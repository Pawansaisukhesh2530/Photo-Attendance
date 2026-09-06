from datetime import datetime, timezone
import logging

from celery import Celery
from redis import Redis
import numpy as np
from sqlalchemy import delete, select

from .config import get_settings
from .db import SessionLocal
from .domain import build_safe_unknown_records, candidate_student_ids
from .models import (AttendanceRecord, AttendanceSession, AttendanceSessionImage,
                     AttendanceStatus, FaceDetection, JobStatus, RecognitionCandidate,
                     RecognitionJob, SessionStatus, StudentFaceEmbedding, StudentFaceImage)
from .models import TwinReview
from .recognition import ModelUnavailable, get_face_engine, decide_match
from .storage import ObjectStorage

settings = get_settings()
logger = logging.getLogger(__name__)
celery_app = Celery("edutrace", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(task_acks_late=True, worker_prefetch_multiplier=1, task_track_started=True)


def resolve_student_status(student_id,has_gallery,best,ambiguous,conflicted,successful_images):
    if student_id in conflicted:return AttendanceStatus.REVIEW,best.get(student_id,(None,None))[0],"DUPLICATE_IDENTITY_CLAIM"
    if student_id in ambiguous:return AttendanceStatus.REVIEW,None,"AMBIGUOUS_CANDIDATES"
    if student_id in best:return AttendanceStatus.PRESENT,best[student_id][0],None
    if not has_gallery:return AttendanceStatus.UNKNOWN,None,"NO_ACTIVE_FACE_ENROLMENT"
    if successful_images==0:return AttendanceStatus.UNKNOWN,None,"NO_USABLE_SESSION_IMAGE"
    return AttendanceStatus.ABSENT,None,"NO_MATCH_OBSERVED"


@celery_app.task(bind=True, autoretry_for=(OSError,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def process_face_enrolment(self, image_id: str) -> None:
    engine=get_face_engine();storage=ObjectStorage()
    with SessionLocal.begin() as db:
        image=db.get(StudentFaceImage,image_id)
        if not image or image.revoked_at:return
        faces=engine.analyse(storage.get(image.object_key))
        if len(faces)!=1:
            image.quality={"status":"REJECTED","reason":"EXACTLY_ONE_FACE_REQUIRED","detected_faces":len(faces)}
            return
        face=faces[0];x1,y1,x2,y2=face.box
        if min(x2-x1,y2-y1)<80:
            image.quality={**face.quality,"status":"REJECTED","reason":"FACE_TOO_SMALL","detected_faces":1};return
        if face.quality["blur_variance"]<35 or not 35<=face.quality["mean_brightness"]<=220:
            image.quality={**face.quality,"status":"REJECTED","reason":"IMAGE_QUALITY","detected_faces":1};return
        same_student=db.execute(select(StudentFaceEmbedding.embedding).join(StudentFaceImage,StudentFaceImage.id==StudentFaceEmbedding.image_id).where(StudentFaceImage.student_id==image.student_id,StudentFaceImage.id!=image.id,StudentFaceImage.revoked_at.is_(None),StudentFaceEmbedding.revoked_at.is_(None))).scalars().all()
        if any(float(np.dot(face.embedding,np.asarray(value,dtype=np.float32)))>=settings.duplicate_template_threshold for value in same_student):
            image.quality={**face.quality,"status":"REJECTED","reason":"DUPLICATE_TEMPLATE"};return
        other=db.execute(select(StudentFaceImage.student_id,StudentFaceEmbedding.embedding).join(StudentFaceEmbedding,StudentFaceEmbedding.image_id==StudentFaceImage.id).where(StudentFaceImage.student_id!=image.student_id,StudentFaceImage.revoked_at.is_(None),StudentFaceEmbedding.revoked_at.is_(None))).all()
        suspicious=max((float(np.dot(face.embedding,np.asarray(value,dtype=np.float32))) for _,value in other),default=-1)
        existing=db.scalar(select(StudentFaceEmbedding).where(StudentFaceEmbedding.image_id==image.id))
        values=face.embedding.astype(float).tolist()
        if existing:existing.embedding=values;existing.model_version=settings.model_version;existing.revoked_at=None
        else:db.add(StudentFaceEmbedding(image_id=image.id,embedding=values,model_version=settings.model_version))
        image.quality={**face.quality,"status":"CROSS_IDENTITY_REVIEW" if suspicious>=settings.cross_identity_review_threshold else "ACCEPTED","cross_identity_score":suspicious,"detected_faces":1}


def _process_attendance(job_id: str) -> None:
    """Durable job boundary. Licensed model adapters plug in before the safe fallback."""
    with SessionLocal.begin() as db:
        job = db.get(RecognitionJob, job_id)
        if not job or job.status == JobStatus.SUCCEEDED:
            return
        session = db.get(AttendanceSession, job.session_id)
        if not session:
            return
        job.status = JobStatus.RUNNING
        job.stage = "MATCHING"
        job.progress = 0.2
        job.error_code = None
        job.attempts += 1
        session.status = SessionStatus.PROCESSING

    try:
        with SessionLocal.begin() as db:
            job = db.get(RecognitionJob, job_id)
            session = db.get(AttendanceSession, job.session_id)
            images=list(db.scalars(select(AttendanceSessionImage).where(AttendanceSessionImage.session_id==session.id)))
            candidate_ids=candidate_student_ids(db,session.id)
            gallery={student_id:[] for student_id in candidate_ids}
            rows=db.execute(select(StudentFaceImage.student_id,StudentFaceEmbedding.embedding).join(StudentFaceEmbedding,StudentFaceEmbedding.image_id==StudentFaceImage.id).where(StudentFaceImage.student_id.in_(candidate_ids),StudentFaceImage.revoked_at.is_(None),StudentFaceEmbedding.revoked_at.is_(None))).all()
            for student_id,embedding in rows:gallery[student_id].append(np.asarray(embedding,dtype=np.float32))
            try:
                engine=get_face_engine();storage=ObjectStorage();best={};ambiguous=set();conflicted=set();successful_images=0
                db.execute(delete(RecognitionCandidate).where(RecognitionCandidate.detection_id.in_(select(FaceDetection.id).join(AttendanceSessionImage).where(AttendanceSessionImage.session_id==session.id))))
                db.execute(delete(FaceDetection).where(FaceDetection.image_id.in_(select(AttendanceSessionImage.id).where(AttendanceSessionImage.session_id==session.id))))
                for image in images:
                    try:
                        faces=engine.analyse(storage.get(image.object_key));successful_images+=1
                        image.processing_error=None
                    except Exception:
                        image.processing_error="IMAGE_PROCESSING_FAILED"
                        logger.exception("Could not process attendance image %s", image.id)
                        continue
                    image_claims=set()
                    for face in faces:
                        detection=FaceDetection(image_id=image.id,box={"x1":face.box[0],"y1":face.box[1],"x2":face.box[2],"y2":face.box[3]},quality=face.quality,model_version=settings.model_version)
                        db.add(detection);db.flush();decision=decide_match(face.embedding,gallery)
                        for rank,(student_id,score) in enumerate(decision.candidates,1):db.add(RecognitionCandidate(detection_id=detection.id,student_id=student_id,score=score,rank=rank))
                        if decision.status=="REVIEW":
                            pair=sorted(sid for sid,_ in decision.candidates[:2]);ambiguous.update(pair)
                            if len(pair)==2 and not db.scalar(select(TwinReview).where(TwinReview.session_id==session.id,TwinReview.student_a_id==pair[0],TwinReview.student_b_id==pair[1])):
                                db.add(TwinReview(session_id=session.id,student_a_id=pair[0],student_b_id=pair[1]))
                        if decision.student_id:
                            if decision.student_id in image_claims:conflicted.add(decision.student_id)
                            image_claims.add(decision.student_id)
                            if decision.student_id not in best or decision.score>best[decision.student_id][0]:best[decision.student_id]=(decision.score,decision.reason)
                if successful_images==0:
                    job.status=JobStatus.FAILED;job.stage="FAILED";job.progress=1.0
                    job.error_code="NO_USABLE_SESSION_IMAGE";job.finished_at=datetime.now(timezone.utc)
                    session.status=SessionStatus.FAILED;session.version+=1
                    return
                for student_id in candidate_ids:
                    status,score,reason=resolve_student_status(student_id,bool(gallery[student_id]),best,ambiguous,conflicted,successful_images)
                    record=db.scalar(select(AttendanceRecord).where(AttendanceRecord.session_id==session.id,AttendanceRecord.student_id==student_id))
                    if record:
                        # PostgreSQL protects the original AI fields from UPDATEs. A deliberate
                        # unfinalized reprocess replaces the result row while keeping its id and
                        # any faculty decision, so audit references and manual work remain intact.
                        replacement=AttendanceRecord(id=record.id,session_id=session.id,student_id=student_id,
                            ai_status=status,status=record.status if record.amended_at else status,score=score,
                            review_reason=reason,model_version=settings.model_version,
                            amended_by=record.amended_by,amended_at=record.amended_at,
                            amendment_reason=record.amendment_reason,version=record.version+1)
                        db.delete(record);db.flush();db.add(replacement)
                    else:db.add(AttendanceRecord(session_id=session.id,student_id=student_id,ai_status=status,status=status,score=score,review_reason=reason,model_version=settings.model_version))
                missing_gallery=any(not gallery[student_id] for student_id in candidate_ids)
                session.status=SessionStatus.PENDING_REVIEW if ambiguous or conflicted or missing_gallery or successful_images==0 else SessionStatus.READY;session.version+=1
            except ModelUnavailable:
                # Models are deployment inputs. Never invent matches when they are absent.
                build_safe_unknown_records(db, session)
            job.status = JobStatus.SUCCEEDED
            job.stage = "DONE"
            job.progress = 1.0
            job.error_code = None
            job.finished_at = datetime.now(timezone.utc)
    except Exception:
        with SessionLocal.begin() as db:
            job = db.get(RecognitionJob, job_id)
            if job:
                job.status = JobStatus.FAILED
                job.stage = "FAILED"
                job.progress = 1.0
                job.error_code = "PROCESSING_FAILED"
                job.finished_at = datetime.now(timezone.utc)
                session = db.get(AttendanceSession, job.session_id)
                if session:
                    session.status = SessionStatus.FAILED
        raise


@celery_app.task(bind=True, autoretry_for=(OSError,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def process_attendance(self, job_id: str) -> None:
    """Serialize work per session across workers with a bounded Redis lease."""
    with SessionLocal() as db:
        job=db.get(RecognitionJob,job_id)
        if not job:return
        session_id=job.session_id
    lock=Redis.from_url(settings.redis_url).lock(f"recognition:{session_id}",timeout=300,blocking_timeout=1)
    if not lock.acquire(blocking=True):return
    try:_process_attendance(job_id)
    finally:
        if lock.owned():lock.release()
