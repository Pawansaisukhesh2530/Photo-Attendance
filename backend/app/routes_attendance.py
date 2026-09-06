import hashlib
import csv
import io
import json
import os
import tempfile
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .domain import (audit, authorized_class_ids, candidate_student_ids, ensure_version,
                     faculty_for_user, make_job_key, page, require_session_access)
from .errors import Problem
from .models import (AttendanceRecord, AttendanceSession, AttendanceSessionClass, CourseClass, Faculty,
                     AttendanceSessionImage, AttendanceStatus, Enrolment, JobStatus, PanoramaDraft,
                     RecognitionJob, RecognitionCandidate, FaceDetection, FacultyClassAssignment, Role, SessionStatus, StudentFaceEmbedding,
                     StudentFaceImage, Student, TwinReview, User, InstitutionSettings)
from .schemas import (AmendmentRequest, AttendanceRecordOut, FinalizeRequest, Page,
                      PanoramaAttach, SessionCreate, SessionOut)
from .security import (create_image_token, create_panorama_token, current_user, require_roles,
                       verify_image_token, verify_panorama_token)
from .storage import ObjectStorage, validate_image
from .worker import process_attendance, process_face_enrolment

router = APIRouter(tags=["Attendance"])


@router.post("/students/{student_id}/face-images", status_code=201)
async def enrol_faces(student_id: str, files: list[UploadFile] = File(...), db: Session = Depends(get_db),
                       actor: User = Depends(require_roles(Role.ADMIN))):
    settings = get_settings()
    # Allow incremental enrollment because Android/iOS pickers may return one asset
    # even when multi-select is requested. Readiness still requires the configured
    # minimum number of accepted images; each request only needs one valid image.
    if not 1 <= len(files) <= settings.max_enrolment_images:
        raise Problem(422, "Invalid image count", f"Upload 1-{settings.max_enrolment_images} images per request.")
    from .models import Student
    student = db.get(Student, student_id)
    if not student: raise Problem(404, "Student not found", "The student does not exist.")
    validated = [validate_image(await f.read()) for f in files]
    if len({x.checksum for x in validated}) != len(validated):
        raise Problem(409, "Duplicate image", "The upload contains duplicate images.")
    storage = ObjectStorage()
    checksums = [image.checksum for image in validated]
    existing = {
        row.checksum: row
        for row in db.scalars(
            select(StudentFaceImage).where(
                StudentFaceImage.student_id == student_id,
                StudentFaceImage.checksum.in_(checksums),
            )
        )
    }
    rows=[]
    for image in validated:
        previous = existing.get(image.checksum)
        if previous:
            # Re-uploading a photo is idempotent. A revoked image is restored and
            # queued for validation again; an active image is returned as-is.
            if previous.revoked_at:
                previous.revoked_at = None
                previous.quality = {"status": "PENDING_MODEL_VALIDATION"}
                previous.width = image.width
                previous.height = image.height
                previous.mime_type = image.mime_type
                previous.version += 1
            rows.append(previous)
            continue
        key=f"students/{student_id}/faces/{image.checksum}"
        storage.put(key,image)
        row=StudentFaceImage(student_id=student_id,object_key=key,checksum=image.checksum,mime_type=image.mime_type,width=image.width,height=image.height,quality={"status":"PENDING_MODEL_VALIDATION"})
        db.add(row);rows.append(row)
    db.flush();audit(db,actor,"FACE_IMAGES_ENROLLED",student,after={"image_ids":[r.id for r in rows]});db.commit()
    for row in rows:
        if row.quality.get("status") == "PENDING_MODEL_VALIDATION" and settings.queue_backend=="celery":
            try: process_face_enrolment.delay(row.id)
            except Exception: pass
    return {"items":[{"id":r.id,"checksum":r.checksum,"width":r.width,"height":r.height,"status":r.quality["status"]} for r in rows]}


@router.get("/students/{student_id}/face-images")
def list_faces(student_id:str,db:Session=Depends(get_db),_:User=Depends(require_roles(Role.ADMIN))):
    rows=db.scalars(select(StudentFaceImage).where(StudentFaceImage.student_id==student_id).order_by(StudentFaceImage.created_at.desc())).all()
    return {"items":[{"id":r.id,"checksum":r.checksum,"width":r.width,"height":r.height,"quality":r.quality,"revoked_at":r.revoked_at,"image_url":f"/api/v1/students/{student_id}/face-images/{r.id}/content"} for r in rows]}


@router.get("/students/{student_id}/face-images/{image_id}/content",include_in_schema=False)
def face_image_content(student_id:str,image_id:str,db:Session=Depends(get_db),_:User=Depends(require_roles(Role.ADMIN))):
    row=db.get(StudentFaceImage,image_id)
    if not row or row.student_id!=student_id:raise Problem(404,"Face image not found","The face image does not exist.")
    return Response(ObjectStorage().get(row.object_key),media_type=row.mime_type,headers={"Cache-Control":"private, no-store"})


@router.delete("/students/{student_id}/face-images/{image_id}",status_code=204)
def revoke_face(student_id:str,image_id:str,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN))):
    row=db.get(StudentFaceImage,image_id)
    if not row or row.student_id!=student_id:raise Problem(404,"Face image not found","The face image does not exist.")
    row.revoked_at=datetime.now(timezone.utc);row.version+=1
    embedding=db.scalar(select(StudentFaceEmbedding).where(StudentFaceEmbedding.image_id==row.id))
    if embedding:embedding.revoked_at=row.revoked_at
    audit(db,actor,"FACE_IMAGE_REVOKED",row,reason="Administrative revocation");db.commit()


