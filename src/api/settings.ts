import type { SettingsService } from '@/services/contracts';
import type { InstitutionSettings, UpdateSettingsRequest } from '@/types';
import { request } from './client';
type Raw={institution_name:string;attendance_threshold:number;image_retention_days:number;version:number;updated_at?:string|null};
const map=(r:Raw):InstitutionSettings=>({institutionName:r.institution_name,institutionCode:'EDU',attendanceThreshold:r.attendance_threshold,academicSession:`${new Date().getFullYear()}-${String(new Date().getFullYear()+1).slice(-2)}`,departments:[],semesterCount:8,allowPostFinalizationEdits:true,updatedAt:r.updated_at??null,updatedBy:null,updatedByName:null});
const body=(p:UpdateSettingsRequest,version:number)=>({institution_name:p.institutionName,attendance_threshold:p.attendanceThreshold,version});
export const settingsApi:SettingsService={
 async getInstitutionSettings(){return map(await request<Raw>('settings/institution'))},
 async updateInstitutionSettings(p){const current=await request<Raw>('settings/institution');return map(await request<Raw>('settings/institution',{method:'PATCH',body:body(p,current.version)}))},
};
