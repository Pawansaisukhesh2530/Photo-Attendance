import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';

import { DEFAULT_PAGE_SIZE } from '@/constants/config';
import { classService } from '@/services';
import { queryKeys } from '@/store/queryClient';
import type {
  AssignFacultyRequest,
  ClassQuery,
  CourseClass,
  CreateClassRequest,
  Paginated,
  UpdateClassRequest,
  UpdateEnrolmentRequest,
} from '@/types';

/**
 * Institution class catalogue and administration. Admin only.
 *
 * Faculty keeps using `useClasses`, which calls the unpaged `getClasses` and is scoped to the
 * signed-in lecturer. This hook calls `getPagedClasses`, which spans the institution. Both go
 * through one filtering routine in the service, so a query means the same thing either way.
 */

export type InfiniteClasses = UseInfiniteQueryResult<InfiniteData<Paginated<CourseClass>>>;

export function useInfiniteClasses(query?: ClassQuery): InfiniteClasses {
  const { page: _page, pageSize, ...filters } = query ?? {};
  const size = pageSize ?? DEFAULT_PAGE_SIZE;

  return useInfiniteQuery({
    queryKey: queryKeys.classes.paged({ ...filters, pageSize: size }),
    queryFn: ({ pageParam }) =>
      classService.getPagedClasses({ ...filters, page: pageParam, pageSize: size }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });
}

/**
 * Invalidates everything a class change can affect.
 *
 * Faculty is included because assignment is a two-sided relationship — `Faculty.assignedClassIds`
 * and `CourseClass.facultyId` are denormalised views of the same fact. Reports are included because
 * a class moving between lecturers changes the faculty breakdown.
 */
function useClassInvalidation() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.classes.all });
    void client.invalidateQueries({ queryKey: queryKeys.faculty.all });
    void client.invalidateQueries({ queryKey: queryKeys.reports.all });
    void client.invalidateQueries({ queryKey: queryKeys.audit.all });
  };
}

export function useCreateClass() {
  const invalidate = useClassInvalidation();
  return useMutation({
    mutationFn: (request: CreateClassRequest) => classService.createClass(request),
    onSuccess: invalidate,
  });
}

export function useUpdateClass() {
  const invalidate = useClassInvalidation();
  return useMutation({
    mutationFn: (request: UpdateClassRequest) => classService.updateClass(request),
    onSuccess: invalidate,
  });
}

export function useAssignFaculty() {
  const invalidate = useClassInvalidation();
  return useMutation({
    mutationFn: (request: AssignFacultyRequest) => classService.assignFaculty(request),
    onSuccess: invalidate,
  });
}

export function useUpdateEnrolment() {
  const invalidate = useClassInvalidation();
  return useMutation({
    mutationFn: (request: UpdateEnrolmentRequest) => classService.updateEnrolment(request),
    onSuccess: () => {
      invalidate();
    },
  });
}
