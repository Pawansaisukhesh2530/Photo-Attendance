import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { classService } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from '@/store/queryClient';
import type { ClassQuery, CourseClass } from '@/types';

/**
 * Class data hooks.
 *
 * Screens call these; they never touch `classService` or `fetch` directly. That keeps
 * the Component → Hook → Service → API chain intact and means caching policy lives in
 * one place per resource.
 */

export function useClasses(query?: ClassQuery): UseQueryResult<CourseClass[]> {
  const user = useAuthStore((state) => state.user);
  // Auth users and faculty profiles have different IDs in the database. Faculty requests are
  // already restricted to the signed-in teacher by the backend, so passing the auth user ID as a
  // faculty filter would intersect the correct scope with an unrelated ID and return no classes.
  const facultyId = user?.role === 'ADMIN' ? query?.facultyId : undefined;

  return useQuery({
    queryKey: queryKeys.classes.list(facultyId ?? user?.id ?? ''),
    queryFn: () => classService.getClasses({ ...query, facultyId }),
  });
}

export function useClass(classId: string | undefined): UseQueryResult<CourseClass> {
  return useQuery({
    queryKey: queryKeys.classes.detail(classId ?? ''),
    queryFn: () => classService.getClass(classId!),
    enabled: Boolean(classId),
  });
}
