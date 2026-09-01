/**
 * Report aggregation for the mock data layer.
 *
 * ============================================================================
 * This is the mock's stand-in for server-side aggregation. In the real system every figure below
 * is computed by the backend from its own tables; the client receives finished numbers and only
 * formats them.
 *
 * It lives here, beside the session store, rather than in a hook or a screen, so there is exactly
 * one place attendance statistics are derived. A component that computed its own percentage would
 * be a second source of truth, and the two would diverge the first time the definition changed.
 * ============================================================================
 *
 * Every figure comes from recorded `AttendanceRecord`s. Nothing is hard-coded, which is what makes
 * a freshly captured session move the report immediately: the aggregator reads the same store the
 * capture flow writes to.
 */

import { ATTENDANCE_THRESHOLD } from '@/constants/config';
import type {
  AttendanceReport,
  AttendanceSession,
  AttendanceTrendPoint,
  ClassAttendanceStat,
  CourseClass,
  FacultyAttendanceStat,
  Id,
  Paginated,
  ReportQuery,
  ReportStudentQuery,
  StudentAttendanceStat,
} from '@/types';

import { matchesText, paginate } from './paginate';

import {
  mockAllClasses,
  mockClasses,
  mockFacultyDirectory,
  mockStudentsByClass,
} from './fixtures';

/** How many flagged students the summary card previews. `lowAttendanceCount` is the real total. */
const LOW_ATTENDANCE_PREVIEW = 4;

/**
 * A student's tally within a scope.
 *
 * `determined` counts only sessions where the status was PRESENT or ABSENT. REVIEW and UNKNOWN are
 * excluded from both the numerator and the denominator: they mean the system could not tell whether
 * the student was there, and letting them fall into the denominator would quietly convert an
 * unresolved recognition failure into a lower attendance percentage. That is the same distinction
 * the results screen draws between UNKNOWN and ABSENT, applied to the arithmetic.
 */
interface Tally {
  attended: number;
  determined: number;
}

function emptyTally(): Tally {
  return { attended: 0, determined: 0 };
}

function percentage(attended: number, determined: number): number {
  if (determined === 0) return 0;
  return Math.round((attended / determined) * 100);
}

/* ------------------------------------------------------------------ *
 * Scope resolution
 * ------------------------------------------------------------------ */

interface Scope {
  classIds: Id[];
  classes: CourseClass[];
  scopeKind: 'INSTITUTION' | 'DEPARTMENT' | 'FACULTY' | 'CLASS';
  scopeId: Id | null;
}

/**
 * Resolves a query to the classes it covers.
 *
 * An unknown `classId` or `facultyId` narrows the scope to nothing rather than silently widening
 * to everything — a stale filter must never show a lecturer another cohort's figures.
 */
function resolveScope(query: ReportQuery | undefined, facultyId: Id): Scope {
  /*
   * Institution scope is opt-in via `institutionWide`, never implied by omitting `facultyId`.
   * For a faculty caller "no faculty filter" already means "my own classes", so inferring the
   * wider scope from an absent filter would hand a lecturer institution-wide figures by accident.
   *
   * A real backend must authorise this against the caller's role. The mock has no auth layer, so
   * the flag is honoured as given and the authorisation requirement is documented on the contract.
   */
  const pool = query?.institutionWide ? mockAllClasses : mockClasses;

  let candidates = query?.institutionWide
    ? pool
    : pool.filter((c) => c.facultyId === (query?.facultyId ?? facultyId));

  // A faculty filter inside institution scope narrows to that lecturer.
  if (query?.institutionWide && query.facultyId) {
    candidates = candidates.filter((c) => c.facultyId === query.facultyId);
  }

  // Department narrows further. Intersection, never union.
  if (query?.department) {
    candidates = candidates.filter((c) => c.department === query.department);
  }

  if (query?.classId) {
    const one = candidates.filter((c) => c.id === query.classId);
    return {
      classIds: one.map((c) => c.id),
      classes: one,
      scopeKind: 'CLASS',
      scopeId: query.classId,
    };
  }

  if (query?.institutionWide) {
    if (query.facultyId) {
      return {
        classIds: candidates.map((c) => c.id),
        classes: candidates,
        scopeKind: 'FACULTY',
        scopeId: query.facultyId,
      };
    }
    if (query.department) {
      return {
        classIds: candidates.map((c) => c.id),
        classes: candidates,
        scopeKind: 'DEPARTMENT',
        scopeId: query.department,
      };
    }
    return {
      classIds: candidates.map((c) => c.id),
      classes: candidates,
      scopeKind: 'INSTITUTION',
      scopeId: null,
    };
  }

  return {
    classIds: candidates.map((c) => c.id),
    classes: candidates,
    scopeKind: 'FACULTY',
    scopeId: query?.facultyId ?? facultyId,
  };
}

