import { useMemo } from 'react';

import type { FacultyMetrics } from '@/components/domain/DashboardMetrics';
import type { AttendanceSessionSummary, TodayClass, TimetableSlot } from '@/types';
import { deriveFacultyMetrics } from '@/utils/facultyMetrics';

import { useAttendanceHistory } from './useAttendance';
import { useClasses } from './useClasses';
import { useTimetableToday } from './useTimetable';

export interface FacultyDashboard {
  metrics: FacultyMetrics;
  todayClasses: TodayClass[];
  todaySlots: TimetableSlot[];
  recentSessions: AttendanceSessionSummary[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: unknown;
  refetch: () => void;
}

function slotToTodayClass(slot: TimetableSlot): TodayClass {
  return {
    id: slot.class_id ?? '',
    subject: slot.subject ?? '',
    classCode: slot.class_code ?? '',
    variant: slot.variant ?? 'Lecture',
    className: slot.class_name,
    section: '',
    displayCode: slot.class_code ?? '',
    semester: 0,
    academicSession: '',
    facultyId: slot.faculty_id,
    facultyName: '',
    studentCount: 0,
    attendancePercentage: 0,
    schedule: [],
    status: 'ACTIVE',
    date: new Date().toISOString().slice(0, 10),
    startTime: slot.start_time?.slice(0, 5) ?? '',
    endTime: slot.end_time?.slice(0, 5) ?? '',
    room: slot.room ?? '',
    attendanceState: 'PENDING',
    sessionId: null,
    presentCount: null,
    lastCapturedAt: null,
  };
}

export function useFacultyDashboard(): FacultyDashboard {
  const today = useTimetableToday();
  const classes = useClasses();
  const history = useAttendanceHistory();

  const todayClasses = useMemo(() => {
    if (!today.data) return [];
    return today.data
      .filter((s) => s.slot_type === 'CLASS')
      .map(slotToTodayClass);
  }, [today.data]);

  const metrics = useMemo<FacultyMetrics>(
    () =>
      deriveFacultyMetrics({
        todayClasses,
        classes: classes.data ?? [],
        sessions: history.data ?? [],
      }),
    [todayClasses, classes.data, history.data],
  );

  return {
    metrics,
    todayClasses,
    todaySlots: today.data ?? [],
    recentSessions: (history.data ?? []).slice(0, 3),
    isLoading: today.isLoading || classes.isLoading || history.isLoading,
    isRefreshing: today.isRefetching || classes.isRefetching || history.isRefetching,
    error: today.error,
    refetch: () => {
      void today.refetch();
      void classes.refetch();
      void history.refetch();
    },
  };
}
