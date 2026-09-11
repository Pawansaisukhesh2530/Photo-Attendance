/** Live service bindings. All application data comes from the backend API. */

import { attendanceApi } from '@/api/attendance';
import { auditApi } from '@/api/audit';
import { authApi } from '@/api/auth';
import { classesApi } from '@/api/classes';
import { facultyApi } from '@/api/faculty';
import { reportsApi } from '@/api/reports';
import { settingsApi } from '@/api/settings';
import { studentsApi } from '@/api/students';
import { timetableApi } from '@/api/timetable';

import type {
  AttendanceService,
  AuditService,
  AuthService,
  ClassService,
  FacultyService,
  ReportService,
  SettingsService,
  StudentService,
  TimetableService,
} from './contracts';

export const authService: AuthService = authApi;
export const classService: ClassService = classesApi;
export const studentService: StudentService = studentsApi;
export const attendanceService: AttendanceService = attendanceApi;
export const reportService: ReportService = reportsApi;
export const auditService: AuditService = auditApi;
export const facultyService: FacultyService = facultyApi;
export const settingsService: SettingsService = settingsApi;
export const timetableService: TimetableService = timetableApi;

export type {
  AttendanceService,
  AuditService,
  AuthService,
  ClassService,
  FacultyService,
  ReportService,
  SettingsService,
  StudentService,
  TimetableService,
} from './contracts';
