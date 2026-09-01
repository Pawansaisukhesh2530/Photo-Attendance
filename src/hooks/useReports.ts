import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { DEFAULT_PAGE_SIZE } from '@/constants/config';
import { reportService } from '@/services';
import { queryKeys } from '@/store/queryClient';
import type {
  AttendanceReport,
  Paginated,
  ReportQuery,
  ReportStudentQuery,
  StudentAttendanceStat,
} from '@/types';

/**
 * Report summary: overall percentage, trend, per-class breakdown, threshold and counts.
 *
 * Every number here is computed by the service. The screen formats them and nothing more — a
 * component that recomputed a percentage would become a second definition of attendance.
 */
export function useReport(query?: ReportQuery): UseQueryResult<AttendanceReport> {
  return useQuery({
    queryKey: queryKeys.reports.detail(query),
    queryFn: () => reportService.getReport(query),
  });
}

export type InfiniteReportStudents = UseInfiniteQueryResult<
  InfiniteData<Paginated<StudentAttendanceStat>>
>;

/**
 * The per-student breakdown, paged.
 *
 * `page`/`pageSize` are stripped from the caller's query and re-supplied per request: the cursor
 * belongs to TanStack, and a caller pinning `page` would freeze the list while the cache key
 * claimed otherwise.
 *
 * Pagination resets on scope change without an explicit reset call. `queryKeys.reports.students`
 * covers the scope, the low-attendance filter and the page size, so changing any of them yields a
 * different key — a different, empty entry that starts at page 1 — while the previous scope's
 * loaded pages stay cached for an instant return.
 */
export function useInfiniteReportStudents(query?: ReportStudentQuery): InfiniteReportStudents {
  const { page: _page, pageSize, ...rest } = query ?? {};
  const size = pageSize ?? DEFAULT_PAGE_SIZE;

  return useInfiniteQuery({
    queryKey: queryKeys.reports.students({ ...rest, pageSize: size }),
    queryFn: ({ pageParam }) =>
      reportService.getStudentStats({ ...rest, page: pageParam, pageSize: size }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });
}
