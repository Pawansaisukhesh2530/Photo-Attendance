import type { ReportService } from '@/services/contracts';
import type { AttendanceReport, Paginated, StudentAttendanceStat } from '@/types';

import { request } from './client';

export const reportsApi: ReportService = {
  getReport: (query) =>
    request<AttendanceReport>('reports/attendance', {
      query: {
        classId: query?.classId,
        facultyId: query?.facultyId,
        from: query?.from,
        to: query?.to,
      },
    }),

  getStudentStats: (query) =>
    request<Paginated<StudentAttendanceStat>>('reports/attendance/students', {
      query: {
        classId: query?.classId,
        facultyId: query?.facultyId,
        from: query?.from,
        to: query?.to,
        lowAttendanceOnly: query?.lowAttendanceOnly,
        // Omitted when undefined by `request`, so the server applies its own defaults.
        page: query?.page,
        pageSize: query?.pageSize,
      },
    }),
};
