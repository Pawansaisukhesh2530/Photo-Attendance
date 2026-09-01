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
import { facultyService } from '@/services';
import { queryKeys } from '@/store/queryClient';
import type {
  CreateFacultyRequest,
  Faculty,
  FacultyQuery,
  FacultyStatus,
  Paginated,
  UpdateFacultyRequest,
} from '@/types';

/**
 * Faculty directory hooks. Admin only.
 *
 * Mutations invalidate the whole `faculty` prefix rather than a specific filtered key: after a
 * create or a status change, every cached filter combination is potentially wrong, and invalidating
 * one key would leave a filtered list showing a stale row. The same reasoning as the attendance
 * `historyRoot` prefix.
 *
 * Classes are invalidated alongside, because a rename propagates into `CourseClass.facultyName` and
 * an assignment change moves a class between lecturers.
 */

export type InfiniteFaculty = UseInfiniteQueryResult<InfiniteData<Paginated<Faculty>>>;

/** A single page. For pickers that want a fixed slice rather than a scrollable list. */
export function useFacultyPage(query?: FacultyQuery): UseQueryResult<Paginated<Faculty>> {
  return useQuery({
    queryKey: queryKeys.faculty.list(query),
    queryFn: () => facultyService.getFacultyList(query),
  });
}

export function useInfiniteFaculty(query?: FacultyQuery): InfiniteFaculty {
  const { page: _page, pageSize, ...filters } = query ?? {};
  const size = pageSize ?? DEFAULT_PAGE_SIZE;

  return useInfiniteQuery({
    queryKey: queryKeys.faculty.list({ ...filters, pageSize: size }),
    queryFn: ({ pageParam }) =>
      facultyService.getFacultyList({ ...filters, page: pageParam, pageSize: size }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });
}

export function useFacultyMember(facultyId: string | undefined): UseQueryResult<Faculty> {
  return useQuery({
    queryKey: queryKeys.faculty.detail(facultyId ?? ''),
    queryFn: () => facultyService.getFacultyMember(facultyId!),
    enabled: Boolean(facultyId),
  });
}

/** Invalidates everything a faculty change can affect. */
function useFacultyInvalidation() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.faculty.all });
    void client.invalidateQueries({ queryKey: queryKeys.classes.all });
    void client.invalidateQueries({ queryKey: queryKeys.audit.all });
  };
}

export function useCreateFaculty() {
  const invalidate = useFacultyInvalidation();
  return useMutation({
    mutationFn: (request: CreateFacultyRequest) => facultyService.createFaculty(request),
    onSuccess: invalidate,
  });
}

export function useUpdateFaculty() {
  const invalidate = useFacultyInvalidation();
  return useMutation({
    mutationFn: (request: UpdateFacultyRequest) => facultyService.updateFaculty(request),
    onSuccess: invalidate,
  });
}

export function useSetFacultyStatus() {
  const invalidate = useFacultyInvalidation();
  return useMutation({
    mutationFn: ({ facultyId, status }: { facultyId: string; status: FacultyStatus }) =>
      facultyService.setFacultyStatus(facultyId, status),
    onSuccess: invalidate,
  });
}
