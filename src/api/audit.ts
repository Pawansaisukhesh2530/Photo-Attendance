import type { AuditService } from '@/services/contracts';
import type { AuditEntry, AuditQuery, Paginated } from '@/types';

import { request } from './client';

function auditFilters(query?: AuditQuery) {
  return {
    sessionId: query?.sessionId,
    studentId: query?.studentId,
    actorId: query?.actorId,
    action: query?.action,
    entityType: query?.entityType,
    from: query?.from,
    to: query?.to,
    search: query?.search,
  };
}

export const auditApi: AuditService = {
  getAuditEntries: (query) =>
    request<AuditEntry[]>('audit', { query: auditFilters(query) }),

  getPagedAuditEntries: (query) =>
    request<Paginated<AuditEntry>>('audit/paged', {
      query: { ...auditFilters(query), page: query?.page, pageSize: query?.pageSize },
    }),
};
