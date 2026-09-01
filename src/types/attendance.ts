import type { BoundingBox, Id, IsoDate, IsoDateTime, PageRequest } from './common';

/**
 * The four attendance states.
 *
 * PRESENT / ABSENT / REVIEW are all rendered explicitly in the Stitch Attendance
 * Results table. UNKNOWN is an extension.
 *
 * Every `AttendanceRecord` belongs to an enrolled student, so UNKNOWN means "the system
 * could not determine a state for this enrolled student" — occluded, not detected at all,
 * or detected without a usable match. It is deliberately not folded into ABSENT, because
 * "we could not tell" and "this student was not here" are different facts and must not be
 * conflated in a record that affects a student's standing. Faculty resolve UNKNOWN to
 * PRESENT or ABSENT exactly as they resolve REVIEW.
 *
 * Faces detected in the photo that match nobody on the roster are NOT records — they are
 * reported as `AttendanceSummary.unmatchedFaces`, because there is no student to attach
 * them to.
 */
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'REVIEW' | 'UNKNOWN';

/** Why a record needs human attention. Drives the copy shown in the review UI. */
export type ReviewReason =
  | 'TWIN_AMBIGUITY'
  | 'LOW_CONFIDENCE'
  | 'OCCLUDED'
  | 'NOT_DETECTED'
  | 'POOR_IMAGE_QUALITY';

export type SessionStatus =
  | 'DRAFT'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'PENDING_REVIEW'
  | 'READY'
  | 'FINALIZED'
  | 'FAILED';

export interface AttendanceRecord {
  id: Id;
  studentId: Id;
  rollNumber: string;
  studentName: string;
  avatarUrl: string | null;

  /**
   * The selected class this record belongs to.
   *
   * Present because a multi-class session cannot derive it: the client would need every
   * participating roster in memory to map a student back to a class. One id per record is far
   * cheaper than that. Display names are not duplicated here — they come from
   * `AttendanceSession.classes`.
   */
  classId: Id;

  /**
   * The operative status. This is what counts, and what faculty edits change.
   */
  status: AttendanceStatus;

  /**
   * The backend's original verdict, never mutated after the session is created.
   *
   * Keeping this alongside `status` is what makes the audit trail and the
   * "AI said X, faculty changed it to Y" comparison derivable on the client without
   * a second endpoint. The backend should treat this field as write-once.
   */
  aiStatus: AttendanceStatus;

  /** Recognition confidence 0..1. Null when the student was never detected. */
  confidence: number | null;

  reviewRequired: boolean;
  reviewReason: ReviewReason | null;

  /** Location of this student's face in the classroom photo, if detected. */
  faceBox: BoundingBox | null;

  /** Set once a human changes the status. */
  editedBy: Id | null;
  editedByName: string | null;
  editedAt: IsoDateTime | null;
  editReason: string | null;
}

/**
 * An ambiguous match between two students the backend could not separate.
 *
 * `resolution` stays null while the case is open. "Decide Later" leaves it null and
 * keeps both records at REVIEW — the frontend must never silently pick a candidate.
 */
export type TwinResolution = 'BOTH_PRESENT' | 'ONLY_A' | 'ONLY_B' | 'DEFERRED';

export interface TwinReviewCandidate {
  studentId: Id;
  name: string;
  rollNumber: string;
  avatarUrl: string | null;
  semester: number;
  confidence: number;
}

export interface TwinReview {
  id: Id;
  sessionId: Id;
  /** Crop of the unidentified face from the classroom photo. */
  detectedFaceUrl: string | null;
  detectedFaceBox: BoundingBox | null;
  studentA: TwinReviewCandidate;
  studentB: TwinReviewCandidate;
  resolution: TwinResolution | null;
  resolvedBy: Id | null;
  resolvedAt: IsoDateTime | null;
}

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  review: number;
  unknown: number;
  /** Faces the backend matched to a roster entry, for the "46/48" readout. */
  recognized: number;
  /**
   * Faces detected in the photo that matched nobody in the candidate pool.
   *
   * Has no corresponding records — there is no in-scope student to attach them to. Surfaced as
   * an informational note so faculty know the count without it polluting the register.
   *
   * Note for the backend developer: a student who is genuinely enrolled but in an *unselected*
   * class necessarily lands here, and is indistinguishable from a visitor or a detection
   * artefact. That is a direct consequence of scoping the pool — the recogniser never searched
   * the unselected class, so it cannot know who the face was. Do not "helpfully" widen the
   * search to label these faces; the whole point of the scope is that it is not widened.
   */
  unmatchedFaces: number;
  /** Percentage 0..100, derived; present for display convenience. */
  percentage: number;
}

/**
 * A class participating in an attendance session.
 *
 * Denormalised onto the session so results can be grouped and labelled without fetching each
 * class separately — a three-class session would otherwise cost three extra round trips before
 * anything could render.
 */
export interface SessionClassRef {
  id: Id;
  subject: string;
  displayCode: string;
  /** Enrolled count at capture time, so historical sessions stay accurate after enrolment changes. */
  studentCount: number;
}

export interface AttendanceSession {
  id: Id;