@router.post("/students/{student_id}/face-images/reprocess",status_code=202)
def reprocess_faces(student_id:str,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN))):
    rows=db.scalars(select(StudentFaceImage).where(StudentFaceImage.student_id==student_id,StudentFaceImage.revoked_at.is_(None))).all()
    if not rows:raise Problem(409,"No active images","Upload enrolment images before reprocessing.")
    for row in rows:row.quality={**row.quality,"status":"PENDING_MODEL_VALIDATION"}
    audit(db,actor,"FACE_IMAGES_REPROCESS_REQUESTED",rows[0],after={"count":len(rows)});db.commit()
    for row in rows:
        if get_settings().queue_backend=="celery":
            try: process_face_enrolment.delay(row.id)
            except Exception: pass
    return {"status":"QUEUED","count":len(rows)}


@router.post("/attendance/sessions",response_model=SessionOut,status_code=201)
def create_session(payload:SessionCreate,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.FACULTY))):
    allowed=authorized_class_ids(db,actor)
    if not set(payload.class_ids)<=allowed:raise Problem(403,"Unassigned class","One or more selected classes are not assigned to this faculty member.")
    faculty=faculty_for_user(db,actor);session=AttendanceSession(faculty_id=faculty.id,attendance_date=payload.attendance_date or date.today(),capture_mode=payload.capture_mode)
    db.add(session);db.flush()
    for class_id in payload.class_ids:db.add(AttendanceSessionClass(session_id=session.id,class_id=class_id))
    audit(db,actor,"ATTENDANCE_SESSION_CREATED",session,after={"class_ids":payload.class_ids});db.commit();return session


