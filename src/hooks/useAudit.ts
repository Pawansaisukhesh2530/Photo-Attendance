import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { DEFAULT_PAGE_SIZE } from '@/constants/config';
import { auditService } from '@/services';
import { queryKeys } from '@/store/queryClient';
import type { AuditEntry, AuditQuery, Paginated } from '@/types';

/**
 * Audit entries for a session or student.
 *
 * Read-only by design. The frontend never writes audit records — the backend owns the
 * persisted history, and this hook exists so the UI can display what the server reports.
 *
 * `staleTime` is zero because an amendment made moments ago must appear immediately; the
 * mutations in `useAttendance` invalidate this key on every change.
 */
export function useAuditEntries(query?: AuditQuery): UseQueryResult<AuditEntry[]> {
  return useQuery({
    // Keyed on the whole query. Passing only `sessionId` meant a change of actor or action filter
    // served the previous filter's entries from cache.
    queryKey: queryKeys.audit.list(query),
    queryFn: () => auditService.getAuditEntries(query),
    staleTime: 0,
  });
}

export type InfiniteAuditEntries = UseInfiniteQueryResult<InfiniteData<Paginated<AuditEntry>>>;

/**
 * The institution-wide audit log, paged. Admin only.
 *
 * `page`/`pageSize` are stripped from the caller's query and re-supplied per request: the cursor
 * belongs to TanStack. Changing any filter produces a different key, so paging restarts at page 1
 * without an explicit reset while the previous filter's pages stay cached.
 */
export function useInfiniteAuditEntries(query?: AuditQuery): InfiniteAuditEntries {
  const { page: _page, pageSize, ...filters } = query ?? {};
  const size = pageSize ?? DEFAULT_PAGE_SIZE;

  return useInfiniteQuery({
    queryKey: queryKeys.audit.paged({ ...filters, pageSize: size }),
    queryFn: ({ pageParam }) =>
      auditService.getPagedAuditEntries({ ...filters, page: pageParam, pageSize: size }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: 0,
  });
}
