/**
 * Mock implementations of every service interface.
 *
 * These hold an in-memory store that mutates across calls, so the vertical slice
 * behaves like a real app: finalize a session, navigate to history, reopen it, edit a
 * record, and the change persists for the lifetime of the process.
 *
 * Delete this directory once the real API is wired.
 */

import { createApiError } from '@/api/client';
import { ATTENDANCE_THRESHOLD, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/constants/config';
import type {
  AttendanceService,
  AuditService,
  AuthService,
  ClassService,
  FacultyService,
  ReportService,
  SettingsService,
  StudentService,
} from '@/services/contracts';
import type {
  AttendanceHistoryQuery,
  AuditQuery,
  ClassQuery,
  CourseClass,
  Faculty,
  FacultyQuery,
  InstitutionSettings,
} from '@/types';
import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceSessionSummary,
  AuditEntry,
  AuthSession,
  Id,
  ProcessingProgress,
  Student,
  StudentProfile,
  TwinReview,
} from '@/types';

import { buildCandidatePool } from './candidatePool';
import { matchesText, paginate } from './paginate';
import { buildReport, buildStudentStats } from './reportAggregation';
import {
  MOCK_CROSS_ENROLMENT,
  MOCK_UNMATCHED_FACES,
  buildRecords,
  buildTwinReview,
  mockAdmin,
  mockAllClasses,
  mockAttendanceHistory,
  mockAttendanceSessions,
  mockAuditEntries,
  mockClasses,
  mockFaculty,
  mockFacultyDirectory,
  mockInstitutionSettings,
  mockStudents,
  mockStudentsByClass,
  mockTodayClasses,
  summarise,
} from './fixtures';
import { assertNoForcedFailure, mockRequest, networkDelay } from './latency';
import { runMockProcessing } from './mockAiProcessing';

/* ------------------------------------------------------------------ *
 * Mutable in-memory store
 * ------------------------------------------------------------------ */

const sessions = new Map<Id, AttendanceSession>(
  mockAttendanceSessions.map((session) => [session.id, session]),
);
const history: AttendanceSessionSummary[] = [...mockAttendanceHistory];
const auditLog: AuditEntry[] = [...mockAuditEntries];
const todayClasses = [...mockTodayClasses];

let sessionCounter = 0;
let classCounter = 0;
let facultyCounter = 0;

/** Mutable copy of the institution settings, so admin edits persist for the process lifetime. */
const settings: InstitutionSettings = { ...mockInstitutionSettings };

/** The threshold currently in force. Reports read this rather than the client-side constant. */
function currentThreshold(): number {
  return settings.attendanceThreshold;
}

/** One-line description of a class, for audit before/after values. */
function describeClass(course: CourseClass): string {
  return `${course.subject} · ${course.displayCode} · Semester ${course.semester}`;
}

/**
 * Keeps `Faculty.assignedClassIds` consistent with class ownership after an assignment change.
 *
 * The two are denormalised views of one relationship, so a change to either has to update both or
 * the faculty profile and the class detail screen would disagree about who teaches what.
 */
/**
 * One filtering routine for both attendance-history endpoints.
 *
 * `getAttendanceHistory` and `getPagedAttendanceHistory` share this so the same query can never
 * mean two different things depending on which method asked. Newest first in both cases.
 */
