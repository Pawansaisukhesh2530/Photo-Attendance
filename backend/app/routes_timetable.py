from datetime import date, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .domain import audit, ensure_version, faculty_for_user, page
from .errors import Problem
from .models import (CourseClass, Faculty, FacultyClassAssignment, Role, SlotType,
                     TimetableSlot, User)
from .schemas import TimetableSlotIn, TimetableSlotPatch
from .security import require_roles

router = APIRouter(tags=["Timetable"])

DAY_NAMES = {1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday"}


def _format_time(t: time) -> str:
    hour = t.hour
    minute = t.minute
    ampm = "AM" if hour < 12 else "PM"
    display_hour = hour % 12 or 12
    return f"{display_hour:02d}:{minute:02d} {ampm}"


def _slot_json(slot: TimetableSlot, course: CourseClass | None = None) -> dict:
    cn = slot.break_label if slot.slot_type == SlotType.FREE else (
        f"{course.code} {course.variant}" if course else ""
    )
    return {
        "id": slot.id,
        "faculty_id": slot.faculty_id,
        "class_id": slot.class_id,
        "slot_type": slot.slot_type.value,
        "day_of_week": slot.day_of_week,
        "day_label": DAY_NAMES.get(slot.day_of_week, ""),
        "start_time": slot.start_time,
        "end_time": slot.end_time,
        "time_label": f"{_format_time(slot.start_time)} - {_format_time(slot.end_time)}",
        "room": slot.room,
        "break_label": slot.break_label,
        "class_name": cn,
        "class_code": course.code if course else None,
        "subject": course.subject if course else None,
        "variant": course.variant if course else None,
        "version": slot.version,
    }


def _check_overlap(db: Session, faculty_id: str, day_of_week: int,
                   start_time: time, end_time: time, exclude_id: str | None = None):
    q = select(TimetableSlot).where(
        TimetableSlot.faculty_id == faculty_id,
        TimetableSlot.day_of_week == day_of_week,
        TimetableSlot.start_time < end_time,
        start_time < TimetableSlot.end_time,
    )
    if exclude_id:
        q = q.where(TimetableSlot.id != exclude_id)
    if db.scalar(q):
        raise Problem(409, "Schedule overlap",
                      "This time slot overlaps with an existing slot for this faculty member.")


@router.post("/admin/timetable/slots", status_code=201)
def create_slot(payload: TimetableSlotIn, db: Session = Depends(get_db),
                actor: User = Depends(require_roles(Role.ADMIN))):
    if not db.get(Faculty, payload.faculty_id):
        raise Problem(404, "Faculty not found", "The faculty member does not exist.")
    if payload.slot_type == SlotType.CLASS:
        if not db.get(CourseClass, payload.class_id):
            raise Problem(404, "Class not found", "The class does not exist.")
        if not db.scalar(select(FacultyClassAssignment).where(
            FacultyClassAssignment.faculty_id == payload.faculty_id,
            FacultyClassAssignment.class_id == payload.class_id,
        )):
            raise Problem(409, "Unassigned class",
                          "This faculty member is not assigned to teach this class.")

    _check_overlap(db, payload.faculty_id, payload.day_of_week,
                   payload.start_time, payload.end_time)

    slot = TimetableSlot(**payload.model_dump())
    db.add(slot)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise Problem(409, "Duplicate slot",
                      "A slot with this faculty, class, day, and time already exists.") from exc
    course = db.get(CourseClass, slot.class_id) if slot.class_id else None
    audit(db, actor, "TIMETABLE_SLOT_CREATED", slot,
          after={"faculty_id": slot.faculty_id, "day_of_week": slot.day_of_week})
    db.commit()
    return _slot_json(slot, course)


@router.get("/admin/timetable")
def list_admin_slots(faculty_id: str | None = Query(None, alias="facultyId"),
                     day_of_week: int | None = Query(None, alias="dayOfWeek"),
                     slot_type: SlotType | None = Query(None, alias="slotType"),
                     page_number: int = Query(1, alias="page"),
                     page_size: int = 50,
                     db: Session = Depends(get_db),
                     _: User = Depends(require_roles(Role.ADMIN))):
    q = select(TimetableSlot).order_by(TimetableSlot.day_of_week, TimetableSlot.start_time)
    if faculty_id:
        q = q.where(TimetableSlot.faculty_id == faculty_id)
    if day_of_week is not None:
        q = q.where(TimetableSlot.day_of_week == day_of_week)
    if slot_type:
        q = q.where(TimetableSlot.slot_type == slot_type)
    items, total, p, s = page(q, db, page_number, page_size)
    courses = {c.id: c for c in db.scalars(
        select(CourseClass).where(CourseClass.id.in_(
            [i.class_id for i in items if i.class_id]
        ))
    ).all()}
    return {"items": [_slot_json(i, courses.get(i.class_id)) for i in items],
            "page": p, "pageSize": s, "total": total, "hasMore": p * s < total}


@router.get("/admin/timetable/faculty/{faculty_id}")
def get_faculty_timetable_admin(faculty_id: str, db: Session = Depends(get_db),
                                _: User = Depends(require_roles(Role.ADMIN))):
    if not db.get(Faculty, faculty_id):
        raise Problem(404, "Faculty not found", "The faculty member does not exist.")
    items = list(db.scalars(
        select(TimetableSlot).where(TimetableSlot.faculty_id == faculty_id)
        .order_by(TimetableSlot.day_of_week, TimetableSlot.start_time)
    ))
    courses = {c.id: c for c in db.scalars(
        select(CourseClass).where(CourseClass.id.in_(
            [i.class_id for i in items if i.class_id]
        ))
    ).all()}
    return {"items": [_slot_json(i, courses.get(i.class_id)) for i in items]}


@router.patch("/admin/timetable/slots/{slot_id}")
def patch_slot(slot_id: str, payload: TimetableSlotPatch,
               db: Session = Depends(get_db),
               actor: User = Depends(require_roles(Role.ADMIN))):
    slot = db.get(TimetableSlot, slot_id)
    if not slot:
        raise Problem(404, "Slot not found", "The timetable slot does not exist.")
    ensure_version(slot, payload.version)

    before = {"day_of_week": slot.day_of_week, "start_time": str(slot.start_time),
              "end_time": str(slot.end_time), "room": slot.room}

    # Keep explicit nulls so an edit can clear class_id when changing CLASS to FREE.
    # Omitted fields remain untouched.
    changes = payload.model_dump(exclude={"version"}, exclude_unset=True)
    new_type = changes.get("slot_type", slot.slot_type)
    new_class_id = changes.get("class_id", slot.class_id)

    if new_type == SlotType.CLASS and new_class_id is None:
        raise Problem(422, "class_id required",
                      "A CLASS slot must have a class_id.")
    if new_type == SlotType.FREE and new_class_id is not None:
        raise Problem(422, "class_id must be null",
                      "A FREE slot cannot have a class_id.")
    if new_type == SlotType.CLASS:
        effective_cid = new_class_id or slot.class_id
        if not db.get(CourseClass, effective_cid):
            raise Problem(404, "Class not found", "The class does not exist.")
        if not db.scalar(select(FacultyClassAssignment).where(
            FacultyClassAssignment.faculty_id == slot.faculty_id,
            FacultyClassAssignment.class_id == effective_cid,
        )):
            raise Problem(409, "Unassigned class",
                          "This faculty member is not assigned to teach this class.")

    effective_start = changes.get("start_time", slot.start_time)
    effective_end = changes.get("end_time", slot.end_time)
    if effective_start >= effective_end:
        raise Problem(422, "Invalid time range", "End time must be after start time.")

    for k, v in changes.items():
        setattr(slot, k, v)

    _check_overlap(db, slot.faculty_id, slot.day_of_week,
                   slot.start_time, slot.end_time, exclude_id=slot.id)

    slot.version += 1
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise Problem(409, "Duplicate slot",
                      "A slot with this faculty, class, day, and time already exists.") from exc
    course = db.get(CourseClass, slot.class_id) if slot.class_id else None
    audit(db, actor, "TIMETABLE_SLOT_UPDATED", slot, before=before,
          after={"day_of_week": slot.day_of_week, "start_time": str(slot.start_time),
                 "end_time": str(slot.end_time), "room": slot.room})
    db.commit()
    return _slot_json(slot, course)


@router.delete("/admin/timetable/slots/{slot_id}", status_code=204)
def delete_slot(slot_id: str, db: Session = Depends(get_db),
                actor: User = Depends(require_roles(Role.ADMIN))):
    slot = db.get(TimetableSlot, slot_id)
    if not slot:
        raise Problem(404, "Slot not found", "The timetable slot does not exist.")
    audit(db, actor, "TIMETABLE_SLOT_DELETED", slot,
          before={"faculty_id": slot.faculty_id, "day_of_week": slot.day_of_week})
    db.delete(slot)
    db.commit()


@router.get("/timetable/mine")
def my_timetable(db: Session = Depends(get_db),
                 actor: User = Depends(require_roles(Role.FACULTY))):
    fac = faculty_for_user(db, actor)
    items = list(db.scalars(
        select(TimetableSlot).where(TimetableSlot.faculty_id == fac.id)
        .order_by(TimetableSlot.day_of_week, TimetableSlot.start_time)
    ))
    courses = {c.id: c for c in db.scalars(
        select(CourseClass).where(CourseClass.id.in_(
            [i.class_id for i in items if i.class_id]
        ))
    ).all()}
    return {"items": [_slot_json(i, courses.get(i.class_id)) for i in items]}


@router.get("/timetable/mine/today")
def my_today_timetable(db: Session = Depends(get_db),
                       actor: User = Depends(require_roles(Role.FACULTY))):
    fac = faculty_for_user(db, actor)
    today_dow = date.today().isoweekday()
    if today_dow > 5:
        return {"items": []}
    items = list(db.scalars(
        select(TimetableSlot).where(
            TimetableSlot.faculty_id == fac.id,
            TimetableSlot.day_of_week == today_dow,
        ).order_by(TimetableSlot.start_time)
    ))
    courses = {c.id: c for c in db.scalars(
        select(CourseClass).where(CourseClass.id.in_(
            [i.class_id for i in items if i.class_id]
        ))
    ).all()}
    return {"items": [_slot_json(i, courses.get(i.class_id)) for i in items]}
