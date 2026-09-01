import type { ClassService } from '@/services/contracts';
import type { CourseClass, Paginated, TodayClass } from '@/types';

import { request } from './client';

/** Query fields shared by the paged and unpaged class endpoints. */
function classFilters(query?: Parameters<ClassService['getClasses']>[0]) {
  return {
    facultyId: query?.facultyId,
    semester: query?.semester,
    search: query?.search,
    department: query?.department,
    status: query?.status,
    unassignedOnly: query?.unassignedOnly,
  };
}

export const classesApi: ClassService = {
  getClasses: (query) =>
    request<CourseClass[]>('classes', { query: classFilters(query) }),

  // Same resource, paged. A separate path rather than a flag so a cache or CDN can treat the two
  // response shapes as genuinely different documents.
  getPagedClasses: (query) =>
    request<Paginated<CourseClass>>('classes/paged', {
      query: { ...classFilters(query), page: query?.page, pageSize: query?.pageSize },
    }),

  getClass: (classId) => request<CourseClass>(`classes/${classId}`),

  getTodayClasses: (facultyId) =>
    request<TodayClass[]>('classes/today', { query: { facultyId } }),

  createClass: (payload) =>
    request<CourseClass>('classes', { method: 'POST', body: payload }),

  updateClass: (payload) =>
    request<CourseClass>(`classes/${payload.classId}`, { method: 'PATCH', body: payload }),

  assignFaculty: (payload) =>
    request<CourseClass>(`classes/${payload.classId}/faculty`, {
      method: 'PUT',
      body: { facultyId: payload.facultyId },
    }),

  updateEnrolment: (payload) =>
    request<CourseClass>(`classes/${payload.classId}/enrolment`, {
      method: 'PATCH',
      body: {
        addStudentIds: payload.addStudentIds,
        removeStudentIds: payload.removeStudentIds,
      },
    }),
};
