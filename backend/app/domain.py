import hashlib
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .errors import Problem
from .models import (AttendanceRecord, AttendanceSession, AttendanceSessionClass, AttendanceSessionImage,
                     AttendanceStatus, AuditEntry, CourseClass, Enrolment, Faculty,
                     FacultyClassAssignment, RecognitionJob, SessionStatus, Student, User)


def audit(db: Session, actor: User, action: str, entity, before=None, after=None, reason=None) -> None:
    db.add(AuditEntry(actor_id=actor.id, action=action, entity_type=entity.__class__.__name__, entity_id=str(entity.id), before=before, after=after, reason=reason))


def faculty_for_user(db: Session, user: User) -> Faculty:
    faculty = db.scalar(select(Faculty).where(Faculty.user_id == user.id))
    if not faculty:
        raise Problem(403, "Faculty profile missing", "This account has no faculty profile.")
    return faculty


def ensure_version(entity, expected: int) -> None:
    if entity.version != expected:
        raise Problem(409, "Version conflict", "This record changed; reload it and try again.")


def page(query, db: Session, page_number: int, page_size: int):
    page_number = max(1, page_number)
    page_size = min(100, max(1, page_size))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = list(db.scalars(query.offset((page_number - 1) * page_size).limit(page_size)))
    return items, total, page_number, page_size


def authorized_class_ids(db: Session, user: User) -> set[str]:
    if user.role.value == "ADMIN":
        return set(db.scalars(select(CourseClass.id)))
    faculty = faculty_for_user(db, user)
    return set(db.scalars(select(FacultyClassAssignment.class_id).where(FacultyClassAssignment.faculty_id == faculty.id)))


def require_session_access(db: Session, user: User, session_id: str) -> AttendanceSession:
    session = db.get(AttendanceSession, session_id)
    if not session:
        raise Problem(404, "Session not found", "The attendance session does not exist.")
    if user.role.value != "ADMIN" and session.faculty_id != faculty_for_user(db, user).id:
        raise Problem(403, "Forbidden", "This session is outside your assigned scope.")
    return session


def candidate_student_ids(db: Session, session_id: str) -> list[str]:
    class_ids = select(AttendanceSessionClass.class_id).where(AttendanceSessionClass.session_id == session_id)
    return list(db.scalars(select(Enrolment.student_id).where(Enrolment.class_id.in_(class_ids)).distinct()))


def make_job_key(db: Session, session_id: str) -> str:
    checksums = sorted(db.scalars(select(AttendanceSessionImage.checksum).where(AttendanceSessionImage.session_id == session_id)))
    raw = f"{session_id}|{'|'.join(checksums)}|{get_settings().model_version}"
    return hashlib.sha256(raw.encode()).hexdigest()


def build_safe_unknown_records(db: Session, session: AttendanceSession) -> None:
    """Fallback used when model adapters are unavailable; uncertainty is never called absence."""
    for student_id in candidate_student_ids(db, session.id):
        existing = db.scalar(select(AttendanceRecord).where(AttendanceRecord.session_id == session.id, AttendanceRecord.student_id == student_id))
        if not existing:
            db.add(AttendanceRecord(session_id=session.id, student_id=student_id, ai_status=AttendanceStatus.UNKNOWN,
                                    status=AttendanceStatus.UNKNOWN, score=None, review_reason="MODEL_UNAVAILABLE",
                                    model_version=get_settings().model_version))
    session.status = SessionStatus.PENDING_REVIEW
    session.version += 1
    db.flush()
