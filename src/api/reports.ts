import type { ReportService } from '@/services/contracts';
import type { AttendanceReport, Paginated, StudentAttendanceStat } from '@/types';
import { downloadFile, request } from './client';

const reportQuery = (query?: Parameters<ReportService['getStudentStats']>[0]) => ({
 classId:query?.classId,facultyId:query?.facultyId,from:query?.from,to:query?.to,department:query?.department,
 schoolId:query?.schoolId,departmentId:query?.departmentId,programId:query?.programId,batchId:query?.batchId,
 sectionId:query?.sectionId,subjectId:query?.subjectId,institutionWide:query?.institutionWide,search:query?.search,
 lowAttendanceOnly:query?.lowAttendanceOnly,
});

export const reportsApi:ReportService={
 getReport:(query)=>request<AttendanceReport>('reports/attendance',{query:{classId:query?.classId,facultyId:query?.facultyId,from:query?.from,to:query?.to,department:query?.department,schoolId:query?.schoolId,departmentId:query?.departmentId,programId:query?.programId,batchId:query?.batchId,sectionId:query?.sectionId,subjectId:query?.subjectId,institutionWide:query?.institutionWide}}),
 getStudentStats:(query)=>request<Paginated<StudentAttendanceStat>&{threshold?:number}>('reports/attendance/students',{query:{classId:query?.classId,facultyId:query?.facultyId,from:query?.from,to:query?.to,department:query?.department,schoolId:query?.schoolId,departmentId:query?.departmentId,programId:query?.programId,batchId:query?.batchId,sectionId:query?.sectionId,subjectId:query?.subjectId,institutionWide:query?.institutionWide,search:query?.search,lowAttendanceOnly:query?.lowAttendanceOnly,page:query?.page,page_size:query?.pageSize}}),
 downloadReport:(query,format)=>{
  const params=new URLSearchParams({format});
  for(const [key,value] of Object.entries(reportQuery(query))) if(value!==undefined && value!=='') params.set(key,String(value));
  return downloadFile(`reports/attendance/export?${params.toString()}`);
 },
};
