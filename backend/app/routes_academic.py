"""Typed, audited administration of the normalized academic hierarchy."""

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .domain import audit, ensure_version, page
from .errors import Problem
from .models import (
    AcademicBatch,
    AcademicProgram,
    AcademicSection,
    AttendanceSession,
    AttendanceSessionClass,
    AuditEntry,
    CourseClass,
    Department,
    Enrolment,
    Faculty,
    FacultyClassAssignment,
    FacultyStatus,
    MappingStatus,
    ProgramSubject,
    Role,
    School,
    SessionStatus,
    Student,
    Subject,
    TimetableSlot,
    User,
)
from .schemas import AcademicCreate, AcademicPatch, ProgramSubjectLink
from .security import require_roles

router = APIRouter(prefix="/academic", tags=["Academic structure"])
admin = require_roles(Role.ADMIN)
reader = require_roles(Role.ADMIN, Role.FACULTY)
KINDS = {
    "schools": (School, None, None),
    "departments": (Department, "school_id", School),
    "programs": (AcademicProgram, "department_id", Department),
    "batches": (AcademicBatch, "program_id", AcademicProgram),
    "sections": (AcademicSection, "batch_id", AcademicBatch),
    "subjects": (Subject, None, None),
}


def _kind(kind: str):
    try:
        return KINDS[kind]
    except KeyError as exc:
        raise Problem(404, "Academic level not found", "Use schools, departments, programs, batches, sections, or subjects.") from exc


def _out(item):
    return {column.name: getattr(item, column.name) for column in item.__table__.columns}


def _count(db: Session, model, *criteria) -> int:
    return db.scalar(select(func.count()).select_from(model).where(*criteria)) or 0


def _active_count(db: Session, model) -> int:
    return _count(db, model, model.active.is_(True))


def _class_scope_query(kind: str, item_id: str):
    """Return a class-id query scoped to one academic record."""
    q = select(CourseClass.id).where(CourseClass.archived.is_(False))
    if kind == "sections":
        return q.where(CourseClass.section_id == item_id)
    q = q.join(AcademicSection, AcademicSection.id == CourseClass.section_id)
    if kind == "batches":
        return q.where(AcademicSection.batch_id == item_id)
    q = q.join(AcademicBatch, AcademicBatch.id == AcademicSection.batch_id)
    if kind == "programs":
        return q.where(AcademicBatch.program_id == item_id)
    q = q.join(AcademicProgram, AcademicProgram.id == AcademicBatch.program_id)
    if kind == "departments":
        return q.where(AcademicProgram.department_id == item_id)
    return q.join(Department, Department.id == AcademicProgram.department_id).where(
        Department.school_id == item_id
    )


def _academic_path(db: Session, kind: str, item) -> list[dict]:
    path: list[dict] = []
    if kind == "schools":
        school = item
    elif kind == "departments":
        department = item
        school = db.get(School, item.school_id)
    elif kind == "programs":
        program = item
        department = db.get(Department, item.department_id)
        school = db.get(School, department.school_id) if department else None
    elif kind == "batches":
        batch = item
        program = db.get(AcademicProgram, item.program_id)
        department = db.get(Department, program.department_id) if program else None
        school = db.get(School, department.school_id) if department else None
    elif kind == "sections":
        batch = db.get(AcademicBatch, item.batch_id)
        program = db.get(AcademicProgram, batch.program_id) if batch else None
        department = db.get(Department, program.department_id) if program else None
        school = db.get(School, department.school_id) if department else None
    else:
        return path
    for level, record in (("schools", locals().get("school")),
                          ("departments", locals().get("department")),
                          ("programs", locals().get("program")),
                          ("batches", locals().get("batch")),
                          ("sections", item if kind == "sections" else None)):
        if record:
            path.append({"kind": level, "id": record.id, "code": record.code,
                         "name": record.name})
    return path


