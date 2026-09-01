import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { classService } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from '@/store/queryClient';
import type { ClassQuery, CourseClass, TodayClass } from '@/types';

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

/**
 * Today's schedule for the signed-in faculty member.
 *
 * Kept fresher than other resources (10s) because a lecturer may finalize a register
 * and immediately return to the dashboard expecting the card to have flipped state.
 */
export function useTodayClasses(): UseQueryResult<TodayClass[]> {
  const facultyId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: queryKeys.classes.today(facultyId ?? ''),
    queryFn: () => classService.getTodayClasses(facultyId!),
    enabled: Boolean(facultyId),
    staleTime: 10_000,
  });
}
