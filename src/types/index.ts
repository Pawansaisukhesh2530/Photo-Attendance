/** Public frontend API types. */

export type {
  ApiError,
  ApiErrorKind,
  BoundingBox,
  Id,
  IsoDate,
  IsoDateTime,
  PageRequest,
  Paginated,
} from './common';

export type {
  AuthSession,
  CreateFacultyRequest,
  Faculty,
  FacultyQuery,
  FacultyStatus,
  ForgotPasswordRequest,
  LoginRequest,
  UpdateFacultyRequest,
  User,
  UserRole,
} from './user';

export type {
  CreateStudentRequest,
  FaceImageInfo,
  Student,
  StudentAttendanceEntry,
  StudentProfile,
  StudentQuery,
  StudentSummary,
} from './student';

export type {
  AssignFacultyRequest,
  ClassAttendanceState,
  ClassQuery,
  ClassSchedule,
  ClassStatus,
  CourseClass,
  CreateClassRequest,
  TodayClass,
  UpdateClassRequest,
  UpdateEnrolmentRequest,
} from './class';

export type {
  AttendanceHistoryQuery,
  AttendanceRecord,
  AttendanceSession,
  AttendanceSessionSummary,
  AttendanceStatus,
  AttendanceSummary,
  CaptureAttendanceRequest,
  FinalizeSessionRequest,
  ProcessingProgress,
  ProcessingStage,
  ProcessingWarning,
  ProcessingWarningCode,
  ResolveTwinReviewRequest,
  ReviewReason,
  SessionClassRef,
  SessionStatus,
  TwinResolution,
  TwinReview,
  TwinReviewCandidate,
  UpdateAttendanceRequest,
} from './attendance';

export type {
  AttendanceReport,
  AttendanceTrendPoint,
  ClassAttendanceStat,
  FacultyAttendanceStat,
  ReportQuery,
  ReportStudentQuery,
  StudentAttendanceStat,
} from './report';

export type {
  InstitutionSettings,
  UpdateSettingsRequest,
} from './settings';

export type {
  AuditAction,
  AuditEntityType,
  AuditEntry,
  AuditQuery,
} from './audit';
