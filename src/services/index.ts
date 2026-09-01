/**
 * The mock/real swap point.
 *
 * This is the only file that knows both implementations exist. Hooks and components
 * import from here and receive an object typed purely by the service interfaces, so
 * they cannot tell which implementation they got — and cannot come to depend on
 * mock-specific behaviour.
 *
 * To go live: set EXPO_PUBLIC_USE_MOCK_API=false and EXPO_PUBLIC_API_BASE_URL.
 * No other file needs to change.
 */

import { attendanceApi } from '@/api/attendance';
import { auditApi } from '@/api/audit';
import { authApi } from '@/api/auth';
import { classesApi } from '@/api/classes';
import { facultyApi } from '@/api/faculty';
import { reportsApi } from '@/api/reports';
import { settingsApi } from '@/api/settings';
import { studentsApi } from '@/api/students';
import { USE_MOCK_API } from '@/constants/config';
import {
  mockAttendanceService,
  mockAuditService,
  mockAuthService,
  mockClassService,
  mockFacultyService,
  mockReportService,
  mockSettingsService,
  mockStudentService,
} from '@/mocks/services';

import type {
  AttendanceService,
  AuditService,
  AuthService,
  ClassService,
  FacultyService,
  ReportService,
  SettingsService,
  StudentService,
} from './contracts';

export const authService: AuthService = USE_MOCK_API ? mockAuthService : authApi;
export const classService: ClassService = USE_MOCK_API ? mockClassService : classesApi;
export const studentService: StudentService = USE_MOCK_API ? mockStudentService : studentsApi;
export const attendanceService: AttendanceService = USE_MOCK_API
  ? mockAttendanceService
  : attendanceApi;
export const reportService: ReportService = USE_MOCK_API ? mockReportService : reportsApi;
export const auditService: AuditService = USE_MOCK_API ? mockAuditService : auditApi;
export const facultyService: FacultyService = USE_MOCK_API ? mockFacultyService : facultyApi;
export const settingsService: SettingsService = USE_MOCK_API ? mockSettingsService : settingsApi;

export type {
  AttendanceService,
  AuditService,
  AuthService,
  ClassService,
  FacultyService,
  ReportService,
  SettingsService,
  StudentService,
} from './contracts';
