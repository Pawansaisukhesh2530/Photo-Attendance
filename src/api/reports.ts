import type { ReportService } from '@/services/contracts';
import type { AttendanceReport, Paginated, StudentAttendanceStat } from '@/types';
import { request } from './client';
type RawSummary={counts:Record<string,number>;attendance_percentage:number;review_and_unknown_excluded:boolean};
const today=()=>new Date().toISOString().slice(0,10);
export const reportsApi:ReportService={
 async getReport(query){const raw=await request<RawSummary>('reports/attendance',{query:{class_id:query?.classId,faculty_id:query?.facultyId,from:query?.from,to:query?.to}});const stats=await request<Paginated<StudentAttendanceStat>&{threshold:number}>('reports/attendance/students',{query:{classId:query?.classId,facultyId:query?.facultyId,from:query?.from,to:query?.to,lowAttendanceOnly:true,page:1,page_size:5}});const directory=await request<{total:number}>('students',{query:{classId:query?.classId,page:1,page_size:1}});return {scope:query?.classId?'CLASS':query?.facultyId?'FACULTY':'INSTITUTION',scopeId:query?.classId??query?.facultyId??null,from:query?.from??today(),to:query?.to??today(),overallPercentage:raw.attendance_percentage,totalSessions:0,studentCount:directory.total,trend:[],byClass:[],byFaculty:[],lowAttendanceStudents:stats.items,lowAttendanceCount:stats.total,threshold:stats.threshold??75} as AttendanceReport},
 getStudentStats:(query)=>request<Paginated<StudentAttendanceStat>&{threshold?:number}>('reports/attendance/students',{query:{classId:query?.classId,facultyId:query?.facultyId,from:query?.from,to:query?.to,lowAttendanceOnly:query?.lowAttendanceOnly,page:query?.page,page_size:query?.pageSize}}),
};