@router.post("/attendance/panorama/preview", status_code=201)
async def prepare_panorama(sweep: UploadFile = File(...), captured_at: str | None = Form(default=None),
                           db: Session = Depends(get_db), actor: User = Depends(require_roles(Role.FACULTY))):
    """Stitch a short, silent camera sweep and return its full-resolution review image."""
    del captured_at  # Client metadata only; the authoritative session time is server-side.
    content = await sweep.read()
    settings = get_settings()
    if not content or len(content) > settings.max_panorama_video_bytes:
        raise Problem(413, "Invalid panorama size", f"The sweep must be at most {settings.max_panorama_video_bytes} bytes.")
    if sweep.content_type and not sweep.content_type.startswith("video/"):
        raise Problem(415, "Unsupported panorama", "Upload a camera video sweep.")

    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise Problem(503, "Panorama unavailable", "The panorama processor is not installed on this server.") from exc

    suffix = os.path.splitext(sweep.filename or "sweep.mp4")[1] or ".mp4"
    temporary = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    temporary_path = temporary.name
    try:
        temporary.write(content)
        temporary.close()
        video = cv2.VideoCapture(temporary_path)
        frame_count = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
        if not video.isOpened() or frame_count < 3:
            video.release()
            raise Problem(422, "Invalid panorama sweep", "The camera sweep could not be decoded.")

        # Keep neighbouring views highly overlapped. Wide jumps make even a smooth sweep
        # unnecessarily hard to stitch, especially after mobile video compression.
        sample_count = min(10, max(6, frame_count // 10))
        positions = np.linspace(0, frame_count - 1, sample_count, dtype=int)
        frames = []
        for position in positions:
            video.set(cv2.CAP_PROP_POS_FRAMES, int(position))
            ok, frame = video.read()
            if ok and frame is not None:
                # Stitching many full 4K frames can consume several gigabytes and terminate the
                # local API process. A 1600px working image keeps enough feature detail for a
                # classroom sweep while placing a deterministic ceiling on memory use.
                height, width = frame.shape[:2]
                longest = max(width, height)
                if longest > 1600:
                    scale = 1600 / longest
                    frame = cv2.resize(
                        frame,
                        (max(1, round(width * scale)), max(1, round(height * scale))),
                        interpolation=cv2.INTER_AREA,
                    )
                frames.append(frame)
        video.release()
        if len(frames) < 3:
            raise Problem(422, "Invalid panorama sweep", "The sweep does not contain enough usable frames.")

        stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
        try:
            status, panorama = stitcher.stitch(frames)
        except cv2.error as exc:
            raise Problem(
                422,
                "Panorama could not be stitched",
                "Move slowly in one direction and keep about one-third of the previous view visible.",
            ) from exc
        if status != cv2.Stitcher_OK or panorama is None:
            raise Problem(422, "Panorama could not be stitched", "Move more slowly and keep about one-third of the previous view visible while sweeping.")
        encoded, jpeg = cv2.imencode(".jpg", panorama, [cv2.IMWRITE_JPEG_QUALITY, 97])
        if not encoded:
            raise Problem(500, "Panorama encoding failed", "The stitched panorama could not be saved.")
        image = validate_image(jpeg.tobytes())
    finally:
        try:
            os.unlink(temporary_path)
        except OSError:
            pass

    faculty = faculty_for_user(db, actor)
    draft = PanoramaDraft(faculty_id=faculty.id, object_key=f"pending/{uuid.uuid4()}", checksum=image.checksum,
                          mime_type=image.mime_type, width=image.width, height=image.height)
    db.add(draft); db.flush()
    draft.object_key = f"panorama-drafts/{faculty.id}/{draft.id}.jpg"
    ObjectStorage().put(draft.object_key, image)
    db.commit()
    token = create_panorama_token(draft.id)
    return {"id": draft.id, "photo_uri": f"/api/v1/attendance/panorama/preview/{draft.id}/content?token={token}",
            "width": draft.width, "height": draft.height}


@router.post("/attendance/panorama/frames", status_code=201)
async def prepare_panorama_frames(frames: list[UploadFile] = File(...), db: Session = Depends(get_db),
                                  actor: User = Depends(require_roles(Role.FACULTY))):
    """Stitch overlapping still photos captured during a guided classroom sweep."""
    if not 4 <= len(frames) <= 8:
        raise Problem(422, "Invalid panorama frame count", "Capture 4-8 overlapping panorama views.")

    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise Problem(503, "Panorama unavailable", "The panorama processor is not installed on this server.") from exc

    validated = [validate_image(await frame.read()) for frame in frames]
    decoded = []
    for image in validated:
        frame = cv2.imdecode(np.frombuffer(image.content, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise Problem(422, "Invalid panorama frame", "One of the captured views could not be decoded.")
        height, width = frame.shape[:2]
        longest = max(width, height)
        if longest > 1600:
            scale = 1600 / longest
            frame = cv2.resize(
                frame,
                (max(1, round(width * scale)), max(1, round(height * scale))),
                interpolation=cv2.INTER_AREA,
            )
        decoded.append(frame)

    status = cv2.Stitcher_ERR_NEED_MORE_IMGS
    panorama = None
    try:
        # PANORAMA handles a rotating phone well. SCANS is a useful fallback for the flatter,
        # nearly translational motion people make while standing far from the classroom.
        for mode in (cv2.Stitcher_PANORAMA, cv2.Stitcher_SCANS):
            status, panorama = cv2.Stitcher_create(mode).stitch(decoded)
            if status == cv2.Stitcher_OK and panorama is not None:
                break
    except cv2.error as exc:
        raise Problem(
            422,
            "Panorama could not be stitched",
            "Pan more slowly in one direction and keep about half of the previous view visible.",
        ) from exc
    if status != cv2.Stitcher_OK or panorama is None:
        raise Problem(
            422,
            "Panorama could not be stitched",
            "Pan more slowly in one direction and keep about half of the previous view visible.",
        )

    encoded, jpeg = cv2.imencode(".jpg", panorama, [cv2.IMWRITE_JPEG_QUALITY, 97])
    if not encoded:
        raise Problem(500, "Panorama encoding failed", "The stitched panorama could not be saved.")
    output = validate_image(jpeg.tobytes())

    faculty = faculty_for_user(db, actor)
    draft = PanoramaDraft(faculty_id=faculty.id, object_key=f"pending/{uuid.uuid4()}", checksum=output.checksum,
                          mime_type=output.mime_type, width=output.width, height=output.height)
    db.add(draft); db.flush()
    draft.object_key = f"panorama-drafts/{faculty.id}/{draft.id}.jpg"
    ObjectStorage().put(draft.object_key, output)
    db.commit()
    token = create_panorama_token(draft.id)
    return {"id": draft.id, "photo_uri": f"/api/v1/attendance/panorama/preview/{draft.id}/content?token={token}",
            "width": draft.width, "height": draft.height}


@router.get("/attendance/panorama/preview/{draft_id}/content", include_in_schema=False)
def panorama_preview_content(draft_id: str, token: str = Query(...), db: Session = Depends(get_db)):
    verify_panorama_token(token, draft_id)
    draft = db.get(PanoramaDraft, draft_id)
    if not draft:
        raise Problem(404, "Panorama not found", "The panorama preview no longer exists.")
    return Response(ObjectStorage().get(draft.object_key), media_type=draft.mime_type,
                    headers={"Cache-Control": "private, no-store"})


@router.post("/attendance/sessions/{session_id}/panorama", status_code=201)
def attach_panorama(session_id: str, payload: PanoramaAttach, db: Session = Depends(get_db),
                    actor: User = Depends(require_roles(Role.FACULTY))):
    session = require_session_access(db, actor, session_id)
    if session.scope_locked_at:
        raise Problem(409, "Session locked", "The panorama cannot be changed after processing starts.")
    faculty = faculty_for_user(db, actor)
    draft = db.get(PanoramaDraft, payload.draft_id)
    if not draft or draft.faculty_id != faculty.id:
        raise Problem(404, "Panorama not found", "The panorama draft does not exist.")
    row = AttendanceSessionImage(session_id=session_id, object_key=draft.object_key,
                                 checksum=draft.checksum, mime_type=draft.mime_type,
                                 width=draft.width, height=draft.height)
    db.add(row); db.flush()
    audit(db, actor, "SESSION_PANORAMA_ATTACHED", session, after={"image_id": row.id, "draft_id": draft.id})
    db.delete(draft); db.commit()
    return {"id": row.id, "checksum": row.checksum, "width": row.width, "height": row.height}


@router.post("/attendance/sessions/{session_id}/images",status_code=201)
async def upload_session_images(session_id:str,files:list[UploadFile]=File(...),db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.FACULTY))):
    session=require_session_access(db,actor,session_id)
    if session.scope_locked_at:raise Problem(409,"Session locked","Images cannot be changed after processing starts.")
    existing=db.scalar(select(func.count()).select_from(AttendanceSessionImage).where(AttendanceSessionImage.session_id==session_id)) or 0
    if not files or existing+len(files)>get_settings().max_session_images:raise Problem(422,"Invalid image count",f"A session accepts 1-{get_settings().max_session_images} images.")
    validated=[validate_image(await f.read()) for f in files]
    storage=ObjectStorage();rows=[]
    for image in validated:
        key=f"sessions/{session_id}/{image.checksum}";storage.put(key,image)
        row=AttendanceSessionImage(session_id=session_id,object_key=key,checksum=image.checksum,mime_type=image.mime_type,width=image.width,height=image.height)
        db.add(row);rows.append(row)
    try:db.flush()
    except Exception as exc:db.rollback();raise Problem(409,"Duplicate image","This image is already attached to the session.") from exc
    audit(db,actor,"SESSION_IMAGES_UPLOADED",session,after={"image_ids":[r.id for r in rows]});db.commit()
    return {"items":[{"id":r.id,"checksum":r.checksum,"width":r.width,"height":r.height} for r in rows]}


@router.get("/attendance/sessions/{session_id}/images")
def list_session_images(session_id:str,db:Session=Depends(get_db),actor:User=Depends(current_user)):
    require_session_access(db,actor,session_id)
    rows=db.scalars(select(AttendanceSessionImage).where(AttendanceSessionImage.session_id==session_id).order_by(AttendanceSessionImage.created_at)).all()
    return {"items":[{"id":r.id,"checksum":r.checksum,"width":r.width,"height":r.height,"processing_error":r.processing_error,"image_url":f"/api/v1/attendance/sessions/{session_id}/images/{r.id}/content?token={create_image_token(session_id,r.id)}","annotated_url":f"/api/v1/attendance/sessions/{session_id}/images/{r.id}/annotated?token={create_image_token(session_id,r.id)}"} for r in rows]}


def _session_image(db:Session,actor:User,session_id:str,image_id:str):
    require_session_access(db,actor,session_id);row=db.get(AttendanceSessionImage,image_id)
    if not row or row.session_id!=session_id:raise Problem(404,"Session image not found","The image does not exist.")
    return row


@router.get("/attendance/sessions/{session_id}/images/{image_id}/content",include_in_schema=False)
def session_image_content(session_id:str,image_id:str,token:str=Query(...),db:Session=Depends(get_db)):
    verify_image_token(token,session_id,image_id);row=db.get(AttendanceSessionImage,image_id)
    if not row or row.session_id!=session_id:raise Problem(404,"Session image not found","The image does not exist.")
    return Response(ObjectStorage().get(row.object_key),media_type=row.mime_type,headers={"Cache-Control":"private, no-store"})


@router.get("/attendance/sessions/{session_id}/images/{image_id}/annotated")
def annotated_session_image(session_id:str,image_id:str,token:str=Query(...),db:Session=Depends(get_db)):
    verify_image_token(token,session_id,image_id);row=db.get(AttendanceSessionImage,image_id)
    if not row or row.session_id!=session_id:raise Problem(404,"Session image not found","The image does not exist.")
    from PIL import Image,ImageDraw,ImageFont
    image=Image.open(io.BytesIO(ObjectStorage().get(row.object_key))).convert("RGB");draw=ImageDraw.Draw(image)
    detections=db.scalars(select(FaceDetection).where(FaceDetection.image_id==image_id)).all()
    detection_ids=[d.id for d in detections]
    candidate_rows=db.execute(
        select(RecognitionCandidate.detection_id,Student.student_id,RecognitionCandidate.score,RecognitionCandidate.rank)
        .join(Student,Student.id==RecognitionCandidate.student_id)
        .where(RecognitionCandidate.detection_id.in_(detection_ids))
        .order_by(RecognitionCandidate.detection_id,RecognitionCandidate.rank)
    ).all() if detection_ids else []
    candidates_by_detection={}
    for candidate in candidate_rows:candidates_by_detection.setdefault(candidate.detection_id,[]).append(candidate)
    settings=get_settings();font_size=max(18,image.width//130)
    try:font=ImageFont.truetype("DejaVuSans.ttf",font_size)
    except OSError:font=ImageFont.load_default()
    for detection in detections:
        candidates=candidates_by_detection.get(detection.id,[]);label="Unknown";colour="#f59e0b"
        if candidates and candidates[0].score>=settings.match_threshold:
            if len(candidates)==1 or candidates[0].score-candidates[1].score>=settings.ambiguity_margin:
                label=candidates[0].student_id;colour="#14b8a6"
            else:label="Review";colour="#ef4444"
        b=detection.box;box=(b["x1"],b["y1"],b["x2"],b["y2"]);line_width=max(2,image.width//700)
        draw.rectangle(box,outline=colour,width=line_width)
        text_box=draw.textbbox((box[0],box[1]),label,font=font,stroke_width=1);padding=max(3,font_size//6)
        label_box=(box[0],max(0,box[1]-(text_box[3]-text_box[1])-padding*2),box[0]+(text_box[2]-text_box[0])+padding*2,box[1])
        draw.rectangle(label_box,fill=colour)
        draw.text((label_box[0]+padding,label_box[1]+padding),label,font=font,fill="white",stroke_width=1,stroke_fill="black")
    output=io.BytesIO();image.save(output,"JPEG",quality=92)
    return Response(output.getvalue(),media_type="image/jpeg",headers={"Content-Disposition":f'attachment; filename="session-{session_id}-image-{image_id}-annotated.jpg"'})


@router.post("/attendance/sessions/{session_id}/process",status_code=202)
def process_session(session_id:str,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.FACULTY))):
    session=require_session_access(db,actor,session_id)
    count=db.scalar(select(func.count()).select_from(AttendanceSessionImage).where(AttendanceSessionImage.session_id==session_id)) or 0
    if count<1:raise Problem(409,"Images required","Upload at least one classroom image.")
    candidates=candidate_student_ids(db,session_id)
    if not candidates:raise Problem(409,"Empty candidate pool","The selected classes have no enrolled students.")
    if len(candidates)>get_settings().max_candidates:raise Problem(422,"Candidate limit exceeded","The selected classes exceed the configured candidate limit.")
    key=make_job_key(db,session_id);job=db.scalar(select(RecognitionJob).where(RecognitionJob.idempotency_key==key))
    if not job:
        job=RecognitionJob(session_id=session_id,idempotency_key=key);db.add(job);db.flush()
        session.scope_locked_at=datetime.now(timezone.utc);session.status=SessionStatus.QUEUED;session.version+=1
        audit(db,actor,"RECOGNITION_QUEUED",job,after={"session_id":session_id});db.commit()
        if get_settings().queue_backend=="celery":
            try:process_attendance.delay(job.id)
            except Exception as exc:
                job.status=JobStatus.FAILED;job.error_code="QUEUE_UNAVAILABLE";session.status=SessionStatus.FAILED;db.commit()
                raise Problem(503,"Queue unavailable","The images are saved; retry processing when the queue is available.") from exc
    return {"job_id":job.id,"status":job.status,"idempotency_key":key}


@router.get("/attendance/sessions/{session_id}/progress")
def progress(session_id:str,db:Session=Depends(get_db),actor:User=Depends(current_user)):
    require_session_access(db,actor,session_id)
    job=db.scalar(select(RecognitionJob).where(RecognitionJob.session_id==session_id).order_by(RecognitionJob.created_at.desc()))
    if not job:raise Problem(404,"Job not found","Processing has not been requested.")
    return {"job_id":job.id,"status":job.status,"stage":job.stage,"progress":job.progress,"error_code":job.error_code}


@router.get("/attendance/sessions/{session_id}")
def get_session(session_id:str,db:Session=Depends(get_db),actor:User=Depends(current_user)):
    session=require_session_access(db,actor,session_id)
    class_ids=list(db.scalars(select(AttendanceSessionClass.class_id).where(AttendanceSessionClass.session_id==session_id)))
    classes=list(db.scalars(select(CourseClass).where(CourseClass.id.in_(class_ids))))
    records=list(db.scalars(select(AttendanceRecord).where(AttendanceRecord.session_id==session_id)))
    images=list(db.scalars(select(AttendanceSessionImage).where(AttendanceSessionImage.session_id==session_id).order_by(AttendanceSessionImage.created_at)))
    detections=db.scalars(select(FaceDetection).join(AttendanceSessionImage,AttendanceSessionImage.id==FaceDetection.image_id).where(AttendanceSessionImage.session_id==session_id)).all()
    evidence=[]
    for detection in detections:
        candidates=db.scalars(select(RecognitionCandidate).where(RecognitionCandidate.detection_id==detection.id).order_by(RecognitionCandidate.rank)).all()
        source=next((x for x in images if x.id==detection.image_id),None);b=detection.box
        matched_student_id=None;match_status="UNMATCHED"
        if candidates and candidates[0].score>=get_settings().match_threshold:
            if len(candidates)==1 or candidates[0].score-candidates[1].score>=get_settings().ambiguity_margin:
                matched_student_id=candidates[0].student_id;match_status="MATCHED"
            else:match_status="REVIEW"
        normalized_box={"x":b["x1"]/source.width,"y":b["y1"]/source.height,"width":(b["x2"]-b["x1"])/source.width,"height":(b["y2"]-b["y1"])/source.height} if source else None
        evidence.append({"detection_id":detection.id,"image_id":detection.image_id,"box":detection.box,"normalized_box":normalized_box,"quality":detection.quality,"model_version":detection.model_version,"match_status":match_status,"matched_student_id":matched_student_id,"candidates":[{"student_id":c.student_id,"score":c.score,"rank":c.rank} for c in candidates]})
    enriched=[]
    for record in records:
        student=db.get(Student,record.student_id)
        student_class=db.scalar(select(Enrolment.class_id).where(Enrolment.student_id==record.student_id,Enrolment.class_id.in_(class_ids)))
        face_box=None
        for item in evidence:
            if item["candidates"] and item["candidates"][0]["student_id"]==record.student_id and item["candidates"][0]["score"]>=get_settings().match_threshold:
                source=next((x for x in images if x.id==item["image_id"]),None);b=item["box"]
                if source:face_box={"x":b["x1"]/source.width,"y":b["y1"]/source.height,"width":(b["x2"]-b["x1"])/source.width,"height":(b["y2"]-b["y1"])/source.height}
                break
        enriched.append({**AttendanceRecordOut.model_validate(record).model_dump(mode="json"),"student_name":student.name,"roll_number":student.roll_number,"class_id":student_class or class_ids[0],"face_box":face_box})
    counts={status.value:sum(1 for r in records if r.status==status) for status in AttendanceStatus};resolved=counts["PRESENT"]+counts["ABSENT"]
    return {"session":SessionOut.model_validate(session),"class_ids":class_ids,"classes":[{"id":c.id,"subject":c.subject,"display_code":c.code,"student_count":db.scalar(select(func.count()).select_from(Enrolment).where(Enrolment.class_id==c.id)) or 0} for c in classes],"records":enriched,"evidence":evidence,"images":[{"id":x.id,"width":x.width,"height":x.height,"processing_error":x.processing_error,"detected_faces":sum(1 for d in detections if d.image_id==x.id),"content_url":f"/api/v1/attendance/sessions/{session_id}/images/{x.id}/annotated?token={create_image_token(session_id,x.id)}"} for x in images],"summary":{"total":len(records),"present":counts["PRESENT"],"absent":counts["ABSENT"],"review":counts["REVIEW"],"unknown":counts["UNKNOWN"],"recognized":sum(1 for r in records if r.score is not None),"detected_faces":len(evidence),"unmatched_faces":sum(1 for x in evidence if x["match_status"]=="UNMATCHED"),"percentage":round(100*counts["PRESENT"]/resolved,2) if resolved else 0}}


@router.patch("/attendance/records/{record_id}",response_model=AttendanceRecordOut)
def amend_record(record_id:str,payload:AmendmentRequest,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.FACULTY))):
    record=db.get(AttendanceRecord,record_id)
    if not record:raise Problem(404,"Attendance record not found","The record does not exist.")
    session=require_session_access(db,actor,record.session_id)
    if payload.version is not None:ensure_version(record,payload.version)
    if session.status==SessionStatus.FINALIZED and not (payload.reason and payload.reason.strip()):raise Problem(422,"Reason required","A finalized attendance change requires a reason.")
    before={"status":record.status.value};record.status=AttendanceStatus(payload.status);record.amended_by=actor.id;record.amended_at=datetime.now(timezone.utc);record.amendment_reason=payload.reason;record.version+=1
    audit(db,actor,"FINALIZED_ATTENDANCE_AMENDED" if session.status==SessionStatus.FINALIZED else "ATTENDANCE_AMENDED",record,before=before,after={"status":record.status.value},reason=payload.reason);db.commit();return record


@router.get("/attendance/sessions/{session_id}/twin-reviews")
def twin_reviews(session_id:str,db:Session=Depends(get_db),actor:User=Depends(current_user)):
    require_session_access(db,actor,session_id)
    rows=db.scalars(select(TwinReview).where(TwinReview.session_id==session_id)).all()
    def candidate(review:TwinReview,student_id:str):
        student=db.get(Student,student_id)
        record=db.scalar(select(AttendanceRecord).where(AttendanceRecord.session_id==review.session_id,AttendanceRecord.student_id==student_id))
        return {"studentId":student_id,"name":student.name if student else "Unknown student",
                "rollNumber":student.roll_number if student else "","avatarUrl":None,
                "semester":student.semester if student else 0,"confidence":record.score if record and record.score is not None else 0}
    return {"items":[{"id":r.id,"sessionId":r.session_id,"detectedFaceUrl":None,"detectedFaceBox":None,
                      "studentA":candidate(r,r.student_a_id),"studentB":candidate(r,r.student_b_id),
                      "resolution":r.resolution,"resolvedBy":r.resolved_by,"resolvedAt":r.resolved_at} for r in rows]}


@router.patch("/attendance/twin-reviews/{review_id}")
def resolve_twin(review_id:str,resolution:str,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.FACULTY))):
    allowed={"BOTH_PRESENT","ONLY_A","ONLY_B","DEFERRED"}
    if resolution not in allowed:raise Problem(422,"Invalid resolution",f"Use one of: {', '.join(sorted(allowed))}.")
    review=db.get(TwinReview,review_id)
    if not review:raise Problem(404,"Review not found","The twin review does not exist.")
    require_session_access(db,actor,review.session_id)
    if resolution!="DEFERRED":
        values={review.student_a_id:AttendanceStatus.PRESENT if resolution in {"BOTH_PRESENT","ONLY_A"} else AttendanceStatus.ABSENT,
                review.student_b_id:AttendanceStatus.PRESENT if resolution in {"BOTH_PRESENT","ONLY_B"} else AttendanceStatus.ABSENT}
        for student_id,status in values.items():
            record=db.scalar(select(AttendanceRecord).where(AttendanceRecord.session_id==review.session_id,AttendanceRecord.student_id==student_id))
            if record:record.status=status;record.amended_by=actor.id;record.amended_at=datetime.now(timezone.utc);record.amendment_reason=f"Twin review: {resolution}";record.version+=1
    review.resolution=resolution;review.resolved_by=actor.id;review.resolved_at=datetime.now(timezone.utc) if resolution!="DEFERRED" else None
    audit(db,actor,"TWIN_REVIEW_RESOLVED",review,after={"resolution":resolution});db.commit()
    return {"id":review.id,"resolution":review.resolution}


