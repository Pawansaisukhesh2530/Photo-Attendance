from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .domain import audit, authorized_class_ids, ensure_version, page
from .errors import Problem
from .models import (
    AcademicBatch,
    AcademicProgram,
    AcademicSection,
    AttendanceRecord,
    AttendanceSession,
    AttendanceSessionClass,
    AttendanceStatus,
    AuditEntry,
    CourseClass,
    Department,
    Enrolment,
    Faculty,
    FacultyClassAssignment,
    FacultyStatus,
    InstitutionSettings,
    MappingStatus,
    ProgramSubject,
    Role,
    School,
    SessionStatus,
    Student,
    StudentFaceEmbedding,
    StudentFaceImage,
    Subject,
    TimetableSlot,
    User,
)
from .schemas import (
    AssignmentRequest,
    ClassIn,
    ClassOut,
    ClassPatch,
    EnrolmentUpdate,
    FacultyIn,
    FacultyOut,
    FacultyPatch,
    FacultyStatusPatch,
    Page,
    SettingsOut,
    SettingsPatch,
    StudentIn,
    StudentMappingPatch,
    StudentOut,
    StudentPatch,
)
from .security import hash_password, require_roles

router = APIRouter(tags=["Administration"])
admin = require_roles(Role.ADMIN)
def allowed_departments(db: Session) -> set[str]:
    settings = db.get(InstitutionSettings, 1)
    return set(settings.departments if settings and settings.departments else ["CSE"])
def allowed_designations(db: Session) -> set[str]:
    settings = db.get(InstitutionSettings, 1)
    return set(settings.faculty_roles if settings and settings.faculty_roles else ["Assistant Professor"])
def allowed_class_types(db: Session) -> set[str]:
    settings = db.get(InstitutionSettings, 1)
    return set(settings.class_types if settings and settings.class_types else ["Lecture", "Lab", "Tutorial"])

def faculty_json(db:Session,item:Faculty,profile:bool=False):
    user=db.get(User,item.user_id);assigned=list(db.scalars(select(FacultyClassAssignment.class_id).where(FacultyClassAssignment.faculty_id==item.id)))
    timetable_slot_count=db.scalar(select(func.count()).select_from(TimetableSlot).where(TimetableSlot.faculty_id==item.id)) or 0
    department=db.get(Department,item.department_id) if item.department_id else None;school=db.get(School,department.school_id) if department else None
    result={"id":item.id,"name":item.name,"email":user.email if user else "","role":"FACULTY","avatarUrl":None,"department":item.department,"departmentId":item.department_id,"schoolId":school.id if school else None,"schoolName":school.name if school else None,"employeeId":item.employee_id,"designation":item.designation,"assignedClassIds":assigned,"timetableSlotCount":timetable_slot_count,"phone":None,"status":item.status.value,"joinedAt":user.created_at.isoformat() if user else None,"version":item.version}
    if profile:
        sessions=list(db.scalars(select(AttendanceSession).where(AttendanceSession.faculty_id==item.id,AttendanceSession.status==SessionStatus.FINALIZED)))
        session_ids=[session.id for session in sessions]
        statuses=list(db.scalars(select(AttendanceRecord.status).where(AttendanceRecord.session_id.in_(session_ids),AttendanceRecord.status.in_([AttendanceStatus.PRESENT,AttendanceStatus.ABSENT])))) if session_ids else []
        activity=db.scalars(select(AuditEntry).where(AuditEntry.entity_id==item.id).order_by(AuditEntry.created_at.desc()).limit(20)).all()
        result.update({"taughtAttendance":{"sessions":len(sessions),"determinedRecords":len(statuses),"presentRecords":sum(value==AttendanceStatus.PRESENT for value in statuses),"percentage":round(100*sum(value==AttendanceStatus.PRESENT for value in statuses)/len(statuses),2) if statuses else 0},
                       "activity":[{"id":entry.id,"action":entry.action,"createdAt":entry.created_at.isoformat(),"reason":entry.reason} for entry in activity]})
    return result

