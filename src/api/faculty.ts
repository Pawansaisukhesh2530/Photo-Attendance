import type { FacultyService } from '@/services/contracts';
import type { Faculty, Paginated } from '@/types';
import { request } from './client';
type WithVersion=Faculty&{version:number};
export const facultyApi:FacultyService={
 getFacultyList:q=>request<Paginated<Faculty>>('faculty',{query:{search:q?.search,schoolId:q?.schoolId,department:q?.department,departmentId:q?.departmentId,status:q?.status,classId:q?.classId,assignedOnly:q?.assignedOnly,page:q?.page,page_size:q?.pageSize}}),
 getFacultyMember:id=>request<Faculty>(`faculty/${id}`),
 createFaculty:p=>request<Faculty>('faculty',{method:'POST',body:{email:p.email,employee_id:p.employeeId,name:p.name,department:p.department,department_id:p.departmentId,designation:p.designation}}),
 async updateFaculty(p){const old=await request<WithVersion>(`faculty/${p.facultyId}`);return request<Faculty>(`faculty/${p.facultyId}`,{method:'PATCH',body:{name:p.name,email:p.email,department:p.department,department_id:p.departmentId,designation:p.designation,status:p.status,version:old.version}})},
 async setFacultyStatus(id,status){const old=await request<WithVersion>(`faculty/${id}`);return request<Faculty>(`faculty/${id}/status`,{method:'PATCH',body:{status,version:old.version}})},
};
