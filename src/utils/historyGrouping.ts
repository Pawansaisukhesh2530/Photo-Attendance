import { ATTENDANCE_THRESHOLD } from '@/constants/config';
import type { AttendanceSessionSummary, IsoDate } from '@/types';

import { formatRelativeDay } from './datetime';

export interface HistorySection {
  /** Calendar date, used as the section key. */
  date: IsoDate;
  /** "Today", "Yesterday", "3 days ago", or "24 Aug". */
  title: string;
  /** Named `data` because React Native's `SectionList` requires that key. */
  data: AttendanceSessionSummary[];
}

export interface HistoryStats {
  sessionCount: number;
  /** Sessions not yet finalized. */
  openCount: number;
  /** Review items still outstanding across all listed sessions. */
  pendingReviews: number;
  /** Mean attendance percentage across listed sessions, or null when there are none. */
  averagePercentage: number | null;
  /** Sessions whose attendance fell below the institutional threshold. */
  lowAttendanceCount: number;
}

/**
 * Groups sessions into date sections, newest first.
 *
 * Date is the axis a lecturer actually recalls a session by — "the Tuesday lab", not a session id —
 * so grouping by day and labelling relatively ("Today", "Yesterday") matches how the list gets
 * scanned. Sessions inside a day are ordered newest-first so the most recent capture is nearest the
 * section header.
 *
 * Pure and free of React so the arithmetic can be verified directly.
 */
export function groupSessionsByDate(
  sessions: AttendanceSessionSummary[],
): HistorySection[] {
  const byDate = new Map<IsoDate, AttendanceSessionSummary[]>();

  for (const session of sessions) {
    const bucket = byDate.get(session.date) ?? [];
    bucket.push(session);
    byDate.set(session.date, bucket);
  }

  return [...byDate.entries()]
    // Descending by ISO date, which sorts correctly as a string.
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, group]) => ({
      date,
      title: formatRelativeDay(group[0]?.capturedAt ?? `${date}T00:00:00Z`),
      data: [...group].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
    }));
}

/** Aggregate figures for the header strip. */
export function summariseHistory(
  sessions: AttendanceSessionSummary[],
): HistoryStats {
  if (sessions.length === 0) {
    return {
      sessionCount: 0,
      openCount: 0,
      pendingReviews: 0,
      averagePercentage: null,
      lowAttendanceCount: 0,
    };
  }

  const openCount = sessions.filter((s) => s.status !== 'FINALIZED').length;

  // Only unfinalized sessions can still carry outstanding review work.
  const pendingReviews = sessions
    .filter((s) => s.status !== 'FINALIZED')
    .reduce((sum, s) => sum + s.summary.review, 0);

  const averagePercentage = Math.round(
    sessions.reduce((sum, s) => sum + s.summary.percentage, 0) / sessions.length,
  );

  return {
    sessionCount: sessions.length,
    openCount,
    pendingReviews,
    averagePercentage,
    lowAttendanceCount: sessions.filter(
      (s) => s.summary.percentage < ATTENDANCE_THRESHOLD,
    ).length,
  };
}

/** Client-side text search over the fields shown on a row. */
export function searchSessions(
  sessions: AttendanceSessionSummary[],
  search: string,
): AttendanceSessionSummary[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return sessions;

  return sessions.filter(
    (s) =>
      s.className.toLowerCase().includes(needle) ||
      s.classDisplayCode.toLowerCase().includes(needle),
  );
}
