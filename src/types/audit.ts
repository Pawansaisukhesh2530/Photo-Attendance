import type { Id, IsoDate, IsoDateTime, PageRequest } from './common';
import type { AttendanceStatus } from './attendance';

/**
 * Every auditable action.
 *
 * The first group is attendance, written by the capture and review flows. The second group is
 * administrative, written when an admin changes the institution's configuration. Both live in one
 * union because an administrator investigating an attendance dispute needs a single chronological
 * record — splitting them would make "what happened to this class in March" require two queries
 * and a manual merge.
 */
export type AuditAction =
  // Attendance
  | 'ATTENDANCE_CAPTURED'
  | 'STATUS_CHANGED'
  | 'TWIN_RESOLVED'
  | 'SESSION_FINALIZED'
  | 'FINALIZED_SESSION_EDITED'
  | 'STUDENT_ENROLLED'
  | 'FACE_ENROLLED'
  // Administration
  | 'FACULTY_CREATED'
  | 'FACULTY_UPDATED'
  | 'FACULTY_STATUS_CHANGED'
  | 'CLASS_CREATED'
  | 'CLASS_UPDATED'
  | 'FACULTY_ASSIGNED'
  | 'ENROLMENT_UPDATED'
  | 'SETTING_CHANGED';

/** What an audit entry is about, for entries that are not attendance records. */
export type AuditEntityType = 'FACULTY' | 'CLASS' | 'STUDENT' | 'SESSION' | 'SETTING';

/**
 * A single audit entry, rendered as a timeline on mobile rather than the wide table
 * the Stitch desktop design implies.
 *
 * Written entirely by the backend; the frontend only ever reads these. There is no create, update
 * or delete anywhere in the contract, and there must never be one — an audit trail that can be
 * edited is not an audit trail.
 */
export interface AuditEntry {
  id: Id;
  action: AuditAction;
  at: IsoDateTime;
  actorId: Id;
  actorName: string;
  actorRole: string;

  sessionId: Id | null;
  classDisplayCode: string | null;

  /** Populated for STATUS_CHANGED and TWIN_RESOLVED. */
  studentId: Id | null;
  studentName: string | null;
  rollNumber: string | null;
  previousStatus: AttendanceStatus | null;
  newStatus: AttendanceStatus | null;

  reason: string | null;

  /* ---------------------------------------------------------------- *
   * Administrative entries
   * ---------------------------------------------------------------- */

  /**
   * What the entry concerns, when it is not an attendance status change.
   *
   * Optional so existing attendance entries stay valid: those are already fully described by
   * `sessionId`, `studentId` and the status pair.
   */
  entityType?: AuditEntityType;
  entityId?: Id;
  /** Human-readable label for the entity, e.g. "Dr. Anil Sharma" or "CSE-5A". */
  entityLabel?: string;

  /**
   * Before/after as display strings, for changes that are not attendance statuses.
   *
   * Deliberately strings rather than a generic value type. The backend owns the formatting of a
   * changed setting or a renamed class, and the client must not have to know the shape of every
   * field that could ever be edited in order to render its history.
   */
  previousValue?: string | null;
  newValue?: string | null;
}

/**
 * Filters for the audit log.
 *
 * Extends `PageRequest`, used only by `AuditService.getPagedAuditEntries`. The unpaged
 * `getAuditEntries` ignores the paging fields and is what the faculty session-audit screen uses.
 */
export interface AuditQuery extends PageRequest {
  sessionId?: Id;
  studentId?: Id;
  actorId?: Id;
  action?: AuditAction;
  entityType?: AuditEntityType;
  /** Inclusive date bounds on `at`. */
  from?: IsoDate;
  to?: IsoDate;
  /** Matches actor name, student name, roll number, entity label or reason. */
  search?: string;
}
