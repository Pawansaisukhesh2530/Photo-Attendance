import type { FacultyService } from '@/services/contracts';
import type { Faculty, Paginated } from '@/types';
import { request } from './client';
type WithVersion=Faculty&{version:number};
export const facultyApi:FacultyService={
 getFacultyList:q=>request<Paginated<Faculty>>('faculty',{query:{search:q?.search,department:q?.department,status:q?.status,classId:q?.classId,page:q?.page,page_size:q?.pageSize}}),
 getFacultyMember:id=>request<Faculty>(`faculty/${id}`),
 createFaculty:p=>request<Faculty>('faculty',{method:'POST',body:{email:p.email,password:'ChangeMe123!',employee_id:p.employeeId,name:p.name,department:p.department,designation:p.designation}}),
 async updateFaculty(p){const old=await request<WithVersion>(`faculty/${p.facultyId}`);return request<Faculty>(`faculty/${p.facultyId}`,{method:'PATCH',body:{name:p.name,department:p.department,designation:p.designation,status:p.status,version:old.version}})},
 setFacultyStatus:(id,status)=>request<Faculty>(`faculty/${id}/status`,{method:'PATCH',body:{status}}),
};
