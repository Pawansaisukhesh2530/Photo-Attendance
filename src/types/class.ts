import type { Id, IsoDate, IsoDateTime, PageRequest } from './common';

/**
 * Per-class, per-day attendance state. Drives the badge on the Stitch class card
 * ("Pending" / "Taken" / "No class today") and which action buttons are enabled.
 */
export type ClassAttendanceState =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'AWAITING_REVIEW'
  | 'COMPLETED'
  | 'NO_CLASS_TODAY';

export interface ClassSchedule {
  /** 0 = Sunday, matching JS `Date.getDay()`. */
  dayOfWeek: number;
  /** "HH:mm" in the institution's local timezone. */
  startTime: string;
  endTime: string;
  room: string;
}

/**
 * Whether a class is running this academic session.
 *
 * ARCHIVED classes keep their attendance history — an archived class must still be inspectable in
 * reports and audit, so this is a visibility flag rather than a deletion.
 */
export type ClassStatus = 'ACTIVE' | 'ARCHIVED';

export interface CourseClass {
  id: Id;
  subject: string;
  /** Programme/year code, e.g. "CSE-5". */
  classCode: string;
  section: string;
  /** Combined display label, e.g. "CSE-5A". */
  displayCode: string;
  semester: number;
  academicSession: string;
  facultyId: Id;
  facultyName: string;
  studentCount: number;
  /** Percentage 0..100 across the session to date. */
  attendancePercentage: number;
  schedule: ClassSchedule[];

  /**
   * Owning department. Optional so records predating the admin area remain valid.
   *
   * Faculty screens deliberately do not read this: a lecturer's class list is already scoped to
   * them, so a department column would be the same value on every row.
   */
  department?: string;

  /** Defaults to ACTIVE when absent. */
  status?: ClassStatus;
}

/**
 * A class as it appears on today's dashboard: the class plus the state of today's
 * specific occurrence.
 */
export interface TodayClass extends CourseClass {
  date: IsoDate;
  startTime: string;
  endTime: string;
  room: string;
  attendanceState: ClassAttendanceState;
  /** Present once attendance has been captured for today's occurrence. */
  sessionId: Id | null;
  /** Populated when `attendanceState` is COMPLETED, for the "42/45 Present" summary line. */
  presentCount: number | null;
  lastCapturedAt: IsoDateTime | null;
}

/**
 * Class filters.
 *
 * Extends `PageRequest` so admin can page a large catalogue. `ClassService.getClasses` still
 * returns a plain array and ignores paging — Faculty relies on that and it is not being changed.
 * `getPagedClasses` is the paged entry point. See `services/contracts.ts`.
 */
export interface ClassQuery extends PageRequest {
  facultyId?: Id;
  semester?: number;
  search?: string;
  department?: string;
  status?: ClassStatus;
  /** When true, classes with no faculty assigned. Drives the admin "needs a lecturer" filter. */
  unassignedOnly?: boolean;
}

/* ------------------------------------------------------------------ *
 * Admin class management
 * ------------------------------------------------------------------ */

/**
 * Payload for creating a class.
 *
 * For the backend developer: `displayCode` is derived server-side from `classCode` + `section`
 * so the label can never disagree with its parts. Faculty assignment and enrolment are separate
 * operations, so each is independently auditable.
 */
export interface CreateClassRequest {
  subject: string;
  classCode: string;
  section: string;
  semester: number;
  department: string;
  academicSession: string;
  /** Optional at creation: a class may be scheduled before a lecturer is assigned. */
  facultyId?: Id | null;
  schedule?: ClassSchedule[];
}

/** Partial update. Omitted fields are left untouched. */
export interface UpdateClassRequest {
  classId: Id;
  subject?: string;
  classCode?: string;
  section?: string;
  semester?: number;
  department?: string;
  academicSession?: string;
  status?: ClassStatus;
  schedule?: ClassSchedule[];
}

/**
 * Assigns or clears the lecturer for a class.
 *
 * `facultyId: null` unassigns. One lecturer per class, matching `CourseClass.facultyId`;
 * co-teaching is not modelled and inventing it here would put a shape on the contract the rest
 * of the app cannot honour.
 */
export interface AssignFacultyRequest {
  classId: Id;
  facultyId: Id | null;
}

/**
 * Adds or removes students from a class roster.
 *
 * For the backend developer: this must be idempotent. Adding a student already enrolled is not
 * an error, and removing one who is not enrolled is not an error — the admin UI submits a desired
 * set, not a diff, so retrying a failed request must be safe.
 */
export interface UpdateEnrolmentRequest {
  classId: Id;
  addStudentIds?: Id[];
  removeStudentIds?: Id[];
}
