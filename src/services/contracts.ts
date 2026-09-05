/**
 * Service interfaces.
 *
 * The HTTP implementations in `src/api/*` satisfy these. Hooks depend only on these interfaces,
 * makes the backend swap a one-line change in `services/index.ts` with no UI churn.
 *
 * Method names follow the vocabulary agreed in the project brief.
 */

import type {
  AssignFacultyRequest,
  AttendanceHistoryQuery,
  AttendanceReport,
  AttendanceSession,
  AttendanceSessionSummary,
  AttendanceStatus,
  AuditEntry,
  AuditQuery,
  AuthSession,
  CaptureAttendanceRequest,
  ClassQuery,
  CourseClass,
  CreateClassRequest,
  CreateFacultyRequest,
  Faculty,
  FacultyQuery,
  FacultyStatus,
  FinalizeSessionRequest,
  ForgotPasswordRequest,
  Id,
  InstitutionSettings,
  LoginRequest,
  Paginated,
  UpdateClassRequest,
  UpdateEnrolmentRequest,
  UpdateFacultyRequest,
  UpdateSettingsRequest,
  ProcessingProgress,
  ReportQuery,
  ReportStudentQuery,
  ResolveTwinReviewRequest,
  Student,
  CreateStudentRequest,
  FaceImageInfo,
  StudentAttendanceStat,
  StudentProfile,
  StudentQuery,
  TodayClass,
  TwinReview,
  UpdateAttendanceRequest,
  User,
} from '@/types';

export interface AuthService {
  login(request: LoginRequest): Promise<AuthSession>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<User>;
  requestPasswordReset(request: ForgotPasswordRequest): Promise<void>;
  refresh(refreshToken: string): Promise<AuthSession>;
}

export interface ClassService {
  /**
   * Unpaged class list. Used by every faculty screen.
   *
   * Kept returning a plain array deliberately. A faculty member holds a handful of classes, and
   * changing this shape would ripple through approved Phase 3 code for no benefit. Paging fields
   * on `ClassQuery` are ignored here — see `getPagedClasses`.
   */
  getClasses(query?: ClassQuery): Promise<CourseClass[]>;

  /**
   * Paged class catalogue. Admin only.
   *
   * Additive rather than a change to `getClasses`, so Faculty keeps working. Implementations must
   * share one filtering routine between the two so the same query can never produce different
   * results depending on which method asked.
   */
  getPagedClasses(query?: ClassQuery): Promise<Paginated<CourseClass>>;

  getClass(classId: Id): Promise<CourseClass>;
  getTodayClasses(facultyId: Id): Promise<TodayClass[]>;

  /* -------------------------------------------------------------- *
   * Administration
   *
   * For the backend developer: each of these must write an audit entry
   * (CLASS_CREATED, CLASS_UPDATED, FACULTY_ASSIGNED, ENROLMENT_UPDATED) and must authorise the
   * caller as ADMIN. The client cannot be trusted to restrict itself.
   * -------------------------------------------------------------- */

  createClass(request: CreateClassRequest): Promise<CourseClass>;
  updateClass(request: UpdateClassRequest): Promise<CourseClass>;

  /** Assigns or clears the lecturer. `facultyId: null` unassigns. */
  assignFaculty(request: AssignFacultyRequest): Promise<CourseClass>;

  /** Adds and/or removes students from a roster. Must be idempotent. */
  updateEnrolment(request: UpdateEnrolmentRequest): Promise<CourseClass>;
}

/**
 * Faculty directory and administration. Admin only.
 *
 * Did not exist before Phase 9 — nothing in the app listed or edited faculty. Every method here is
 * new contract surface for the backend developer.
 */
export interface FacultyService {
  getFacultyList(query?: FacultyQuery): Promise<Paginated<Faculty>>;
  getFacultyMember(facultyId: Id): Promise<Faculty>;

  /**
   * Creates a faculty member.
   *
   * The server owns `id` and must enforce uniqueness of `employeeId` and `email`, returning a
   * VALIDATION error with `fieldErrors` on collision so the form can attach the message to the
   * right input. It must not create an account silently on conflict.
   */
  createFaculty(request: CreateFacultyRequest): Promise<Faculty>;

  updateFaculty(request: UpdateFacultyRequest): Promise<Faculty>;

  /**
   * Changes employment status.
   *
   * Separate from `updateFaculty` because it is the one faculty change with consequences beyond
   * the record — an institution needs to see status changes as their own audited events
   * (`FACULTY_STATUS_CHANGED`), not buried in a general edit.
   *
   * Deactivating must NOT delete or rewrite the person's attendance history or audit trail.
   */
  setFacultyStatus(facultyId: Id, status: FacultyStatus): Promise<Faculty>;
}

/**
 * Institution settings. Admin only.
 *
 * The attendance threshold is the important one: it is institution policy, and every surface that
 * flags a student must follow it rather than a client-side constant.
 */
export interface SettingsService {
  getInstitutionSettings(): Promise<InstitutionSettings>;

  /**
   * Persists changed settings.
   *
   * The backend must audit every change (`SETTING_CHANGED`) with the previous and new values,
   * because changing the threshold retroactively changes who counts as low-attendance across the
   * entire institution.
   */
  updateInstitutionSettings(request: UpdateSettingsRequest): Promise<InstitutionSettings>;
}