  /**
   * The classes the faculty member selected before capturing.
   *
   * This is the recognition scope. The backend must build its candidate pool from the students
   * enrolled in exactly these classes and must not search beyond them. A session with one entry
   * is ordinary single-class attendance; two or more is a combined session.
   */
  selectedClassIds: Id[];

  /** Display data for each selected class, in selection order. */
  classes: SessionClassRef[];

  /**
   * The primary class — the first selected, and the one the session was started from.
   *
   * Retained so history rows, audit entries and the dashboard's today-card can keep labelling a
   * session with a single class. For multi-class sessions the UI shows this plus a "+n" affix
   * rather than inventing a combined name.
   */
  classId: Id;
  className: string;
  classDisplayCode: string;

  facultyId: Id;
  date: IsoDate;
  capturedAt: IsoDateTime;
  finalizedAt: IsoDateTime | null;
  status: SessionStatus;
  /** Local or remote URI of the single classroom photograph. */
  photoUri: string | null;
  /** Dimensions of the source photo, so normalised face boxes can be laid out. */
  photoWidth: number | null;
  photoHeight: number | null;
  summary: AttendanceSummary;
  records: AttendanceRecord[];
  twinReviews: TwinReview[];
  /** Non-fatal warnings, e.g. poor lighting or no faces found. */
  warnings: ProcessingWarning[];
}

export type ProcessingWarningCode =
  | 'POOR_IMAGE_QUALITY'
  | 'NO_FACES_DETECTED'
  | 'NO_RECOGNIZABLE_STUDENTS'
  | 'LOW_FACE_COUNT'
  | 'PARTIAL_OCCLUSION'
  | 'UNKNOWN_FACES_PRESENT';

export interface ProcessingWarning {
  code: ProcessingWarningCode;
  message: string;
  severity: 'INFO' | 'WARNING';
}

/** Compact projection for the history list. */
export interface AttendanceSessionSummary {
  id: Id;
  /** Primary class. For multi-class sessions the UI appends "+n" using `classCount`. */
  classId: Id;
  className: string;
  classDisplayCode: string;
  /** How many classes took part. 1 for an ordinary session. */
  classCount: number;
  date: IsoDate;
  capturedAt: IsoDateTime;
  status: SessionStatus;
  summary: AttendanceSummary;
  /** True when at least one record was changed by a human after processing. */
  hasManualEdits: boolean;
}

/* ------------------------------------------------------------------ *
 * Request payloads
 * ------------------------------------------------------------------ */

export interface CaptureAttendanceRequest {
  /**
   * The classes participating in this session, in selection order. Must contain at least one.
   *
   * For the backend developer: this is the recognition scope, and it arrives *before* any
   * matching happens. Build the candidate pool from the students enrolled in these classes only.
   * Do not match against the full student database and then infer which classes were involved —
   * that would let a face from an unrelated class enter a register it has no business in.
   */
  classIds: Id[];
  /** Local file URI of the compressed classroom photo. */
  photoUri: string;
  capturedAt: IsoDateTime;
}

/**
 * The stages the frontend reports while a capture is in flight.
 *
 * These mirror the five steps in the Stitch "AI Processing" stepper. They are
 * presentation only: the real backend is free to expose different progress, and the
 * mapping lives in one place (`services/attendance.ts`) so it can be re-pointed
 * without touching UI.
 */
export type ProcessingStage =
  | 'CAPTURED'
  | 'UPLOADING'
  | 'DETECTING_FACES'
  | 'IDENTIFYING_STUDENTS'
  | 'MATCHING_ROSTER'
  | 'GENERATING_RECORD'
  | 'PREPARING_REVIEW'
  | 'DONE';

export interface ProcessingProgress {
  stage: ProcessingStage;
  /** 0..1 across the whole pipeline. */
  progress: number;
  /** Human-readable detail, e.g. "42 individuals detected". */
  detail: string | null;
}

export interface UpdateAttendanceRequest {
  recordId: Id;
  status: AttendanceStatus;
  /** Required by policy when editing an already-finalized session. */
  reason?: string;
}

export interface ResolveTwinReviewRequest {
  reviewId: Id;
  resolution: TwinResolution;
}

export interface FinalizeSessionRequest {
  sessionId: Id;
  /**
   * Must be set explicitly to finalize while REVIEW records remain. Forces the
   * confirmation step to be a deliberate act rather than an accident.
   */
  acknowledgeUnresolvedReviews?: boolean;
}

/**
 * Filters for attendance history.
 *
 * Extends `PageRequest`, which is honoured only by `getPagedAttendanceHistory`. The original
 * `getAttendanceHistory` still returns a plain array and ignores the paging fields — the faculty
 * History screen depends on that shape and is not being changed. Both go through the same
 * filtering code; see `services/contracts.ts`.
 */
export interface AttendanceHistoryQuery extends PageRequest {
  classId?: Id;
  facultyId?: Id;
  from?: IsoDate;
  to?: IsoDate;
  status?: SessionStatus;
  /** Matches class name, display code or the lecturer's name. Admin oversight only. */
  search?: string;
  /** Restricts to sessions still holding unresolved review cases. */
  pendingReviewOnly?: boolean;
}
