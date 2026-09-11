from datetime import date, datetime, time
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .models import AttendanceStatus, FacultyStatus, Role, SessionStatus, SlotType

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int
    has_more: bool


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1,max_length=320)
    password: str = Field(min_length=8, max_length=200)
    remember_me: bool = False

    model_config=ConfigDict(populate_by_name=True,alias_generator=lambda s: ''.join([s.split('_')[0]]+[x.title() for x in s.split('_')[1:]]))

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_email(cls, value):
        if isinstance(value, dict) and "identifier" not in value and "email" in value:
            return {**value, "identifier": value["email"]}
        return value


class RefreshRequest(BaseModel):
    refresh_token: str
    model_config=ConfigDict(populate_by_name=True,alias_generator=lambda s: ''.join([s.split('_')[0]]+[x.title() for x in s.split('_')[1:]]))


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
    password: str = Field(default="ChangeMe123!",min_length=8)
    employee_id: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    department: str = Field(min_length=1, max_length=120)
    designation: str = Field(default="Faculty", max_length=120)

    @field_validator("email")
    @classmethod
    def require_institution_email(cls, value: EmailStr) -> EmailStr:
        if not str(value).lower().endswith("@christuniversity.in"):
            raise ValueError("Use a @christuniversity.in email address.")
        return value


class FacultyPatch(BaseModel):
    email: EmailStr | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    department: str | None = Field(default=None, min_length=1, max_length=120)
    designation: str | None = Field(default=None, min_length=1, max_length=120)
    status: FacultyStatus | None = None
    version: int

    @field_validator("email")
    @classmethod
    def require_institution_email(cls, value: EmailStr | None) -> EmailStr | None:
        if value is not None and not str(value).lower().endswith("@christuniversity.in"):
            raise ValueError("Use a @christuniversity.in email address.")
        return value


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
    variant: str = Field(default="Lecture", max_length=40)
    subject: str = Field(min_length=1, max_length=200)
    department: str = Field(min_length=1, max_length=120)
    semester: int = Field(ge=1, le=16)
    section: str = Field(min_length=1, max_length=20)
    academic_session: str = Field(min_length=1, max_length=30)

    @field_validator("variant")
    @classmethod
    def normalize_variant(cls, v: str) -> str:
        return v.strip().title()


class ClassPatch(BaseModel):
    subject: str | None = Field(default=None, min_length=1)
    variant: str | None = Field(default=None, max_length=40)
    department: str | None = Field(default=None, min_length=1)
    semester: int | None = Field(default=None, ge=1, le=16)
    section: str | None = Field(default=None, min_length=1)
    academic_session: str | None = Field(default=None, min_length=1)
    archived: bool | None = None
    version: int

    @field_validator("variant")
    @classmethod
    def normalize_variant(cls, v: str | None) -> str | None:
        return v.strip().title() if v is not None else v


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
    capture_mode: Literal["STANDARD", "PANORAMA"] = "STANDARD"

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
    capture_mode: str
    status: SessionStatus
    version: int
    finalized_at: datetime | None


class PanoramaAttach(BaseModel):
    draft_id: str


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
    version: int | None = None


class FinalizeRequest(BaseModel):
    acknowledge_unresolved: bool = False
    model_config=ConfigDict(populate_by_name=True,alias_generator=lambda s: ''.join([s.split('_')[0]]+[x.title() for x in s.split('_')[1:]]))


class SettingsPatch(BaseModel):
    institution_name: str | None = Field(default=None, min_length=1, max_length=250)
    institution_code: str | None = Field(default=None, min_length=2, max_length=20, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
    attendance_threshold: int | None = Field(default=None, ge=1, le=100)
    image_retention_days: int | None = Field(default=None, ge=1, le=3650)
    departments: list[str] | None = Field(default=None, min_length=1, max_length=100)
    faculty_roles: list[str] | None = Field(default=None, min_length=1, max_length=100)
    version: int


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    institution_name: str
    institution_code: str = "EDU"
    attendance_threshold: int
    image_retention_days: int
    version: int

    departments: list[str] = ["CSE"]
    faculty_roles: list[str] = ["Assistant Professor"]


class TimetableSlotIn(BaseModel):
    faculty_id: str
    class_id: str | None = None
    slot_type: SlotType = SlotType.CLASS
    day_of_week: int = Field(ge=1, le=5)
    start_time: time
    end_time: time
    room: str | None = None
    break_label: str | None = None

    @model_validator(mode="after")
    def validate_slot(self):
        if self.start_time >= self.end_time:
            raise ValueError("end_time must be after start_time")
        if self.slot_type == SlotType.CLASS and self.class_id is None:
            raise ValueError("class_id is required for CLASS slots")
        if self.slot_type == SlotType.FREE and self.class_id is not None:
            raise ValueError("class_id must be null for FREE slots")
        return self


class TimetableSlotPatch(BaseModel):
    class_id: str | None = None
    slot_type: SlotType | None = None
    day_of_week: int | None = Field(default=None, ge=1, le=5)
    start_time: time | None = None
    end_time: time | None = None
    room: str | None = None
    break_label: str | None = None
    version: int

    @model_validator(mode="after")
    def validate_slot(self):
        st = self.slot_type
        cid = self.class_id
        if st is not None and st == SlotType.CLASS and cid is None:
            raise ValueError("class_id is required for CLASS slots")
        if st is not None and st == SlotType.FREE and cid is not None:
            raise ValueError("class_id must be null for FREE slots")
        if self.start_time is not None and self.end_time is not None and self.start_time >= self.end_time:
            raise ValueError("end_time must be after start_time")
        return self


class TimetableSlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    faculty_id: str
    class_id: str | None
    slot_type: SlotType
    day_of_week: int
    day_label: str
    start_time: time
    end_time: time
    time_label: str
    room: str | None
    break_label: str | None
    class_name: str
    class_code: str | None
    subject: str | None
    variant: str | None
    version: int
