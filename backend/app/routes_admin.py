from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .domain import audit, authorized_class_ids, ensure_version, page
from .errors import Problem
from .models import (AuditEntry, CourseClass, Enrolment, Faculty, FacultyClassAssignment,
                     InstitutionSettings, Role, Student, User)
from .schemas import (AssignmentRequest, ClassIn, ClassOut, ClassPatch, EnrolmentUpdate,
                      FacultyIn, FacultyOut, FacultyPatch, Page, SettingsOut, SettingsPatch,
                      StudentIn, StudentOut, StudentPatch)
from .security import hash_password, require_roles

router = APIRouter(tags=["Administration"])
admin = require_roles(Role.ADMIN)


def _commit(db: Session, message="A record with that identifier already exists."):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Problem(409, "Duplicate record", message) from exc


@router.post("/faculty", response_model=FacultyOut, status_code=201)
def create_faculty(payload: FacultyIn, db: Session = Depends(get_db), actor: User = Depends(admin)):
    user = User(email=payload.email.lower(), password_hash=hash_password(payload.password), role=Role.FACULTY)
    db.add(user); db.flush()
    member = Faculty(user_id=user.id, employee_id=payload.employee_id, name=payload.name,
                     department=payload.department, designation=payload.designation)
    db.add(member); db.flush(); audit(db, actor, "FACULTY_CREATED", member, after={"employee_id": member.employee_id})
    _commit(db); return member


@router.get("/faculty", response_model=Page[FacultyOut])
def list_faculty(search: str | None = None, page_number: int = Query(1, alias="page"), page_size: int = 25,
                 db: Session = Depends(get_db), _: User = Depends(admin)):
    q = select(Faculty).order_by(Faculty.name)
    if search: q = q.where(or_(Faculty.name.ilike(f"%{search}%"), Faculty.employee_id.ilike(f"%{search}%")))
    items,total,p,s = page(q,db,page_number,page_size); return Page(items=items,page=p,page_size=s,total=total,has_more=p*s<total)


@router.get("/faculty/{faculty_id}", response_model=FacultyOut)
def get_faculty(faculty_id: str, db: Session = Depends(get_db), _: User = Depends(admin)):
    item=db.get(Faculty,faculty_id)
    if not item: raise Problem(404,"Faculty not found","The faculty member does not exist.")
    return item