def class_json(db:Session,item:CourseClass,profile:bool=False):
    assignment=db.scalar(select(FacultyClassAssignment).where(FacultyClassAssignment.class_id==item.id))
    member=db.get(Faculty,assignment.faculty_id) if assignment else None
    count=db.scalar(select(func.count()).select_from(Enrolment).where(Enrolment.class_id==item.id)) or 0
    attendance=db.execute(select(AttendanceRecord.status).join(AttendanceSession,AttendanceSession.id==AttendanceRecord.session_id)
                          .join(AttendanceSessionClass,AttendanceSessionClass.session_id==AttendanceSession.id)
                          .where(AttendanceSessionClass.class_id==item.id,AttendanceSession.status==SessionStatus.FINALIZED,
                                 AttendanceRecord.student_id.in_(select(Enrolment.student_id).where(Enrolment.class_id==item.id)),
                                 AttendanceRecord.status.in_([AttendanceStatus.PRESENT,AttendanceStatus.ABSENT]))).scalars().all()
    attendance_percentage=round(100*sum(value==AttendanceStatus.PRESENT for value in attendance)/len(attendance),2) if attendance else 0
    slots=list(db.scalars(select(TimetableSlot).where(TimetableSlot.class_id==item.id).order_by(TimetableSlot.day_of_week,TimetableSlot.start_time)))
    academic_section=db.get(AcademicSection,item.section_id) if item.section_id else None
    academic_batch=db.get(AcademicBatch,academic_section.batch_id) if academic_section else None
    academic_program=db.get(AcademicProgram,academic_batch.program_id) if academic_batch else None
    academic_department=db.get(Department,academic_program.department_id) if academic_program else None
    from .routes_timetable import DAY_NAMES, _format_time
    schedule=[{"day_of_week":s.day_of_week,"day_label":DAY_NAMES.get(s.day_of_week,""),"start_time":_format_time(s.start_time),"end_time":_format_time(s.end_time),"room":s.room or "N/A"} for s in slots]
    result={"id":item.id,"code":item.code,"variant":item.variant,"subject":item.subject,"department":item.department,"semester":item.semester,"section":item.section,"academic_session":item.academic_session,"schoolId":academic_department.school_id if academic_department else None,"departmentId":academic_program.department_id if academic_program else None,"programId":academic_batch.program_id if academic_batch else None,"batchId":academic_section.batch_id if academic_section else None,"programSubjectId":item.program_subject_id,"sectionId":item.section_id,"archived":item.archived,"version":item.version,"faculty_id":member.id if member else None,"faculty_name":member.name if member else None,"student_count":count,"attendance_percentage":attendance_percentage,"schedule":schedule}
    if profile:
        activity=db.scalars(select(AuditEntry).where(AuditEntry.entity_id==item.id).order_by(AuditEntry.created_at.desc()).limit(20)).all()
        result["activity"]=[{"id":entry.id,"action":entry.action,"createdAt":entry.created_at.isoformat(),"reason":entry.reason} for entry in activity]
    return result