@router.post("/attendance/sessions/{session_id}/finalize",response_model=SessionOut)
def finalize(session_id:str,payload:FinalizeRequest,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.FACULTY))):
    session=require_session_access(db,actor,session_id)
    if session.status not in {SessionStatus.PENDING_REVIEW,SessionStatus.READY,SessionStatus.FINALIZED}:
        raise Problem(409,"Session not ready","Processing must finish before attendance can be finalized.")
    unresolved=db.scalar(select(func.count()).select_from(AttendanceRecord).where(AttendanceRecord.session_id==session_id,AttendanceRecord.status.in_([AttendanceStatus.REVIEW,AttendanceStatus.UNKNOWN]))) or 0
    if unresolved and not payload.acknowledge_unresolved:raise Problem(409,"Unresolved attendance",f"{unresolved} records still require review.")
    session.status=SessionStatus.FINALIZED;session.finalized_at=datetime.now(timezone.utc);session.version+=1;audit(db,actor,"SESSION_FINALIZED",session,after={"unresolved":unresolved});db.commit();return session


@router.post("/attendance/sessions/{session_id}/retry",status_code=202)
def retry(session_id:str,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.FACULTY))):
    session=require_session_access(db,actor,session_id)
    if session.status not in {SessionStatus.FAILED,SessionStatus.PENDING_REVIEW,SessionStatus.READY}:
        raise Problem(409,"Session cannot be reprocessed","Only completed or failed, unfinalized sessions can be reprocessed.")
    job=RecognitionJob(session_id=session_id,idempotency_key=hashlib.sha256(f"retry|{session_id}|{datetime.now(timezone.utc).isoformat()}".encode()).hexdigest())
    db.add(job);db.flush();session.status=SessionStatus.QUEUED;session.version+=1;audit(db,actor,"RECOGNITION_RETRIED",job);db.commit()
    if get_settings().queue_backend=="celery":
        try:process_attendance.delay(job.id)
        except Exception as exc:
            job.status=JobStatus.FAILED;job.error_code="QUEUE_UNAVAILABLE";session.status=SessionStatus.FAILED;db.commit()
            raise Problem(503,"Queue unavailable","The retry could not be queued; the images are preserved.") from exc
    return {"job_id":job.id,"status":job.status}


