// Deep import, NOT `from '@expo/vector-icons'`.
//
// The package root re-exports every icon set, which drags all ~19 icon fonts (roughly
// 4 MB, including a 1.3 MB MaterialCommunityIcons) into the bundle. This app uses one
// set, so it imports one set.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { palette } from '@/theme';

/**
 * Icon layer.
 *
 * Stitch uses Material Symbols Outlined, which is not available as a React Native
 * font in Expo's bundled icon sets. MaterialIcons is the closest match from the same
 * design family, so glyph names are mapped here once rather than being guessed at each
 * call site.
 *
 * A handful of Stitch glyphs have no MaterialIcons equivalent and are substituted with
 * the nearest sensible alternative — noted inline. Anything substituted should be
 * eyeballed against the Stitch screen during the Phase 10 fidelity pass.
 */

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

/** Semantic names used throughout the app, mapped to concrete MaterialIcons glyphs. */
const ICONS = {
  // Navigation
  dashboard: 'dashboard',
  classes: 'school',
  students: 'group',
  faculty: 'badge',
  enrollments: 'person-add',
  attendance: 'event',
  history: 'history',
  reports: 'analytics',
  audit: 'receipt-long',
  settings: 'settings',
  help: 'help-outline',
  logout: 'logout',
  menu: 'menu',
  back: 'arrow-back',
  forward: 'arrow-forward',
  chevronRight: 'chevron-right',
  chevronLeft: 'chevron-left',
  close: 'close',
  more: 'more-vert',
  moreHorizontal: 'more-horiz',

  // Auth / identity
  person: 'person',
  lock: 'lock',
  visible: 'visibility',
  hidden: 'visibility-off',
  institution: 'domain',
  support: 'support-agent',
  /** The app mark glyph chosen by the Stitch mobile login screen. */
  appMark: 'account-balance',
  passwordReset: 'lock-reset',
  check: 'check',

  // Attendance
  /** Stitch uses `how_to_reg`; MaterialIcons carries the same glyph name. */
  takeAttendance: 'how-to-reg',
  present: 'check-circle',
  absent: 'cancel',
  review: 'warning',
  /** Substitute: Stitch uses `help` outline for unrecognised faces. */
  unknown: 'help-outline',
  /** Substitute for Stitch `psychology_alt`, which has no MaterialIcons equivalent. */
  twin: 'people-alt',
  /** Substitute for Stitch `done_all`. */
  bothPresent: 'done-all',
  /** Substitute for Stitch `person_check`. */
  personConfirm: 'how-to-reg',
  finalize: 'task-alt',
  edit: 'edit',
  camera: 'photo-camera',
  panorama: 'panorama-wide-angle',
  stop: 'stop',
  retake: 'refresh',
  gallery: 'photo-library',
  flash: 'flash-on',
  flashOff: 'flash-off',
  flipCamera: 'flip-camera-ios',
  /** Substitute for Stitch `center_focus_strong`. */
  focus: 'center-focus-strong',
  /** Substitute for Stitch `memory`, used on the recognition-rate card. */
  recognition: 'memory',
  processing: 'autorenew',

  // Data / meta
  calendar: 'calendar-today',
  clock: 'schedule',
  room: 'location-on',
  search: 'search',
  filter: 'filter-list',
  download: 'download',
  notifications: 'notifications',
  info: 'info-outline',
  warning: 'warning-amber',
  error: 'error-outline',
  success: 'check-circle',
  add: 'add',
  trend: 'trending-up',
  offline: 'wifi-off',
  retry: 'refresh',
  empty: 'inbox',
  photo: 'image',
} as const satisfies Record<string, MaterialIconName>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  /**
   * Accepts `ColorValue` rather than `string` so it can take the `color` that
   * React Navigation passes to `tabBarIcon`, which may be an opaque platform colour.
   */
  color?: ColorValue;
}

export function Icon({ name, size = 20, color = palette.onSurfaceVariant }: IconProps) {
  return <MaterialIcons name={ICONS[name]} size={size} color={color} />;
}
