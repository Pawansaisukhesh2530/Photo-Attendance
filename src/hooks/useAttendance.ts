import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { DEFAULT_PAGE_SIZE } from '@/constants/config';

import { attendanceService } from '@/services';
import { queryKeys } from '@/store/queryClient';
import type {
  AttendanceHistoryQuery,
  AttendanceSession,
  AttendanceSessionSummary,
  AttendanceStatus,
  FinalizeSessionRequest,
  Paginated,
  ResolveTwinReviewRequest,
} from '@/types';

/**
 * Attendance session hooks.
 *
 * Every mutation returns the whole updated session and writes it straight into the
 * cache, then invalidates the collections that derive from it. Returning the full
 * session rather than a patch is deliberate: status changes cascade into the summary
 * counts and can flip the session's own status out of PENDING_REVIEW, so a partial
 * update would leave the UI subtly inconsistent.
 */

export function useAttendanceSession(
  sessionId: string | undefined,
): UseQueryResult<AttendanceSession> {
  return useQuery({
    queryKey: queryKeys.attendance.session(sessionId ?? ''),
    queryFn: () => attendanceService.getAttendanceSession(sessionId!),
    enabled: Boolean(sessionId),
  });
}

/**
 * Session history, optionally filtered.
 *
 * Filtering goes through the service rather than being applied to a fetched list, so the same code
 * path works once history is large enough to paginate server-side.
 */
export function useAttendanceHistory(
  query?: AttendanceHistoryQuery,
): UseQueryResult<AttendanceSessionSummary[]> {
  return useQuery({
    queryKey: queryKeys.attendance.history(query),
    queryFn: () => attendanceService.getAttendanceHistory(query),
  });
}

export type InfiniteAttendanceHistory = UseInfiniteQueryResult<
  InfiniteData<Paginated<AttendanceSessionSummary>>
>;

/**
 * Paged session history. Admin oversight only.
 *
 * Additive: `useAttendanceHistory` above is untouched and the faculty History screen keeps using
 * it. Both call into one filtering routine in the service, so the paged and unpaged views can never
 * disagree about what a query means.
 *
 * Its key sits under the `historyRoot` prefix, so the existing post-mutation invalidation already
 * refreshes this list when a session is edited or finalized — no extra wiring needed.
 */
export function useInfiniteAttendanceHistory(
  query?: AttendanceHistoryQuery,
): InfiniteAttendanceHistory {
  const { page: _page, pageSize, ...filters } = query ?? {};
  const size = pageSize ?? DEFAULT_PAGE_SIZE;

  return useInfiniteQuery({
    queryKey: queryKeys.attendance.historyPaged({ ...filters, pageSize: size }),
    queryFn: ({ pageParam }) =>
      attendanceService.getPagedAttendanceHistory({
        ...filters,
        page: pageParam,
        pageSize: size,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });
}

/** Shared post-mutation cache handling. */
function useSessionMutationHandlers() {
  const queryClient = useQueryClient();

  return (session: AttendanceSession): void => {
    queryClient.setQueryData(queryKeys.attendance.session(session.id), session);
    // Prefix invalidation, so filtered History lists refresh too — not just the unfiltered one.
    void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.historyRoot });
    void queryClient.invalidateQueries({ queryKey: queryKeys.classes.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.audit.all });
  };
}

/**
 * Changes one student's status.
 *
 * Works identically on draft and finalized sessions — the brief is explicit that
 * finalized attendance stays editable, so there is no guard here that would make
 * finalization feel like a lock.
 */
export function useUpdateAttendance() {
  const onSuccess = useSessionMutationHandlers();

  return useMutation({
    mutationFn: (variables: { recordId: string; status: AttendanceStatus; reason?: string }) =>
      attendanceService.updateAttendance(variables),
    onSuccess,
  });
}

export function useResolveTwinReview() {
  const onSuccess = useSessionMutationHandlers();

  return useMutation({
    mutationFn: (variables: ResolveTwinReviewRequest) =>
      attendanceService.resolveTwinReview(variables),
    onSuccess,
  });
}

export function useFinalizeAttendance() {
  const onSuccess = useSessionMutationHandlers();

  return useMutation({
    mutationFn: (variables: FinalizeSessionRequest) =>
      attendanceService.finalizeAttendance(variables),
    onSuccess,
  });
}

/** Convenience selector: how many records still need a human decision. */
export function unresolvedReviewCount(session: AttendanceSession | undefined): number {
  if (!session) return 0;
  return session.records.filter((record) => record.reviewRequired).length;
}