@router.patch("/faculty/{faculty_id}", response_model=FacultyOut)
def patch_faculty(faculty_id: str,payload:FacultyPatch,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(Faculty,faculty_id)
    if not item: raise Problem(404,"Faculty not found","The faculty member does not exist.")
    ensure_version(item,payload.version); before={"status":item.status.value,"name":item.name}
    for key,value in payload.model_dump(exclude={"version"},exclude_none=True).items(): setattr(item,key,value)
    item.version+=1; audit(db,actor,"FACULTY_UPDATED",item,before=before,after={"status":item.status.value,"name":item.name}); db.commit(); return item


@router.post("/students",response_model=StudentOut,status_code=201)
def create_student(payload:StudentIn,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=Student(**payload.model_dump()); db.add(item); db.flush(); audit(db,actor,"STUDENT_CREATED",item,after={"student_id":item.student_id}); _commit(db); return item


@router.get("/students",response_model=Page[StudentOut])
def list_students(search:str|None=None,department:str|None=None,semester:int|None=None,page_number:int=Query(1,alias="page"),page_size:int=25,
                  db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    q=select(Student).order_by(Student.name)
    if actor.role == Role.FACULTY:
        q=q.join(Enrolment,Enrolment.student_id==Student.id).where(Enrolment.class_id.in_(authorized_class_ids(db,actor))).distinct()
    if search:q=q.where(or_(Student.name.ilike(f"%{search}%"),Student.student_id.ilike(f"%{search}%"),Student.roll_number.ilike(f"%{search}%")))
    if department:q=q.where(Student.department==department)
    if semester:q=q.where(Student.semester==semester)
    items,total,p,s=page(q,db,page_number,page_size);return Page(items=items,page=p,page_size=s,total=total,has_more=p*s<total)


@router.get("/students/{student_id}",response_model=StudentOut)
def get_student(student_id:str,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    item=db.get(Student,student_id)
    if not item:raise Problem(404,"Student not found","The student does not exist.")
    if actor.role == Role.FACULTY and not db.scalar(select(Enrolment.id).where(Enrolment.student_id==student_id,Enrolment.class_id.in_(authorized_class_ids(db,actor)))):
        raise Problem(403,"Forbidden","This student is outside your assigned scope.")
    return item


@router.patch("/students/{student_id}",response_model=StudentOut)
def patch_student(student_id:str,payload:StudentPatch,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(Student,student_id)
    if not item:raise Problem(404,"Student not found","The student does not exist.")
    ensure_version(item,payload.version);before={"name":item.name,"active":item.active}
    for k,v in payload.model_dump(exclude={"version"},exclude_none=True).items():setattr(item,k,v)
    item.version+=1;audit(db,actor,"STUDENT_UPDATED",item,before=before,after={"name":item.name,"active":item.active});db.commit();return item


@router.post("/classes",response_model=ClassOut,status_code=201)
def create_class(payload:ClassIn,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=CourseClass(**payload.model_dump());db.add(item);db.flush();audit(db,actor,"CLASS_CREATED",item,after={"code":item.code});_commit(db);return item


@router.get("/classes",response_model=Page[ClassOut])
def list_classes(search:str|None=None,page_number:int=Query(1,alias="page"),page_size:int=25,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    q=select(CourseClass).order_by(CourseClass.code)
    if actor.role == Role.FACULTY:q=q.where(CourseClass.id.in_(authorized_class_ids(db,actor)))
    if search:q=q.where(or_(CourseClass.code.ilike(f"%{search}%"),CourseClass.subject.ilike(f"%{search}%")))
    items,total,p,s=page(q,db,page_number,page_size);return Page(items=items,page=p,page_size=s,total=total,has_more=p*s<total)


@router.get("/classes/{class_id}",response_model=ClassOut)
def get_class(class_id:str,db:Session=Depends(get_db),actor:User=Depends(require_roles(Role.ADMIN,Role.FACULTY))):
    item=db.get(CourseClass,class_id)
    if not item:raise Problem(404,"Class not found","The class does not exist.")
    if actor.role==Role.FACULTY and class_id not in authorized_class_ids(db,actor):raise Problem(403,"Forbidden","This class is outside your assigned scope.")
    return item


@router.patch("/classes/{class_id}",response_model=ClassOut)
def patch_class(class_id:str,payload:ClassPatch,db:Session=Depends(get_db),actor:User=Depends(admin)):
    item=db.get(CourseClass,class_id)
    if not item:raise Problem(404,"Class not found","The class does not exist.")
    ensure_version(item,payload.version);before={"subject":item.subject,"archived":item.archived}
    for k,v in payload.model_dump(exclude={"version"},exclude_none=True).items():setattr(item,k,v)
    item.version+=1;audit(db,actor,"CLASS_UPDATED",item,before=before,after={"subject":item.subject,"archived":item.archived});db.commit();return item


@router.put("/classes/{class_id}/faculty",status_code=204)
def assign_faculty(class_id:str,payload:AssignmentRequest,db:Session=Depends(get_db),actor:User=Depends(admin)):
    if not db.get(CourseClass,class_id) or not db.get(Faculty,payload.faculty_id):raise Problem(404,"Record not found","The class or faculty member does not exist.")
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
def list_audit(page_number:int=Query(1,alias="page"),page_size:int=25,db:Session=Depends(get_db),_:User=Depends(admin)):
    q=select(AuditEntry).order_by(AuditEntry.created_at.desc());items,total,p,s=page(q,db,page_number,page_size)
    data=[{"id":x.id,"action":x.action,"entity_type":x.entity_type,"entity_id":x.entity_id,"before":x.before,"after":x.after,"reason":x.reason,"created_at":x.created_at} for x in items]
    return Page(items=data,page=p,page_size=s,total=total,has_more=p*s<total)