def _dependency_counts(db: Session, kind: str, item_id: str) -> dict[str, int]:
    if kind == "schools":
        department_ids = select(Department.id).where(Department.school_id == item_id)
        program_ids = select(AcademicProgram.id).where(AcademicProgram.department_id.in_(department_ids))
        batch_ids = select(AcademicBatch.id).where(AcademicBatch.program_id.in_(program_ids))
        section_ids = select(AcademicSection.id).where(AcademicSection.batch_id.in_(batch_ids))
        return {
            "departments": _count(db, Department, Department.school_id == item_id),
            "programmes": _count(db, AcademicProgram, AcademicProgram.id.in_(program_ids)),
            "batches": _count(db, AcademicBatch, AcademicBatch.id.in_(batch_ids)),
            "sections": _count(db, AcademicSection, AcademicSection.id.in_(section_ids)),
            "students": _count(db, Student, Student.school_id == item_id),
            "faculty": _count(db, Faculty, Faculty.department_id.in_(department_ids)),
            "classes": db.scalar(select(func.count()).select_from(_class_scope_query(kind, item_id).subquery())) or 0,
        }
    if kind == "departments":
        program_ids = select(AcademicProgram.id).where(AcademicProgram.department_id == item_id)
        batch_ids = select(AcademicBatch.id).where(AcademicBatch.program_id.in_(program_ids))
        section_ids = select(AcademicSection.id).where(AcademicSection.batch_id.in_(batch_ids))
        return {
            "programmes": _count(db, AcademicProgram, AcademicProgram.department_id == item_id),
            "batches": _count(db, AcademicBatch, AcademicBatch.id.in_(batch_ids)),
            "sections": _count(db, AcademicSection, AcademicSection.id.in_(section_ids)),
            "students": _count(db, Student, Student.department_id == item_id),
            "faculty": _count(db, Faculty, Faculty.department_id == item_id),
            "classes": db.scalar(select(func.count()).select_from(_class_scope_query(kind, item_id).subquery())) or 0,
        }
    if kind == "programs":
        batch_ids = select(AcademicBatch.id).where(AcademicBatch.program_id == item_id)
        section_ids = select(AcademicSection.id).where(AcademicSection.batch_id.in_(batch_ids))
        return {
            "batches": _count(db, AcademicBatch, AcademicBatch.program_id == item_id),
            "sections": _count(db, AcademicSection, AcademicSection.id.in_(section_ids)),
            "curriculum": _count(db, ProgramSubject, ProgramSubject.program_id == item_id),
            "students": _count(db, Student, Student.program_id == item_id),
            "classes": db.scalar(select(func.count()).select_from(_class_scope_query(kind, item_id).subquery())) or 0,
        }
    if kind == "batches":
        return {
            "sections": _count(db, AcademicSection, AcademicSection.batch_id == item_id),
            "students": _count(db, Student, Student.batch_id == item_id),
            "classes": db.scalar(select(func.count()).select_from(_class_scope_query(kind, item_id).subquery())) or 0,
        }
    if kind == "sections":
        class_ids = _class_scope_query(kind, item_id)
        return {
            "students": _count(db, Student, Student.section_id == item_id),
            "classes": db.scalar(select(func.count()).select_from(class_ids.subquery())) or 0,
            "timetableSlots": _count(db, TimetableSlot, TimetableSlot.class_id.in_(class_ids)),
            "attendanceSessions": db.scalar(select(func.count(func.distinct(AttendanceSessionClass.session_id))).where(
                AttendanceSessionClass.class_id.in_(class_ids)
            )) or 0,
        }
    program_links = select(ProgramSubject.id).where(ProgramSubject.subject_id == item_id)
    return {
        "programmes": _count(db, ProgramSubject, ProgramSubject.subject_id == item_id),
        "classes": _count(db, CourseClass, CourseClass.program_subject_id.in_(program_links)),
    }


def _clean(value: str) -> str:
    return " ".join(value.strip().split())


def _commit(db: Session):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Problem(409, "Duplicate academic record", "That code already exists under the selected parent.") from exc


def _flush(db: Session):
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise Problem(409, "Duplicate academic record", "That code already exists under the selected parent.") from exc