/**
 * Sessions inside the scope and date range.
 *
 * A session participates if any of its selected classes is in scope. Its *records* are filtered
 * separately, by `record.classId`, so a multi-class session contributes only the part that belongs
 * to the scope — a combined CSE-5A + CSE-5B capture must not inflate a CSE-5A-only report.
 */
function sessionsInScope(
  all: AttendanceSession[],
  scope: Scope,
  from: string | undefined,
  to: string | undefined,
): AttendanceSession[] {
  const inScope = new Set(scope.classIds);

  return all
    .filter((session) => session.selectedClassIds.some((id) => inScope.has(id)))
    .filter((session) => (from ? session.date >= from : true))
    .filter((session) => (to ? session.date <= to : true))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

/* ------------------------------------------------------------------ *
 * Per-student tallies
 * ------------------------------------------------------------------ */

interface AggregateResult {
  /** studentId -> tally, for every student with at least one determined record in scope. */
  byStudent: Map<Id, Tally>;
  /** classId -> tally. Kept so the faculty roll-up reuses it instead of re-walking records. */
  byClassTally: Map<Id, Tally>;
  /** classId -> distinct session ids that contributed. */
  sessionsPerClass: Map<Id, Set<string>>;
  trend: AttendanceTrendPoint[];
  byClass: ClassAttendanceStat[];
  overall: Tally;
  sessionCount: number;
  from: string | null;
  to: string | null;
}

function aggregate(sessions: AttendanceSession[], scope: Scope): AggregateResult {
  const inScope = new Set(scope.classIds);

  const byStudent = new Map<Id, Tally>();
  const byDate = new Map<string, Tally>();
  const byClassTally = new Map<Id, Tally>();
  const sessionsPerClass = new Map<Id, Set<string>>();
  const overall = emptyTally();

  for (const session of sessions) {
    for (const record of session.records) {
      // Records outside the scope are skipped even though their session is in scope.
      if (!inScope.has(record.classId)) continue;

      const determined = record.status === 'PRESENT' || record.status === 'ABSENT';
      if (!determined) continue;

      const attended = record.status === 'PRESENT' ? 1 : 0;

      const student = byStudent.get(record.studentId) ?? emptyTally();
      student.attended += attended;
      student.determined += 1;
      byStudent.set(record.studentId, student);

      const date = byDate.get(session.date) ?? emptyTally();
      date.attended += attended;
      date.determined += 1;
      byDate.set(session.date, date);

      const klass = byClassTally.get(record.classId) ?? emptyTally();
      klass.attended += attended;
      klass.determined += 1;
      byClassTally.set(record.classId, klass);

      const seen = sessionsPerClass.get(record.classId) ?? new Set<string>();
      seen.add(session.id);
      sessionsPerClass.set(record.classId, seen);

      overall.attended += attended;
      overall.determined += 1;
    }
  }

  // Chronological. The chart plots left to right in time, so the order is part of the contract
  // rather than a presentation detail the screen can re-sort.
  const trend: AttendanceTrendPoint[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tally]) => ({
      date,
      percentage: percentage(tally.attended, tally.determined),
      present: tally.attended,
      total: tally.determined,
    }));

  const byClass: ClassAttendanceStat[] = scope.classes
    .filter((course) => byClassTally.has(course.id))
    .map((course) => {
      const tally = byClassTally.get(course.id)!;
      return {
        classId: course.id,
        className: course.subject,
        displayCode: course.displayCode,
        percentage: percentage(tally.attended, tally.determined),
        sessionCount: sessionsPerClass.get(course.id)?.size ?? 0,
      };
    });

  const dates = trend.map((p) => p.date);

  return {
    byStudent,
    byClassTally,
    sessionsPerClass,
    trend,
    byClass,
    overall,
    sessionCount: sessions.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}

