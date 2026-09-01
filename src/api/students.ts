import type { StudentService } from '@/services/contracts';
import type { Paginated, Student, StudentProfile } from '@/types';

import { request } from './client';

export const studentsApi: StudentService = {
  getStudents: (query) =>
    request<Paginated<Student>>('students', {
      query: {
        classId: query?.classId,
        search: query?.search,
        department: query?.department,
        semester: query?.semester,
        lowAttendanceOnly: query?.lowAttendanceOnly,
        // Omitted when undefined by `request`, so the server applies its own defaults.
        page: query?.page,
        pageSize: query?.pageSize,
      },
    }),

  getStudent: (studentId) => request<StudentProfile>(`students/${studentId}`),
};
