from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .domain import audit, authorized_class_ids, ensure_version, page
from .errors import Problem
from .models import (AttendanceRecord,AttendanceSession,AttendanceSessionClass,AttendanceStatus,AuditEntry, CourseClass, Enrolment, Faculty, FacultyClassAssignment,
                     FacultyStatus, InstitutionSettings, Role, SessionStatus, Student, StudentFaceEmbedding, StudentFaceImage, User)
from .config import get_settings
from .schemas import (AssignmentRequest, ClassIn, ClassOut, ClassPatch, EnrolmentUpdate,
                      FacultyIn, FacultyOut, FacultyPatch, Page, SettingsOut, SettingsPatch,
                      StudentIn, StudentOut, StudentPatch)
from .security import hash_password, require_roles

router = APIRouter(tags=["Administration"])
admin = require_roles(Role.ADMIN)

def faculty_json(db:Session,item:Faculty):
    user=db.get(User,item.user_id);assigned=list(db.scalars(select(FacultyClassAssignment.class_id).where(FacultyClassAssignment.faculty_id==item.id)))
    return {"id":item.id,"name":item.name,"email":user.email if user else "","role":"FACULTY","avatarUrl":None,"department":item.department,"employeeId":item.employee_id,"designation":item.designation,"assignedClassIds":assigned,"phone":None,"status":item.status.value,"joinedAt":user.created_at.isoformat() if user else None,"version":item.version}

def class_json(db:Session,item:CourseClass):
    assignment=db.scalar(select(FacultyClassAssignment).where(FacultyClassAssignment.class_id==item.id))
    member=db.get(Faculty,assignment.faculty_id) if assignment else None
    count=db.scalar(select(func.count()).select_from(Enrolment).where(Enrolment.class_id==item.id)) or 0
    attendance=db.execute(select(AttendanceRecord.status).join(AttendanceSession,AttendanceSession.id==AttendanceRecord.session_id)
                          .join(AttendanceSessionClass,AttendanceSessionClass.session_id==AttendanceSession.id)
                          .where(AttendanceSessionClass.class_id==item.id,AttendanceSession.status==SessionStatus.FINALIZED,
                                 AttendanceRecord.status.in_([AttendanceStatus.PRESENT,AttendanceStatus.ABSENT]))).scalars().all()
    attendance_percentage=round(100*sum(value==AttendanceStatus.PRESENT for value in attendance)/len(attendance),2) if attendance else 0
    return {"id":item.id,"code":item.code,"subject":item.subject,"department":item.department,"semester":item.semester,"section":item.section,"academic_session":item.academic_session,"archived":item.archived,"version":item.version,"faculty_id":member.id if member else None,"faculty_name":member.name if member else None,"student_count":count,"attendance_percentage":attendance_percentage}

def student_json(db:Session,item:Student,profile=False):
    class_ids=list(db.scalars(select(Enrolment.class_id).where(Enrolment.student_id==item.id)))
    face_count=db.scalar(select(func.count()).select_from(StudentFaceEmbedding).join(StudentFaceImage,StudentFaceImage.id==StudentFaceEmbedding.image_id).where(StudentFaceImage.student_id==item.id,StudentFaceImage.revoked_at.is_(None),StudentFaceEmbedding.revoked_at.is_(None))) or 0
    rows=db.execute(select(AttendanceRecord.status,AttendanceSession.attendance_date,AttendanceSession.id,AttendanceSessionClass.class_id,CourseClass.subject).join(AttendanceSession,AttendanceSession.id==AttendanceRecord.session_id).join(AttendanceSessionClass,AttendanceSessionClass.session_id==AttendanceSession.id).join(CourseClass,CourseClass.id==AttendanceSessionClass.class_id).where(AttendanceRecord.student_id==item.id,AttendanceSession.status==SessionStatus.FINALIZED).order_by(AttendanceSession.attendance_date.desc())).all()
    determined=[r for r in rows if r.status in {AttendanceStatus.PRESENT,AttendanceStatus.ABSENT}];overall=round(100*sum(r.status==AttendanceStatus.PRESENT for r in determined)/len(determined),2) if determined else 0
    result={"id":item.id,"studentId":item.student_id,"rollNumber":item.roll_number,"name":item.name,"avatarUrl":None,"department":item.department,"semester":item.semester,"section":item.section,"overallAttendance":overall,"faceEnrolled":face_count>=get_settings().min_enrolment_images,"twinGroupId":None,"primaryClassId":class_ids[0] if class_ids else "","version":item.version}
    if profile:
        by_class={};recent=[]
        for cid in class_ids:
            selected=[r for r in rows if r.class_id==cid and r.status in {AttendanceStatus.PRESENT,AttendanceStatus.ABSENT}];by_class[cid]=round(100*sum(r.status==AttendanceStatus.PRESENT for r in selected)/len(selected),2) if selected else 0
        for r in rows[:20]:recent.append({"date":r.attendance_date.isoformat(),"className":r.subject,"classId":r.class_id,"status":r.status.value,"sessionId":r.id})
        result.update({"enrolledClassIds":class_ids,"recentAttendance":recent,"attendanceByClass":by_class})
    return result