@router.get("/tree")
def hierarchy_tree(include_archived: bool = Query(False, alias="includeArchived"),
                   db: Session = Depends(get_db), actor: User = Depends(reader)):
    if include_archived and actor.role != Role.ADMIN:
        raise Problem(403, "Forbidden", "Only administrators can view archived academic records.")
    result = {}
    for kind, (model, _, _) in KINDS.items():
        q = select(model).order_by(model.name)
        if not include_archived:
            q = q.where(model.active.is_(True))
        rows = db.scalars(q).all()
        result[kind] = [_out(row) for row in rows]
    result["programSubjects"] = [_out(row) for row in db.scalars(
        select(ProgramSubject).order_by(ProgramSubject.program_id, ProgramSubject.semester_number)
    ).all()]
    return result


@router.get("/mapping-report")
def mapping_report(page_number: int = Query(1, alias="page"), page_size: int = Query(25, ge=1, le=100),
                   search: str | None = None, db: Session = Depends(get_db), _: User = Depends(admin)):
    q = select(Student).where(Student.mapping_status == "NEEDS_MAPPING").order_by(Student.name)
    if search:
        term = f"%{search.strip()}%"
        q = q.where(or_(Student.name.ilike(term), Student.student_id.ilike(term), Student.roll_number.ilike(term)))
    rows, total, current, size = page(q, db, page_number, page_size)
    return {"items": [{"id": row.id, "studentId": row.student_id, "rollNumber": row.roll_number,
                       "name": row.name, "version": row.version, "mappingStatus": row.mapping_status.value,
                       "mappingNote": row.mapping_note,
                       "legacy": {"department": row.department, "semester": row.semester, "section": row.section}}
                      for row in rows], "page": current, "pageSize": size, "total": total,
            "hasMore": current * size < total}


@router.get("/overview")
def academic_overview(db: Session = Depends(get_db), _: User = Depends(admin)):
    """Institution counts and attention queues from the same predicates as their lists."""
    active_classes = CourseClass.archived.is_(False)
    unassigned_classes = ~select(FacultyClassAssignment.id).where(
        FacultyClassAssignment.class_id == CourseClass.id
    ).exists()
    unscheduled_classes = ~select(TimetableSlot.id).where(
        TimetableSlot.class_id == CourseClass.id
    ).exists()
    empty_classes = ~select(Enrolment.id).where(Enrolment.class_id == CourseClass.id).exists()
    no_curriculum = ~select(ProgramSubject.id).where(
        ProgramSubject.program_id == AcademicProgram.id
    ).exists()
    assigned_inactive = select(FacultyClassAssignment.id).where(
        FacultyClassAssignment.faculty_id == Faculty.id
    ).exists()

    counts = {
        "schools": _active_count(db, School),
        "departments": _active_count(db, Department),
        "programs": _active_count(db, AcademicProgram),
        "batches": _active_count(db, AcademicBatch),
        "sections": _active_count(db, AcademicSection),
        "subjects": _active_count(db, Subject),
        "students": _count(db, Student, Student.active.is_(True)),
        "faculty": _count(db, Faculty, Faculty.status == FacultyStatus.ACTIVE),
        "classes": _count(db, CourseClass, active_classes),
    }
    attention = [
        {"key": "academicPlacement", "label": "Academic placement required",
         "count": _count(db, Student, Student.mapping_status == MappingStatus.NEEDS_MAPPING,
                         Student.active.is_(True)),
         "href": "/(admin)/students", "query": {"mappingStatus": "NEEDS_MAPPING"}},
        {"key": "classesNeedFaculty", "label": "Classes need Faculty",
         "count": _count(db, CourseClass, active_classes, unassigned_classes),
         "href": "/(admin)/classes", "query": {"unassignedOnly": True}},
        {"key": "classesNeedTimetable", "label": "Classes need timetable",
         "count": _count(db, CourseClass, active_classes, unscheduled_classes),
         "href": "/(admin)/classes", "query": {"unscheduledOnly": True}},
        {"key": "programsNeedCurriculum", "label": "Programmes need curriculum",
         "count": _count(db, AcademicProgram, AcademicProgram.active.is_(True), no_curriculum),
         "href": "/(admin)/academic-structure", "query": {"kind": "programs", "needsCurriculum": True}},
        {"key": "classesEmptyRosters", "label": "Classes have empty rosters",
         "count": _count(db, CourseClass, active_classes, empty_classes),
         "href": "/(admin)/classes", "query": {"emptyRosterOnly": True}},
        {"key": "inactiveFacultyAssigned", "label": "Inactive Faculty with assignments",
         "count": _count(db, Faculty, Faculty.status == FacultyStatus.INACTIVE, assigned_inactive),
         "href": "/(admin)/faculty", "query": {"status": "INACTIVE", "assignedOnly": True}},
        {"key": "attendanceFailed", "label": "Attendance processing failed",
         "count": _count(db, AttendanceSession, AttendanceSession.status == SessionStatus.FAILED),
         "href": "/(admin)/attendance", "query": {"status": "FAILED"}},
        {"key": "sessionsAwaitingReview", "label": "Sessions awaiting Faculty review",
         "count": _count(db, AttendanceSession,
                         AttendanceSession.status == SessionStatus.PENDING_REVIEW),
         "href": "/(admin)/attendance", "query": {"status": "PENDING_REVIEW"}},
    ]
    return {"counts": counts, "attention": attention}