def student_json(db:Session,item:Student,profile=False):
    class_ids=list(db.scalars(select(Enrolment.class_id).where(Enrolment.student_id==item.id)))
    face_count=db.scalar(select(func.count()).select_from(StudentFaceEmbedding).join(StudentFaceImage,StudentFaceImage.id==StudentFaceEmbedding.image_id).where(StudentFaceImage.student_id==item.id,StudentFaceImage.revoked_at.is_(None),StudentFaceEmbedding.revoked_at.is_(None),StudentFaceEmbedding.model_version==get_settings().model_version)) or 0
    rows=db.execute(select(AttendanceRecord.status,AttendanceSession.attendance_date,AttendanceSession.id,AttendanceSessionClass.class_id,CourseClass.subject).join(AttendanceSession,AttendanceSession.id==AttendanceRecord.session_id).join(AttendanceSessionClass,AttendanceSessionClass.session_id==AttendanceSession.id).join(CourseClass,CourseClass.id==AttendanceSessionClass.class_id).where(AttendanceRecord.student_id==item.id,AttendanceSessionClass.class_id.in_(class_ids),AttendanceSession.status==SessionStatus.FINALIZED).order_by(AttendanceSession.attendance_date.desc())).all()
    determined_by_record=db.scalars(select(AttendanceRecord.status).join(AttendanceSession,AttendanceSession.id==AttendanceRecord.session_id).where(AttendanceRecord.student_id==item.id,AttendanceSession.status==SessionStatus.FINALIZED,AttendanceRecord.status.in_([AttendanceStatus.PRESENT,AttendanceStatus.ABSENT]))).all()
    overall=round(100*sum(status==AttendanceStatus.PRESENT for status in determined_by_record)/len(determined_by_record),2) if determined_by_record else 0
    result={"id":item.id,"studentId":item.student_id,"rollNumber":item.roll_number,"name":item.name,"avatarUrl":None,"department":item.department,"semester":item.semester,"section":item.section,"schoolId":item.school_id,"departmentId":item.department_id,"programId":item.program_id,"batchId":item.batch_id,"sectionId":item.section_id,"mappingStatus":item.mapping_status.value,"mappingNote":item.mapping_note,"active":item.active,"overallAttendance":overall,"faceEnrolled":face_count>=get_settings().min_enrolment_images,"twinGroupId":None,"primaryClassId":class_ids[0] if class_ids else "","version":item.version}
    if profile:
        by_class={};recent=[]
        for cid in class_ids:
            selected=[r for r in rows if r.class_id==cid and r.status in {AttendanceStatus.PRESENT,AttendanceStatus.ABSENT}];by_class[cid]=round(100*sum(r.status==AttendanceStatus.PRESENT for r in selected)/len(selected),2) if selected else 0
        for r in rows[:20]:recent.append({"date":r.attendance_date.isoformat(),"className":r.subject,"classId":r.class_id,"status":r.status.value,"sessionId":r.id})
        activity=db.scalars(select(AuditEntry).where(AuditEntry.entity_id==item.id).order_by(AuditEntry.created_at.desc()).limit(20)).all()
        result.update({"enrolledClassIds":class_ids,"recentAttendance":recent,"attendanceByClass":by_class,"activity":[{"id":entry.id,"action":entry.action,"createdAt":entry.created_at.isoformat(),"reason":entry.reason} for entry in activity]})
    return result


def _commit(db: Session, message="A record with that identifier already exists."):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Problem(409, "Duplicate record", message) from exc


def _flush(db: Session, message="A record with that identifier already exists."):
    """Flush generated identifiers while preserving the API's conflict response."""
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise Problem(409, "Duplicate record", message) from exc


def _student_hierarchy(db: Session, values: dict):
    keys = ("school_id", "department_id", "program_id", "batch_id", "section_id")
    supplied = [values.get(key) for key in keys]
    if any(supplied) and not all(supplied):
        raise Problem(422, "Incomplete academic mapping", "Select School, Department, Programme, Batch, and Section.")
    if not all(supplied):
        return None
    school, department, program, batch, section = (db.get(model, value) for model, value in zip(
        (School, Department, AcademicProgram, AcademicBatch, AcademicSection), supplied))
    if not all((school, department, program, batch, section)) or not all(x.active for x in (school, department, program, batch, section)):
        raise Problem(422, "Invalid academic mapping", "Every selected academic record must exist and be active.")
    if department.school_id != school.id or program.department_id != department.id or batch.program_id != program.id or section.batch_id != batch.id:
        raise Problem(422, "Invalid academic mapping", "The selected records do not form one valid hierarchy path.")
    return school, department, program, batch, section