/**
 * Rolls the per-class tallies up by lecturer.
 *
 * Derived from the same `byClassTally` the class breakdown uses rather than walking the records a
 * second time, so the two dimensions can never disagree about a class.
 *
 * Empty below two entries. At CLASS scope, and at FACULTY scope, a faculty breakdown would just
 * restate the overall figure with a name attached.
 */
function facultyRows(
  scope: Scope,
  result: AggregateResult,
  lowByClass: Map<Id, number>,
): FacultyAttendanceStat[] {
  if (scope.scopeKind === 'CLASS') return [];

  const byFaculty = new Map<Id, { tally: Tally; classes: Set<Id>; sessions: Set<string>; low: number }>();

  for (const course of scope.classes) {
    const tally = result.byClassTally.get(course.id);
    if (!tally) continue;
    // A class with no lecturer assigned contributes to the institution total but belongs to nobody.
    if (!course.facultyId) continue;

    const bucket =
      byFaculty.get(course.facultyId) ??
      { tally: emptyTally(), classes: new Set<Id>(), sessions: new Set<string>(), low: 0 };

    bucket.tally.attended += tally.attended;
    bucket.tally.determined += tally.determined;
    bucket.classes.add(course.id);
    for (const sessionId of result.sessionsPerClass.get(course.id) ?? []) {
      bucket.sessions.add(sessionId);
    }
    bucket.low += lowByClass.get(course.id) ?? 0;

    byFaculty.set(course.facultyId, bucket);
  }

  const rows = [...byFaculty.entries()].map(([id, bucket]) => {
    const member = mockFacultyDirectory.find((f) => f.id === id);
    return {
      facultyId: id,
      facultyName: member?.name ?? id,
      department: member?.department ?? null,
      percentage: percentage(bucket.tally.attended, bucket.tally.determined),
      classCount: bucket.classes.size,
      sessionCount: bucket.sessions.size,
      lowAttendanceCount: bucket.low,
    };
  });

  if (rows.length < 2) return [];

  // Weakest first: an administrator is looking for where to intervene.
  return rows.sort((a, b) => a.percentage - b.percentage);
}

/* ------------------------------------------------------------------ *
 * Student stat rows
 * ------------------------------------------------------------------ */

/**
 * Builds the per-student rows for a scope, in roster order.
 *
 * Roster order rather than tally order, so the list is stable and a student stays put between
 * refreshes. Students with no determined record in the range are included with a zero tally —
 * omitting them would make a student vanish from the report simply because every one of their
 * sessions was left unresolved, which is exactly the case a lecturer needs to see.
 */