@router.get("/subjects/suggestions")
def subject_suggestions(code: str | None = None, name: str | None = None,
                        db: Session = Depends(get_db), _: User = Depends(admin)):
    terms = []
    if code and code.strip():
        terms.append(Subject.code.ilike(f"%{_clean(code)}%"))
    if name and name.strip():
        terms.append(Subject.name.ilike(f"%{_clean(name)}%"))
    if not terms:
        return {"items": []}
    rows = db.scalars(select(Subject).where(or_(*terms)).order_by(Subject.active.desc(), Subject.name).limit(10)).all()
    return {"items": [{**_out(row), **_dependency_counts(db, "subjects", row.id)} for row in rows]}


@router.get("/{kind}/{item_id}/impact")
def archive_impact(kind: str, item_id: str, db: Session = Depends(get_db),
                   _: User = Depends(admin)):
    model, _, _ = _kind(kind)
    item = db.get(model, item_id)
    if not item:
        raise Problem(404, "Academic record not found", "The record does not exist.")
    dependencies = _dependency_counts(db, kind, item_id)
    blocking = {key: value for key, value in dependencies.items() if value > 0}
    return {"record": _out(item), "dependencies": dependencies,
            "canArchive": not blocking, "blocking": blocking}


@router.get("/{kind}/{item_id}")
def academic_workspace(kind: str, item_id: str, db: Session = Depends(get_db),
                       _: User = Depends(reader)):
    model, _, _ = _kind(kind)
    item = db.get(model, item_id)
    if not item:
        raise Problem(404, "Academic record not found", "The record does not exist.")
    children: list[dict] = []
    child_kind: str | None = None
    if kind == "schools":
        child_kind, child_model, child_column = "departments", Department, Department.school_id
    elif kind == "departments":
        child_kind, child_model, child_column = "programs", AcademicProgram, AcademicProgram.department_id
    elif kind == "programs":
        child_kind, child_model, child_column = "batches", AcademicBatch, AcademicBatch.program_id
    elif kind == "batches":
        child_kind, child_model, child_column = "sections", AcademicSection, AcademicSection.batch_id
    else:
        child_model = child_column = None
    if child_model is not None:
        children = [_out(row) for row in db.scalars(
            select(child_model).where(child_column == item_id).order_by(child_model.name).limit(100)
        ).all()]

    curriculum: list[dict] = []
    if kind == "programs":
        links = db.execute(
            select(ProgramSubject, Subject).join(Subject, Subject.id == ProgramSubject.subject_id)
            .where(ProgramSubject.program_id == item_id)
            .order_by(ProgramSubject.semester_number, Subject.name)
        ).all()
        curriculum = [{"id": link.id, "program_id": link.program_id,
                       "subject_id": subject.id, "semester_number": link.semester_number,
                       "subject": _out(subject),
                       "class_count": _count(db, CourseClass,
                                             CourseClass.program_subject_id == link.id)}
                      for link, subject in links]
    elif kind == "subjects":
        links = db.execute(
            select(ProgramSubject, AcademicProgram, Department, School)
            .join(AcademicProgram, AcademicProgram.id == ProgramSubject.program_id)
            .join(Department, Department.id == AcademicProgram.department_id)
            .join(School, School.id == Department.school_id)
            .where(ProgramSubject.subject_id == item_id)
            .order_by(AcademicProgram.name)
        ).all()
        curriculum = [{"id": link.id, "program_id": program.id,
                       "semester_number": link.semester_number,
                       "program": _out(program), "department": _out(department),
                       "school": _out(school),
                       "class_count": _count(db, CourseClass,
                                             CourseClass.program_subject_id == link.id)}
                      for link, program, department, school in links]

    activity = db.scalars(select(AuditEntry).where(
        AuditEntry.entity_id == item_id
    ).order_by(AuditEntry.created_at.desc()).limit(20)).all()
    return {"record": _out(item), "path": _academic_path(db, kind, item),
            "counts": _dependency_counts(db, kind, item_id),
            "childKind": child_kind, "children": children, "curriculum": curriculum,
            "activity": [{"id": row.id, "action": row.action, "actor_id": row.actor_id,
                          "reason": row.reason, "before": row.before, "after": row.after,
                          "created_at": row.created_at} for row in activity]}


