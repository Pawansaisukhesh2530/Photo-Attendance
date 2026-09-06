import type { SettingsService } from '@/services/contracts';
import type { InstitutionSettings, UpdateSettingsRequest } from '@/types';
import { request } from './client';
type Raw={institution_name:string;institution_code?:string;attendance_threshold:number;image_retention_days:number;departments?:string[];faculty_roles?:string[];version:number;updated_at?:string|null};
const map=(r:Raw):InstitutionSettings=>({institutionName:r.institution_name,institutionCode:r.institution_code??'EDU',attendanceThreshold:r.attendance_threshold,academicSession:`${new Date().getFullYear()}-${String(new Date().getFullYear()+1).slice(-2)}`,departments:r.departments??['CSE'],facultyRoles:r.faculty_roles??['Assistant Professor'],semesterCount:8,allowPostFinalizationEdits:true,updatedAt:r.updated_at??null,updatedBy:null,updatedByName:null});
const body=(p:UpdateSettingsRequest,version:number)=>({institution_name:p.institutionName,institution_code:p.institutionCode,attendance_threshold:p.attendanceThreshold,departments:p.departments,faculty_roles:p.facultyRoles,version});
export const settingsApi:SettingsService={
 async getInstitutionSettings(){return map(await request<Raw>('settings/institution'))},
 async updateInstitutionSettings(p){const current=await request<Raw>('settings/institution');return map(await request<Raw>('settings/institution',{method:'PATCH',body:body(p,current.version)}))},
};
