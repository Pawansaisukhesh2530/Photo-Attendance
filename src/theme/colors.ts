/**
 * Colour tokens transcribed verbatim from the Stitch project
 * "FacultyFace Attendance Pro" (id 1332040491112930834), theme "Academic Precision".
 *
 * Source of truth: Stitch `designTheme.namedColors` / the `tailwind.config` block
 * embedded in every exported screen. Do not hand-edit individual values here; if the
 * Stitch theme changes, re-export and re-transcribe the whole block.
 *
 * This is a Material 3 role-based palette. Prefer semantic roles (`primary`,
 * `onSurfaceVariant`) over raw hexes anywhere in the app.
 */

export const palette = {
  // --- Primary ---
  primary: '#3525cd',
  onPrimary: '#ffffff',
  primaryContainer: '#4f46e5',
  onPrimaryContainer: '#dad7ff',
  inversePrimary: '#c3c0ff',
  primaryFixed: '#e2dfff',
  primaryFixedDim: '#c3c0ff',
  onPrimaryFixed: '#0f0069',
  onPrimaryFixedVariant: '#3323cc',

  // --- Secondary (used by Stitch to mean PRESENT / success) ---
  secondary: '#006c49',
  onSecondary: '#ffffff',
  secondaryContainer: '#6cf8bb',
  onSecondaryContainer: '#00714d',
  secondaryFixed: '#6ffbbe',
  secondaryFixedDim: '#4edea3',
  onSecondaryFixed: '#002113',
  onSecondaryFixedVariant: '#005236',

  // --- Tertiary (used by Stitch to mean REVIEW / needs attention) ---
  tertiary: '#684000',
  onTertiary: '#ffffff',
  tertiaryContainer: '#885500',
  onTertiaryContainer: '#ffd4a4',
  tertiaryFixed: '#ffddb8',
  tertiaryFixedDim: '#ffb95f',
  onTertiaryFixed: '#2a1700',
  onTertiaryFixedVariant: '#653e00',

  // --- Error (used by Stitch to mean ABSENT) ---
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  // --- Surfaces ---
  background: '#fcf8ff',
  onBackground: '#1b1b24',
  surface: '#fcf8ff',
  onSurface: '#1b1b24',
  onSurfaceVariant: '#464555',
  surfaceVariant: '#e4e1ee',
  surfaceBright: '#fcf8ff',
  surfaceDim: '#dcd8e5',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f5f2ff',
  surfaceContainer: '#f0ecf9',
  surfaceContainerHigh: '#eae6f4',
  surfaceContainerHighest: '#e4e1ee',
  surfaceTint: '#4d44e3',
  inverseSurface: '#302f39',
  inverseOnSurface: '#f3effc',

  // --- Outlines ---
  outline: '#777587',
  outlineVariant: '#c7c4d8',
} as const;

export type PaletteKey = keyof typeof palette;

/**
 * Attendance status colours.
 *
 * Stitch defines PRESENT / ABSENT / REVIEW explicitly in the Attendance Results
 * screen. UNKNOWN does not exist anywhere in the Stitch design, so it is an
 * extension: deliberately neutral (outline-based) so it reads as "no information"
 * rather than as a confirmed absence, which would be a meaningful mis-signal.
 */
export const statusColors = {
  PRESENT: {
    accent: palette.secondary,
    surface: palette.surfaceContainerLow,
    onSurface: palette.onSurface,
    border: palette.outlineVariant,
    container: palette.secondaryContainer,
    onContainer: palette.onSecondaryContainer,
  },
  ABSENT: {
    accent: palette.error,
    surface: palette.surfaceContainerLow,
    onSurface: palette.onSurface,
    border: palette.outlineVariant,
    container: palette.errorContainer,
    onContainer: palette.onErrorContainer,
  },
  REVIEW: {
    accent: palette.tertiary,
    surface: palette.tertiaryFixed,
    onSurface: palette.onTertiaryFixedVariant,
    border: palette.tertiaryFixedDim,
    container: palette.tertiaryContainer,
    onContainer: palette.onTertiaryContainer,
  },
  UNKNOWN: {
    accent: palette.outline,
    surface: palette.surfaceContainer,
    onSurface: palette.onSurfaceVariant,
    border: palette.outlineVariant,
    container: palette.surfaceContainerHigh,
    onContainer: palette.onSurfaceVariant,
  },
} as const;

/**
 * Stitch's exported HTML leaks a handful of raw Tailwind `slate-*` values
 * (#F8FAFC, #E2E8F0, #F1F5F9) as page and table-header backgrounds, outside its own
 * token set. Rather than port that inconsistency, those roles are mapped onto the
 * nearest real token. Recorded here so the mapping is auditable.
 */
export const stitchSlateMapping = {
  '#F8FAFC': 'surfaceContainerLow',
  '#E2E8F0': 'outlineVariant',
  '#F1F5F9': 'surfaceContainer',
} as const;
