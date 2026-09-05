import type { AttendanceService } from '@/services/contracts';
import type {
  AttendanceSession,
  AttendanceSessionSummary,
  Paginated,
  ProcessingProgress,
  TwinReview,
} from '@/types';
import { API_BASE_URL } from '@/constants/config';
import { downloadFile, request, uploadAttendanceMedia, uploadFiles } from './client';

const POLL_INTERVAL_MS=1200;
type RawRecord={id:string;student_id:string;student_name:string;roll_number:string;class_id:string;ai_status:any;status:any;score:number|null;review_reason:string|null;face_box:any;amended_by:string|null;amended_at:string|null;amendment_reason:string|null};
type RawSession={session:{id:string;faculty_id:string;attendance_date:string;status:string;finalized_at:string|null;capture_mode?:'STANDARD'|'PANORAMA'};class_ids:string[];classes:{id:string;subject:string;display_code:string;student_count:number}[];records:RawRecord[];images:{id:string;width:number;height:number;content_url:string}[];summary:{total:number;present:number;absent:number;review:number;unknown:number;recognized:number;unmatched_faces:number;percentage:number}};

const publicUrl=(path:string)=>new URL(path.replace(/^\//,''),`${API_BASE_URL.replace(/\/api\/v1\/?$/,'')}/`).toString();
const reason=(value:string|null):any=>value?.includes('AMBIGUOUS')?'TWIN_AMBIGUITY':value?.includes('QUALITY')?'POOR_IMAGE_QUALITY':value?'NOT_DETECTED':null;
function mapSession(raw:RawSession):AttendanceSession{
  const primary=raw.classes[0]??{id:raw.class_ids[0]??'',subject:'Class',display_code:'Class',student_count:raw.records.length};
  return {id:raw.session.id,captureMode:raw.session.capture_mode,selectedClassIds:raw.class_ids,classes:raw.classes.map(c=>({id:c.id,subject:c.subject,displayCode:c.display_code,studentCount:c.student_count})),classId:primary.id,className:primary.subject,classDisplayCode:primary.display_code,facultyId:raw.session.faculty_id,date:raw.session.attendance_date,capturedAt:`${raw.session.attendance_date}T00:00:00Z`,finalizedAt:raw.session.finalized_at,status:(raw.session.status==='QUEUED'?'PROCESSING':raw.session.status) as any,photoUri:raw.images[0]?publicUrl(raw.images[0].content_url):null,photoWidth:raw.images[0]?.width??null,photoHeight:raw.images[0]?.height??null,summary:{...raw.summary,unmatchedFaces:raw.summary.unmatched_faces},records:raw.records.map(r=>({id:r.id,studentId:r.student_id,rollNumber:r.roll_number,studentName:r.student_name,avatarUrl:null,classId:r.class_id,status:r.status,aiStatus:r.ai_status,confidence:r.score,reviewRequired:r.status==='REVIEW'||r.status==='UNKNOWN',reviewReason:reason(r.review_reason),faceBox:r.face_box,editedBy:r.amended_by,editedByName:null,editedAt:r.amended_at,editReason:r.amendment_reason})),twinReviews:[],warnings:raw.summary.unmatched_faces?[{code:'UNKNOWN_FACES_PRESENT',message:`${raw.summary.unmatched_faces} detected face(s) did not match this roster.`,severity:'INFO'}]:[]};
}
async function getSession(id:string){return mapSession(await request<RawSession>(`attendance/sessions/${id}`));}
function summary(s:AttendanceSession):AttendanceSessionSummary{return {id:s.id,classId:s.classId,className:s.className,classDisplayCode:s.classDisplayCode,classCount:s.selectedClassIds.length,date:s.date,capturedAt:s.capturedAt,status:s.status,summary:s.summary,hasManualEdits:s.records.some(r=>r.editedAt!==null)}}

export const attendanceApi:AttendanceService={
  preparePanorama: async (payload) => {
    const raw = await uploadAttendanceMedia<{id:string;photo_uri:string;width:number;height:number}>(
      'attendance/panorama/preview',
      payload.sweepUri,
      {fieldName:'sweep',name:'classroom-panorama-sweep.mp4',type:'video/mp4'},
      {captured_at:payload.capturedAt},
    );
    return {id:raw.id,photoUri:publicUrl(raw.photo_uri),width:raw.width,height:raw.height};
  },
  async captureAttendance(payload){
    const created=await request<{id:string}>('attendance/sessions',{method:'POST',body:{class_ids:payload.classIds,capture_mode:payload.captureMode}});
    if(payload.captureMode==='PANORAMA'&&payload.panoramaDraftId){
      await request(`attendance/sessions/${created.id}/panorama`,{method:'POST',body:{draft_id:payload.panoramaDraftId}});
    }else{
      await uploadFiles(`attendance/sessions/${created.id}/images`,payload.photoUris);
    }
    await request(`attendance/sessions/${created.id}/process`,{method:'POST'});
    return getSession(created.id);
  },
  observeProcessing(sessionId,onProgress,onError){let stopped=false;const poll=async()=>{if(stopped)return;try{const raw=await request<{stage:string;progress:number;status:string;error_code?:string}>(`attendance/sessions/${sessionId}/progress`);const stages:Record<string,ProcessingProgress['stage']>={QUEUED:'UPLOADING',MATCHING:'MATCHING_ROSTER',FAILED:'DONE',DONE:'DONE'};onProgress({stage:stages[raw.stage]??'IDENTIFYING_STUDENTS',progress:raw.progress,detail:raw.error_code??null});if(raw.stage!=='DONE'&&raw.stage!=='FAILED')setTimeout(poll,POLL_INTERVAL_MS)}catch(e){onError(e)}};void poll();return()=>{stopped=true}},
  async retryProcessing(id){await request(`attendance/sessions/${id}/retry`,{method:'POST'});return getSession(id)},
  getAttendanceSession:getSession,
  downloadSession:(id,format)=>downloadFile(`attendance/sessions/${id}/export?format=${format}`),
  async updateAttendance({recordId,status,reason}){await request(`attendance/records/${recordId}`,{method:'PATCH',body:{status,reason}});const sessions=await request<{items:{id:string}[]}>('attendance/sessions',{query:{pageSize:100}});for(const s of sessions.items){const full=await getSession(s.id);if(full.records.some(r=>r.id===recordId))return full}throw new Error('Attendance session not found')},
  async resolveTwinReview({reviewId,resolution}){await request(`attendance/twin-reviews/${reviewId}`,{method:'PATCH',query:{resolution}});const sessions=await request<{items:{id:string}[]}>('attendance/sessions',{query:{pageSize:100}});for(const s of sessions.items){const full=await getSession(s.id);if(full.twinReviews.some(r=>r.id===reviewId))return full}throw new Error('Attendance session not found')},
  async getTwinReviews(sessionId){const raw=await request<{items:any[]}>(`attendance/sessions/${sessionId}/twin-reviews`);return raw.items as TwinReview[]},
  async finalizeAttendance({sessionId,acknowledgeUnresolvedReviews}){await request(`attendance/sessions/${sessionId}/finalize`,{method:'POST',body:{acknowledgeUnresolved:acknowledgeUnresolvedReviews??false}});return getSession(sessionId)},
  async getAttendanceHistory(){const raw=await request<{items:{id:string}[]}>('attendance/sessions',{query:{pageSize:100}});return Promise.all(raw.items.map(async x=>summary(await getSession(x.id))))},
  async getPagedAttendanceHistory(query){const all=await attendanceApi.getAttendanceHistory(query);const page=query?.page??1,size=query?.pageSize??25,items=all.slice((page-1)*size,page*size);return {items,page,pageSize:size,total:all.length,hasMore:page*size<all.length} as Paginated<AttendanceSessionSummary>},
};