function filterHistory(query?: AttendanceHistoryQuery): AttendanceSessionSummary[] {
  let result = [...history];

  if (query?.classId) result = result.filter((h) => h.classId === query.classId);
  if (query?.status) result = result.filter((h) => h.status === query.status);
  if (query?.from) result = result.filter((h) => h.date >= query.from!);
  if (query?.to) result = result.filter((h) => h.date <= query.to!);

  if (query?.facultyId) {
    // History rows carry no facultyId, so ownership is resolved through the class. Admin filters
    // by lecturer; faculty callers never pass this.
    const owned = new Set(
      mockAllClasses.filter((c) => c.facultyId === query.facultyId).map((c) => c.id),
    );
    result = result.filter((h) => owned.has(h.classId));
  }

  if (query?.pendingReviewOnly) {
    result = result.filter((h) => h.summary.review > 0 || h.status === 'PENDING_REVIEW');
  }

  if (query?.search) {
    result = result.filter((h) => {
      const owner = mockAllClasses.find((c) => c.id === h.classId)?.facultyName;
      return matchesText(query.search, h.className, h.classDisplayCode, owner);
    });
  }

  return result.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

function syncFacultyClassList(classId: Id): void {
  const owner = mockAllClasses.find((c) => c.id === classId)?.facultyId;

  for (const member of mockFacultyDirectory) {
    const holds = member.assignedClassIds.includes(classId);
    const shouldHold = member.id === owner;

    if (shouldHold && !holds) {
      member.assignedClassIds = [...member.assignedClassIds, classId];
    } else if (!shouldHold && holds) {
      member.assignedClassIds = member.assignedClassIds.filter((id) => id !== classId);
    }
  }
}

function requireSession(sessionId: Id): AttendanceSession {
  const session = sessions.get(sessionId);
  if (!session) {
    throw createApiError('NOT_FOUND', 'That attendance session no longer exists.');
  }
  return session;
}

function nowIso(): string {
  return new Date().toISOString();
}

function recomputeSummary(session: AttendanceSession): AttendanceSession {
  return { ...session, summary: summarise(session.records) };
}

/**
 * Administrative actions are attributed to the admin account, attendance actions to the lecturer.
 *
 * Derived from the action rather than passed in, so a caller cannot mis-attribute an entry. A real
 * backend takes the actor from the authenticated token and must never trust the client for it.
 */
const ADMIN_ACTIONS = new Set<AuditEntry['action']>([
  'FACULTY_CREATED',
  'FACULTY_UPDATED',
  'FACULTY_STATUS_CHANGED',
  'CLASS_CREATED',
  'CLASS_UPDATED',
  'FACULTY_ASSIGNED',
  'ENROLMENT_UPDATED',
  'SETTING_CHANGED',
]);

function appendAudit(entry: Omit<AuditEntry, 'id' | 'at' | 'actorId' | 'actorName' | 'actorRole'>): void {
  const isAdmin = ADMIN_ACTIONS.has(entry.action);

  auditLog.unshift({
    id: `aud-${auditLog.length + 1}`,
    at: nowIso(),
    actorId: isAdmin ? mockAdmin.id : mockFaculty.id,
    actorName: isAdmin ? mockAdmin.name : mockFaculty.name,
    actorRole: isAdmin ? 'Administrator' : mockFaculty.designation,
    ...entry,
  });
}

function syncHistory(session: AttendanceSession): void {
  const summary: AttendanceSessionSummary = {
    id: session.id,
    classId: session.classId,
    className: session.className,
    classDisplayCode: session.classDisplayCode,
    classCount: session.selectedClassIds.length,
    date: session.date,
    capturedAt: session.capturedAt,
    status: session.status,
    summary: session.summary,
    hasManualEdits: session.records.some((r) => r.editedAt !== null),
  };

  const index = history.findIndex((h) => h.id === session.id);
  if (index >= 0) history[index] = summary;
  else history.unshift(summary);
}

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

export const mockAuthService: AuthService = {
  async login(request): Promise<AuthSession> {
    await networkDelay(1.6);

    if (!request.identifier.trim() || !request.password.trim()) {
      throw createApiError('VALIDATION', 'Please check the highlighted fields.', {
        fieldErrors: {
          ...(request.identifier.trim() ? {} : { identifier: 'Enter your employee ID or email.' }),
          ...(request.password.trim() ? {} : { password: 'Enter your password.' }),
        },
      });
    }

    // Any password of 4+ characters succeeds. "admin" in the identifier yields the
    // admin role so both navigation trees are reachable during development.
    if (request.password.trim().length < 4) {
      throw createApiError('UNAUTHORIZED', 'Those credentials were not recognised.');
    }

    const isAdmin = request.identifier.toLowerCase().includes('admin');
    const user = isAdmin ? mockAdmin : mockFaculty;

    return {
      accessToken: `mock-access-${Date.now()}`,
      refreshToken: `mock-refresh-${Date.now()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      user,
    };
  },

  async logout(): Promise<void> {
    await networkDelay(0.5);
  },

  async getCurrentUser() {
    return mockRequest('auth.getCurrentUser', () => mockFaculty);
  },

  async requestPasswordReset(request): Promise<void> {
    await networkDelay(1.2);
    if (!request.identifier.trim()) {
      throw createApiError('VALIDATION', 'Enter your employee ID or email.', {
        fieldErrors: { identifier: 'Enter your employee ID or email.' },
      });
    }
  },

  async refresh(): Promise<AuthSession> {
    await networkDelay();
    return {
      accessToken: `mock-access-${Date.now()}`,
      refreshToken: `mock-refresh-${Date.now()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      user: mockFaculty,
    };
  },
};

/* ------------------------------------------------------------------ *
 * Classes
 * ------------------------------------------------------------------ */

/**
 * One filtering routine for both class endpoints.
 *
 * `getClasses` and `getPagedClasses` must never disagree about what a query means, so the filter
 * lives here and each endpoint only decides which pool to draw from and whether to page.
 */
function filterClasses(pool: CourseClass[], query?: ClassQuery): CourseClass[] {
  let result = [...pool];

  if (query?.facultyId) {
    result = result.filter((c) => c.facultyId === query.facultyId);
  }
  if (query?.semester !== undefined) {
    result = result.filter((c) => c.semester === query.semester);
  }
  if (query?.department) {
    result = result.filter((c) => c.department === query.department);
  }
  if (query?.status) {
    // Absent status means ACTIVE — see `CourseClass.status`.
    result = result.filter((c) => (c.status ?? 'ACTIVE') === query.status);
  }
  if (query?.unassignedOnly) {
    result = result.filter((c) => !c.facultyId);
  }
  if (query?.search) {
    result = result.filter((c) =>
      matchesText(query.search, c.subject, c.displayCode, c.facultyName, c.department),
    );
  }

  return result;
}

export const mockClassService: ClassService = {
  async getClasses(query) {
    // Faculty scope: only the four teaching classes. The wider catalogue is admin-only, and
    // leaking it here would pull unrelated classes into the attendance candidate pool.
    return mockRequest('classes.getClasses', () => filterClasses(mockClasses, query));
  },

  async getPagedClasses(query) {
    // Admin scope: the whole institution catalogue, paged after filtering.
    return mockRequest('classes.getPagedClasses', () =>
      paginate(filterClasses(mockAllClasses, query), query),
    );
  },

  async getClass(classId) {
    return mockRequest('classes.getClass', () => {
      // Looks across the whole catalogue: an admin must be able to open any class, and a faculty
      // caller can only reach ids their own list gave them.
      const found = mockAllClasses.find((c) => c.id === classId);
      if (!found) throw createApiError('NOT_FOUND', 'That class could not be found.');
      return found;
    });
  },

  /* -------------------------------------------------------------- *
   * Administration
   *
   * MOCK PERSISTENCE. These mutate in-memory arrays that live for the lifetime of the JS
   * process. Nothing is written anywhere. Reloading the app restores the original fixtures.
   * The admin UI states this on screen rather than implying a database exists.
   * -------------------------------------------------------------- */

  async createClass(request) {
    await networkDelay(0.9);

    const trimmedSubject = request.subject.trim();
    const trimmedCode = request.classCode.trim();
    const trimmedSection = request.section.trim();

    const fieldErrors: Record<string, string> = {};
    if (!trimmedSubject) fieldErrors.subject = 'Enter a subject name.';
    if (!trimmedCode) fieldErrors.classCode = 'Enter a class code.';
    if (!trimmedSection) fieldErrors.section = 'Enter a section.';

    const displayCode = `${trimmedCode}${trimmedSection}`;
    if (mockAllClasses.some((c) => c.displayCode.toLowerCase() === displayCode.toLowerCase())) {
      fieldErrors.section = `${displayCode} already exists.`;
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw createApiError('VALIDATION', 'Please check the highlighted fields.', { fieldErrors });
    }

    const holder = request.facultyId
      ? mockFacultyDirectory.find((f) => f.id === request.facultyId)
      : undefined;

    classCounter += 1;
    const created: CourseClass = {
      id: `cls-new-${classCounter}`,
      subject: trimmedSubject,
      classCode: trimmedCode,
      section: trimmedSection,
      // Derived, never accepted from the client, so the label cannot disagree with its parts.
      displayCode,
      semester: request.semester,
      academicSession: request.academicSession,
      department: request.department,
      status: 'ACTIVE',
      facultyId: holder?.id ?? '',
      facultyName: holder?.name ?? '',
      // A brand-new class has no roster and no recorded attendance. Showing anything else would
      // invent a figure.
      studentCount: 0,
      attendancePercentage: 0,
      schedule: request.schedule ?? [],
    };

    mockAllClasses.push(created);

    appendAudit({
      action: 'CLASS_CREATED',
      sessionId: null,
      classDisplayCode: created.displayCode,
      studentId: null,
      studentName: null,
      rollNumber: null,
      previousStatus: null,
      newStatus: null,
      reason: null,
      entityType: 'CLASS',
      entityId: created.id,
      entityLabel: `${created.subject} · ${created.displayCode}`,
      previousValue: null,
      newValue: created.displayCode,
    });

    return created;
  },

  async updateClass(request) {
    await networkDelay(0.8);

    const index = mockAllClasses.findIndex((c) => c.id === request.classId);
    if (index < 0) throw createApiError('NOT_FOUND', 'That class could not be found.');

    const before = mockAllClasses[index]!;
    const next: CourseClass = {
      ...before,
      ...(request.subject !== undefined ? { subject: request.subject.trim() } : {}),
      ...(request.classCode !== undefined ? { classCode: request.classCode.trim() } : {}),
      ...(request.section !== undefined ? { section: request.section.trim() } : {}),
      ...(request.semester !== undefined ? { semester: request.semester } : {}),
      ...(request.department !== undefined ? { department: request.department } : {}),
      ...(request.academicSession !== undefined ? { academicSession: request.academicSession } : {}),
      ...(request.status !== undefined ? { status: request.status } : {}),
      ...(request.schedule !== undefined ? { schedule: request.schedule } : {}),
    };
    next.displayCode = `${next.classCode}${next.section}`;

    mockAllClasses[index] = next;
    syncFacultyClassList(next.id);

    appendAudit({
      action: 'CLASS_UPDATED',
      sessionId: null,
      classDisplayCode: next.displayCode,
      studentId: null,
      studentName: null,
      rollNumber: null,
      previousStatus: null,
      newStatus: null,
      reason: null,
      entityType: 'CLASS',
      entityId: next.id,
      entityLabel: `${next.subject} · ${next.displayCode}`,
      previousValue: describeClass(before),
      newValue: describeClass(next),
    });

    return next;
  },

  async assignFaculty(request) {
    await networkDelay(0.8);

    const index = mockAllClasses.findIndex((c) => c.id === request.classId);
    if (index < 0) throw createApiError('NOT_FOUND', 'That class could not be found.');

    const before = mockAllClasses[index]!;

    let holder: Faculty | undefined;
    if (request.facultyId) {
      holder = mockFacultyDirectory.find((f) => f.id === request.facultyId);
      if (!holder) {
        throw createApiError('NOT_FOUND', 'That faculty member could not be found.');
      }
      // An inactive member has left the institution; assigning them teaching load would be a data
      // error rather than a decision. On leave is allowed: they hold their classes and return.
      if (holder.status === 'INACTIVE') {
        throw createApiError(
          'VALIDATION',
          `${holder.name} is inactive and cannot be assigned to a class.`,
          { fieldErrors: { facultyId: 'This faculty member is inactive.' } },
        );
      }
      if (before.facultyId === holder.id) {
        // Idempotent: re-assigning the current holder is not an error, it is a no-op.
        return before;
      }
    }

    const next: CourseClass = {
      ...before,
      facultyId: holder?.id ?? '',
      facultyName: holder?.name ?? '',
    };

    mockAllClasses[index] = next;
    syncFacultyClassList(next.id);

    appendAudit({
      action: 'FACULTY_ASSIGNED',
      sessionId: null,
      classDisplayCode: next.displayCode,
      studentId: null,
      studentName: null,
      rollNumber: null,
      previousStatus: null,
      newStatus: null,
      reason: null,
      entityType: 'CLASS',
      entityId: next.id,
      entityLabel: `${next.subject} · ${next.displayCode}`,
      previousValue: before.facultyName || 'Unassigned',
      newValue: next.facultyName || 'Unassigned',
    });

    return next;
  },

  async updateEnrolment(request) {
    await networkDelay(0.9);

    const index = mockAllClasses.findIndex((c) => c.id === request.classId);
    if (index < 0) throw createApiError('NOT_FOUND', 'That class could not be found.');

    const before = mockAllClasses[index]!;
    const roster = mockStudentsByClass[request.classId];

    /*
     * Only the four teaching classes have a real roster in the mock. For the wider catalogue there
     * is no student list to mutate, so the count is adjusted and that limitation is reported —
     * rather than silently pretending an enrolment change took effect.
     */
    if (!roster) {
      const delta =
        (request.addStudentIds?.length ?? 0) - (request.removeStudentIds?.length ?? 0);
      const next = {
        ...before,
        studentCount: Math.max(0, before.studentCount + delta),
      };
      mockAllClasses[index] = next;
      return next;
    }

    // Idempotent by construction: adding an enrolled student and removing an absent one are both
    // no-ops, so a retried request is safe.
    for (const id of request.removeStudentIds ?? []) {
      const at = roster.findIndex((s) => s.id === id);
      if (at >= 0) roster.splice(at, 1);
    }
    for (const id of request.addStudentIds ?? []) {
      if (roster.some((s) => s.id === id)) continue;
      const student = mockStudents.find((s) => s.id === id);
      if (student) roster.push(student);
    }

    const next = { ...before, studentCount: roster.length };
    mockAllClasses[index] = next;

    appendAudit({
      action: 'ENROLMENT_UPDATED',
      sessionId: null,
      classDisplayCode: next.displayCode,
      studentId: null,
      studentName: null,
      rollNumber: null,
      previousStatus: null,
      newStatus: null,
      reason: null,
      entityType: 'CLASS',
      entityId: next.id,
      entityLabel: `${next.subject} · ${next.displayCode}`,
      previousValue: `${before.studentCount} students`,
      newValue: `${next.studentCount} students`,
    });

    return next;
  },

  async getTodayClasses() {
    return mockRequest('classes.getTodayClasses', () => [...todayClasses]);
  },
};

/* ------------------------------------------------------------------ *
 * Students
 * ------------------------------------------------------------------ */

export const mockStudentService: StudentService = {
  async getStudents(query) {
    return mockRequest('students.getStudents', () => {
      let pool: Student[] = query?.classId
        ? (mockStudentsByClass[query.classId] ?? [])
        : mockStudents;

      if (query?.search) {
        const needle = query.search.toLowerCase();
        pool = pool.filter(
          (s) =>
            s.name.toLowerCase().includes(needle) ||
            s.rollNumber.toLowerCase().includes(needle) ||
            s.studentId.toLowerCase().includes(needle),
        );
      }
      if (query?.semester !== undefined) {
        pool = pool.filter((s) => s.semester === query.semester);
      }
      // Previously accepted on the contract but never applied.
      if (query?.department) {
        pool = pool.filter((s) => s.department === query.department);
      }
      if (query?.lowAttendanceOnly) {
        pool = pool.filter((s) => s.overallAttendance < ATTENDANCE_THRESHOLD);
      }

      /*
       * Paging is applied last, after every filter, so `total` and `hasMore` describe the
       * filtered set. Getting this order wrong is the classic paged-endpoint bug: the list would
       * claim 175 results while the active filter has 48, and infinite scroll would keep asking
       * for pages the query cannot produce.
       *
       * Both parameters are clamped rather than trusted. `pageSize` is capped so a client cannot
       * defeat paging by requesting everything, and `page` floors at 1 so a bad value narrows
       * nothing and never produces a negative slice.
       */
      const pageSize = Math.min(
        Math.max(1, Math.floor(query?.pageSize ?? DEFAULT_PAGE_SIZE)),
        MAX_PAGE_SIZE,
      );
      const page = Math.max(1, Math.floor(query?.page ?? 1));
      const start = (page - 1) * pageSize;
      const items = pool.slice(start, start + pageSize);

      return {
        items,
        page,
        pageSize,
        total: pool.length,
        // Derived from the window actually returned, not from `total > pageSize`. A page past the
        // end yields no items and `hasMore: false`, which is what stops the list requesting
        // pages forever.
        hasMore: start + items.length < pool.length,
      };
    });
  },

  async getStudent(studentId) {
    return mockRequest('students.getStudent', (): StudentProfile => {
      const student = mockStudents.find((s) => s.id === studentId);
      if (!student) throw createApiError('NOT_FOUND', 'That student could not be found.');

      // Roster membership, plus any explicit cross-enrolment. A student may legitimately sit in
      // more than one class, so this must never collapse to a single id.
      const fromRosters = Object.entries(mockStudentsByClass)
        .filter(([, roster]) => roster.some((s) => s.id === studentId))
        .map(([classId]) => classId);

      const enrolledClassIds = [
        ...new Set([...fromRosters, ...(MOCK_CROSS_ENROLMENT[studentId] ?? [])]),
      ];

      // Per-class figures vary around the overall percentage, deterministically so the profile
      // does not reshuffle between visits. Clamped to 0..100.
      const attendanceByClass = Object.fromEntries(
        enrolledClassIds.map((id, i) => [
          id,
          Math.max(0, Math.min(100, student.overallAttendance + (i === 0 ? 0 : (i % 2 === 0 ? 4 : -6)))),
        ]),
      );

      // Newest first, drawn from sessions belonging to classes this student is actually in.
      const relevant = history
        .filter((h) => enrolledClassIds.includes(h.classId))
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));

      const source = relevant.length > 0 ? relevant : history;

      return {
        ...student,
        enrolledClassIds,
        attendanceByClass,
        recentAttendance: source.slice(0, 6).map((h, i) => ({
          date: h.date,
          className: h.className,
          classId: h.classId,
          // Scripted, not derived from any real record: the mock has no per-student history store.
          status: i === 2 ? 'ABSENT' : i === 4 ? 'REVIEW' : 'PRESENT',
          sessionId: h.id,
        })),
      };
    });
  },
};

