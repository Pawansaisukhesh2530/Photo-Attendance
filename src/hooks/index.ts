export {
  unresolvedReviewCount,
  useAttendanceHistory,
  useAttendanceSession,
  useFinalizeAttendance,
  useInfiniteAttendanceHistory,
  useResolveTwinReview,
  useUpdateAttendance,
  type InfiniteAttendanceHistory,
} from './useAttendance';
export {
  useCaptureAttendance,
  useProcessingProgress,
  type ProcessingState,
} from './useAttendanceCapture';
export {
  useAuditEntries,
  useInfiniteAuditEntries,
  type InfiniteAuditEntries,
} from './useAudit';
export { useAuth, useRequestPasswordReset } from './useAuth';
export { useClass, useClasses, useTodayClasses } from './useClasses';
export { useFacultyDashboard, type FacultyDashboard } from './useFacultyDashboard';
export { useDebouncedValue } from './useDebouncedValue';

// Admin (Phase 9)
export {
  useCreateFaculty,
  useFacultyMember,
  useFacultyPage,
  useInfiniteFaculty,
  useSetFacultyStatus,
  useUpdateFaculty,
  type InfiniteFaculty,
} from './useFacultyAdmin';
export {
  useAssignFaculty,
  useCreateClass,
  useInfiniteClasses,
  useUpdateClass,
  useUpdateEnrolment,
  type InfiniteClasses,
} from './useClassAdmin';
export { useInstitutionSettings, useUpdateSettings } from './useSettings';
export {
  useInfiniteReportStudents,
  useReport,
  type InfiniteReportStudents,
} from './useReports';
export {
  useInfiniteStudents,
  useStudent,
  useStudents,
  type InfiniteStudents,
} from './useStudents';