@router.get("/attendance/sessions",response_model=Page[SessionOut])
def history(class_id:str|None=Query(None,alias="classId"),faculty_id:str|None=Query(None,alias="facultyId"),
            from_date:date|None=Query(None,alias="from"),to_date:date|None=Query(None,alias="to"),
            status:SessionStatus|None=None,pending_review_only:bool=Query(False,alias="pendingReviewOnly"),search:str|None=None,
            page_number:int=Query(1,alias="page"),page_size:int=25,db:Session=Depends(get_db),actor:User=Depends(current_user)):
    q=select(AttendanceSession).order_by(AttendanceSession.created_at.desc())
    if actor.role==Role.FACULTY:q=q.where(AttendanceSession.faculty_id==faculty_for_user(db,actor).id)
    elif faculty_id:q=q.where(AttendanceSession.faculty_id==faculty_id)
    if class_id or search:
        q=q.join(AttendanceSessionClass,AttendanceSessionClass.session_id==AttendanceSession.id).join(CourseClass,CourseClass.id==AttendanceSessionClass.class_id)
    if class_id:q=q.where(AttendanceSessionClass.class_id==class_id)
    if from_date:q=q.where(AttendanceSession.attendance_date>=from_date)
    if to_date:q=q.where(AttendanceSession.attendance_date<=to_date)
    if status:q=q.where(AttendanceSession.status==status)
    if pending_review_only:q=q.where(AttendanceSession.status==SessionStatus.PENDING_REVIEW)
    if search:
        q=(q.join(Faculty,Faculty.id==AttendanceSession.faculty_id)
           .where(or_(CourseClass.code.ilike(f"%{search}%"),CourseClass.subject.ilike(f"%{search}%"),Faculty.name.ilike(f"%{search}%"))).distinct())
    items,total,p,s=page(q,db,page_number,page_size);return Page(items=items,page=p,page_size=s,total=total,has_more=p*s<total)