/* ------------------------------------------------------------------ *
 * Attendance
 * ------------------------------------------------------------------ */

export const mockAttendanceService: AttendanceService = {
  async captureAttendance(request) {
    // Honours forced failures so the upload-failure path is demonstrable.
    assertNoForcedFailure('attendance.captureAttendance');
    await networkDelay(1.4);
    assertNoForcedFailure('attendance.captureAttendance');

    const classIds = [...new Set(request.classIds)];
    if (classIds.length === 0) {
      throw createApiError('VALIDATION', 'Select at least one class before taking attendance.');
    }

    const courses = classIds
      .map((id) => mockClasses.find((c) => c.id === id))
      .filter((c): c is CourseClass => Boolean(c));

    if (courses.length === 0) {
      throw createApiError('NOT_FOUND', 'None of the selected classes could be found.');
    }

    // ================================================================
    // Scope boundary. Recognition may only consider these students.
    // In the real system the server does this from `classIds`.
    // ================================================================
    const pool = buildCandidatePool(classIds);

    sessionCounter += 1;
    const sessionId = `ses-live-${sessionCounter}`;

    const records = buildRecords(
      pool.students,
      sessionId,
      pool.classByStudentId,
      pool.ambiguousTwinGroups,
    );

    const primary = courses[0]!;

    const session: AttendanceSession = {
      id: sessionId,
      selectedClassIds: courses.map((c) => c.id),
      classes: courses.map((c) => ({
        id: c.id,
        subject: c.subject,
        displayCode: c.displayCode,
        studentCount: (mockStudentsByClass[c.id] ?? []).length,
      })),
      classId: primary.id,
      className: primary.subject,
      classDisplayCode: primary.displayCode,
      facultyId: mockFaculty.id,
      date: request.capturedAt.slice(0, 10),
      capturedAt: request.capturedAt,
      finalizedAt: null,
      status: 'PROCESSING',
      photoUri: request.photoUri,
      photoWidth: 2048,
      photoHeight: 1536,
      summary: summarise(records),
      records,
      // Only pairs with both members in scope. A twin whose counterpart sits in an unselected
      // class yields no review, because there is no in-scope candidate to weigh them against.
      twinReviews: buildTwinReview(sessionId, pool.students),
      warnings: [
        {
          code: 'UNKNOWN_FACES_PRESENT',
          message:
            courses.length > 1
              ? `${MOCK_UNMATCHED_FACES} detected faces did not match any student in the ${courses.length} selected classes.`
              : `${MOCK_UNMATCHED_FACES} detected faces could not be matched to this roster.`,
          severity: 'INFO',
        },
      ],
    };

    sessions.set(sessionId, session);

    // Publish to history immediately, not just on finalize. A lecturer who captures and is then
    // interrupted must be able to find the session again — without this it exists in the store
    // but appears in no list, so there is no route back to it.
    syncHistory(session);

    appendAudit({
      action: 'ATTENDANCE_CAPTURED',
      sessionId,
      classDisplayCode: primary.displayCode,
      studentId: null,
      studentName: null,
      rollNumber: null,
      previousStatus: null,
      newStatus: null,
      reason: null,
    });

    return session;
  },

  observeProcessing(sessionId, onProgress, onError) {
    const session = sessions.get(sessionId);
    if (!session) {
      onError(createApiError('NOT_FOUND', 'That attendance session no longer exists.'));
      return () => {};
    }

    const detectedCount = session.records.filter((r) => r.confidence !== null).length;

    return runMockProcessing(
      { detectedCount, rosterSize: session.records.length },
      (progress: ProcessingProgress) => {
        if (progress.stage === 'DONE') {
          const current = sessions.get(sessionId);
          if (current) {
            const hasReviews = current.records.some((r) => r.reviewRequired);
            sessions.set(sessionId, {
              ...current,
              status: hasReviews ? 'PENDING_REVIEW' : 'READY',
            });
          }
        }
        onProgress(progress);
      },
      (error) => {
        // Mark the session FAILED but keep it — the photo stays available so the user can
        // retry the upload rather than being sent back to retake a moment that has passed.
        const current = sessions.get(sessionId);
        if (current) sessions.set(sessionId, { ...current, status: 'FAILED' });
        onError(error);
      },
    );
  },

  async retryProcessing(sessionId) {
    await networkDelay(0.6);
    const session = requireSession(sessionId);
    const reset = { ...session, status: 'PROCESSING' as const };
    sessions.set(sessionId, reset);
    return reset;
  },

  async getAttendanceSession(sessionId) {
    return mockRequest('attendance.getAttendanceSession', () => requireSession(sessionId));
  },

  async updateAttendance(request) {
    await networkDelay(0.7);

    // Find the session owning this record.
    const owner = [...sessions.values()].find((s) =>
      s.records.some((r) => r.id === request.recordId),
    );
    if (!owner) throw createApiError('NOT_FOUND', 'That attendance record no longer exists.');

    const wasFinalized = owner.status === 'FINALIZED';
    let changed: AttendanceRecord | null = null;

    const records = owner.records.map((record) => {
      if (record.id !== request.recordId) return record;
      changed = {
        ...record,
        status: request.status,
        // Resolving a review clears the flag; the AI verdict is never overwritten.
        reviewRequired: false,
        editedBy: mockFaculty.id,
        editedByName: mockFaculty.name,
        editedAt: nowIso(),
        editReason: request.reason ?? null,
      };
      return changed;
    });

    const updated = recomputeSummary({ ...owner, records });
    sessions.set(updated.id, updated);
    syncHistory(updated);

    if (changed) {
      const edited = changed as AttendanceRecord;
      appendAudit({
        action: wasFinalized ? 'FINALIZED_SESSION_EDITED' : 'STATUS_CHANGED',
        sessionId: updated.id,
        classDisplayCode: updated.classDisplayCode,
        studentId: edited.studentId,
        studentName: edited.studentName,
        rollNumber: edited.rollNumber,
        previousStatus:
          owner.records.find((r) => r.id === request.recordId)?.status ?? null,
        newStatus: request.status,
        reason: request.reason ?? null,
      });
    }

    return updated;
  },

  async resolveTwinReview(request) {
    await networkDelay(0.8);

    const owner = [...sessions.values()].find((s) =>
      s.twinReviews.some((t) => t.id === request.reviewId),
    );
    if (!owner) throw createApiError('NOT_FOUND', 'That review no longer exists.');

    const review = owner.twinReviews.find((t) => t.id === request.reviewId)!;

    // "Decide Later" must leave both records under REVIEW. Never auto-assign.
    if (request.resolution === 'DEFERRED') {
      const deferred: AttendanceSession = {
        ...owner,
        twinReviews: owner.twinReviews.map((t) =>
          t.id === request.reviewId ? { ...t, resolution: 'DEFERRED' } : t,
        ),
      };
      sessions.set(deferred.id, deferred);
      return deferred;
    }

    const statusFor = (studentId: Id): 'PRESENT' | 'ABSENT' => {
      if (request.resolution === 'BOTH_PRESENT') return 'PRESENT';
      if (request.resolution === 'ONLY_A') {
        return studentId === review.studentA.studentId ? 'PRESENT' : 'ABSENT';
      }
      return studentId === review.studentB.studentId ? 'PRESENT' : 'ABSENT';
    };

    const affected = [review.studentA.studentId, review.studentB.studentId];
    const records = owner.records.map((record) => {
      if (!affected.includes(record.studentId)) return record;
      return {
        ...record,
        status: statusFor(record.studentId),
        reviewRequired: false,
        editedBy: mockFaculty.id,
        editedByName: mockFaculty.name,
        editedAt: nowIso(),
        editReason: `Twin review: ${request.resolution}`,
      };
    });

    const twinReviews = owner.twinReviews.map((t) =>
      t.id === request.reviewId
        ? { ...t, resolution: request.resolution, resolvedBy: mockFaculty.id, resolvedAt: nowIso() }
        : t,
    );

    const stillPending = records.some((r) => r.reviewRequired);
    const updated = recomputeSummary({
      ...owner,
      records,
      twinReviews,
      status: owner.status === 'FINALIZED' ? 'FINALIZED' : stillPending ? 'PENDING_REVIEW' : 'READY',
    });

    sessions.set(updated.id, updated);
    syncHistory(updated);

    for (const studentId of affected) {
      const record = records.find((r) => r.studentId === studentId);
      if (!record) continue;
      appendAudit({
        action: 'TWIN_RESOLVED',
        sessionId: updated.id,
        classDisplayCode: updated.classDisplayCode,
        studentId: record.studentId,
        studentName: record.studentName,
        rollNumber: record.rollNumber,
        previousStatus: 'REVIEW',
        newStatus: record.status,
        reason: `Twin review: ${request.resolution}`,
      });
    }

    return updated;
  },

  async getTwinReviews(sessionId) {
    return mockRequest('attendance.getTwinReviews', (): TwinReview[] => {
      return requireSession(sessionId).twinReviews;
    });
  },

  async finalizeAttendance(request) {
    await networkDelay(1.1);

    const session = requireSession(request.sessionId);
    const unresolved = session.records.filter((r) => r.reviewRequired).length;

    // The server refuses a silent finalize while reviews are open. The client must
    // pass the acknowledgement explicitly, which is what stops an accidental tap from
    // recording an incomplete register.
    if (unresolved > 0 && !request.acknowledgeUnresolvedReviews) {
      throw createApiError(
        'CONFLICT',
        `${unresolved} ${unresolved === 1 ? 'student' : 'students'} still need review.`,
      );
    }

    const finalized = recomputeSummary({
      ...session,
      status: 'FINALIZED',
      finalizedAt: nowIso(),
    });

    sessions.set(finalized.id, finalized);
    syncHistory(finalized);

    // Today's dashboard card flips to COMPLETED.
    const index = todayClasses.findIndex((c) => c.id === finalized.classId);
    if (index >= 0) {
      todayClasses[index] = {
        ...todayClasses[index]!,
        attendanceState: 'COMPLETED',
        sessionId: finalized.id,
        presentCount: finalized.summary.present,
        lastCapturedAt: finalized.capturedAt,
      };
    }

    appendAudit({
      action: 'SESSION_FINALIZED',
      sessionId: finalized.id,
      classDisplayCode: finalized.classDisplayCode,
      studentId: null,
      studentName: null,
      rollNumber: null,
      previousStatus: null,
      newStatus: null,
      reason: null,
    });

    return finalized;
  },

  async getAttendanceHistory(query) {
    /*
      Scoped to the authenticated faculty member, the same way `getReport` resolves its own scope.

      This is the faculty path — the History screen, class detail and the dashboard's recent
      sessions all read it, and none of them pass a `facultyId`. Until Phase 9 the fixture happened
      to contain only this lecturer's sessions, so an unscoped read looked correct; adding the
      catalogue sessions for the admin oversight list made the omission visible, and the screen
      began listing sessions for classes the lecturer does not teach.

      Enforced here rather than in the four call sites: scope is an authorisation decision, and a
      caller that forgets it must not be able to widen its own view. An explicit `facultyId` is still
      honoured so the admin filter keeps working; institution-wide reads go through
      `getPagedAttendanceHistory`.
    */
    return mockRequest('attendance.getAttendanceHistory', () =>
      filterHistory({ ...query, facultyId: query?.facultyId ?? mockFaculty.id }),
    );
  },

  async getPagedAttendanceHistory(query) {
    /*
      Same filter routine as above, then paged. Admin oversight, so deliberately NOT scoped to a
      faculty member: this is the institution-wide list. A `facultyId` in the query still narrows it
      when an administrator filters by lecturer.
    */
    return mockRequest('attendance.getPagedAttendanceHistory', () =>
      paginate(filterHistory(query), query),
    );
  },
};

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

