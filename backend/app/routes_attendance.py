import hashlib
import csv
import io
import json
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .domain import (audit, authorized_class_ids, candidate_student_ids, ensure_version,
                     faculty_for_user, make_job_key, page, require_session_access)
from .errors import Problem
from .models import (AttendanceRecord, AttendanceSession, AttendanceSessionClass, CourseClass,
                     AttendanceSessionImage, AttendanceStatus, Enrolment, JobStatus,
                     RecognitionJob, RecognitionCandidate, FaceDetection, Role, SessionStatus, StudentFaceEmbedding,
                     StudentFaceImage, Student, TwinReview, User, InstitutionSettings)
from .schemas import (AmendmentRequest, AttendanceRecordOut, FinalizeRequest, Page,
                      SessionCreate, SessionOut)
from .security import create_image_token, current_user, require_roles, verify_image_token
from .storage import ObjectStorage, validate_image
from .worker import process_attendance, process_face_enrolment

router = APIRouter(tags=["Attendance"])


@router.post("/students/{student_id}/face-images", status_code=201)
async def enrol_faces(student_id: str, files: list[UploadFile] = File(...), db: Session = Depends(get_db),
                       actor: User = Depends(require_roles(Role.ADMIN))):
    settings = get_settings()
    if not settings.min_enrolment_images <= len(files) <= settings.max_enrolment_images:
        raise Problem(422, "Invalid image count", f"Upload {settings.min_enrolment_images}-{settings.max_enrolment_images} images together.")
    from .models import Student
    student = db.get(Student, student_id)
    if not student: raise Problem(404, "Student not found", "The student does not exist.")
    validated = [validate_image(await f.read()) for f in files]
    if len({x.checksum for x in validated}) != len(validated):
        raise Problem(409, "Duplicate image", "The upload contains duplicate images.")
    storage = ObjectStorage()
    rows=[]
    for image in validated:
        key=f"students/{student_id}/faces/{image.checksum}"
        storage.put(key,image)
        row=StudentFaceImage(student_id=student_id,object_key=key,checksum=image.checksum,mime_type=image.mime_type,width=image.width,height=image.height,quality={"status":"PENDING_MODEL_VALIDATION"})
        db.add(row);rows.append(row)
    db.flush();audit(db,actor,"FACE_IMAGES_ENROLLED",student,after={"image_ids":[r.id for r in rows]});db.commit()
    for row in rows:
        if settings.queue_backend=="celery":
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
    faculty=faculty_for_user(db,actor);session=AttendanceSession(faculty_id=faculty.id,attendance_date=payload.attendance_date or date.today())
    db.add(session);db.flush()
    for class_id in payload.class_ids:db.add(AttendanceSessionClass(session_id=session.id,class_id=class_id))
    audit(db,actor,"ATTENDANCE_SESSION_CREATED",session,after={"class_ids":payload.class_ids});db.commit();return session


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
        evidence.append({"detection_id":detection.id,"image_id":detection.image_id,"box":detection.box,"quality":detection.quality,"model_version":detection.model_version,"candidates":[{"student_id":c.student_id,"score":c.score,"rank":c.rank} for c in candidates]})
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
    return {"session":SessionOut.model_validate(session),"class_ids":class_ids,"classes":[{"id":c.id,"subject":c.subject,"display_code":c.code,"student_count":db.scalar(select(func.count()).select_from(Enrolment).where(Enrolment.class_id==c.id)) or 0} for c in classes],"records":enriched,"evidence":evidence,"images":[{"id":x.id,"width":x.width,"height":x.height,"content_url":f"/api/v1/attendance/sessions/{session_id}/images/{x.id}/annotated?token={create_image_token(session_id,x.id)}"} for x in images],"summary":{"total":len(records),"present":counts["PRESENT"],"absent":counts["ABSENT"],"review":counts["REVIEW"],"unknown":counts["UNKNOWN"],"recognized":sum(1 for r in records if r.score is not None),"unmatched_faces":sum(1 for x in evidence if not x["candidates"] or x["candidates"][0]["score"]<get_settings().match_threshold),"percentage":round(100*counts["PRESENT"]/resolved,2) if resolved else 0}}


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
    return {"items":[{"id":r.id,"student_a_id":r.student_a_id,"student_b_id":r.student_b_id,"resolution":r.resolution,"resolved_at":r.resolved_at} for r in rows]}


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
    if session.status!=SessionStatus.FAILED:raise Problem(409,"Session is not failed","Only failed sessions can be retried.")
    job=RecognitionJob(session_id=session_id,idempotency_key=hashlib.sha256(f"retry|{session_id}|{datetime.now(timezone.utc).isoformat()}".encode()).hexdigest())
    db.add(job);db.flush();session.status=SessionStatus.QUEUED;session.version+=1;audit(db,actor,"RECOGNITION_RETRIED",job);db.commit()
    if get_settings().queue_backend=="celery":
        try:process_attendance.delay(job.id)
        except Exception as exc:
            job.status=JobStatus.FAILED;job.error_code="QUEUE_UNAVAILABLE";session.status=SessionStatus.FAILED;db.commit()
            raise Problem(503,"Queue unavailable","The retry could not be queued; the images are preserved.") from exc
    return {"job_id":job.id,"status":job.status}


