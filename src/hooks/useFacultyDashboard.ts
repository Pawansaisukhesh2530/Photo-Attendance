import { useMemo } from 'react';

import type { FacultyMetrics } from '@/components/domain/DashboardMetrics';
import type { AttendanceSessionSummary, TodayClass } from '@/types';
import { deriveFacultyMetrics } from '@/utils/facultyMetrics';

import { useAttendanceHistory } from './useAttendance';
import { useClasses, useTodayClasses } from './useClasses';

export interface FacultyDashboard {
  metrics: FacultyMetrics;
  todayClasses: TodayClass[];
  recentSessions: AttendanceSessionSummary[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * Composes the faculty dashboard from the existing service calls.
 *
 * The metrics are derived on the client from today's schedule, the assigned classes and
 * recent history rather than fetched. That is a deliberate interim choice: a real backend
 * will almost certainly expose a single `GET /dashboard/summary`, and when it does, only
 * this hook changes — no screen or component touches the derivation. Deriving here also
 * avoids inventing a service method that the agreed contract does not yet contain.
 *
 * The one caveat worth stating for the backend developer: `pendingReviews` counts review
 * items across the sessions this client happens to have fetched. It is a display figure,
 * not an authoritative total, and the server should own it once available.
 */
export function useFacultyDashboard(): FacultyDashboard {
  const today = useTodayClasses();
  const classes = useClasses();
  const history = useAttendanceHistory();

  const metrics = useMemo<FacultyMetrics>(
    () =>
      deriveFacultyMetrics({
        todayClasses: today.data ?? [],
        classes: classes.data ?? [],
        sessions: history.data ?? [],
      }),
    [today.data, classes.data, history.data],
  );

  return {
    metrics,
    todayClasses: today.data ?? [],
    // The dashboard shows only the three most recent, matching the Stitch panel.
    recentSessions: (history.data ?? []).slice(0, 3),
    // Only a first load counts as loading; a background refetch must not blank the screen.
    isLoading: today.isLoading || classes.isLoading || history.isLoading,
    isRefreshing: today.isRefetching || classes.isRefetching || history.isRefetching,
    // Today's schedule is the screen's reason to exist, so its failure is the one that
    // turns the whole screen into an error state. The others degrade quietly.
    error: today.error,
    refetch: () => {
      void today.refetch();
      void classes.refetch();
      void history.refetch();
    },
  };
}