export const mockReportService: ReportService = {
  async getReport(query) {
    // Aggregation lives in `reportAggregation`, beside the session store it reads. The service
    // method only supplies the store and the authenticated faculty scope.
    return mockRequest(
      'reports.getReport',
      // The threshold comes from institution settings, not the client-side constant, so changing
      // it in the admin area moves every figure the report flags.
      () => buildReport([...sessions.values()], query, mockFaculty.id, currentThreshold()),
      1.5,
    );
  },

  async getStudentStats(query) {
    return mockRequest(
      'reports.getStudentStats',
      () => buildStudentStats([...sessions.values()], query, mockFaculty.id, currentThreshold()),
      1.1,
    );
  },
};

/* ------------------------------------------------------------------ *
 * Audit
 * ------------------------------------------------------------------ */

/**
 * One filtering routine for both audit endpoints.
 *
 * `actorId` was declared on `AuditQuery` from Phase 1 but never applied here — filtering by actor
 * silently returned everything. Fixed as part of Phase 9, since the admin audit screen filters by
 * actor and would otherwise show every entry regardless of who was selected.
 *
 * Newest first. `auditLog` is maintained in that order by `appendAudit`, but sorting explicitly
 * means the guarantee does not depend on insertion discipline.
 */
function filterAudit(query?: AuditQuery): AuditEntry[] {
  let result = [...auditLog];

  if (query?.sessionId) result = result.filter((e) => e.sessionId === query.sessionId);
  if (query?.studentId) result = result.filter((e) => e.studentId === query.studentId);
  if (query?.actorId) result = result.filter((e) => e.actorId === query.actorId);
  if (query?.action) result = result.filter((e) => e.action === query.action);
  if (query?.entityType) result = result.filter((e) => e.entityType === query.entityType);

  // `at` is a full timestamp and the bounds are calendar dates, so compare on the date part only.
  if (query?.from) result = result.filter((e) => e.at.slice(0, 10) >= query.from!);
  if (query?.to) result = result.filter((e) => e.at.slice(0, 10) <= query.to!);

  if (query?.search) {
    result = result.filter((e) =>
      matchesText(
        query.search,
        e.actorName,
        e.studentName,
        e.rollNumber,
        e.entityLabel,
        e.classDisplayCode,
        e.reason,
      ),
    );
  }

  return result.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Audit reads. There is no write, update or delete here and there must never be one.
 */
export const mockAuditService: AuditService = {
  async getAuditEntries(query) {
    return mockRequest('audit.getAuditEntries', () => filterAudit(query));
  },

  async getPagedAuditEntries(query) {
    // Same filter routine, then paged. The institution-wide log grows without bound.
    return mockRequest('audit.getPagedAuditEntries', () => paginate(filterAudit(query), query));
  },
};

/* ------------------------------------------------------------------ *
 * Faculty directory (admin)
 * ------------------------------------------------------------------ */

/** One filtering routine, so a query means the same thing wherever it is asked. */
function filterFaculty(query?: FacultyQuery): Faculty[] {
  let result = [...mockFacultyDirectory];

  if (query?.department) result = result.filter((f) => f.department === query.department);
  // Absent status is treated as ACTIVE — see `Faculty.status`.
  if (query?.status) result = result.filter((f) => (f.status ?? 'ACTIVE') === query.status);
  if (query?.classId) {
    result = result.filter((f) => f.assignedClassIds.includes(query.classId!));
  }
  if (query?.search) {
    result = result.filter((f) =>
      matchesText(query.search, f.name, f.employeeId, f.email, f.department, f.designation),
    );
  }

  return result;
}

/**
 * MOCK PERSISTENCE.
 *
 * Creates and updates mutate an in-memory array that lives for the lifetime of the JS process.
 * Nothing is written to disk or to a server, and reloading the app restores the original fixtures.
 * The admin UI says so on screen rather than implying a database exists behind it.
 */
export const mockFacultyService: FacultyService = {
  async getFacultyList(query) {
    return mockRequest('faculty.getFacultyList', () => paginate(filterFaculty(query), query));
  },

  async getFacultyMember(facultyId) {
    return mockRequest('faculty.getFacultyMember', () => {
      const found = mockFacultyDirectory.find((f) => f.id === facultyId);
      if (!found) throw createApiError('NOT_FOUND', 'That faculty member could not be found.');
      return found;
    });
  },

  async createFaculty(request) {
    await networkDelay(1);

    const name = request.name.trim();
    const email = request.email.trim().toLowerCase();
    const employeeId = request.employeeId.trim();

    const fieldErrors: Record<string, string> = {};
    if (!name) fieldErrors.name = 'Enter a name.';
    if (!email) fieldErrors.email = 'Enter an email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldErrors.email = 'Enter a valid email address.';
    }
    if (!employeeId) fieldErrors.employeeId = 'Enter an employee ID.';
    if (!request.department) fieldErrors.department = 'Choose a department.';
    if (!request.designation.trim()) fieldErrors.designation = 'Enter a designation.';

    // Uniqueness. A real backend must enforce this too and must not rely on the client checking.
    if (email && mockFacultyDirectory.some((f) => f.email.toLowerCase() === email)) {
      fieldErrors.email = 'That email address is already registered.';
    }
    if (
      employeeId &&
      mockFacultyDirectory.some((f) => f.employeeId.toLowerCase() === employeeId.toLowerCase())
    ) {
      fieldErrors.employeeId = 'That employee ID is already in use.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw createApiError('VALIDATION', 'Please check the highlighted fields.', { fieldErrors });
    }

    facultyCounter += 1;
    const created: Faculty = {
      id: `fac-new-${facultyCounter}`,
      name,
      email,
      role: 'FACULTY',
      avatarUrl: null,
      department: request.department,
      employeeId,
      designation: request.designation.trim(),
      // Teaching load is granted separately, via `assignFaculty`, so the two stay independently
      // auditable.
      assignedClassIds: [],
      phone: request.phone ?? null,
      status: request.status ?? 'ACTIVE',
      joinedAt: nowIso(),
    };

    mockFacultyDirectory.push(created);

    appendAudit({
      action: 'FACULTY_CREATED',
      sessionId: null,
      classDisplayCode: null,
      studentId: null,
      studentName: null,
      rollNumber: null,
      previousStatus: null,
      newStatus: null,
      reason: null,
      entityType: 'FACULTY',
      entityId: created.id,
      entityLabel: created.name,
      previousValue: null,
      newValue: `${created.name} · ${created.employeeId}`,
    });

    return created;
  },

  async updateFaculty(request) {
    await networkDelay(0.85);

    const index = mockFacultyDirectory.findIndex((f) => f.id === request.facultyId);
    if (index < 0) throw createApiError('NOT_FOUND', 'That faculty member could not be found.');

    const before = mockFacultyDirectory[index]!;
    const fieldErrors: Record<string, string> = {};

    if (request.email !== undefined) {
      const email = request.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fieldErrors.email = 'Enter a valid email address.';
      } else if (
        mockFacultyDirectory.some((f) => f.id !== before.id && f.email.toLowerCase() === email)
      ) {
        fieldErrors.email = 'That email address is already registered.';
      }
    }
    if (request.name !== undefined && !request.name.trim()) {
      fieldErrors.name = 'Enter a name.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw createApiError('VALIDATION', 'Please check the highlighted fields.', { fieldErrors });
    }

    const next: Faculty = {
      ...before,
      ...(request.name !== undefined ? { name: request.name.trim() } : {}),
      ...(request.email !== undefined ? { email: request.email.trim().toLowerCase() } : {}),
      ...(request.department !== undefined ? { department: request.department } : {}),
      ...(request.designation !== undefined ? { designation: request.designation.trim() } : {}),
      ...(request.phone !== undefined ? { phone: request.phone } : {}),
      ...(request.status !== undefined ? { status: request.status } : {}),
    };

    mockFacultyDirectory[index] = next;

    // Class rows denormalise the lecturer's name, so a rename has to propagate or class detail
    // would keep showing the old one.
    if (next.name !== before.name) {
      for (let i = 0; i < mockAllClasses.length; i += 1) {
        const course = mockAllClasses[i]!;
        if (course.facultyId === next.id) {
          mockAllClasses[i] = { ...course, facultyName: next.name };
        }
      }
    }

    appendAudit({
      action: 'FACULTY_UPDATED',
      sessionId: null,
      classDisplayCode: null,
      studentId: null,
      studentName: null,
      rollNumber: null,
      previousStatus: null,
      newStatus: null,
      reason: null,
      entityType: 'FACULTY',
      entityId: next.id,
      entityLabel: next.name,
      previousValue: `${before.name} · ${before.designation} · ${before.department ?? '—'}`,
      newValue: `${next.name} · ${next.designation} · ${next.department ?? '—'}`,
    });

    return next;
  },

  async setFacultyStatus(facultyId, status) {
    await networkDelay(0.7);

    const index = mockFacultyDirectory.findIndex((f) => f.id === facultyId);
    if (index < 0) throw createApiError('NOT_FOUND', 'That faculty member could not be found.');

    const before = mockFacultyDirectory[index]!;
    if ((before.status ?? 'ACTIVE') === status) return before;

    const next: Faculty = { ...before, status };
    mockFacultyDirectory[index] = next;

    /*
     * Deactivating does NOT touch attendance history or audit. A lecturer leaving the institution
     * must not erase the register they took, so their classes keep the assignment and every
     * recorded session stays exactly as it was.
     */
    appendAudit({
      action: 'FACULTY_STATUS_CHANGED',
      sessionId: null,
      classDisplayCode: null,
      studentId: null,
      studentName: null,
      rollNumber: null,
      previousStatus: null,
      newStatus: null,
      reason: null,
      entityType: 'FACULTY',
      entityId: next.id,
      entityLabel: next.name,
      previousValue: before.status ?? 'ACTIVE',
      newValue: status,
    });

    return next;
  },
};

