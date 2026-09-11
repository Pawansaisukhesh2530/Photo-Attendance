"""Admin-managed academic hierarchy endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .errors import Problem
from .models import AcademicBatch, AcademicProgram, AcademicSection, Department, ProgramSubject, Role, School, Subject, User
from .security import require_roles

router = APIRouter(prefix="/academic", tags=["Academic structure"])
admin = require_roles(Role.ADMIN)
KINDS = {
    "schools": (School, None),
    "departments": (Department, "school_id"),
    "programs": (AcademicProgram, "department_id"),
    "batches": (AcademicBatch, "program_id"),
    "sections": (AcademicSection, "batch_id"),
    "subjects": (Subject, None),
}


def _model(kind: str):
    try:
        return KINDS[kind][0], KINDS[kind][1]
    except KeyError as exc:
        raise Problem(404, "Academic level not found", "Use schools, departments, programs, batches, sections, or subjects.") from exc


def _out(item):
    data = {c.name: getattr(item, c.name) for c in item.__table__.columns if c.name not in {"version"}}
    data["version"] = item.version
    return data


def _clean(value: object, label: str, maximum: int) -> str:
    result = str(value or "").strip()
    if not result or len(result) > maximum:
        raise Problem(422, f"Invalid {label}", f"Provide a {label} between 1 and {maximum} characters.")
    return result


@router.get("/tree")
def hierarchy_tree(db: Session = Depends(get_db), _: User = Depends(admin)):
    schools = list(db.scalars(select(School).where(School.active.is_(True)).order_by(School.name)))
    departments = list(db.scalars(select(Department).where(Department.active.is_(True)).order_by(Department.name)))
    programs = list(db.scalars(select(AcademicProgram).where(AcademicProgram.active.is_(True)).order_by(AcademicProgram.name)))
    batches = list(db.scalars(select(AcademicBatch).where(AcademicBatch.active.is_(True)).order_by(AcademicBatch.start_year)))
    sections = list(db.scalars(select(AcademicSection).where(AcademicSection.active.is_(True)).order_by(AcademicSection.name)))
    subjects = list(db.scalars(select(Subject).where(Subject.active.is_(True)).order_by(Subject.name)))
    return {"schools": [_out(x) for x in schools], "departments": [_out(x) for x in departments],
            "programs": [_out(x) for x in programs], "batches": [_out(x) for x in batches],
            "sections": [_out(x) for x in sections], "subjects": [_out(x) for x in subjects]}


@router.get("/{kind}")
def list_level(kind: str, db: Session = Depends(get_db), _: User = Depends(admin)):
    model, _ = _model(kind)
    return {"items": [_out(x) for x in db.scalars(select(model).order_by(model.name)).all()]}


@router.post("/{kind}", status_code=201)
def create_level(kind: str, payload: dict, db: Session = Depends(get_db), actor: User = Depends(admin)):
    model, parent_key = _model(kind)
    values = {"code": _clean(payload.get("code"), "code", 30), "name": _clean(payload.get("name"), "name", 180)}
    if parent_key:
        parent_id = _clean(payload.get(parent_key), parent_key, 36)
        parent_model = {"school_id": School, "department_id": Department, "program_id": AcademicProgram, "batch_id": AcademicBatch}[parent_key]
        if not db.get(parent_model, parent_id):
            raise Problem(422, "Invalid parent", "Select a valid parent from the hierarchy.")
        values[parent_key] = parent_id
    if model is AcademicBatch:
        values["start_year"] = int(payload.get("start_year", 0)); values["end_year"] = int(payload.get("end_year", 0))
        if values["start_year"] < 2000 or values["end_year"] < values["start_year"]: raise Problem(422, "Invalid batch years", "End year must be on or after start year.")
    if model is AcademicSection: values["name"] = _clean(payload.get("name"), "name", 80)
    if model is Subject: values.pop("code", None); values["code"] = _clean(payload.get("code"), "code", 30)
    item = model(**values); db.add(item)
    try:
        db.commit(); db.refresh(item)
    except IntegrityError as exc:
        db.rollback(); raise Problem(409, "Duplicate academic record", "That code already exists at this hierarchy level.") from exc
    return _out(item)


@router.patch("/{kind}/{item_id}")
def update_level(kind: str, item_id: str, payload: dict, db: Session = Depends(get_db), _: User = Depends(admin)):
    model, _ = _model(kind); item = db.get(model, item_id)
    if not item: raise Problem(404, "Academic record not found", "The record does not exist.")
    if payload.get("version") != item.version: raise Problem(409, "Version conflict", "Reload the academic structure and try again.")
    for key, maximum in (("code", 30), ("name", 180)):
        if key in payload: setattr(item, key, _clean(payload[key], key, maximum))
    if "active" in payload: item.active = bool(payload["active"])
    item.version += 1
    try: db.commit(); db.refresh(item)
    except IntegrityError as exc: db.rollback(); raise Problem(409, "Duplicate academic record", "That code already exists at this level.") from exc
    return _out(item)


@router.delete("/{kind}/{item_id}", status_code=204)
def archive_level(kind: str, item_id: str, db: Session = Depends(get_db), _: User = Depends(admin)):
    model, _ = _model(kind); item = db.get(model, item_id)
    if not item: raise Problem(404, "Academic record not found", "The record does not exist.")
    item.active = False; item.version += 1; db.commit()


@router.put("/programs/{program_id}/subjects/{subject_id}", status_code=204)
def link_subject(program_id: str, subject_id: str, db: Session = Depends(get_db), _: User = Depends(admin)):
    if not db.get(AcademicProgram, program_id) or not db.get(Subject, subject_id): raise Problem(404, "Academic record not found", "Select a valid programme and subject.")
    if not db.scalar(select(ProgramSubject).where(ProgramSubject.program_id == program_id, ProgramSubject.subject_id == subject_id)):
        db.add(ProgramSubject(program_id=program_id, subject_id=subject_id)); db.commit()


@router.delete("/programs/{program_id}/subjects/{subject_id}", status_code=204)
def unlink_subject(program_id: str, subject_id: str, db: Session = Depends(get_db), _: User = Depends(admin)):
    row = db.scalar(select(ProgramSubject).where(ProgramSubject.program_id == program_id, ProgramSubject.subject_id == subject_id))
    if not row: raise Problem(404, "Subject link not found", "That subject is not linked to this programme.")
    db.delete(row); db.commit()