def _commit(db: Session, message="A record with that identifier already exists."):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Problem(409, "Duplicate record", message) from exc


@router.post("/faculty", status_code=201)
def create_faculty(payload: FacultyIn, db: Session = Depends(get_db), actor: User = Depends(admin)):
    user = User(email=payload.email.lower(), password_hash=hash_password(payload.password), role=Role.FACULTY)
    db.add(user); db.flush()
    member = Faculty(user_id=user.id, employee_id=payload.employee_id, name=payload.name,
                     department=payload.department, designation=payload.designation)
    db.add(member); db.flush(); audit(db, actor, "FACULTY_CREATED", member, after={"employee_id": member.employee_id})
    _commit(db); return faculty_json(db,member)


@router.get("/faculty")
def list_faculty(search: str | None = None, department:str|None=None,status:FacultyStatus|None=None,
                 class_id:str|None=Query(None,alias="classId"),page_number: int = Query(1, alias="page"), page_size: int = 25,
                 db: Session = Depends(get_db), _: User = Depends(admin)):
    q = select(Faculty).order_by(Faculty.name)
    if search: q = q.where(or_(Faculty.name.ilike(f"%{search}%"), Faculty.employee_id.ilike(f"%{search}%")))
    if department:q=q.where(Faculty.department==department)
    if status:q=q.where(Faculty.status==status)
    if class_id:q=q.join(FacultyClassAssignment,FacultyClassAssignment.faculty_id==Faculty.id).where(FacultyClassAssignment.class_id==class_id)
    items,total,p,s = page(q,db,page_number,page_size); return {"items":[faculty_json(db,x) for x in items],"page":p,"pageSize":s,"total":total,"hasMore":p*s<total}


@router.get("/faculty/{faculty_id}")
def get_faculty(faculty_id: str, db: Session = Depends(get_db), _: User = Depends(admin)):
    item=db.get(Faculty,faculty_id)
    if not item: raise Problem(404,"Faculty not found","The faculty member does not exist.")
    return faculty_json(db,item)