def _report_data(db:Session,actor:User,class_id:str|None,faculty_id:str|None,department:str|None,
                 from_date:date|None,to_date:date|None,institution_wide:bool=False):
    if actor.role==Role.FACULTY and institution_wide:
        raise Problem(403,"Institution report unavailable","Faculty accounts can only view their assigned classes.")
    effective_faculty_id=faculty_for_user(db,actor).id if actor.role==Role.FACULTY else faculty_id
    class_query=select(CourseClass)
    if actor.role==Role.FACULTY:
        class_query=class_query.where(CourseClass.id.in_(authorized_class_ids(db,actor)))
    if class_id:class_query=class_query.where(CourseClass.id==class_id)
    if department:class_query=class_query.where(CourseClass.department==department)
    if effective_faculty_id:
        class_query=class_query.join(FacultyClassAssignment,FacultyClassAssignment.class_id==CourseClass.id).where(FacultyClassAssignment.faculty_id==effective_faculty_id)
    classes=list(db.scalars(class_query.order_by(CourseClass.code)).unique())
    class_ids=[item.id for item in classes]
    sessions=[]
    if class_ids:
        session_query=(select(AttendanceSession).join(AttendanceSessionClass,AttendanceSessionClass.session_id==AttendanceSession.id)
                       .where(AttendanceSession.status==SessionStatus.FINALIZED,AttendanceSessionClass.class_id.in_(class_ids)))
        if effective_faculty_id:session_query=session_query.where(AttendanceSession.faculty_id==effective_faculty_id)
        if from_date:session_query=session_query.where(AttendanceSession.attendance_date>=from_date)
        if to_date:session_query=session_query.where(AttendanceSession.attendance_date<=to_date)
        sessions=list(db.scalars(session_query.order_by(AttendanceSession.attendance_date).distinct()).unique())
    session_ids=[item.id for item in sessions]
    student_ids=set(db.scalars(select(Enrolment.student_id).where(Enrolment.class_id.in_(class_ids))).all()) if class_ids else set()
    students=list(db.scalars(select(Student).where(Student.id.in_(student_ids)).order_by(Student.name))) if student_ids else []
    records=(list(db.scalars(select(AttendanceRecord).where(AttendanceRecord.session_id.in_(session_ids),
             AttendanceRecord.student_id.in_(student_ids),AttendanceRecord.status.in_([AttendanceStatus.PRESENT,AttendanceStatus.ABSENT]))))
             if session_ids and student_ids else [])
    threshold_row=db.get(InstitutionSettings,1);threshold=threshold_row.attendance_threshold if threshold_row else 75
    return classes,sessions,students,records,threshold,effective_faculty_id