function studentRows(
  scope: Scope,
  byStudent: Map<Id, Tally>,
  threshold: number,
): StudentAttendanceStat[] {
  const rows: StudentAttendanceStat[] = [];
  const seen = new Set<Id>();

  for (const classId of scope.classIds) {
    for (const student of mockStudentsByClass[classId] ?? []) {
      // A student enrolled in two in-scope classes appears once, with their combined tally.
      if (seen.has(student.id)) continue;
      seen.add(student.id);

      const tally = byStudent.get(student.id) ?? emptyTally();
      const pct = percentage(tally.attended, tally.determined);

      rows.push({
        studentId: student.id,
        rollNumber: student.rollNumber,
        name: student.name,
        avatarUrl: student.avatarUrl,
        attendedSessions: tally.attended,
        totalSessions: tally.determined,
        percentage: pct,
        // A student with nothing determined is not "below threshold" — there is no evidence
        // either way, and flagging them would be an accusation the data cannot support.
        belowThreshold: tally.determined > 0 && pct < threshold,
      });
    }
  }

  return rows;
}

/* ------------------------------------------------------------------ *
 * Public entry points, used by `mockReportService`
 * ------------------------------------------------------------------ */

/**
 * Below-threshold students per class, for the faculty roll-up.
 *
 * Counted per class rather than taken from the scope-wide list, because a lecturer's figure is the
 * sum over their own classes. A student enrolled in two classes is counted once per class they are
 * failing, which is the number an administrator acts on.
 */
function lowCountByClass(
  scope: Scope,
  byStudent: Map<Id, Tally>,
  threshold: number,
): Map<Id, number> {
  const counts = new Map<Id, number>();

  for (const classId of scope.classIds) {
    let low = 0;
    for (const student of mockStudentsByClass[classId] ?? []) {
      const tally = byStudent.get(student.id);
      if (!tally || tally.determined === 0) continue;
      if (percentage(tally.attended, tally.determined) < threshold) low += 1;
    }
    counts.set(classId, low);
  }

  return counts;
}

export function buildReport(
  sessions: AttendanceSession[],
  query: ReportQuery | undefined,
  facultyId: Id,
  threshold: number = ATTENDANCE_THRESHOLD,
): AttendanceReport {
  const scope = resolveScope(query, facultyId);
  const scoped = sessionsInScope(sessions, scope, query?.from, query?.to);
  const result = aggregate(scoped, scope);

  const rows = studentRows(scope, result.byStudent, threshold);
  const low = rows
    .filter((r) => r.belowThreshold)
    // Worst first: the summary card previews the students who need attention most.
    .sort((a, b) => a.percentage - b.percentage);

  const byFaculty = facultyRows(
    scope,
    result,
    lowCountByClass(scope, result.byStudent, threshold),
  );

  return {
    scope: scope.scopeKind,
    scopeId: scope.scopeId,
    // Falls back to the requested range, then to today, so `from`/`to` are never empty strings
    // even when the scope produced no sessions at all.
    from: result.from ?? query?.from ?? new Date().toISOString().slice(0, 10),
    to: result.to ?? query?.to ?? new Date().toISOString().slice(0, 10),
    overallPercentage: percentage(result.overall.attended, result.overall.determined),
    totalSessions: result.sessionCount,
    studentCount: rows.length,
    trend: result.trend,
    byClass: result.byClass,
    byFaculty,
    lowAttendanceStudents: low.slice(0, LOW_ATTENDANCE_PREVIEW),
    lowAttendanceCount: low.length,
    threshold,
  };
}

export function buildStudentStats(
  sessions: AttendanceSession[],
  query: ReportStudentQuery | undefined,
  facultyId: Id,
  threshold: number = ATTENDANCE_THRESHOLD,
): Paginated<StudentAttendanceStat> {
  const scope = resolveScope(query, facultyId);
  const scoped = sessionsInScope(sessions, scope, query?.from, query?.to);
  const result = aggregate(scoped, scope);

  let rows = studentRows(scope, result.byStudent, threshold);

  if (query?.lowAttendanceOnly) {
    rows = rows.filter((r) => r.belowThreshold).sort((a, b) => a.percentage - b.percentage);
  }

  if (query?.search) {
    rows = rows.filter((r) => matchesText(query.search, r.name, r.rollNumber));
  }

  // Paging last, after every filter, so `total` and `hasMore` describe the filtered set.
  return paginate(rows, query);
}
