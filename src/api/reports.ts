import type { ReportService } from '@/services/contracts';
import type { AttendanceReport, Paginated, StudentAttendanceStat } from '@/types';
import { request } from './client';
export const reportsApi:ReportService={
 getReport:(query)=>request<AttendanceReport>('reports/attendance',{query:{classId:query?.classId,facultyId:query?.facultyId,from:query?.from,to:query?.to,department:query?.department,institutionWide:query?.institutionWide}}),
 getStudentStats:(query)=>request<Paginated<StudentAttendanceStat>&{threshold?:number}>('reports/attendance/students',{query:{classId:query?.classId,facultyId:query?.facultyId,from:query?.from,to:query?.to,department:query?.department,institutionWide:query?.institutionWide,search:query?.search,lowAttendanceOnly:query?.lowAttendanceOnly,page:query?.page,page_size:query?.pageSize}}),
};