def _normalized_class(db: Session, program_subject_id: str | None, section_id: str | None):
    if bool(program_subject_id) != bool(section_id):
        raise Problem(422, "Incomplete class mapping", "Select both a programme subject and a section.")
    if not program_subject_id:
        return None
    link, section = db.get(ProgramSubject, program_subject_id), db.get(AcademicSection, section_id)
    if not link or not section or not section.active:
        raise Problem(422, "Invalid class mapping", "Select an active programme subject and section.")
    batch, program, subject = db.get(AcademicBatch, section.batch_id), db.get(AcademicProgram, link.program_id), db.get(Subject, link.subject_id)
    if not batch or batch.program_id != link.program_id or not program or not program.active or not subject or not subject.active:
        raise Problem(422, "Invalid class mapping", "The subject and section must belong to the same active programme.")
    return link, section


@router.post("/faculty", status_code=201)
def create_faculty(payload: FacultyIn, db: Session = Depends(get_db), actor: User = Depends(admin)):
    department = db.get(Department, payload.department_id) if payload.department_id else None
    if payload.department_id and (not department or not department.active):
        raise Problem(422, "Invalid department", "Choose an active department from the academic hierarchy.")
    if not payload.department_id and payload.department not in allowed_departments(db):
        raise Problem(422, "Invalid department", "Choose a department from the institution list.")
    if payload.designation not in allowed_designations(db):
        raise Problem(422, "Invalid designation", "Choose a role from the institution list.")
    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(get_settings().default_account_password),
        role=Role.FACULTY,
    )
    db.add(user); _flush(db, "That email address is already assigned to an account.")
    member = Faculty(user_id=user.id, employee_id=payload.employee_id, name=payload.name,
                     department=department.code if department else payload.department,
                     department_id=payload.department_id, designation=payload.designation)
    db.add(member); _flush(db, "That employee ID is already assigned to a faculty member."); audit(db, actor, "FACULTY_CREATED", member, after={"employee_id": member.employee_id})
    _commit(db); return faculty_json(db,member)


@router.get("/faculty")
def list_faculty(search: str | None = None, department:str|None=None,
                 school_id:str|None=Query(None,alias="schoolId"),
                 department_id:str|None=Query(None,alias="departmentId"),status:FacultyStatus|None=None,
                 class_id:str|None=Query(None,alias="classId"),
                 assigned_only:bool=Query(False,alias="assignedOnly"),
                 page_number: int = Query(1, alias="page"), page_size: int = 25,
                 db: Session = Depends(get_db), _: User = Depends(admin)):
    q = select(Faculty).order_by(Faculty.name)
    if search: q = q.where(or_(Faculty.name.ilike(f"%{search}%"), Faculty.employee_id.ilike(f"%{search}%")))
    if department:q=q.where(Faculty.department==department)
    if school_id:q=q.where(Faculty.department_id.in_(select(Department.id).where(Department.school_id==school_id)))
    if department_id:q=q.where(Faculty.department_id==department_id)
    if status:q=q.where(Faculty.status==status)
    if class_id:q=q.join(FacultyClassAssignment,FacultyClassAssignment.faculty_id==Faculty.id).where(FacultyClassAssignment.class_id==class_id)
    if assigned_only:q=q.where(select(FacultyClassAssignment.id).where(FacultyClassAssignment.faculty_id==Faculty.id).exists())
    items,total,p,s = page(q,db,page_number,page_size); return {"items":[faculty_json(db,x) for x in items],"page":p,"pageSize":s,"total":total,"hasMore":p*s<total}


@router.get("/faculty/{faculty_id}")
def get_faculty(faculty_id: str, db: Session = Depends(get_db), _: User = Depends(admin)):
    item=db.get(Faculty,faculty_id)
    if not item: raise Problem(404,"Faculty not found","The faculty member does not exist.")
    return faculty_json(db,item,profile=True)


