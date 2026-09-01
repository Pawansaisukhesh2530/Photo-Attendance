import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceSummary,
  Id,
  SessionClassRef,
} from '@/types';

export interface ClassGroup {
  class: SessionClassRef;
  records: AttendanceRecord[];
  summary: AttendanceSummary;
}

/**
 * Summarises a set of records.
 *
 * Mirrors the server's own arithmetic so per-class figures reconcile exactly with the session
 * total. `unmatchedFaces` is deliberately zero for a per-class breakdown: an unmatched face
 * belongs to no class by definition, so attributing it to one would be an invention. It stays a
 * session-level figure only.
 */
export function summariseRecords(records: AttendanceRecord[]): AttendanceSummary {
  const present = records.filter((r) => r.status === 'PRESENT').length;
  const absent = records.filter((r) => r.status === 'ABSENT').length;
  const review = records.filter((r) => r.status === 'REVIEW').length;
  const unknown = records.filter((r) => r.status === 'UNKNOWN').length;
  const recognized = records.filter((r) => r.confidence !== null).length;
  const total = records.length;

  return {
    total,
    present,
    absent,
    review,
    unknown,
    recognized,
    unmatchedFaces: 0,
    percentage: total === 0 ? 0 : Math.round((present / total) * 100),
  };
}

/**
 * Groups a session's records by participating class, in selection order.
 *
 * Kept as a pure function outside the components so the results screen stays presentational and
 * so the arithmetic can be verified directly. Classes with no records still appear, which matters
 * for an empty or fully-absent class — silently dropping it would make the register look shorter
 * than the session actually was.
 */
export function groupRecordsByClass(session: AttendanceSession): ClassGroup[] {
  const byClass = new Map<Id, AttendanceRecord[]>();
  for (const ref of session.classes) byClass.set(ref.id, []);

  for (const record of session.records) {
    const bucket = byClass.get(record.classId);
    if (bucket) bucket.push(record);
    // A record whose classId is not among the session's classes is dropped rather than
    // rehomed. That would mean the backend returned an out-of-scope student, and inventing a
    // home for it would hide a contract violation.
  }

  return session.classes.map((ref) => {
    const records = byClass.get(ref.id) ?? [];
    return { class: ref, records, summary: summariseRecords(records) };
  });
}

/** True when the session covers more than one class. */
export function isMultiClass(session: AttendanceSession): boolean {
  return session.selectedClassIds.length > 1;
}

/** "CSE-5A" or "CSE-5A +2", for compact contexts like history rows and headers. */
export function classLabel(
  displayCode: string,
  classCount: number,
): string {
  return classCount > 1 ? `${displayCode} +${classCount - 1}` : displayCode;
}
