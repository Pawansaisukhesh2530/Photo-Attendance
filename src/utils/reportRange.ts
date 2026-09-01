import type { IsoDate } from '@/types';

/**
 * Preset reporting windows for the Reports screens.
 *
 * ============================================================================
 * These presets only ever produce a `from`/`to` pair that is handed to the existing
 * `ReportQuery`. They add no backend date semantics: the service already filters sessions by
 * `session.date` with inclusive bounds (`date >= from` and `date <= to`, compared as `YYYY-MM-DD`
 * strings), and omitting both bounds means "all available data". This module only chooses the two
 * dates; the meaning of those dates is entirely the service's.
 *
 * Free-form calendar selection is deliberately absent — it would need a date-picker dependency,
 * which is out of scope for this phase. Presets cover the windows an administrator or lecturer
 * actually asks for without adding one.
 * ============================================================================
 */

export type ReportRangeKey = 'all' | '7d' | '30d' | 'term';

/** The default window: no date filter, i.e. every recorded session. Matches pre-phase behaviour. */
export const DEFAULT_REPORT_RANGE: ReportRangeKey = 'all';

/**
 * Chip options, in the order the user approved: narrowest first, "All" last.
 *
 * Typed structurally so this stays a pure util with no dependency on the component layer; the
 * shape is assignable to `FilterChipOption<ReportRangeKey>`.
 */
export const REPORT_RANGE_OPTIONS: readonly { value: ReportRangeKey; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'term', label: 'This term' },
  { value: 'all', label: 'All time' },
];

const RANGE_KEYS: readonly ReportRangeKey[] = ['all', '7d', '30d', 'term'];

/** Narrows an untrusted URL param to a known range key, falling back to the default. */
export function isReportRangeKey(value: unknown): value is ReportRangeKey {
  return typeof value === 'string' && (RANGE_KEYS as readonly string[]).includes(value);
}

export function toReportRangeKey(value: unknown): ReportRangeKey {
  return isReportRangeKey(value) ? value : DEFAULT_REPORT_RANGE;
}

/**
 * A local `YYYY-MM-DD`, built from the date's own calendar fields rather than `toISOString`.
 *
 * `toISOString` is UTC, which can roll the day forward or back near midnight and would make
 * "today" disagree with the wall clock the user is reading. Session dates are plain calendar days,
 * so the window boundaries are computed as calendar days too.
 */
function toIsoDate(date: Date): IsoDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `date` shifted by `days`, without mutating the input. */
function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Start of the current academic term, by a documented client convention.
 *
 * There is no term-boundary field on the settings contract, so a convention is chosen here rather
 * than invented on the backend: terms begin on 1 January and 1 July. From July onward the odd/first
 * term is current; before July the even/second term of the academic year is current. This only
 * decides which `from` date the preset sends; the service treats it as any other date bound.
 */
function termStart(now: Date): Date {
  const july = 6; // zero-based month index
  const startMonth = now.getMonth() >= july ? july : 0;
  return new Date(now.getFullYear(), startMonth, 1);
}

/**
 * Resolves a preset to the `from`/`to` bounds the report query expects.
 *
 * `all` returns an empty object so both bounds stay absent — the caller must not send empty
 * strings, which would filter to sessions dated `''`. `7d` and `30d` are inclusive windows ending
 * today (7 and 30 calendar days respectively, today counted). `term` runs from the term start to
 * today. Every window guarantees `from <= to`.
 *
 * `now` is injectable so the result is deterministic under test; in the app it defaults to the
 * current date, and two calls on the same calendar day yield identical bounds.
 */
export function resolveReportRange(
  key: ReportRangeKey,
  now: Date = new Date(),
): { from?: IsoDate; to?: IsoDate } {
  if (key === 'all') return {};

  const to = toIsoDate(now);

  if (key === '7d') return { from: toIsoDate(addDays(now, -6)), to };
  if (key === '30d') return { from: toIsoDate(addDays(now, -29)), to };
  return { from: toIsoDate(termStart(now)), to };
}