/* ------------------------------------------------------------------ *
 * Institution settings (admin)
 * ------------------------------------------------------------------ */

/**
 * MOCK PERSISTENCE. In-memory for the process lifetime; a reload restores the defaults. The
 * settings screen states this explicitly rather than implying the value was saved to a server.
 */
export const mockSettingsService: SettingsService = {
  async getInstitutionSettings() {
    return mockRequest('settings.getInstitutionSettings', () => ({ ...settings }));
  },

  async updateInstitutionSettings(request) {
    await networkDelay(0.9);

    const fieldErrors: Record<string, string> = {};

    if (request.attendanceThreshold !== undefined) {
      const value = request.attendanceThreshold;
      if (!Number.isFinite(value) || !Number.isInteger(value)) {
        fieldErrors.attendanceThreshold = 'Enter a whole number.';
      } else if (value < 1 || value > 100) {
        fieldErrors.attendanceThreshold = 'The threshold must be between 1 and 100.';
      }
    }
    if (request.institutionName !== undefined && !request.institutionName.trim()) {
      fieldErrors.institutionName = 'Enter the institution name.';
    }
    if (request.semesterCount !== undefined && (request.semesterCount < 1 || request.semesterCount > 16)) {
      fieldErrors.semesterCount = 'Enter a semester count between 1 and 16.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw createApiError('VALIDATION', 'Please check the highlighted fields.', { fieldErrors });
    }

    const previousThreshold = settings.attendanceThreshold;

    if (request.institutionName !== undefined) settings.institutionName = request.institutionName.trim();
    if (request.institutionCode !== undefined) settings.institutionCode = request.institutionCode.trim();
    if (request.attendanceThreshold !== undefined) {
      settings.attendanceThreshold = request.attendanceThreshold;
    }
    if (request.academicSession !== undefined) settings.academicSession = request.academicSession;
    if (request.departments !== undefined) settings.departments = [...request.departments];
    if (request.semesterCount !== undefined) settings.semesterCount = request.semesterCount;

    settings.updatedAt = nowIso();
    settings.updatedBy = mockAdmin.id;
    settings.updatedByName = mockAdmin.name;

    // The threshold decides who counts as low-attendance across the whole institution, so a change
    // to it is audited on its own rather than folded into a general settings edit.
    if (
      request.attendanceThreshold !== undefined &&
      request.attendanceThreshold !== previousThreshold
    ) {
      appendAudit({
        action: 'SETTING_CHANGED',
        sessionId: null,
        classDisplayCode: null,
        studentId: null,
        studentName: null,
        rollNumber: null,
        previousStatus: null,
        newStatus: null,
        reason: null,
        entityType: 'SETTING',
        entityId: 'attendanceThreshold',
        entityLabel: 'Attendance threshold',
        previousValue: `${previousThreshold}%`,
        newValue: `${request.attendanceThreshold}%`,
      });
    }

    return { ...settings };
  },
};

/** Test/debug helper: wipes mutations and returns the store to its initial state. */
export function resetMockStore(): void {
  sessions.clear();
  for (const session of mockAttendanceSessions) sessions.set(session.id, session);
  history.length = 0;
  history.push(...mockAttendanceHistory);
  auditLog.length = 0;
  auditLog.push(...mockAuditEntries);
  todayClasses.length = 0;
  todayClasses.push(...mockTodayClasses);
  Object.assign(settings, mockInstitutionSettings);
  classCounter = 0;
  facultyCounter = 0;
  sessionCounter = 0;
}