@router.get("/attendance/sessions",response_model=Page[SessionOut])
def history(page_number:int=Query(1,alias="page"),page_size:int=25,db:Session=Depends(get_db),actor:User=Depends(current_user)):
    q=select(AttendanceSession).order_by(AttendanceSession.created_at.desc())
    if actor.role==Role.FACULTY:q=q.where(AttendanceSession.faculty_id==faculty_for_user(db,actor).id)
    items,total,p,s=page(q,db,page_number,page_size);return Page(items=items,page=p,page_size=s,total=total,has_more=p*s<total)


@router.get("/reports/attendance")
def report(class_id:str|None=None,faculty_id:str|None=None,from_date:date|None=Query(None,alias="from"),to_date:date|None=Query(None,alias="to"),db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    q=select(AttendanceRecord.status,func.count()).join(AttendanceSession,AttendanceSession.id==AttendanceRecord.session_id).where(AttendanceSession.status==SessionStatus.FINALIZED)
    if actor.role==Role.FACULTY:q=q.where(AttendanceSession.faculty_id==faculty_for_user(db,actor).id)
    elif faculty_id:q=q.where(AttendanceSession.faculty_id==faculty_id)
    if class_id:q=q.join(AttendanceSessionClass,AttendanceSessionClass.session_id==AttendanceSession.id).where(AttendanceSessionClass.class_id==class_id)
    if from_date:q=q.where(AttendanceSession.attendance_date>=from_date)
    if to_date:q=q.where(AttendanceSession.attendance_date<=to_date)
    rows=db.execute(q.group_by(AttendanceRecord.status)).all();counts={status.value:count for status,count in rows};resolved=counts.get("PRESENT",0)+counts.get("ABSENT",0)
    return {"counts":counts,"attendance_percentage":round(100*counts.get("PRESENT",0)/resolved,2) if resolved else 0,"review_and_unknown_excluded":True}


@router.get("/reports/attendance/students")
def student_report(page_number:int=Query(1,alias="page"),page_size:int=25,low_attendance_only:bool=Query(False,alias="lowAttendanceOnly"),db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    base=select(AttendanceRecord.student_id,
                func.sum(case((AttendanceRecord.status==AttendanceStatus.PRESENT,1),else_=0)).label("attended"),
                func.count().label("total")).join(AttendanceSession,AttendanceSession.id==AttendanceRecord.session_id).where(AttendanceSession.status==SessionStatus.FINALIZED,AttendanceRecord.status.in_([AttendanceStatus.PRESENT,AttendanceStatus.ABSENT]))
    if actor.role==Role.FACULTY:base=base.where(AttendanceSession.faculty_id==faculty_for_user(db,actor).id)
    rows=db.execute(base.group_by(AttendanceRecord.student_id)).all();settings_row=db.get(InstitutionSettings,1);threshold=settings_row.attendance_threshold if settings_row else 75
    items=[]
    for sid,attended,total in rows:
        student=db.get(Student,sid)
        items.append({"studentId":sid,"rollNumber":student.roll_number if student else "","name":student.name if student else "Unknown student","avatarUrl":None,"attendedSessions":int(attended),"totalSessions":total,"percentage":round(100*attended/total,2),"belowThreshold":round(100*attended/total,2)<threshold})
    if low_attendance_only:items=[x for x in items if x["percentage"]<threshold]
    start=(max(page_number,1)-1)*min(max(page_size,1),100);size=min(max(page_size,1),100);subset=items[start:start+size]
    return {"items":subset,"page":max(page_number,1),"pageSize":size,"total":len(items),"hasMore":start+size<len(items),"threshold":threshold}


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
