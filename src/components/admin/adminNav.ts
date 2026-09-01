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
  /** True for the five destinations that get their own bottom tab on phones. */
  primary: boolean;
  /** Short description, shown in the More menu where there is room for it. */
  description: string;
}

export const ADMIN_DESTINATIONS: AdminDestination[] = [
  {
    segment: 'dashboard',
    href: '/(admin)/dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    primary: true,
    description: 'Institution overview',
  },
  {
    segment: 'faculty',
    href: '/(admin)/faculty',
    label: 'Faculty',
    icon: 'faculty',
    primary: true,
    description: 'Lecturers, status and assignments',
  },
  {
    segment: 'students',
    href: '/(admin)/students',
    label: 'Students',
    icon: 'students',
    primary: true,
    description: 'Institution-wide student directory',
  },
  {
    segment: 'classes',
    href: '/(admin)/classes',
    label: 'Classes',
    icon: 'classes',
    primary: true,
    description: 'Catalogue, enrolment and lecturers',
  },
  {
    segment: 'attendance',
    href: '/(admin)/attendance',
    label: 'Attendance',
    icon: 'history',
    primary: false,
    description: 'Every recorded session',
  },
  {
    segment: 'reports',
    href: '/(admin)/reports',
    label: 'Reports',
    icon: 'reports',
    primary: false,
    description: 'Institution attendance analytics',
  },
  {
    segment: 'audit',
    href: '/(admin)/audit',
    label: 'Audit',
    icon: 'audit',
    primary: false,
    description: 'Read-only record of every change',
  },
  {
    segment: 'settings',
    href: '/(admin)/settings',
    label: 'Settings',
    icon: 'settings',
    primary: false,
    description: 'Institution policy and configuration',
  },
];

/** The four that live behind "More" on a phone. */
export const ADMIN_SECONDARY = ADMIN_DESTINATIONS.filter((d) => !d.primary);
