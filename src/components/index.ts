/** Public surface of the component library. Screens import from here. */

// Primitives
export { Avatar, type AvatarProps } from './primitives/Avatar';
export { Badge, type BadgeProps } from './primitives/Badge';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './primitives/Button';
export {
  AnimatedOverlay,
  type AnimatedOverlayProps,
  type OverlayVariant,
} from './primitives/AnimatedOverlay';
export {
  AnimatedPressable,
  type AnimatedPressableProps,
} from './primitives/Pressable';
export { Card, type CardProps } from './primitives/Card';
export { GlassSurface, type GlassSurfaceProps } from './primitives/GlassSurface';
export { LiquidTabIcon, type LiquidTabIconProps } from './primitives/LiquidTabIcon';
export { Checkbox, type CheckboxProps } from './primitives/Checkbox';
export { ConfirmationModal, type ConfirmationModalProps } from './primitives/ConfirmationModal';
export {
  FilterChips,
  type FilterChipOption,
  type FilterChipsProps,
} from './primitives/FilterChips';
export { Icon, type IconName, type IconProps } from './primitives/Icon';
export { Input, type InputProps } from './primitives/Input';
export { ProgressBar, type ProgressBarProps } from './primitives/ProgressBar';
export { ProgressRing, type ProgressRingProps } from './primitives/ProgressRing';
export { SearchField, type SearchFieldProps } from './primitives/SearchField';
export { Skeleton, SkeletonCard, SkeletonListItem, type SkeletonProps } from './primitives/Skeleton';
export {
  EmptyState,
  ErrorState,
  LoadingState,
  type EmptyStateProps,
  type ErrorStateProps,
} from './primitives/StateViews';
export { Text, type TextProps } from './primitives/Text';
export { ToastProvider, useToast, type ToastTone } from './primitives/Toast';

// Layout
export { AppHeader, type AppHeaderProps, type HeaderAction } from './layout/AppHeader';
export { AuthGuard, GuestGuard, type AuthGuardProps } from './layout/AuthGuard';
export { Screen, type ScreenProps } from './layout/Screen';
export { SectionHeader, type SectionHeaderProps } from './layout/SectionHeader';
export { SettingsRow, type SettingsRowProps } from './layout/SettingsRow';

// Admin (Phase 9)
export {
  ADMIN_DESTINATIONS,
  ADMIN_SECONDARY,
  type AdminDestination,
} from './admin/adminNav';
export {
  AdminScaffold,
  type AdminBreadcrumb,
  type AdminScaffoldProps,
} from './admin/AdminScaffold';
export {
  AdminSidebar,
  ADMIN_SIDEBAR_WIDTH,
  type AdminSidebarProps,
} from './admin/AdminSidebar';
export {
  AdminPagedList,
  type AdminPagedListProps,
} from './admin/AdminPagedList';
export {
  DataTableHeader,
  DataTableRow,
  type DataColumn,
} from './admin/DataTable';
export {
  FacultyStatusBadge,
  type FacultyStatusBadgeProps,
} from './admin/FacultyStatusBadge';
export {
  PagedListFooter,
  type PagedListFooterProps,
} from './admin/PagedListFooter';
export {
  SelectionSheet,
  type SelectionOption,
  type SelectionSheetProps,
} from './admin/SelectionSheet';

// Domain
export {
  AttendanceStatusBadge,
  attendanceStatusLabel,
  type AttendanceStatusBadgeProps,
} from './domain/AttendanceStatusBadge';
export {
  AttendanceSummaryCard,
  MetricCard,
  type AttendanceSummaryCardProps,
  type MetricCardProps,
} from './domain/AttendanceSummaryCard';
export { AmendReasonSheet, type AmendReasonSheetProps } from './domain/AmendReasonSheet';
export {
  AttendanceTrendChart,
  type AttendanceTrendChartProps,
} from './domain/AttendanceTrendChart';
export { AuditTimeline, type AuditTimelineProps } from './domain/AuditTimeline';
export {
  CameraFramingGuide,
  type CameraFramingGuideProps,
} from './domain/CameraFramingGuide';
export { ClassCard, type ClassCardProps } from './domain/ClassCard';
export {
  ClassroomPhotoViewer,
  type ClassroomPhotoViewerProps,
} from './domain/ClassroomPhotoViewer';
export { FaceEnrolmentCard, type FaceEnrolmentCardProps } from './domain/FaceEnrolmentCard';
export { FinalizeModal, type FinalizeModalProps } from './domain/FinalizeModal';
export { ProcessingStepper, type ProcessingStepperProps } from './domain/ProcessingStepper';
export { StatusEditSheet, type StatusEditSheetProps } from './domain/StatusEditSheet';
export { TwinReviewModal, type TwinReviewModalProps } from './domain/TwinReviewModal';
export {
  ClassAttendanceBar,
  type ClassAttendanceBarProps,
} from './domain/ClassAttendanceBar';
export { ClassCodeTag, type ClassCodeTagProps } from './domain/ClassCodeTag';
export { ClassListCard, type ClassListCardProps } from './domain/ClassListCard';
export { ClassSelectRow, type ClassSelectRowProps } from './domain/ClassSelectRow';
export {
  DashboardMetrics,
  type DashboardMetricsProps,
  type FacultyMetrics,
} from './domain/DashboardMetrics';
export { SessionHistoryRow, type SessionHistoryRowProps } from './domain/SessionHistoryRow';
export { StudentListItem, type StudentListItemProps } from './domain/StudentListItem';
export {
  StudentProfileHeader,
  type StudentProfileHeaderProps,
} from './domain/StudentProfileHeader';
export {
  StudentProfileView,
  useStudentHeaderTitle,
  type StudentProfileViewProps,
} from './domain/StudentProfileView';
export { StudentRosterRow, type StudentRosterRowProps } from './domain/StudentRosterRow';
export { StudentStatRow, type StudentStatRowProps } from './domain/StudentStatRow';
