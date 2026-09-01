import { QueryClient } from '@tanstack/react-query';

import { isApiError } from '@/api/client';

/**
 * Query cache configuration.
 *
 * Attendance data is edited and re-read constantly (resolve a review, change a status,
 * finalize, reopen from history), so cache invalidation carries real weight here. The
 * key factory below keeps invalidation precise instead of blowing the whole cache away
 * after every mutation.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        // Never retry a failure the user must act on — wrong credentials, missing
        // record, validation. Retrying those just delays the error message.
        if (isApiError(error) && !error.retryable) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/** The filter half of a student query — everything except the page cursor. */
interface StudentFilterKey {
  classId?: string;
  search?: string;
  department?: string;
  semester?: number;
  lowAttendanceOnly?: boolean;
}

/**
 * Stable serialisation of the student filters.
 *
 * Every filter the service accepts must appear here. A key that omits one makes two different
 * requests collide: `semester` and `lowAttendanceOnly` were once missing, so toggling either
 * returned the previous filter's roster from cache with no refetch. Explicit `null` defaults keep
 * the string identical regardless of the order the caller built the object in, or whether an
 * absent filter was omitted or passed as undefined.
 */
function studentFilterKey(query?: StudentFilterKey): string {
  if (!query) return 'all';
  return JSON.stringify({
    classId: query.classId ?? null,
    search: query.search ?? null,
    department: query.department ?? null,
    semester: query.semester ?? null,
    lowAttendanceOnly: query.lowAttendanceOnly ?? false,
  });
}

/**
 * The scope half of a report query — everything except paging and the low-attendance filter.
 *
 * `department` and `institutionWide` were missing when the admin scope fields were added to
 * `ReportQuery`. Latent for faculty, which never sends them, but the admin reports screen switches
 * department scope constantly — an incomplete key would have served one department's figures under
 * another department's heading with no refetch.
 */
interface ReportScopeKey {
  classId?: string;
  facultyId?: string;
  department?: string;
  institutionWide?: boolean;
  from?: string;
  to?: string;
}

/**
 * Stable serialisation of a report scope.
 *
 * Shared by the summary and the paged student breakdown so both agree on what "the same scope"
 * means. `from` and `to` are included even though no UI currently sets them: they are on the
 * contract, and a key that ignored them would serve one range's figures for another the moment a
 * date filter arrives.
 */
function reportScopeKey(query?: ReportScopeKey): string {
  if (!query) return 'all';
  return JSON.stringify({
    classId: query.classId ?? null,
    facultyId: query.facultyId ?? null,
    department: query.department ?? null,
    // Institution scope is a genuinely different result from faculty scope for the same filters,
    // so it has to be part of the identity.
    institutionWide: query.institutionWide ?? false,
    from: query.from ?? null,
    to: query.to ?? null,
  });
}

/**
 * Every attendance-history filter that affects the result.
 *
 * `facultyId`, `search` and `pendingReviewOnly` were missing from this key. Latent while only the
 * faculty History screen existed — it never passes them — but the admin oversight list filters by
 * lecturer and searches, where an incomplete key would serve another filter's rows from cache.
 */
interface HistoryFilterKey {
  classId?: string;
  facultyId?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
  pendingReviewOnly?: boolean;
}

function historyFilterKey(query?: HistoryFilterKey): string {
  if (!query) return 'all';
  return JSON.stringify({
    classId: query.classId ?? null,
    facultyId: query.facultyId ?? null,
    status: query.status ?? null,
    from: query.from ?? null,
    to: query.to ?? null,
    search: query.search ?? null,
    pendingReviewOnly: query.pendingReviewOnly ?? false,
  });
}

interface ClassFilterKey {
  facultyId?: string;
  semester?: number;
  search?: string;
  department?: string;
  status?: string;
  unassignedOnly?: boolean;
}

function classFilterKey(query?: ClassFilterKey): string {
  if (!query) return 'all';
  return JSON.stringify({
    facultyId: query.facultyId ?? null,
    semester: query.semester ?? null,
    search: query.search ?? null,
    department: query.department ?? null,
    status: query.status ?? null,
    unassignedOnly: query.unassignedOnly ?? false,
  });
}

/** Every audit filter that affects the result. `page` is excluded — see `audit.paged`. */
interface AuditFilterKey {
  sessionId?: string;
  studentId?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  search?: string;
}

function auditFilterKey(query?: AuditFilterKey): string {
  if (!query) return 'all';
  return JSON.stringify({
    sessionId: query.sessionId ?? null,
    studentId: query.studentId ?? null,
    actorId: query.actorId ?? null,
    action: query.action ?? null,
    entityType: query.entityType ?? null,
    from: query.from ?? null,
    to: query.to ?? null,
    search: query.search ?? null,
  });
}

interface FacultyFilterKey {
  search?: string;
  department?: string;
  status?: string;
  classId?: string;
}

function facultyFilterKey(query?: FacultyFilterKey): string {
  if (!query) return 'all';
  return JSON.stringify({
    search: query.search ?? null,
    department: query.department ?? null,
    status: query.status ?? null,
    classId: query.classId ?? null,
  });
}

/**
 * Centralised query keys. Never inline a key array at a call site — that is how
 * invalidation silently stops matching.
 */