export interface StudentService {
  getStudents(query?: StudentQuery): Promise<Paginated<Student>>;
  getStudent(studentId: Id): Promise<StudentProfile>;
  createStudent(request:CreateStudentRequest):Promise<Student>;
  getFaceImages(studentId:Id):Promise<FaceImageInfo[]>;
  uploadFaceImages(studentId:Id,uris:string[]):Promise<void>;
  revokeFaceImage(studentId:Id,imageId:Id):Promise<void>;
  reprocessFaceImages(studentId:Id):Promise<void>;
}

export interface AttendanceService {
  /**
   * Submits the single classroom photograph and opens a session.
   *
   * Resolves as soon as the session exists in PROCESSING; it does not wait for
   * recognition to finish. Callers then subscribe via `observeProcessing`.
   */
  captureAttendance(request: CaptureAttendanceRequest): Promise<AttendanceSession>;

  /**
   * Streams pipeline progress for a session.
   *
   * Returns an unsubscribe function. The real implementation will poll or open a
   * socket. The UI only ever sees
   * `ProcessingProgress` values.
   */
  observeProcessing(
    sessionId: Id,
    onProgress: (progress: ProcessingProgress) => void,
    onError: (error: unknown) => void,
  ): () => void;

  /**
   * Puts a FAILED session back into PROCESSING so the pipeline can be re-run against the
   * photo already uploaded. Exists so a processing failure never forces a retake — the
   * classroom moment cannot be recovered, but the upload can.
   */
  retryProcessing(sessionId: Id): Promise<AttendanceSession>;

  getAttendanceSession(sessionId: Id): Promise<AttendanceSession>;
  downloadSession(sessionId: Id, format: 'csv' | 'xlsx' | 'pdf' | 'json'): Promise<void>;

  /** Works on both draft and finalized sessions. Post-finalization edits are expected, not exceptional. */
  updateAttendance(request: UpdateAttendanceRequest): Promise<AttendanceSession>;

  resolveTwinReview(request: ResolveTwinReviewRequest): Promise<AttendanceSession>;
  getTwinReviews(sessionId: Id): Promise<TwinReview[]>;

  finalizeAttendance(request: FinalizeSessionRequest): Promise<AttendanceSession>;

  /**
   * Unpaged history for the caller's own classes. Used by the faculty History screen, class detail
   * and the dashboard's recent sessions.
   *
   * Kept returning a plain array deliberately: Phase 6 is approved and depends on this shape.
   * Paging fields on the query are ignored here.
   *
   * For the backend developer: this endpoint MUST scope to the classes the authenticated caller
   * teaches, derived from their token — not from anything the client sends. Omitting `facultyId`
   * means "mine", never "everyone"; a faculty caller must not be able to widen its own view by
   * leaving the field off. Institution-wide reads are a separate, admin-authorised endpoint
   * (`getPagedAttendanceHistory`). Do not rely on the client asking nicely.
   */
  getAttendanceHistory(query?: AttendanceHistoryQuery): Promise<AttendanceSessionSummary[]>;

  /**
   * Paged history. Admin oversight only.
   *
   * Additive rather than a change to `getAttendanceHistory`. An institution accumulates a session
   * per class per teaching day, so the admin list cannot assume the whole history fits in one
   * response — but Faculty must not be broken to fix that.
   *
   * Implementations must share one filtering routine with the unpaged method.
   */
  getPagedAttendanceHistory(
    query?: AttendanceHistoryQuery,
  ): Promise<Paginated<AttendanceSessionSummary>>;
}

export interface ReportService {
  /**
   * Summary, trend and per-class breakdown for a scope and date range.
   *
   * Carries no full student roll — see `getStudentStats`.
   */
  getReport(query?: ReportQuery): Promise<AttendanceReport>;

  /**
   * The per-student breakdown, paged.
   *
   * Separate from `getReport` because the roll is the only unbounded part of a report: a faculty
   * member's scope can span hundreds of students, and embedding it in the summary would resend
   * the trend and class breakdown on every page. Splitting them also lets the roll page
   * independently while the summary above it stays put.
   */
  getStudentStats(query?: ReportStudentQuery): Promise<Paginated<StudentAttendanceStat>>;
}

/**
 * Audit log. Read-only, on both methods, permanently.
 *
 * There is deliberately no create, update or delete here and there must never be one. The backend
 * writes entries as a side effect of the actions being audited; an audit trail an administrator
 * can edit is worthless as evidence.
 */
export interface AuditService {
  /**
   * Unpaged entries. Used by the faculty session-audit screen.
   *
   * Kept returning a plain array: a single session's history is short and bounded, and Phase 6
   * depends on this shape. Paging fields on the query are ignored here.
   */
  getAuditEntries(query?: AuditQuery): Promise<AuditEntry[]>;

  /**
   * Paged entries. Admin institution-wide audit.
   *
   * Additive. The institution-wide log grows without bound, so it must page — but the faculty
   * screen must not change to accommodate that. Implementations share one filtering routine.
   */
  getPagedAuditEntries(query?: AuditQuery): Promise<Paginated<AuditEntry>>;
}

/** Convenience alias used by hooks that need a status value in a callback signature. */
export type StatusChange = { recordId: Id; status: AttendanceStatus };
