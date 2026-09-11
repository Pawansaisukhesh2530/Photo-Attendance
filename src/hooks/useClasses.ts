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
  const facultyId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: queryKeys.classes.list(query?.facultyId ?? facultyId),
    queryFn: () => classService.getClasses({ ...query, facultyId: query?.facultyId ?? facultyId }),
  });
}

export function useClass(classId: string | undefined): UseQueryResult<CourseClass> {
  return useQuery({
    queryKey: queryKeys.classes.detail(classId ?? ''),
    queryFn: () => classService.getClass(classId!),
    enabled: Boolean(classId),
  });
}
