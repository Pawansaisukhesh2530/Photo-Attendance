import type { FacultyService } from '@/services/contracts';
import type { Faculty, Paginated } from '@/types';

import { request } from './client';

/**
 * HTTP implementation of the faculty directory.
 *
 * Speculative, like every other file in this directory: these paths are the frontend's proposal to
 * the backend developer, not an agreed API. Nothing calls them while `USE_MOCK_API` is true.
 */
export const facultyApi: FacultyService = {
  getFacultyList: (query) =>
    request<Paginated<Faculty>>('faculty', {
      query: {
        search: query?.search,
        department: query?.department,
        status: query?.status,
        classId: query?.classId,
        page: query?.page,
        pageSize: query?.pageSize,
      },
    }),

  getFacultyMember: (facultyId) => request<Faculty>(`faculty/${facultyId}`),

  createFaculty: (payload) =>
    request<Faculty>('faculty', { method: 'POST', body: payload }),

  updateFaculty: (payload) =>
    request<Faculty>(`faculty/${payload.facultyId}`, { method: 'PATCH', body: payload }),

  setFacultyStatus: (facultyId, status) =>
    request<Faculty>(`faculty/${facultyId}/status`, {
      method: 'PATCH',
      body: { status },
    }),
};
