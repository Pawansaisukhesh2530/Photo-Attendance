import { useMemo } from 'react';

import type {
  AttendanceReport,
  AttendanceSessionSummary,
  ClassAttendanceStat,
  AuditEntry,
} from '@/types';

import { useInfiniteAttendanceHistory } from './useAttendance';
import { useAuditEntries } from './useAudit';
import { useInfiniteClasses } from './useClassAdmin';
import { useInfiniteFaculty } from './useFacultyAdmin';
import { useReport } from './useReports';
import { useInstitutionSettings } from './useSettings';

export interface AdminDashboard {
  /* Metrics */
  totalStudents: number;
  totalFaculty: number;
  activeFaculty: number;
  totalClasses: number;
  /** Sessions recorded today, across the institution. */
  todaySessions: number;
  todayPercentage: number | null;
  pendingReviewSessions: number;
  lowAttendanceStudents: number;

  /* Sections */
  report: AttendanceReport | undefined;
  recentSessions: AttendanceSessionSummary[];
  /** Classes below the institutional threshold, weakest first. */
  classesNeedingAttention: ClassAttendanceStat[];
  recentActivity: AuditEntry[];
  /** Institutional threshold, from settings. Never a client-side constant. */
  threshold: number | undefined;
  institutionName: string | undefined;
  institutionCode: string | undefined;

  isLoading: boolean;
  isRefetching: boolean;
  error: unknown;
  refetch: () => void;
}

/** How many rows each dashboard section previews. */
const PREVIEW = 5;

/**
 * Everything the admin dashboard shows, assembled in one place.
 *
 * The screen renders; this composes. Six independent queries produce one view model here rather
 * than six `useQuery` calls and a pile of derivation inside the component, so the dashboard stays a
 * layout concern and the arithmetic stays testable.
 *
 * Every figure is either reported by a service or counted from what a service returned. Nothing is
 * invented, and the threshold comes from institution settings — the whole point of Phase 8's
 * `AttendanceReport.threshold` was that policy is server-owned.
 */
export function useAdminDashboard(): AdminDashboard {
  const settings = useInstitutionSettings();

  // Institution scope is opt-in, so an admin request must say so explicitly.
  const report = useReport({ institutionWide: true });

  // First page only: the dashboard needs counts and a short preview, not the whole institution.
  const faculty = useInfiniteFaculty({ pageSize: 100 });
  const classes = useInfiniteClasses({ pageSize: 100 });
  const history = useInfiniteAttendanceHistory({ pageSize: 50 });
  const pending = useInfiniteAttendanceHistory({ pendingReviewOnly: true, pageSize: 50 });
  const audit = useAuditEntries();

  const facultyRows = useMemo(
    () => (faculty.data?.pages ?? []).flatMap((p) => p.items),
    [faculty.data],
  );

  const sessions = useMemo(
    () => (history.data?.pages ?? []).flatMap((p) => p.items),
    [history.data],
  );

  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = useMemo(
    () => sessions.filter((s) => s.date === today),
    [sessions, today],
  );

  /**
   * Today's attendance percentage across the institution.
   *
   * Weighted by headcount rather than a mean of per-session percentages: a 60-student lecture and a
   * 26-student lab should not carry equal weight in one figure. Null when nothing was recorded
   * today, so the UI can say "no sessions yet" instead of showing a misleading 0%.
   */
  const todayPercentage = useMemo(() => {
    if (todaySessions.length === 0) return null;
    const present = todaySessions.reduce((sum, s) => sum + s.summary.present, 0);
    const total = todaySessions.reduce((sum, s) => sum + s.summary.total, 0);
    if (total === 0) return null;
    return Math.round((present / total) * 100);
  }, [todaySessions]);

  const threshold = settings.data?.attendanceThreshold ?? report.data?.threshold;

  const classesNeedingAttention = useMemo(() => {
    if (!report.data || threshold === undefined) return [];
    return report.data.byClass
      .filter((c) => c.percentage < threshold)
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, PREVIEW);
  }, [report.data, threshold]);

  const totalPendingReview = pending.data?.pages[0]?.total ?? 0;

  return {
    totalStudents: report.data?.studentCount ?? 0,
    totalFaculty: faculty.data?.pages[0]?.total ?? 0,
    activeFaculty: facultyRows.filter((f) => (f.status ?? 'ACTIVE') === 'ACTIVE').length,
    totalClasses: classes.data?.pages[0]?.total ?? 0,
    todaySessions: todaySessions.length,
    todayPercentage,
    pendingReviewSessions: totalPendingReview,
    lowAttendanceStudents: report.data?.lowAttendanceCount ?? 0,

    report: report.data,
    recentSessions: sessions.slice(0, PREVIEW),
    classesNeedingAttention,
    recentActivity: (audit.data ?? []).slice(0, PREVIEW),
    threshold,
    institutionName: settings.data?.institutionName,
    institutionCode: settings.data?.institutionCode,

    // The dashboard is a summary: it is only "loading" while the pieces that carry its headline
    // numbers are still in flight. Waiting on the audit preview too would hold the whole page back
    // for a section nobody reads first.
    isLoading:
      settings.isLoading || report.isLoading || faculty.isLoading || classes.isLoading,
    isRefetching:
      settings.isRefetching || report.isRefetching || history.isRefetching,
    // Settings and the report are load-bearing; a failed audit preview should not blank the page.
    error: settings.error ?? report.error ?? null,
    refetch: () => {
      void settings.refetch();
      void report.refetch();
      void faculty.refetch();
      void classes.refetch();
      void history.refetch();
      void pending.refetch();
      void audit.refetch();
    },
  };
}