@router.get("/{kind}")
def list_level(kind: str, search: str | None = None, parent_id: str | None = Query(None, alias="parentId"),
               active: bool | None = None,
               needs_curriculum: bool = Query(False, alias="needsCurriculum"),
               page_number: int = Query(1, alias="page"),
               page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db), _: User = Depends(reader)):
    model, parent_key, _ = _kind(kind)
    q = select(model).order_by(model.name)
    if search:
        term = f"%{search.strip()}%"
        q = q.where(or_(model.name.ilike(term), model.code.ilike(term)))
    if parent_key and parent_id:
        q = q.where(getattr(model, parent_key) == parent_id)
    if active is not None:
        q = q.where(model.active.is_(active))
    if needs_curriculum:
        if model is not AcademicProgram:
            raise Problem(422, "Invalid filter", "Curriculum readiness applies only to programmes.")
        q = q.where(~select(ProgramSubject.id).where(
            ProgramSubject.program_id == AcademicProgram.id
        ).exists())
    rows, total, current, size = page(q, db, page_number, page_size)
    return {"items": [{**_out(row), "path": _academic_path(db, kind, row),
                        "counts": _dependency_counts(db, kind, row.id)} for row in rows],
            "page": current, "pageSize": size,
            "total": total, "hasMore": current * size < total}


@router.post("/{kind}", status_code=201)
def create_level(kind: str, payload: AcademicCreate, db: Session = Depends(get_db), actor: User = Depends(admin)):
    model, parent_key, parent_model = _kind(kind)
    values = {"code": _clean(payload.code).upper(), "name": _clean(payload.name)}
    if parent_key:
        parent_id = getattr(payload, parent_key)
        parent = db.get(parent_model, parent_id) if parent_id else None
        if not parent or not parent.active:
            raise Problem(422, "Invalid academic parent", "Select an active parent from the academic hierarchy.")
        values[parent_key] = parent_id
    if model is AcademicBatch:
        if payload.start_year is None or payload.end_year is None or payload.end_year < payload.start_year:
            raise Problem(422, "Invalid batch years", "Provide an end year on or after the start year.")
        values.update(start_year=payload.start_year, end_year=payload.end_year)
    item = model(**values)
    db.add(item)
    _flush(db)
    audit(db, actor, "ACADEMIC_RECORD_CREATED", item, after=_out(item))
    _commit(db)
    db.refresh(item)
    return _out(item)


