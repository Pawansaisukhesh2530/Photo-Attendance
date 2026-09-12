import type { IconName } from '@/components/primitives/Icon';

/**
 * The admin destinations, in one place.
 *
 * Shared by the desktop sidebar and the mobile "More" menu so the two can never drift out of sync,
 * and so adding a destination is a one-line change rather than an edit in three files.
 */
export interface AdminDestination {
  /** Route segment under `(admin)`. */
  segment: string;
  href: string;
  label: string;
  icon: IconName;
  group: 'Overview' | 'Academics' | 'People' | 'Teaching' | 'Oversight' | 'System';
  /** Short description, shown in the More menu where there is room for it. */
  description: string;
}

export const ADMIN_DESTINATIONS: AdminDestination[] = [
  {
    segment: 'dashboard',
    href: '/(admin)/dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    group: 'Overview',
    description: 'Institution overview',
  },
  {
    segment: 'faculty',
    href: '/(admin)/faculty',
    label: 'Faculty',
    icon: 'faculty',
    group: 'People',
    description: 'Lecturers, status and assignments',
  },
  {
    segment: 'students',
    href: '/(admin)/students',
    label: 'Students',
    icon: 'students',
    group: 'People',
    description: 'Institution-wide student directory',
  },
  {
    segment: 'classes',
    href: '/(admin)/classes',
    label: 'Classes',
    icon: 'classes',
    group: 'Teaching',
    description: 'Catalogue, enrolment and lecturers',
  },
  {
    segment: 'attendance',
    href: '/(admin)/attendance',
    label: 'Attendance',
    icon: 'history',
    group: 'Teaching',
    description: 'Every recorded session',
  },
  {
    segment: 'reports',
    href: '/(admin)/reports',
    label: 'Reports',
    icon: 'reports',
    group: 'Oversight',
    description: 'Institution attendance analytics',
  },
  {
    segment: 'audit',
    href: '/(admin)/audit',
    label: 'Audit',
    icon: 'audit',
    group: 'System',
    description: 'Read-only record of every change',
  },
  {
    segment: 'settings',
    href: '/(admin)/settings',
    label: 'Settings',
    icon: 'settings',
    group: 'System',
    description: 'Institution policy and configuration',
  },
  {
    segment: 'academic-structure',
    href: '/(admin)/academic-structure',
    label: 'Academic structure',
    icon: 'classes',
    group: 'Academics',
    description: 'Schools, departments, programmes, batches and subjects',
  },
  {
    segment: 'curriculum',
    href: '/(admin)/curriculum',
    label: 'Curriculum',
    icon: 'reports',
    group: 'Academics',
    description: 'Subjects and programme curriculum',
  },
  {
    segment: 'timetable',
    href: '/(admin)/timetable',
    label: 'Timetable',
    icon: 'calendar',
    group: 'Teaching',
    description: 'Teaching schedule and room allocation',
  },
];

export const ADMIN_GROUP_ORDER = ['Overview', 'Academics', 'People', 'Teaching', 'Oversight', 'System'] as const;

/** Destinations shown in the phone More directory. */
export const ADMIN_SECONDARY = ADMIN_DESTINATIONS.filter(
  (destination) => !['dashboard', 'academic-structure'].includes(destination.segment),
);
