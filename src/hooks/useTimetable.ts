import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { timetableService } from '@/services';
import { queryKeys } from '@/store/queryClient';
import type {
  CreateTimetableSlotRequest,
  TimetableQuery,
  TimetableSlot,
  UpdateTimetableSlotRequest,
} from '@/types';

/**
 * Faculty: my full weekly timetable.
 */
export function useMyTimetable(): UseQueryResult<TimetableSlot[]> {
  return useQuery({
    queryKey: queryKeys.timetable.mine,
    queryFn: () => timetableService.getMyTimetable(),
  });
}

/**
 * Faculty: today's slots only (backed by GET /timetable/mine/today).
 */
export function useTimetableToday(): UseQueryResult<TimetableSlot[]> {
  return useQuery({
    queryKey: queryKeys.timetable.today(''),
    queryFn: () => timetableService.getMyTodayClasses(),
    staleTime: 10_000,
  });
}

/**
 * Admin: one faculty member's full schedule (for the profile editor).
 */
export function useFacultyTimetable(
  facultyId: string | undefined,
): UseQueryResult<TimetableSlot[]> {
  return useQuery({
    queryKey: queryKeys.timetable.faculty(facultyId ?? ''),
    queryFn: () => timetableService.getFacultyTimetable(facultyId!),
    enabled: Boolean(facultyId),
  });
}

export function useAdminTimetable(query?: TimetableQuery) {
  return useQuery({
    queryKey: [...queryKeys.timetable.all, 'admin', query],
    queryFn: () => timetableService.getTimetable(query),
  });
}

function useTimetableInvalidation() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.timetable.all });
    void client.invalidateQueries({ queryKey: queryKeys.classes.all });
  };
}

export function useCreateTimetableSlot() {
  const invalidate = useTimetableInvalidation();
  return useMutation({
    mutationFn: (request: CreateTimetableSlotRequest) =>
      timetableService.createSlot(request),
    onSuccess: invalidate,
  });
}

export function useUpdateTimetableSlot() {
  const invalidate = useTimetableInvalidation();
  return useMutation({
    mutationFn: (request: UpdateTimetableSlotRequest) =>
      timetableService.updateSlot(request),
    onSuccess: invalidate,
  });
}

export function useDeleteTimetableSlot() {
  const invalidate = useTimetableInvalidation();
  return useMutation({
    mutationFn: (slotId: string) => timetableService.deleteSlot(slotId),
    onSuccess: invalidate,
  });
}
