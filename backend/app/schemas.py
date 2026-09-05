from datetime import date, datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from .models import AttendanceStatus, FacultyStatus, Role, SessionStatus

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int
    has_more: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    role: Role
    is_active: bool


class FacultyIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    employee_id: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    department: str = Field(min_length=1, max_length=120)
    designation: str = Field(default="Faculty", max_length=120)


class FacultyPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    department: str | None = Field(default=None, min_length=1, max_length=120)
    designation: str | None = Field(default=None, min_length=1, max_length=120)
    status: FacultyStatus | None = None
    version: int


class FacultyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    employee_id: str
    name: str
    department: str
    designation: str
    status: FacultyStatus
    version: int


class StudentIn(BaseModel):
    student_id: str = Field(min_length=1, max_length=50)
    roll_number: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    department: str = Field(min_length=1, max_length=120)
    semester: int = Field(ge=1, le=16)
    section: str = Field(min_length=1, max_length=20)


class StudentPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    department: str | None = Field(default=None, min_length=1)
    semester: int | None = Field(default=None, ge=1, le=16)
    section: str | None = Field(default=None, min_length=1)
    active: bool | None = None
    version: int


class StudentOut(StudentIn):
    model_config = ConfigDict(from_attributes=True)
    id: str
    active: bool
    version: int


class ClassIn(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    subject: str = Field(min_length=1, max_length=200)
    department: str = Field(min_length=1, max_length=120)
    semester: int = Field(ge=1, le=16)
    section: str = Field(min_length=1, max_length=20)
    academic_session: str = Field(min_length=1, max_length=30)


class ClassPatch(BaseModel):
    subject: str | None = Field(default=None, min_length=1)
    department: str | None = Field(default=None, min_length=1)
    semester: int | None = Field(default=None, ge=1, le=16)
    section: str | None = Field(default=None, min_length=1)
    academic_session: str | None = Field(default=None, min_length=1)
    archived: bool | None = None
    version: int


class ClassOut(ClassIn):
    model_config = ConfigDict(from_attributes=True)
    id: str
    archived: bool
    version: int


class AssignmentRequest(BaseModel):
    faculty_id: str


class EnrolmentUpdate(BaseModel):
    add_student_ids: list[str] = Field(default_factory=list)
    remove_student_ids: list[str] = Field(default_factory=list)


class SessionCreate(BaseModel):
    class_ids: list[str] = Field(min_length=1, max_length=20)
    attendance_date: date | None = None

    @model_validator(mode="after")
    def unique_classes(self):
        if len(set(self.class_ids)) != len(self.class_ids):
            raise ValueError("class_ids must be unique")
        return self


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    faculty_id: str
    attendance_date: date
    status: SessionStatus
    version: int
    finalized_at: datetime | None


class AttendanceRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    student_id: str
    ai_status: AttendanceStatus
    status: AttendanceStatus
    score: float | None
    review_reason: str | None
    model_version: str
    version: int


class AmendmentRequest(BaseModel):
    status: Literal["PRESENT", "ABSENT"]
    reason: str | None = Field(default=None, max_length=1000)
    version: int


class FinalizeRequest(BaseModel):
    acknowledge_unresolved: bool = False


class SettingsPatch(BaseModel):
    institution_name: str | None = Field(default=None, min_length=1, max_length=250)
    attendance_threshold: int | None = Field(default=None, ge=1, le=100)
    image_retention_days: int | None = Field(default=None, ge=1, le=3650)
    version: int


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    institution_name: str
    attendance_threshold: int
    image_retention_days: int
    version: int
