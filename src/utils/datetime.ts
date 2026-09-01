/**
 * Date and time formatting.
 *
 * Uses `Intl` via `toLocaleDateString`, which is available on Hermes with the
 * `intl` variant that Expo ships by default. Kept in one place so the dashboard,
 * history list and audit timeline all render dates identically.
 */

/** "Thursday, 27 August 2026" — the Stitch dashboard date line. */
export function formatLongDate(date: Date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "27 Aug 2026" — compact form for cards and list rows. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * "27 Aug" — day and month only, for chart axis labels.
 *
 * The year is dropped because an axis has room for four labels at phone width and a report never
 * spans a year boundary in practice; the full dates are stated in the chart's textual readout.
 */
export function formatAxisDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/** "09:15 AM" from an ISO timestamp. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "09:00 AM" from a bare "HH:mm" schedule string. */
export function formatScheduleTime(hhmm: string): string {
  const [hourPart, minutePart] = hhmm.split(':');
  const hour = Number(hourPart ?? '0');
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minutePart ?? '00'} ${meridiem}`;
}

/**
 * "Today" / "Yesterday" / "24 Aug" — used by the history list, matching the relative
 * labels in the Stitch Recent Activity panel.
 */
export function formatRelativeDay(iso: string): string {
  const target = new Date(iso);
  const now = new Date();

  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const dayDiff = Math.round((startOfDay(now) - startOfDay(target)) / 86_400_000);

  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return `${dayDiff} days ago`;

  return target.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Morning / Afternoon / Evening, for the dashboard greeting. */
export function greetingForNow(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
