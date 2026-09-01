import type { Id, IsoDate, PageRequest } from './common';
import type { AttendanceStatus } from './attendance';

export interface Student {
  id: Id;
  /** Institutional student ID, e.g. "CS-2023-042". Distinct from the per-class roll number. */
  studentId: string;
  /** Position within a specific class roster, e.g. "CSE-5A-14". */
  rollNumber: string;
  name: string;
  avatarUrl: string | null;
  department: string;
  semester: number;
  section: string;
  /** Percentage 0..100 across all enrolled classes. */
  overallAttendance: number;
  /**
   * Whether a face template exists for this student on the backend.
   *
   * The frontend only ever reads this to drive the enrolment UI badge; it never
   * inspects, generates, or transmits biometric data. Enrolment capture and template
   * extraction are entirely backend concerns.
   */
  faceEnrolled: boolean;
  /**
   * Set when the backend has flagged this student as visually ambiguous with
   * another (twins, close siblings). Drives the twin-review affordance.
   *
   * A group may span classes. Two students share a group only if they look alike, which says
   * nothing about whether they are enrolled together — so ambiguity is only real when both
   * happen to fall inside the same recognition scope.
   */
  twinGroupId: Id | null;

  /**
   * The class this student primarily belongs to.
   *
   * Used to attribute an attendance record to a class. In a multi-class session the class that
   * put a student in scope is authoritative and overrides this, but it is the sensible default
   * for a single-class session and for student-profile display.
   */
  primaryClassId: Id;
}

/** Compact projection used in long virtualised rosters. */
export interface StudentSummary {
  id: Id;
  rollNumber: string;
  name: string;
  avatarUrl: string | null;
  overallAttendance: number;
}

export interface StudentAttendanceEntry {
  date: IsoDate;
  className: string;
  classId: Id;
  status: AttendanceStatus;
  sessionId: Id;
}

export interface StudentProfile extends Student {
  enrolledClassIds: Id[];
  recentAttendance: StudentAttendanceEntry[];
  /** Per-class attendance percentage, keyed by class id. */
  attendanceByClass: Record<Id, number>;
}

/**
 * Filters and paging for the student directory.
 *
 * Extends the shared `PageRequest` rather than declaring its own `page`/`pageSize`, so every
 * paged endpoint speaks the same dialect. Both are optional: omitting them means "first page,
 * server default size".
 *
 * For the backend developer: `total` and `hasMore` on the response must reflect the *filtered*
 * set, not the whole cohort. The client renders "showing 25 of 48" straight from those two
 * fields and drives infinite scroll off `hasMore`, so a total that ignores the filters would
 * both mislead the user and make the list request pages that do not exist.
 */
export interface StudentQuery extends PageRequest {
  classId?: Id;
  search?: string;
  department?: string;
  semester?: number;
  /** Filters to students below the institutional attendance threshold. */
  lowAttendanceOnly?: boolean;
}