@router.patch("/faculty/{faculty_id}")
def patch_faculty(faculty_id: str,payload:FacultyPatch,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(Faculty,faculty_id)
    if not item: raise Problem(404,"Faculty not found","The faculty member does not exist.")
    ensure_version(item,payload.version); before={"status":item.status.value,"name":item.name}
    if payload.department_id is not None:
        department = db.get(Department, payload.department_id)
        if not department or not department.active:
            raise Problem(422, "Invalid department", "Choose an active department from the academic hierarchy.")
    if payload.department is not None and payload.department_id is None and payload.department not in allowed_departments(db):
        raise Problem(422, "Invalid department", "Choose a department from the institution list.")
    if payload.designation is not None and payload.designation not in allowed_designations(db):
        raise Problem(422, "Invalid designation", "Choose a role from the institution list.")
    changes=payload.model_dump(exclude={"version"},exclude_none=True)
    email=changes.pop("email",None)
    if email is not None:
        user=db.get(User,item.user_id)
        user.email=str(email).lower()
    if payload.department_id is not None:
        changes["department"] = department.code
    for key,value in changes.items(): setattr(item,key,value)
    item.version+=1; audit(db,actor,"FACULTY_UPDATED",item,before=before,after={"status":item.status.value,"name":item.name}); _commit(db,"That email address is already assigned to an account."); return faculty_json(db,item)

@router.patch("/faculty/{faculty_id}/status")
def faculty_status(faculty_id:str,payload:FacultyStatusPatch,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(Faculty,faculty_id)
    if not item:raise Problem(404,"Faculty not found","The faculty member does not exist.")
    ensure_version(item,payload.version)
    before={"status":item.status.value};item.status=payload.status;item.version+=1;audit(db,actor,"FACULTY_STATUS_CHANGED",item,before=before,after={"status":item.status.value});db.commit();return faculty_json(db,item)


@router.post("/students",status_code=201)
def create_student(payload:StudentIn,db:Session=Depends(get_db),actor:User=Depends(admin)):
    values=payload.model_dump(); hierarchy=_student_hierarchy(db,values)
    if not hierarchy and payload.department not in allowed_departments(db):
        raise Problem(422, "Invalid department", "Choose a department from the institution list.")
    values["mapping_status"]=MappingStatus.MAPPED if hierarchy else MappingStatus.NEEDS_MAPPING
    values["mapping_note"]=None if hierarchy else "Academic hierarchy must be assigned by an administrator."
    item=Student(**values); db.add(item); _flush(db, "That student ID or roll number already belongs to another student."); audit(db,actor,"STUDENT_CREATED",item,after={"student_id":item.student_id,"mapping_status":item.mapping_status.value}); _commit(db); return student_json(db,item)


@router.get("/students")
def list_students(search:str|None=None,department:str|None=None,school_id:str|None=Query(None,alias="schoolId"),department_id:str|None=Query(None,alias="departmentId"),program_id:str|None=Query(None,alias="programId"),batch_id:str|None=Query(None,alias="batchId"),section_id:str|None=Query(None,alias="sectionId"),mapping_status:MappingStatus|None=Query(None,alias="mappingStatus"),semester:int|None=None,class_id:str|None=Query(None,alias="classId"),
                  low_attendance_only:bool=Query(False,alias="lowAttendanceOnly"),page_number:int=Query(1,alias="page"),page_size:int=25,
                  db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    q=select(Student).order_by(Student.name)
    if actor.role == Role.FACULTY or class_id:q=q.join(Enrolment,Enrolment.student_id==Student.id)
    if actor.role == Role.FACULTY:q=q.where(Enrolment.class_id.in_(authorized_class_ids(db,actor))).distinct()
    if class_id:q=q.where(Enrolment.class_id==class_id)
    if search:q=q.where(or_(Student.name.ilike(f"%{search}%"),Student.student_id.ilike(f"%{search}%"),Student.roll_number.ilike(f"%{search}%")))
    if department:q=q.where(Student.department==department)
    if school_id:q=q.where(Student.school_id==school_id)
    if department_id:q=q.where(Student.department_id==department_id)
    if program_id:q=q.where(Student.program_id==program_id)
    if batch_id:q=q.where(Student.batch_id==batch_id)
    if section_id:q=q.where(Student.section_id==section_id)
    if mapping_status:q=q.where(Student.mapping_status==mapping_status)
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
    changes=payload.model_dump(exclude={"version"},exclude_none=True)
    hierarchy_keys={"school_id","department_id","program_id","batch_id","section_id"}
    if hierarchy_keys.intersection(changes):
        proposed={key:changes.get(key,getattr(item,key)) for key in hierarchy_keys}
        _student_hierarchy(db,proposed)
        changes.update(proposed);changes["mapping_status"]=MappingStatus.MAPPED;changes["mapping_note"]=None
    if payload.department is not None and not hierarchy_keys.intersection(changes) and payload.department not in allowed_departments(db):
        raise Problem(422, "Invalid department", "Choose a department from the institution list.")
    for k,v in changes.items():setattr(item,k,v)
    item.version+=1;audit(db,actor,"STUDENT_UPDATED",item,before=before,after={"name":item.name,"active":item.active,"mapping_status":item.mapping_status.value});db.commit();return item


@router.put("/students/{student_id}/academic-mapping")
def map_student(student_id:str,payload:StudentMappingPatch,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(Student,student_id)
    if not item:raise Problem(404,"Student not found","The student does not exist.")
    ensure_version(item,payload.version);values=payload.model_dump(exclude={"version"});_student_hierarchy(db,values)
    before={"mapping_status":item.mapping_status.value,"school_id":item.school_id,"department_id":item.department_id,"program_id":item.program_id,"batch_id":item.batch_id,"section_id":item.section_id}
    for key,value in values.items():setattr(item,key,value)
    item.mapping_status=MappingStatus.MAPPED;item.mapping_note=None;item.version+=1
    audit(db,actor,"STUDENT_ACADEMIC_MAPPING_CHANGED",item,before=before,after={**values,"mapping_status":item.mapping_status.value});db.commit();return student_json(db,item,True)


@router.post("/classes",status_code=201)
def create_class(payload:ClassIn,db:Session=Depends(get_db),actor:User=Depends(admin)):
    if payload.variant not in allowed_class_types(db):
        raise Problem(422, "Invalid class type", "Choose a class type from the institution settings.")
    normalized=_normalized_class(db,payload.program_subject_id,payload.section_id)
    if not normalized and payload.department not in allowed_departments(db):
        raise Problem(422, "Invalid department", "Choose a department from the institution list.")
    values=payload.model_dump()
    if normalized:
        link,section=normalized;program=db.get(AcademicProgram,link.program_id);department=db.get(Department,program.department_id);subject=db.get(Subject,link.subject_id)
        values.update(subject=subject.name,department=department.code,section=section.code)
        if link.semester_number is not None:values["semester"]=link.semester_number
    item=CourseClass(**values);db.add(item);_flush(db, "That class code and type combination is already in use.");audit(db,actor,"CLASS_CREATED",item,after={"code":item.code});_commit(db);return class_json(db,item)


@router.get("/classes")
def list_classes(search:str|None=None,faculty_id:str|None=Query(None,alias="facultyId"),semester:int|None=None,
                 department:str|None=None,school_id:str|None=Query(None,alias="schoolId"),department_id:str|None=Query(None,alias="departmentId"),
                 program_id:str|None=Query(None,alias="programId"),batch_id:str|None=Query(None,alias="batchId"),
                 program_subject_id:str|None=Query(None,alias="programSubjectId"),section_id:str|None=Query(None,alias="sectionId"),
                 status:str|None=None,unassigned_only:bool=Query(False,alias="unassignedOnly"),
                 unscheduled_only:bool=Query(False,alias="unscheduledOnly"),
                 empty_roster_only:bool=Query(False,alias="emptyRosterOnly"),
                 page_number:int=Query(1,alias="page"),page_size:int=25,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    q=select(CourseClass).order_by(CourseClass.code)
    if actor.role == Role.FACULTY:q=q.where(CourseClass.id.in_(authorized_class_ids(db,actor)))
    if search:q=q.where(or_(CourseClass.code.ilike(f"%{search}%"),CourseClass.subject.ilike(f"%{search}%")))
    if faculty_id:q=q.join(FacultyClassAssignment,FacultyClassAssignment.class_id==CourseClass.id).where(FacultyClassAssignment.faculty_id==faculty_id)
    if semester is not None:q=q.where(CourseClass.semester==semester)
    if department:q=q.where(CourseClass.department==department)
    if any((school_id,department_id,program_id,batch_id)):
        q=q.join(AcademicSection,AcademicSection.id==CourseClass.section_id).join(AcademicBatch,AcademicBatch.id==AcademicSection.batch_id).join(AcademicProgram,AcademicProgram.id==AcademicBatch.program_id)
        if school_id:q=q.join(Department,Department.id==AcademicProgram.department_id).where(Department.school_id==school_id)
        if department_id:q=q.where(AcademicProgram.department_id==department_id)
        if program_id:q=q.where(AcademicBatch.program_id==program_id)
        if batch_id:q=q.where(AcademicSection.batch_id==batch_id)
    if program_subject_id:q=q.where(CourseClass.program_subject_id==program_subject_id)
    if section_id:q=q.where(CourseClass.section_id==section_id)
    if status in {"ACTIVE","ARCHIVED"}:q=q.where(CourseClass.archived==(status=="ARCHIVED"))
    if unassigned_only:q=q.where(~select(FacultyClassAssignment.id).where(FacultyClassAssignment.class_id==CourseClass.id).exists())
    if unscheduled_only:q=q.where(~select(TimetableSlot.id).where(TimetableSlot.class_id==CourseClass.id).exists())
    if empty_roster_only:q=q.where(~select(Enrolment.id).where(Enrolment.class_id==CourseClass.id).exists())
    items,total,p,s=page(q,db,page_number,page_size);return {"items":[class_json(db,x) for x in items],"page":p,"page_size":s,"total":total,"has_more":p*s<total}


@router.get("/classes/{class_id}")
def get_class(class_id:str,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    item=db.get(CourseClass,class_id)
    if not item:raise Problem(404,"Class not found","The class does not exist.")
    if actor.role==Role.FACULTY and class_id not in authorized_class_ids(db,actor):raise Problem(403,"Forbidden","This class is outside your assigned scope.")
    return class_json(db,item,profile=True)


@router.patch("/classes/{class_id}")
def patch_class(class_id:str,payload:ClassPatch,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(CourseClass,class_id)
    if not item:raise Problem(404,"Class not found","The class does not exist.")
    ensure_version(item,payload.version);before={"subject":item.subject,"archived":item.archived}
    changes=payload.model_dump(exclude={"version"},exclude_none=True)
    if changes.get("variant", item.variant) not in allowed_class_types(db):
        raise Problem(422, "Invalid class type", "Choose a class type from the institution settings.")
    normalized=_normalized_class(db,changes.get("program_subject_id",item.program_subject_id),changes.get("section_id",item.section_id))
    if normalized:
        link,section=normalized;program=db.get(AcademicProgram,link.program_id);department=db.get(Department,program.department_id);subject=db.get(Subject,link.subject_id)
        changes.update(subject=subject.name,department=department.code,section=section.code)
        if link.semester_number is not None:changes["semester"]=link.semester_number
    if payload.department is not None and not normalized and payload.department not in allowed_departments(db):
        raise Problem(422, "Invalid department", "Choose a department from the institution list.")
    for k,v in changes.items():setattr(item,k,v)
    item.version+=1;audit(db,actor,"CLASS_UPDATED",item,before=before,after={"subject":item.subject,"archived":item.archived});db.commit();return class_json(db,item)


@router.put("/classes/{class_id}/faculty",status_code=204)
def assign_faculty(class_id:str,payload:AssignmentRequest,db:Session=Depends(get_db),actor:User=Depends(admin)):
    course, member = db.get(CourseClass,class_id), db.get(Faculty,payload.faculty_id)
    if not course or not member:raise Problem(404,"Record not found","The class or faculty member does not exist.")
    if member.status != FacultyStatus.ACTIVE:
        raise Problem(409,"Inactive Faculty","Activate this Faculty member before assigning a new class.")
    if course.section_id and member.department_id:
        section=db.get(AcademicSection,course.section_id);batch=db.get(AcademicBatch,section.batch_id) if section else None
        program=db.get(AcademicProgram,batch.program_id) if batch else None
        if not program or program.department_id != member.department_id:
            raise Problem(422,"Faculty outside academic context","Choose active Faculty from this class Department.")
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
    course=db.get(CourseClass,class_id)
    if not course:raise Problem(404,"Class not found","The class does not exist.")
    for sid in payload.remove_student_ids:
        row=db.scalar(select(Enrolment).where(Enrolment.class_id==class_id,Enrolment.student_id==sid))
        if row:db.delete(row)
    for sid in payload.add_student_ids:
        student=db.get(Student,sid)
        if not student:raise Problem(404,"Student not found",f"Student {sid} does not exist.")
        if student.mapping_status != MappingStatus.MAPPED:
            raise Problem(409,"Student needs academic mapping",f"Map student {student.student_id} before enrolling them in a normalized class.")
        if not course.section_id or not course.program_subject_id:
            raise Problem(409,"Class needs academic mapping","Map this class to a programme subject and section before adding students.")
        if student.section_id != course.section_id:
            raise Problem(422,"Academic scope mismatch",f"Student {student.student_id} does not belong to this class section.")
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
    changed = False
    if item.departments is None:
        item.departments = ["CSE"]
        changed = True
    if item.faculty_roles is None:
        item.faculty_roles = ["Assistant Professor"]
        changed = True
    if item.class_types is None:
        item.class_types = ["Lecture", "Lab", "Tutorial"]
        changed = True
    if not getattr(item, "institution_code", None):
        item.institution_code = "EDU"
        changed = True
    if changed:
        db.commit()
        db.refresh(item)
    return item


@router.patch("/settings",response_model=SettingsOut)
@router.patch("/settings/institution",response_model=SettingsOut,include_in_schema=False)
def patch_settings(payload:SettingsPatch,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(InstitutionSettings,1) or InstitutionSettings(id=1);db.add(item);db.flush();ensure_version(item,payload.version)
    values=payload.model_dump(exclude={"version"},exclude_none=True)
    before={key:getattr(item,key) for key in values}
    if "departments" in values:
        values["departments"] = sorted({value.strip() for value in values["departments"] if value.strip()})
        if not values["departments"]: raise Problem(422,"Invalid departments","Keep at least one department.")
    if "faculty_roles" in values:
        values["faculty_roles"] = sorted({value.strip() for value in values["faculty_roles"] if value.strip()})
        if not values["faculty_roles"]: raise Problem(422,"Invalid faculty roles","Keep at least one faculty role.")
    if "class_types" in values:
        values["class_types"] = sorted({value.strip() for value in values["class_types"] if value.strip()})
        if not values["class_types"]: raise Problem(422,"Invalid class types","Keep at least one class type.")
    if "institution_code" in values:
        values["institution_code"] = values["institution_code"].strip().upper()
    for k,v in values.items():setattr(item,k,v)
    item.version+=1;audit(db,actor,"SETTING_CHANGED",item,before=before,after={key:getattr(item,key) for key in values});db.commit();return item


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
