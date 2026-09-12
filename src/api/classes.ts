import type { ClassService } from '@/services/contracts';
import type { CourseClass, TodayClass } from '@/types';
import { request } from './client';

type Raw={id:string;code:string;variant:string;subject:string;department:string;semester:number;section:string;academic_session:string;schoolId?:string|null;departmentId?:string|null;programId?:string|null;batchId?:string|null;programSubjectId?:string|null;sectionId?:string|null;archived:boolean;version:number;faculty_id?:string|null;faculty_name?:string|null;student_count?:number;attendance_percentage?:number;schedule?:{day_of_week:number;day_label:string;start_time:string;end_time:string;room:string|null}[];activity?:{id:string;action:string;createdAt:string;reason:string|null}[]};
type RawPage={items:Raw[];page:number;page_size:number;total:number;has_more:boolean};
const map=(x:Raw):CourseClass=>({id:x.id,subject:x.subject,classCode:x.code,variant:x.variant||'Lecture',section:x.section,displayCode:x.code,className:`${x.code} ${x.variant||'Lecture'}`,semester:x.semester,academicSession:x.academic_session,facultyId:x.faculty_id??'',facultyName:x.faculty_name??'Unassigned',studentCount:x.student_count??0,attendancePercentage:x.attendance_percentage??0,schedule:(x.schedule??[]).map(s=>({dayOfWeek:s.day_of_week,startTime:s.start_time,endTime:s.end_time,room:s.room??''})),department:x.department,schoolId:x.schoolId??undefined,departmentId:x.departmentId??undefined,programId:x.programId??undefined,batchId:x.batchId??undefined,programSubjectId:x.programSubjectId,sectionId:x.sectionId,status:x.archived?'ARCHIVED':'ACTIVE',activity:x.activity});
async function rawPage(query:any={}){return request<RawPage>('classes',{query:{search:query.search,facultyId:query.facultyId,semester:query.semester,department:query.department,schoolId:query.schoolId,departmentId:query.departmentId,programId:query.programId,batchId:query.batchId,programSubjectId:query.programSubjectId,sectionId:query.sectionId,status:query.status,unassignedOnly:query.unassignedOnly,unscheduledOnly:query.unscheduledOnly,emptyRosterOnly:query.emptyRosterOnly,page:query.page,page_size:query.pageSize}})}
async function getRaw(id:string){return request<Raw>(`classes/${id}`)}
export const classesApi:ClassService={
 async getClasses(query){return (await rawPage({...query,pageSize:100})).items.map(map)},
 async getPagedClasses(query){const p=await rawPage(query);return {items:p.items.map(map),page:p.page,pageSize:p.page_size,total:p.total,hasMore:p.has_more}},
 async getClass(id){return map(await getRaw(id))},
 async getTodayClasses(){
  const all=await classesApi.getClasses();
  const today=new Date().toISOString().slice(0,10);
  return all.map(c=>({...c,date:today,startTime:c.schedule[0]?.startTime??'09:00',endTime:c.schedule[0]?.endTime??'10:00',room:c.schedule[0]?.room??'',attendanceState:'PENDING',sessionId:null,presentCount:null,lastCapturedAt:null}) as TodayClass);
 },
 createClass:async p=>map(await request<Raw>('classes',{method:'POST',body:{code:p.classCode,variant:p.variant??'Lecture',subject:p.subject,department:p.department,semester:p.semester,section:p.section,academic_session:p.academicSession,program_subject_id:p.programSubjectId,section_id:p.sectionId}})),
 async updateClass(p){const old=await getRaw(p.classId);return map(await request<Raw>(`classes/${p.classId}`,{method:'PATCH',body:{subject:p.subject,variant:p.variant,department:p.department,semester:p.semester,section:p.section,academic_session:p.academicSession,program_subject_id:p.programSubjectId,section_id:p.sectionId,archived:p.status==='ARCHIVED'?true:p.status==='ACTIVE'?false:undefined,version:old.version}}))},
 async assignFaculty(p){const old=await getRaw(p.classId);if(p.facultyId)await request(`classes/${p.classId}/faculty`,{method:'PUT',body:{faculty_id:p.facultyId}});else if(old.faculty_id)await request(`classes/${p.classId}/faculty/${old.faculty_id}`,{method:'DELETE'});return classesApi.getClass(p.classId)},
 async updateEnrolment(p){await request(`classes/${p.classId}/enrolments`,{method:'PATCH',body:{add_student_ids:p.addStudentIds??[],remove_student_ids:p.removeStudentIds??[]}});return classesApi.getClass(p.classId)},
};
