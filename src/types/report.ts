import type { Id, IsoDate, PageRequest } from './common';

export interface AttendanceTrendPoint {
  date: IsoDate;
  /** Percentage 0..100 for that date. */
  percentage: number;
  present: number;
  total: number;
}

export interface StudentAttendanceStat {
  studentId: Id;
  rollNumber: string;
  name: string;
  avatarUrl: string | null;
  /**
   * Sessions the student was recorded PRESENT for.
   *
   * Note for the backend developer: `attendedSessions` and `totalSessions` must both exclude
   * sessions where the student's status is REVIEW or UNKNOWN. Those mean "we could not determine
   * this student's presence", and counting them in the denominator would silently penalise a
   * student for a recognition failure that was never resolved. An undetermined session is not
   * evidence of absence and must not be treated as such.
   */
  attendedSessions: number;
  /** Sessions with a determined status (PRESENT or ABSENT). Never less than `attendedSessions`. */
  totalSessions: number;
  percentage: number;
  /** True when below the institutional threshold. */
  belowThreshold: boolean;
}

export interface ClassAttendanceStat {
  classId: Id;
  className: string;
  displayCode: string;
  percentage: number;
  sessionCount: number;
}

/**
 * Attendance aggregated by the lecturer who took it.
 *
 * Admin-only. A faculty member's own report has exactly one entry — themselves — so this dimension
 * only means something at institution or department scope.
 *
 * For the backend developer: this measures the attendance recorded *in* a lecturer's classes. It
 * is not a judgement of the lecturer, and the UI must not present it as one; a class of habitual
 * non-attenders is not evidence about whoever teaches it.
 */
export interface FacultyAttendanceStat {
  facultyId: Id;
  facultyName: string;
  department: string | null;
  /** Percentage 0..100 across every class this lecturer taught in scope. */
  percentage: number;
  classCount: number;
  sessionCount: number;
  /** Students below the threshold across this lecturer's classes. */
  lowAttendanceCount: number;
}

/**
 * The report summary for a scope and date range.
 *
 * Deliberately holds no full student roll. The per-student breakdown is served separately and
 * paged by `ReportService.getStudentStats`, because a faculty member's scope can span several
 * hundred students and embedding that array here would force the whole roll down the wire every
 * time the trend was refreshed. `studentCount` and `lowAttendanceCount` are the authoritative
 * totals; `lowAttendanceStudents` is a bounded preview for the summary card only.
 */
export interface AttendanceReport {
  scope: 'INSTITUTION' | 'FACULTY' | 'CLASS' | 'DEPARTMENT';
  scopeId: Id | null;
  from: IsoDate;
  to: IsoDate;
  /** Percentage 0..100 across the whole scope and range. */
  overallPercentage: number;
  totalSessions: number;
  /** Distinct students in scope. The true total behind the paged per-student breakdown. */
  studentCount: number;
  trend: AttendanceTrendPoint[];
  byClass: ClassAttendanceStat[];

  /**
   * Per-lecturer breakdown.
   *
   * Empty at CLASS scope and at FACULTY scope, where it would restate the overall figure. Only
   * institution and department scope produce more than one entry, so the admin UI hides the
   * section when it holds fewer than two.
   */
  byFaculty: FacultyAttendanceStat[];

  /**
   * A short, bounded preview of students below the threshold, for the summary card.
   *
   * NOT the complete list — `lowAttendanceCount` is. Anything that needs every flagged student
   * must page `getStudentStats({ lowAttendanceOnly: true })`, which is the single scalable source.
   */
  lowAttendanceStudents: StudentAttendanceStat[];
  /** Total students below the threshold in this scope and range. */
  lowAttendanceCount: number;
  /** The percentage below which a student is flagged. Institution policy, set server-side. */
  threshold: number;
}

export interface ReportQuery {
  classId?: Id;
  facultyId?: Id;
  from?: IsoDate;
  to?: IsoDate;

  /**
   * Department scope. Admin only.
   *
   * Narrows to classes owned by one department. Combines with `classId`/`facultyId` as an
   * intersection, never a union — a stale filter must narrow the result, never widen it.
   */
  department?: string;

  /**
   * Requests institution-wide scope, ignoring the caller's own faculty assignment.
   *
   * Explicit rather than implied by omitting `facultyId`, because "no faculty filter" already
   * means "my own classes" for every faculty caller. Making the wider scope opt-in means a
   * faculty client can never accidentally receive institution figures.
   *
   * The backend MUST authorise this against the caller's role and reject it for a faculty token.
   * Do not rely on the client asking nicely.
   */
  institutionWide?: boolean;
}

/**
 * Filters and paging for the per-student report breakdown.
 *
 * Extends `ReportQuery` so a scope is expressed identically whether the caller wants the summary
 * or the roll, and `PageRequest` so it uses the same paging dialect as `StudentQuery`.
 *
 * `total` and `hasMore` on the response must reflect the *filtered* set. Paging is applied after
 * filtering, never before.
 */
export interface ReportStudentQuery extends ReportQuery, PageRequest {
  /** Restricts the page to students below `AttendanceReport.threshold`. */
  lowAttendanceOnly?: boolean;
  /** Matches student name or roll number. */
  search?: string;
}
