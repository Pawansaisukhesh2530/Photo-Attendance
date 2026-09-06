import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, JSON, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
from .config import get_settings

from .db import Base


def uuid4() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    ADMIN = "ADMIN"
    FACULTY = "FACULTY"
    STUDENT = "STUDENT"


class FacultyStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ON_LEAVE = "ON_LEAVE"


class SessionStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    PENDING_REVIEW = "PENDING_REVIEW"
    READY = "READY"
    FINALIZED = "FINALIZED"
    FAILED = "FAILED"


class AttendanceStatus(str, enum.Enum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    REVIEW = "REVIEW"
    UNKNOWN = "UNKNOWN"


class JobStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class Versioned:
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class User(Versioned, Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    role: Mapped[Role] = mapped_column(Enum(Role), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RefreshToken(Versioned, Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Faculty(Versioned, Base):
    __tablename__ = "faculty"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True)
    employee_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    department: Mapped[str] = mapped_column(String(120), index=True)
    designation: Mapped[str] = mapped_column(String(120), default="Faculty")
    status: Mapped[FacultyStatus] = mapped_column(Enum(FacultyStatus), default=FacultyStatus.ACTIVE)


class Student(Versioned, Base):
    __tablename__ = "students"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    student_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    roll_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    department: Mapped[str] = mapped_column(String(120), index=True)
    semester: Mapped[int] = mapped_column(Integer)
    section: Mapped[str] = mapped_column(String(20))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class CourseClass(Versioned, Base):
    __tablename__ = "classes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    subject: Mapped[str] = mapped_column(String(200))
    department: Mapped[str] = mapped_column(String(120), index=True)
    semester: Mapped[int] = mapped_column(Integer)
    section: Mapped[str] = mapped_column(String(20))
    academic_session: Mapped[str] = mapped_column(String(30))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class FacultyClassAssignment(Base):
    __tablename__ = "faculty_class_assignments"
    __table_args__ = (UniqueConstraint("faculty_id", "class_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    faculty_id: Mapped[str] = mapped_column(ForeignKey("faculty.id", ondelete="CASCADE"), index=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)


class Enrolment(Base):
    __tablename__ = "enrolments"
    __table_args__ = (UniqueConstraint("student_id", "class_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)


class StudentFaceImage(Versioned, Base):
    __tablename__ = "student_face_images"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    object_key: Mapped[str] = mapped_column(String(600), unique=True)
    checksum: Mapped[str] = mapped_column(String(64), index=True)
    mime_type: Mapped[str] = mapped_column(String(100))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    quality: Mapped[dict] = mapped_column(JSON, default=dict)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StudentFaceEmbedding(Versioned, Base):
    __tablename__ = "student_face_embeddings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    image_id: Mapped[str] = mapped_column(ForeignKey("student_face_images.id", ondelete="CASCADE"), unique=True)
    embedding: Mapped[list] = mapped_column(Vector(512) if get_settings().pgvector_enabled else JSON)
    model_version: Mapped[str] = mapped_column(String(120), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class AttendanceSession(Versioned, Base):
    __tablename__ = "attendance_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    faculty_id: Mapped[str] = mapped_column(ForeignKey("faculty.id"), index=True)
    attendance_date: Mapped[date] = mapped_column(Date, default=date.today)
    capture_mode: Mapped[str] = mapped_column(String(20), default="STANDARD")
    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus), default=SessionStatus.DRAFT, index=True)
    scope_locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PanoramaDraft(Base):
    __tablename__ = "panorama_drafts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    faculty_id: Mapped[str] = mapped_column(ForeignKey("faculty.id", ondelete="CASCADE"), index=True)
    object_key: Mapped[str] = mapped_column(String(600), unique=True)
    checksum: Mapped[str] = mapped_column(String(64), index=True)
    mime_type: Mapped[str] = mapped_column(String(100), default="image/jpeg")
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class AttendanceSessionClass(Base):
    __tablename__ = "attendance_session_classes"
    __table_args__ = (UniqueConstraint("session_id", "class_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    session_id: Mapped[str] = mapped_column(ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("classes.id"), index=True)


class AttendanceSessionImage(Versioned, Base):
    __tablename__ = "attendance_session_images"
    __table_args__ = (UniqueConstraint("session_id", "checksum"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    session_id: Mapped[str] = mapped_column(ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True)
    object_key: Mapped[str] = mapped_column(String(600), unique=True)
    checksum: Mapped[str] = mapped_column(String(64))
    mime_type: Mapped[str] = mapped_column(String(100))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    processing_error: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RecognitionJob(Versioned, Base):
    __tablename__ = "recognition_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    session_id: Mapped[str] = mapped_column(ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.QUEUED)
    stage: Mapped[str] = mapped_column(String(60), default="QUEUED")
    progress: Mapped[float] = mapped_column(Float, default=0)
    error_code: Mapped[str | None] = mapped_column(String(100))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FaceDetection(Base):
    __tablename__ = "face_detections"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    image_id: Mapped[str] = mapped_column(ForeignKey("attendance_session_images.id", ondelete="CASCADE"), index=True)
    box: Mapped[dict] = mapped_column(JSON)
    quality: Mapped[dict] = mapped_column(JSON, default=dict)
    model_version: Mapped[str] = mapped_column(String(120))


class RecognitionCandidate(Base):
    __tablename__ = "recognition_candidates"
    __table_args__ = (UniqueConstraint("detection_id", "student_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    detection_id: Mapped[str] = mapped_column(ForeignKey("face_detections.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), index=True)
    score: Mapped[float] = mapped_column(Float)
    rank: Mapped[int] = mapped_column(Integer)


class AttendanceRecord(Versioned, Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("session_id", "student_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    session_id: Mapped[str] = mapped_column(ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), index=True)
    ai_status: Mapped[AttendanceStatus] = mapped_column(Enum(AttendanceStatus))
    status: Mapped[AttendanceStatus] = mapped_column(Enum(AttendanceStatus))
    score: Mapped[float | None] = mapped_column(Float)
    review_reason: Mapped[str | None] = mapped_column(String(100))
    model_version: Mapped[str] = mapped_column(String(120))
    amended_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    amended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    amendment_reason: Mapped[str | None] = mapped_column(Text)


class TwinReview(Base):
    __tablename__ = "twin_reviews"
    __table_args__ = (UniqueConstraint("session_id", "student_a_id", "student_b_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    session_id: Mapped[str] = mapped_column(ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True)
    student_a_id: Mapped[str] = mapped_column(ForeignKey("students.id"))
    student_b_id: Mapped[str] = mapped_column(ForeignKey("students.id"))
    resolution: Mapped[str | None] = mapped_column(String(30))
    resolved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditEntry(Base):
    __tablename__ = "audit_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(80), index=True)
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    before: Mapped[dict | None] = mapped_column(JSON)
    after: Mapped[dict | None] = mapped_column(JSON)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class InstitutionSettings(Versioned, Base):
    __tablename__ = "institution_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    institution_name: Mapped[str] = mapped_column(String(250), default="EduTrace Institution")
    attendance_threshold: Mapped[int] = mapped_column(Integer, default=75)
    image_retention_days: Mapped[int] = mapped_column(Integer, default=30)
    departments: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["CSE"])
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
