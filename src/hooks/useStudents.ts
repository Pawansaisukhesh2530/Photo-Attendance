import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { DEFAULT_PAGE_SIZE } from '@/constants/config';
import { studentService } from '@/services';
import { queryKeys } from '@/store/queryClient';
import type { Paginated, Student, StudentProfile, StudentQuery } from '@/types';

/**
 * A single page of students.
 *
 * For callers that want a fixed slice rather than a scrollable list — the class-detail roster
 * preview, which renders five rows and a "View all" link.
 */
export function useStudents(query?: StudentQuery): UseQueryResult<Paginated<Student>> {
  return useQuery({
    queryKey: queryKeys.students.list(query),
    queryFn: () => studentService.getStudents(query),
  });
}

export type InfiniteStudents = UseInfiniteQueryResult<InfiniteData<Paginated<Student>>>;

/**
 * The student directory, paged.
 *
 * `page`/`pageSize` are stripped from the caller's query and re-supplied per request: the page
 * cursor belongs to TanStack, and letting a caller pin `page` here would freeze the list on one
 * page while making the cache key claim otherwise.
 *
 * Pagination resets on filter change for free. `queryKeys.students.infinite` includes every
 * filter, so changing one produces a different key, which is a different (empty) infinite cache
 * entry starting at page 1. There is no reset call to forget, and switching back to a previous
 * filter returns its already-loaded pages immediately.
 *
 * `getNextPageParam` returns undefined once the server says `hasMore: false`, which is what makes
 * `hasNextPage` false and stops the list asking for pages that do not exist.
 */
export function useInfiniteStudents(query?: StudentQuery): InfiniteStudents {
  const { page: _page, pageSize, ...filters } = query ?? {};
  const size = pageSize ?? DEFAULT_PAGE_SIZE;

  return useInfiniteQuery({
    queryKey: queryKeys.students.infinite({ ...filters, pageSize: size }),
    queryFn: ({ pageParam }) =>
      studentService.getStudents({ ...filters, page: pageParam, pageSize: size }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });
}

export function useStudent(studentId: string | undefined): UseQueryResult<StudentProfile> {
  return useQuery({
    queryKey: queryKeys.students.detail(studentId ?? ''),
    queryFn: () => studentService.getStudent(studentId!),
    enabled: Boolean(studentId),
  });
}