export const queryKeys = {
  currentUser: ['currentUser'] as const,

  classes: {
    all: ['classes'] as const,
    list: (facultyId?: string) => ['classes', 'list', facultyId ?? 'all'] as const,
    detail: (classId: string) => ['classes', 'detail', classId] as const,
    today: (facultyId: string) => ['classes', 'today', facultyId] as const,

    /**
     * Paged institution catalogue. Admin only.
     *
     * Distinct from `list`, which is the faculty-scoped unpaged view, so the two cannot collide.
     * `page` is excluded — TanStack owns the cursor.
     */
    paged: (query?: ClassFilterKey & { pageSize?: number }) =>
      ['classes', 'paged', classFilterKey(query), query?.pageSize ?? 'default'] as const,
  },

  students: {
    all: ['students'] as const,

    /**
     * Single page. Used where a fixed slice is wanted — the class-detail roster preview.
     *
     * `page` and `pageSize` are part of the key, because page 2 of a query is a different
     * response from page 1 and must not overwrite it in the cache.
     */
    list: (query?: StudentFilterKey & { page?: number; pageSize?: number }) =>
      [
        'students',
        'list',
        studentFilterKey(query),
        query?.page ?? 1,
        query?.pageSize ?? 'default',
      ] as const,

    /**
     * Infinite list. Used by the students directory.
     *
     * Deliberately excludes `page`: TanStack owns the page cursor inside `pageParam`, and one
     * cache entry accumulates every loaded page. Including `page` here would give each page its
     * own entry and the accumulation would never happen.
     *
     * `pageSize` stays in the key — changing it changes the shape of every page, so the loaded
     * set has to be rebuilt rather than extended.
     *
     * Everything else in the filter is in the key, which is what makes pagination reset when a
     * filter changes: a new filter is a new key, so it starts empty at page 1 while the previous
     * filter's loaded pages stay cached for an instant return.
     */
    infinite: (query?: StudentFilterKey & { pageSize?: number }) =>
      ['students', 'infinite', studentFilterKey(query), query?.pageSize ?? 'default'] as const,

    detail: (studentId: string) => ['students', 'detail', studentId] as const,
  },

  attendance: {
    all: ['attendance'] as const,
    session: (sessionId: string) => ['attendance', 'session', sessionId] as const,
    twinReviews: (sessionId: string) => ['attendance', 'twinReviews', sessionId] as const,

    /**
     * Prefix covering every history variant.
     *
     * Mutations invalidate this rather than a specific filtered key. A filtered list
     * (`{classId: 'cls-001', status: 'FINALIZED'}`) has a different key from the unfiltered one, so
     * invalidating only the latter would leave a filtered History screen showing stale rows after
     * an edit.
     */
    historyRoot: ['attendance', 'history'] as const,

    history: (query?: HistoryFilterKey) =>
      ['attendance', 'history', historyFilterKey(query)] as const,

    /**
     * Paged history. Admin oversight only.
     *
     * Separate from `history` so the faculty unpaged view and the admin paged view cannot collide.
     * Both sit under the `historyRoot` prefix, so one invalidation still covers them.
     * `page` is excluded — TanStack owns the cursor.
     */
    historyPaged: (query?: HistoryFilterKey & { pageSize?: number }) =>
      [
        'attendance',
        'history',
        'paged',
        historyFilterKey(query),
        query?.pageSize ?? 'default',
      ] as const,
  },

  reports: {
    all: ['reports'] as const,

    /** Summary, trend and per-class breakdown. Keyed on the whole scope. */
    detail: (query?: ReportScopeKey) => ['reports', 'detail', reportScopeKey(query)] as const,

    /**
     * The paged per-student breakdown.
     *
     * `page` is deliberately absent: TanStack owns the cursor inside `pageParam` and one cache
     * entry accumulates every loaded page. `pageSize` and `lowAttendanceOnly` are both in the key,
     * because either changes what a page contains, so the loaded set has to be rebuilt rather
     * than extended.
     */
    students: (
      query?: ReportScopeKey & { lowAttendanceOnly?: boolean; pageSize?: number },
    ) =>
      [
        'reports',
        'students',
        reportScopeKey(query),
        query?.lowAttendanceOnly ?? false,
        query?.pageSize ?? 'default',
      ] as const,
  },

  audit: {
    all: ['audit'] as const,

    /**
     * Unpaged entries, keyed on every filter that affects the result.
     *
     * The key previously covered only `sessionId`, so filtering by actor or action served the
     * previous filter's entries from cache with no refetch — the same defect fixed in `students`
     * and `reports`. Latent while only the faculty session-audit screen existed, because it passes
     * nothing but `sessionId`; the admin log filters by actor and action, where it would bite
     * immediately.
     */
    list: (query?: AuditFilterKey) => ['audit', 'list', auditFilterKey(query)] as const,

    /**
     * Paged entries. `page` is deliberately absent: TanStack owns the cursor inside `pageParam`
     * and one entry accumulates every loaded page. `pageSize` is in the key because it changes
     * what a page contains.
     */
    paged: (query?: AuditFilterKey & { pageSize?: number }) =>
      ['audit', 'paged', auditFilterKey(query), query?.pageSize ?? 'default'] as const,
  },

  faculty: {
    all: ['faculty'] as const,
    list: (query?: FacultyFilterKey & { pageSize?: number }) =>
      ['faculty', 'list', facultyFilterKey(query), query?.pageSize ?? 'default'] as const,
    detail: (facultyId: string) => ['faculty', 'detail', facultyId] as const,
  },

  settings: {
    all: ['settings'] as const,
    institution: ['settings', 'institution'] as const,
  },
} as const;