@router.patch("/faculty/{faculty_id}")
def patch_faculty(faculty_id: str,payload:FacultyPatch,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(Faculty,faculty_id)
    if not item: raise Problem(404,"Faculty not found","The faculty member does not exist.")
    ensure_version(item,payload.version); before={"status":item.status.value,"name":item.name}
    for key,value in payload.model_dump(exclude={"version"},exclude_none=True).items(): setattr(item,key,value)
    item.version+=1; audit(db,actor,"FACULTY_UPDATED",item,before=before,after={"status":item.status.value,"name":item.name}); db.commit(); return faculty_json(db,item)

@router.patch("/faculty/{faculty_id}/status")
def faculty_status(faculty_id:str,payload:dict,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(Faculty,faculty_id)
    if not item:raise Problem(404,"Faculty not found","The faculty member does not exist.")
    item.status=payload.get("status",item.status);item.version+=1;audit(db,actor,"FACULTY_STATUS_CHANGED",item,after={"status":item.status.value});db.commit();return faculty_json(db,item)


@router.post("/students",status_code=201)
def create_student(payload:StudentIn,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=Student(**payload.model_dump()); db.add(item); db.flush(); audit(db,actor,"STUDENT_CREATED",item,after={"student_id":item.student_id}); _commit(db); return student_json(db,item)


@router.get("/students")
def list_students(search:str|None=None,department:str|None=None,semester:int|None=None,class_id:str|None=Query(None,alias="classId"),
                  low_attendance_only:bool=Query(False,alias="lowAttendanceOnly"),page_number:int=Query(1,alias="page"),page_size:int=25,
                  db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    q=select(Student).order_by(Student.name)
    if actor.role == Role.FACULTY or class_id:q=q.join(Enrolment,Enrolment.student_id==Student.id)
    if actor.role == Role.FACULTY:q=q.where(Enrolment.class_id.in_(authorized_class_ids(db,actor))).distinct()
    if class_id:q=q.where(Enrolment.class_id==class_id)
    if search:q=q.where(or_(Student.name.ilike(f"%{search}%"),Student.student_id.ilike(f"%{search}%"),Student.roll_number.ilike(f"%{search}%")))
    if department:q=q.where(Student.department==department)
    if semester:q=q.where(Student.semester==semester)
    if low_attendance_only:
        threshold_row=db.get(InstitutionSettings,1);threshold=threshold_row.attendance_threshold if threshold_row else 75
        low_query=(select(AttendanceRecord.student_id).join(AttendanceSession,AttendanceSession.id==AttendanceRecord.session_id)
                   .where(AttendanceSession.status==SessionStatus.FINALIZED,AttendanceRecord.status.in_([AttendanceStatus.PRESENT,AttendanceStatus.ABSENT])))
        if actor.role==Role.FACULTY:low_query=low_query.where(AttendanceSession.faculty_id==db.scalar(select(Faculty.id).where(Faculty.user_id==actor.id)))
        low_query=low_query.group_by(AttendanceRecord.student_id).having(100*func.sum(case((AttendanceRecord.status==AttendanceStatus.PRESENT,1),else_=0))/func.count()<threshold)
        q=q.where(Student.id.in_(low_query))
    items,total,p,s=page(q,db,page_number,page_size);return {"items":[student_json(db,x) for x in items],"page":p,"pageSize":s,"total":total,"hasMore":p*s<total}


@router.get("/students/{student_id}")
def get_student(student_id:str,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    item=db.get(Student,student_id)
    if not item:raise Problem(404,"Student not found","The student does not exist.")
    if actor.role == Role.FACULTY and not db.scalar(select(Enrolment.id).where(Enrolment.student_id==student_id,Enrolment.class_id.in_(authorized_class_ids(db,actor)))):
        raise Problem(403,"Forbidden","This student is outside your assigned scope.")
    return student_json(db,item,True)


@router.patch("/students/{student_id}",response_model=StudentOut)
def patch_student(student_id:str,payload:StudentPatch,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(Student,student_id)
    if not item:raise Problem(404,"Student not found","The student does not exist.")
    ensure_version(item,payload.version);before={"name":item.name,"active":item.active}
    for k,v in payload.model_dump(exclude={"version"},exclude_none=True).items():setattr(item,k,v)
    item.version+=1;audit(db,actor,"STUDENT_UPDATED",item,before=before,after={"name":item.name,"active":item.active});db.commit();return item


@router.post("/classes",status_code=201)
def create_class(payload:ClassIn,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=CourseClass(**payload.model_dump());db.add(item);db.flush();audit(db,actor,"CLASS_CREATED",item,after={"code":item.code});_commit(db);return class_json(db,item)


@router.get("/classes")
def list_classes(search:str|None=None,faculty_id:str|None=Query(None,alias="facultyId"),semester:int|None=None,
                 department:str|None=None,status:str|None=None,unassigned_only:bool=Query(False,alias="unassignedOnly"),
                 page_number:int=Query(1,alias="page"),page_size:int=25,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    q=select(CourseClass).order_by(CourseClass.code)
    if actor.role == Role.FACULTY:q=q.where(CourseClass.id.in_(authorized_class_ids(db,actor)))
    if search:q=q.where(or_(CourseClass.code.ilike(f"%{search}%"),CourseClass.subject.ilike(f"%{search}%")))
    if faculty_id:q=q.join(FacultyClassAssignment,FacultyClassAssignment.class_id==CourseClass.id).where(FacultyClassAssignment.faculty_id==faculty_id)
    if semester is not None:q=q.where(CourseClass.semester==semester)
    if department:q=q.where(CourseClass.department==department)
    if status in {"ACTIVE","ARCHIVED"}:q=q.where(CourseClass.archived==(status=="ARCHIVED"))
    if unassigned_only:q=q.where(~select(FacultyClassAssignment.id).where(FacultyClassAssignment.class_id==CourseClass.id).exists())
    items,total,p,s=page(q,db,page_number,page_size);return {"items":[class_json(db,x) for x in items],"page":p,"page_size":s,"total":total,"has_more":p*s<total}


@router.get("/classes/{class_id}")
def get_class(class_id:str,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    item=db.get(CourseClass,class_id)
    if not item:raise Problem(404,"Class not found","The class does not exist.")
    if actor.role==Role.FACULTY and class_id not in authorized_class_ids(db,actor):raise Problem(403,"Forbidden","This class is outside your assigned scope.")
    return class_json(db,item)


@router.patch("/classes/{class_id}")
def patch_class(class_id:str,payload:ClassPatch,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(CourseClass,class_id)
    if not item:raise Problem(404,"Class not found","The class does not exist.")
    ensure_version(item,payload.version);before={"subject":item.subject,"archived":item.archived}
    for k,v in payload.model_dump(exclude={"version"},exclude_none=True).items():setattr(item,k,v)
    item.version+=1;audit(db,actor,"CLASS_UPDATED",item,before=before,after={"subject":item.subject,"archived":item.archived});db.commit();return class_json(db,item)


@router.put("/classes/{class_id}/faculty",status_code=204)
def assign_faculty(class_id:str,payload:AssignmentRequest,db:Session=Depends(get_db),actor:User=Depends(admin)):
    if not db.get(CourseClass,class_id) or not db.get(Faculty,payload.faculty_id):raise Problem(404,"Record not found","The class or faculty member does not exist.")
    for existing in db.scalars(select(FacultyClassAssignment).where(FacultyClassAssignment.class_id==class_id)).all():
        if existing.faculty_id!=payload.faculty_id: db.delete(existing)
    if not db.scalar(select(FacultyClassAssignment).where(FacultyClassAssignment.class_id==class_id,FacultyClassAssignment.faculty_id==payload.faculty_id)):
        row=FacultyClassAssignment(class_id=class_id,faculty_id=payload.faculty_id);db.add(row);db.flush();audit(db,actor,"FACULTY_ASSIGNED",row,after={"class_id":class_id,"faculty_id":payload.faculty_id});db.commit()


@router.delete("/classes/{class_id}/faculty/{faculty_id}",status_code=204)
def unassign_faculty(class_id:str,faculty_id:str,db:Session=Depends(get_db),actor:User=Depends(admin)):
    row=db.scalar(select(FacultyClassAssignment).where(FacultyClassAssignment.class_id==class_id,FacultyClassAssignment.faculty_id==faculty_id))
    if not row:raise Problem(404,"Assignment not found","The faculty assignment does not exist.")
    audit(db,actor,"FACULTY_UNASSIGNED",row,before={"class_id":class_id,"faculty_id":faculty_id});db.delete(row);db.commit()


@router.patch("/classes/{class_id}/enrolments",status_code=204)
def update_enrolments(class_id:str,payload:EnrolmentUpdate,db:Session=Depends(get_db),actor:User=Depends(admin)):
    if not db.get(CourseClass,class_id):raise Problem(404,"Class not found","The class does not exist.")
    for sid in payload.remove_student_ids:
        row=db.scalar(select(Enrolment).where(Enrolment.class_id==class_id,Enrolment.student_id==sid))
        if row:db.delete(row)
    for sid in payload.add_student_ids:
        if not db.get(Student,sid):raise Problem(404,"Student not found",f"Student {sid} does not exist.")
        if not db.scalar(select(Enrolment).where(Enrolment.class_id==class_id,Enrolment.student_id==sid)):db.add(Enrolment(class_id=class_id,student_id=sid))
    audit(db,actor,"ENROLMENT_UPDATED",db.get(CourseClass,class_id),after=payload.model_dump());db.commit()


@router.get("/classes/{class_id}/enrolments",response_model=Page[StudentOut])
def list_enrolments(class_id:str,page_number:int=Query(1,alias="page"),page_size:int=25,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    if not db.get(CourseClass,class_id):raise Problem(404,"Class not found","The class does not exist.")
    if actor.role==Role.FACULTY and class_id not in authorized_class_ids(db,actor):raise Problem(403,"Forbidden","This class is outside your assigned scope.")
    q=select(Student).join(Enrolment,Enrolment.student_id==Student.id).where(Enrolment.class_id==class_id).order_by(Student.name)
    items,total,p,s=page(q,db,page_number,page_size);return Page(items=items,page=p,page_size=s,total=total,has_more=p*s<total)


@router.get("/settings",response_model=SettingsOut)
@router.get("/settings/institution",response_model=SettingsOut,include_in_schema=False)
def get_settings_route(db:Session=Depends(get_db),_:User=Depends(admin)):
    item=db.get(InstitutionSettings,1)
    if not item:item=InstitutionSettings(id=1);db.add(item);db.commit()
    return item


@router.patch("/settings",response_model=SettingsOut)
@router.patch("/settings/institution",response_model=SettingsOut,include_in_schema=False)
def patch_settings(payload:SettingsPatch,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(InstitutionSettings,1) or InstitutionSettings(id=1);db.add(item);db.flush();ensure_version(item,payload.version);before={"attendance_threshold":item.attendance_threshold}
    for k,v in payload.model_dump(exclude={"version"},exclude_none=True).items():setattr(item,k,v)
    item.version+=1;audit(db,actor,"SETTING_CHANGED",item,before=before,after={"attendance_threshold":item.attendance_threshold});db.commit();return item


@router.get("/audit",response_model=Page[dict])
def list_audit(session_id:str|None=Query(None,alias="sessionId"),student_id:str|None=Query(None,alias="studentId"),
               actor_id:str|None=Query(None,alias="actorId"),action:str|None=None,entity_type:str|None=Query(None,alias="entityType"),
               from_date:date|None=Query(None,alias="from"),to_date:date|None=Query(None,alias="to"),search:str|None=None,
               page_number:int=Query(1,alias="page"),page_size:int=25,db:Session=Depends(get_db),_:User=Depends(admin)):
    q=select(AuditEntry).order_by(AuditEntry.created_at.desc())
    if session_id:q=q.where(AuditEntry.entity_id==session_id)
    if student_id:q=q.where(AuditEntry.entity_id==student_id)
    if actor_id:q=q.where(AuditEntry.actor_id==actor_id)
    if action:q=q.where(AuditEntry.action==action)
    if entity_type:q=q.where(func.lower(AuditEntry.entity_type)==entity_type.lower())
    if from_date:q=q.where(AuditEntry.created_at>=datetime.combine(from_date,time.min))
    if to_date:q=q.where(AuditEntry.created_at<datetime.combine(to_date+timedelta(days=1),time.min))
    if search:q=q.where(or_(AuditEntry.action.ilike(f"%{search}%"),AuditEntry.entity_type.ilike(f"%{search}%"),AuditEntry.entity_id.ilike(f"%{search}%"),AuditEntry.reason.ilike(f"%{search}%")))
    items,total,p,s=page(q,db,page_number,page_size)
    data=[]
    for x in items:
        user=db.get(User,x.actor_id);member=db.scalar(select(Faculty).where(Faculty.user_id==x.actor_id)) if user and user.role==Role.FACULTY else None
        data.append({"id":x.id,"action":x.action,"entity_type":x.entity_type,"entity_id":x.entity_id,"before":x.before,"after":x.after,
                     "reason":x.reason,"created_at":x.created_at,"actor_id":x.actor_id,
                     "actor_name":member.name if member else (user.email if user else "System"),"actor_role":user.role.value if user else "System"})
    return Page(items=data,page=p,page_size=s,total=total,has_more=p*s<total)