def _student_stats(students:list[Student],records:list[AttendanceRecord],threshold:int):
    totals={student.id:[0,0] for student in students}
    for record in records:
        if record.student_id in totals:
            totals[record.student_id][1]+=1
            if record.status==AttendanceStatus.PRESENT:totals[record.student_id][0]+=1
    items=[]
    for student in students:
        attended,total=totals[student.id];percentage=round(100*attended/total,2) if total else 0
        items.append({"studentId":student.id,"rollNumber":student.roll_number,"name":student.name,"avatarUrl":None,
                      "attendedSessions":attended,"totalSessions":total,"percentage":percentage,
                      "belowThreshold":total>0 and percentage<threshold})
    return items


@router.get("/reports/attendance")
def report(class_id:str|None=Query(None,alias="classId"),faculty_id:str|None=Query(None,alias="facultyId"),
           from_date:date|None=Query(None,alias="from"),to_date:date|None=Query(None,alias="to"),
           department:str|None=None,institution_wide:bool=Query(False,alias="institutionWide"),
           db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    classes,sessions,students,records,threshold,effective_faculty_id=_report_data(
        db,actor,class_id,faculty_id,department,from_date,to_date,institution_wide)
    session_by_id={item.id:item for item in sessions};present=sum(r.status==AttendanceStatus.PRESENT for r in records);total=len(records)
    trend=[]
    for day in sorted({session.attendance_date for session in sessions}):
        day_records=[r for r in records if session_by_id[r.session_id].attendance_date==day]
        day_present=sum(r.status==AttendanceStatus.PRESENT for r in day_records);day_total=len(day_records)
        trend.append({"date":day.isoformat(),"percentage":round(100*day_present/day_total,2) if day_total else 0,
                      "present":day_present,"total":day_total})
    session_classes={sid:set(db.scalars(select(AttendanceSessionClass.class_id).where(AttendanceSessionClass.session_id==sid)).all()) for sid in session_by_id}
    enrolments={course.id:set(db.scalars(select(Enrolment.student_id).where(Enrolment.class_id==course.id)).all()) for course in classes}
    by_class=[]
    for course in classes:
        ids={s.id for s in sessions if course.id in session_classes[s.id]};members=enrolments[course.id]
        subset=[r for r in records if r.session_id in ids and r.student_id in members];class_present=sum(r.status==AttendanceStatus.PRESENT for r in subset)
        by_class.append({"classId":course.id,"className":course.subject,"displayCode":course.code,
                         "percentage":round(100*class_present/len(subset),2) if subset else 0,"sessionCount":len(ids)})
    by_faculty=[]
    if not class_id and not effective_faculty_id:
        for fid in sorted({s.faculty_id for s in sessions}):
            faculty=db.get(Faculty,fid);ids={s.id for s in sessions if s.faculty_id==fid};subset=[r for r in records if r.session_id in ids]
            faculty_present=sum(r.status==AttendanceStatus.PRESENT for r in subset)
            faculty_students={r.student_id for r in subset};low=sum(1 for item in _student_stats([s for s in students if s.id in faculty_students],subset,threshold) if item["belowThreshold"])
            by_faculty.append({"facultyId":fid,"facultyName":faculty.name if faculty else "Unknown faculty",
                               "department":faculty.department if faculty else None,"percentage":round(100*faculty_present/len(subset),2) if subset else 0,
                               "classCount":len(set().union(*(session_classes[sid] for sid in ids))) if ids else 0,
                               "sessionCount":len(ids),"lowAttendanceCount":low})
    stats=_student_stats(students,records,threshold);low=[item for item in stats if item["belowThreshold"]]
    scope="CLASS" if class_id else "FACULTY" if effective_faculty_id else "DEPARTMENT" if department else "INSTITUTION"
    scope_id=class_id or effective_faculty_id or department
    return {"scope":scope,"scopeId":scope_id,"from":(from_date or date.today()).isoformat(),"to":(to_date or date.today()).isoformat(),
            "overallPercentage":round(100*present/total,2) if total else 0,"totalSessions":len(sessions),"studentCount":len(students),
            "trend":trend,"byClass":by_class,"byFaculty":by_faculty,"lowAttendanceStudents":low[:5],
            "lowAttendanceCount":len(low),"threshold":threshold}


@router.get("/reports/attendance/students")
def student_report(page_number:int=Query(1,alias="page"),page_size:int=25,
                   class_id:str|None=Query(None,alias="classId"),faculty_id:str|None=Query(None,alias="facultyId"),
                   from_date:date|None=Query(None,alias="from"),to_date:date|None=Query(None,alias="to"),department:str|None=None,
                   institution_wide:bool=Query(False,alias="institutionWide"),search:str|None=None,
                   low_attendance_only:bool=Query(False,alias="lowAttendanceOnly"),
                   db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    _,_,students,records,threshold,_=_report_data(db,actor,class_id,faculty_id,department,from_date,to_date,institution_wide)
    items=_student_stats(students,records,threshold)
    if search:
        needle=search.strip().casefold();items=[x for x in items if needle in x["name"].casefold() or needle in x["rollNumber"].casefold()]
    if low_attendance_only:items=[x for x in items if x["belowThreshold"]]
    items.sort(key=lambda item:(item["percentage"],item["name"].casefold()))
    page_number=max(page_number,1);size=min(max(page_size,1),100);start=(page_number-1)*size;subset=items[start:start+size]
    return {"items":subset,"page":page_number,"pageSize":size,"total":len(items),"hasMore":start+size<len(items),"threshold":threshold}


@router.get("/attendance/sessions/{session_id}/export")
def export_session(session_id:str,format:str=Query("csv",pattern="^(csv|json|xlsx|pdf)$"),db:Session=Depends(get_db),actor:User=Depends(current_user)):
    session=require_session_access(db,actor,session_id)
    rows=db.execute(select(AttendanceRecord,Student).join(Student,Student.id==AttendanceRecord.student_id).where(AttendanceRecord.session_id==session_id).order_by(Student.roll_number)).all()
    data=[{"student_id":s.student_id,"roll_number":s.roll_number,"name":s.name,"ai_status":r.ai_status.value,"faculty_status":r.status.value,"score":r.score,"review_reason":r.review_reason,"model_version":r.model_version} for r,s in rows]
    filename=f"attendance-{session.attendance_date}-{session_id}.{format}"
    headers={"Content-Disposition":f'attachment; filename="{filename}"'}
    if format=="json":return Response(json.dumps({"session":SessionOut.model_validate(session).model_dump(mode="json"),"records":data},indent=2),media_type="application/json",headers=headers)
    fields=list(data[0]) if data else ["student_id","roll_number","name","ai_status","faculty_status","score","review_reason","model_version"]
    if format=="csv":
        target=io.StringIO();writer=csv.DictWriter(target,fieldnames=fields);writer.writeheader();writer.writerows(data);return Response(target.getvalue(),media_type="text/csv",headers=headers)
    if format=="xlsx":
        from openpyxl import Workbook
        book=Workbook();sheet=book.active;sheet.title="Attendance";sheet.append(fields)
        for item in data:sheet.append([item.get(field) for field in fields])
        output=io.BytesIO();book.save(output);return Response(output.getvalue(),media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",headers=headers)
    from reportlab.lib.pagesizes import A4,landscape
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate,Table,TableStyle,Paragraph,Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    output=io.BytesIO();doc=SimpleDocTemplate(output,pagesize=landscape(A4));styles=getSampleStyleSheet();body=[Paragraph(f"Attendance — {session.attendance_date}",styles["Title"]),Spacer(1,12)]
    table=Table([["Student ID","Roll","Name","AI","Faculty","Score"]]+[[x["student_id"],x["roll_number"],x["name"],x["ai_status"],x["faculty_status"],"" if x["score"] is None else f'{x["score"]:.4f}'] for x in data],repeatRows=1)
    table.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#0f766e")),("TEXTCOLOR",(0,0),(-1,0),colors.white),("GRID",(0,0),(-1,-1),.5,colors.grey),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),8),("VALIGN",(0,0),(-1,-1),"TOP")]))
    body.append(table);doc.build(body);return Response(output.getvalue(),media_type="application/pdf",headers=headers)
