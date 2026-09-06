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
  primary: '#a99cff',
  onPrimary: '#ffffff',
  primaryContainer: '#6858f5',
  onPrimaryContainer: '#f2efff',
  inversePrimary: '#c3c0ff',
  primaryFixed: '#30275f',
  primaryFixedDim: '#7568c8',
  onPrimaryFixed: '#f4f1ff',
  onPrimaryFixedVariant: '#d8d2ff',

  // --- Secondary (used by Stitch to mean PRESENT / success) ---
  secondary: '#50e3ae',
  onSecondary: '#ffffff',
  secondaryContainer: 'rgba(35,211,154,0.22)',
  onSecondaryContainer: '#8fffd5',
  secondaryFixed: '#6ffbbe',
  secondaryFixedDim: '#4edea3',
  onSecondaryFixed: '#002113',
  onSecondaryFixedVariant: '#005236',

  // --- Tertiary (used by Stitch to mean REVIEW / needs attention) ---
  tertiary: '#ffc56f',
  onTertiary: '#ffffff',
  tertiaryContainer: 'rgba(255,176,73,0.24)',
  onTertiaryContainer: '#ffe2b8',
  tertiaryFixed: 'rgba(255,188,94,0.18)',
  tertiaryFixedDim: '#ffb95f',
  onTertiaryFixed: '#fff1dc',
  onTertiaryFixedVariant: '#ffd79b',

  // --- Error (used by Stitch to mean ABSENT) ---
  error: '#ff7b82',
  onError: '#ffffff',
  errorContainer: 'rgba(255,91,101,0.20)',
  onErrorContainer: '#ffdadd',

  // --- Surfaces ---
  background: '#070914',
  onBackground: '#f4f5ff',
  surface: 'rgba(20,24,43,0.62)',
  onSurface: '#f5f6ff',
  onSurfaceVariant: '#c4c8dd',
  surfaceVariant: 'rgba(47,52,78,0.70)',
  surfaceBright: 'rgba(49,55,84,0.74)',
  surfaceDim: 'rgba(7,10,22,0.82)',
  surfaceContainerLowest: 'rgba(17,21,39,0.56)',
  surfaceContainerLow: 'rgba(15,19,36,0.42)',
  surfaceContainer: 'rgba(29,34,57,0.54)',
  surfaceContainerHigh: 'rgba(39,44,70,0.66)',
  surfaceContainerHighest: 'rgba(52,57,86,0.76)',
  surfaceTint: '#4d44e3',
  inverseSurface: '#f1efff',
  inverseOnSurface: '#17182a',

  // --- Outlines ---
  outline: '#8d92ac',
  outlineVariant: 'rgba(210,216,255,0.22)',
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
