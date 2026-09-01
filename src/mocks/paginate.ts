import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/constants/config';
import type { PageRequest, Paginated } from '@/types';

/**
 * Applies paging to an already-filtered list.
 *
 * One implementation for every paged mock endpoint. Written once because the invariants are easy
 * to get subtly wrong and they matter: `total` must describe the filtered set, `hasMore` must be
 * derived from the window actually returned rather than from `total > pageSize`, and both
 * parameters must be clamped so a bad value narrows the result instead of producing a negative
 * slice or defeating paging entirely.
 *
 * Callers MUST filter before calling this. Paging before filtering is the classic paged-endpoint
 * bug: the list reports the unfiltered total and then requests pages the query cannot produce.
 */
export function paginate<T>(rows: T[], request?: PageRequest): Paginated<T> {
  const pageSize = Math.min(
    Math.max(1, Math.floor(request?.pageSize ?? DEFAULT_PAGE_SIZE)),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(1, Math.floor(request?.page ?? 1));
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);

  return {
    items,
    page,
    pageSize,
    total: rows.length,
    hasMore: start + items.length < rows.length,
  };
}

/** Case-insensitive "does any of these fields contain the needle". */
export function matchesText(needle: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  if (!needle) return true;
  const n = needle.trim().toLowerCase();
  if (n.length === 0) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(n));
}
