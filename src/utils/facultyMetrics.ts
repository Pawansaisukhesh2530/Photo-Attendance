import type { AttendanceSessionSummary, CourseClass, TodayClass } from '@/types';

export interface FacultyMetricsInput {
  todayClasses: TodayClass[];
  classes: CourseClass[];
  sessions: AttendanceSessionSummary[];
}

export interface DerivedFacultyMetrics {
  todayClassCount: number;
  attendanceDone: number;
  pendingReviews: number;
  averageAttendance: number | null;
}

/**
 * Derives the faculty dashboard metrics.
 *
 * Kept as a pure function, free of React and of any service import, so the arithmetic can
 * be exercised directly and so it can be deleted wholesale the day the backend exposes a
 * dashboard summary endpoint.
 *
 * `pendingReviews` is a display figure only. It counts review items across whichever
 * sessions this client has fetched, so it is a lower bound rather than an authoritative
 * total — the server owns that number once it exists. Nothing in the UI should treat it as
 * a source of truth for outstanding work.
 */
export function deriveFacultyMetrics({
  todayClasses,
  classes,
  sessions,
}: FacultyMetricsInput): DerivedFacultyMetrics {
  const scheduled = todayClasses.filter((c) => c.attendanceState !== 'NO_CLASS_TODAY');
  const done = todayClasses.filter((c) => c.attendanceState === 'COMPLETED');

  const pendingReviews = sessions
    .filter((session) => session.status !== 'FINALIZED')
    .reduce((sum, session) => sum + session.summary.review, 0);

  const averageAttendance =
    classes.length === 0
      ? null
      : Math.round(
          classes.reduce((sum, c) => sum + c.attendancePercentage, 0) / classes.length,
        );

  return {
    todayClassCount: scheduled.length,
    attendanceDone: done.length,
    pendingReviews,
    averageAttendance,
  };
}