@router.patch("/{kind}/{item_id}")
def update_level(kind: str, item_id: str, payload: AcademicPatch, db: Session = Depends(get_db), actor: User = Depends(admin)):
    model, _, _ = _kind(kind)
    item = db.get(model, item_id)
    if not item:
        raise Problem(404, "Academic record not found", "The record does not exist.")
    ensure_version(item, payload.version)
    before = _out(item)
    values = payload.model_dump(exclude={"version"}, exclude_none=True)
    if "code" in values:
        values["code"] = _clean(values["code"]).upper()
    if "name" in values:
        values["name"] = _clean(values["name"])
    if model is AcademicBatch:
        start, end = values.get("start_year", item.start_year), values.get("end_year", item.end_year)
        if end < start:
            raise Problem(422, "Invalid batch years", "End year must be on or after start year.")
    for key, value in values.items():
        setattr(item, key, value)
    item.version += 1
    audit(db, actor, "ACADEMIC_RECORD_UPDATED", item, before=before, after=_out(item))
    _commit(db)
    db.refresh(item)
    return _out(item)


def _archive_dependency(db: Session, kind: str, item_id: str) -> str | None:
    labels = {"programmes": "programmes", "curriculum": "curriculum assignments",
              "timetableSlots": "timetable slots", "attendanceSessions": "attendance sessions"}
    return next((labels.get(key, key) for key, value in _dependency_counts(db, kind, item_id).items()
                 if value > 0), None)


@router.delete("/{kind}/{item_id}", status_code=204)
def archive_level(kind: str, item_id: str, db: Session = Depends(get_db), actor: User = Depends(admin)):
    model, _, _ = _kind(kind)
    item = db.get(model, item_id)
    if not item:
        raise Problem(404, "Academic record not found", "The record does not exist.")
    dependency = _archive_dependency(db, kind, item_id)
    if dependency:
        raise Problem(409, "Academic record is in use", f"Archive or reassign its {dependency} first.")
    before = _out(item)
    item.active = False
    item.version += 1
    audit(db, actor, "ACADEMIC_RECORD_ARCHIVED", item, before=before, after=_out(item))
    db.commit()
    return Response(status_code=204)


@router.post("/programs/{program_id}/subjects", status_code=201)
def link_subject(program_id: str, payload: ProgramSubjectLink, db: Session = Depends(get_db), actor: User = Depends(admin)):
    program, subject = db.get(AcademicProgram, program_id), db.get(Subject, payload.subject_id)
    if not program or not program.active or not subject or not subject.active:
        raise Problem(422, "Invalid programme subject", "Select an active programme and subject.")
    if db.scalar(select(ProgramSubject).where(ProgramSubject.program_id == program_id,
                                              ProgramSubject.subject_id == payload.subject_id)):
        raise Problem(409, "Subject already assigned", "That subject is already assigned to this programme.")
    row = ProgramSubject(program_id=program_id, subject_id=payload.subject_id,
                         semester_number=payload.semester_number)
    db.add(row)
    _flush(db)
    audit(db, actor, "PROGRAMME_SUBJECT_LINKED", row, after=_out(row))
    db.commit()
    return _out(row)


@router.delete("/programs/{program_id}/subjects/{subject_id}", status_code=204)
def unlink_subject(program_id: str, subject_id: str, db: Session = Depends(get_db), actor: User = Depends(admin)):
    row = db.scalar(select(ProgramSubject).where(ProgramSubject.program_id == program_id,
                                                 ProgramSubject.subject_id == subject_id))
    if not row:
        raise Problem(404, "Subject link not found", "That subject is not linked to this programme.")
    if db.scalar(select(func.count()).select_from(CourseClass).where(CourseClass.program_subject_id == row.id)):
        raise Problem(409, "Programme subject is in use", "Archive its class offerings before removing this assignment.")
    audit(db, actor, "PROGRAMME_SUBJECT_UNLINKED", row, before=_out(row))
    db.delete(row)
    db.commit()
    return Response(status_code=204)
