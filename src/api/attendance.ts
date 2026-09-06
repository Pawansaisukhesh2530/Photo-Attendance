import type { AttendanceService } from '@/services/contracts';
import type {
  AttendanceSession,
  AttendanceSessionSummary,
  Paginated,
  ProcessingProgress,
  TwinReview,
} from '@/types';
import { API_BASE_URL } from '@/constants/config';
import { createApiError, downloadFile, request, uploadFiles } from './client';

const POLL_INTERVAL_MS=1200;
type RawRecord={id:string;student_id:string;student_name:string;roll_number:string;class_id:string;ai_status:any;status:any;score:number|null;review_reason:string|null;face_box:any;amended_by:string|null;amended_at:string|null;amendment_reason:string|null};
type RawEvidence={detection_id:string;image_id:string;normalized_box:{x:number;y:number;width:number;height:number};quality:Record<string,unknown>;match_status:'MATCHED'|'REVIEW'|'UNMATCHED';matched_student_id:string|null};
type RawSession={session:{id:string;faculty_id:string;attendance_date:string;status:string;finalized_at:string|null;capture_mode?:'STANDARD'|'PANORAMA'};class_ids:string[];classes:{id:string;subject:string;display_code:string;student_count:number}[];records:RawRecord[];evidence:RawEvidence[];images:{id:string;width:number;height:number;content_url:string;processing_error:string|null;detected_faces:number}[];summary:{total:number;present:number;absent:number;review:number;unknown:number;recognized:number;detected_faces:number;unmatched_faces:number;percentage:number}};

const publicUrl=(path:string)=>new URL(path.replace(/^\//,''),`${API_BASE_URL.replace(/\/api\/v1\/?$/,'')}/`).toString();
const reason=(value:string|null):any=>value?.includes('AMBIGUOUS')?'TWIN_AMBIGUITY':value?.includes('QUALITY')?'POOR_IMAGE_QUALITY':value?'NOT_DETECTED':null;
function mapSession(raw:RawSession):AttendanceSession{
  const primary=raw.classes[0]??{id:raw.class_ids[0]??'',subject:'Class',display_code:'Class',student_count:raw.records.length};
  const warnings:AttendanceSession['warnings']=[];
  if(raw.images.some(image=>image.processing_error))warnings.push({code:'POOR_IMAGE_QUALITY',message:'The backend could not read one or more uploaded images. Retry processing or upload another photo.',severity:'WARNING'});
  else if(raw.summary.detected_faces===0)warnings.push({code:'NO_FACES_DETECTED',message:'No faces were detected in the uploaded photo.',severity:'WARNING'});
  if(raw.summary.unmatched_faces)warnings.push({code:'UNKNOWN_FACES_PRESENT',message:`${raw.summary.unmatched_faces} of ${raw.summary.detected_faces} detected face(s) did not match this roster.`,severity:'INFO'});
  return {id:raw.session.id,captureMode:raw.session.capture_mode,selectedClassIds:raw.class_ids,classes:raw.classes.map(c=>({id:c.id,subject:c.subject,displayCode:c.display_code,studentCount:c.student_count})),classId:primary.id,className:primary.subject,classDisplayCode:primary.display_code,facultyId:raw.session.faculty_id,date:raw.session.attendance_date,capturedAt:`${raw.session.attendance_date}T00:00:00Z`,finalizedAt:raw.session.finalized_at,status:(raw.session.status==='QUEUED'?'PROCESSING':raw.session.status) as any,photoUri:raw.images[0]?publicUrl(raw.images[0].content_url):null,photoWidth:raw.images[0]?.width??null,photoHeight:raw.images[0]?.height??null,summary:{total:raw.summary.total,present:raw.summary.present,absent:raw.summary.absent,review:raw.summary.review,unknown:raw.summary.unknown,recognized:raw.summary.recognized,detectedFaces:raw.summary.detected_faces,unmatchedFaces:raw.summary.unmatched_faces,percentage:raw.summary.percentage},records:raw.records.map(r=>({id:r.id,studentId:r.student_id,rollNumber:r.roll_number,studentName:r.student_name,avatarUrl:null,classId:r.class_id,status:r.status,aiStatus:r.ai_status,confidence:r.score,reviewRequired:r.status==='REVIEW'||r.status==='UNKNOWN',reviewReason:reason(r.review_reason),faceBox:r.face_box,editedBy:r.amended_by,editedByName:null,editedAt:r.amended_at,editReason:r.amendment_reason})),detections:raw.evidence.map(item=>({id:item.detection_id,imageId:item.image_id,box:item.normalized_box,confidence:Number(item.quality.detection_confidence??0),matchStatus:item.match_status,matchedStudentId:item.matched_student_id})),twinReviews:[],warnings};
}
async function getSession(id:string){const [raw,reviews]=await Promise.all([request<RawSession>(`attendance/sessions/${id}`),request<{items:TwinReview[]}>(`attendance/sessions/${id}/twin-reviews`)]);const session=mapSession(raw);return {...session,twinReviews:reviews.items};}
function summary(s:AttendanceSession):AttendanceSessionSummary{return {id:s.id,classId:s.classId,className:s.className,classDisplayCode:s.classDisplayCode,classCount:s.selectedClassIds.length,date:s.date,capturedAt:s.capturedAt,status:s.status,summary:s.summary,hasManualEdits:s.records.some(r=>r.editedAt!==null)}}

export const attendanceApi:AttendanceService={
  preparePanorama: async (payload) => {
    const raw = await uploadFiles<{id:string;photo_uri:string;width:number;height:number}>(
      'attendance/panorama/frames',
      payload.frameUris,
      'frames',
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
  observeProcessing(sessionId,onProgress,onError){let stopped=false;const poll=async()=>{if(stopped)return;try{const raw=await request<{stage:string;progress:number;status:string;error_code?:string}>(`attendance/sessions/${sessionId}/progress`);if(raw.stage==='FAILED'){onError(createApiError('SERVER',raw.error_code==='NO_USABLE_SESSION_IMAGE'?'The backend could not read the uploaded photo. Upload another image or retry.':'Face processing failed. Retry the upload or use another photo.'));return}const stages:Record<string,ProcessingProgress['stage']>={QUEUED:'UPLOADING',MATCHING:'MATCHING_ROSTER',DONE:'DONE'};onProgress({stage:stages[raw.stage]??'IDENTIFYING_STUDENTS',progress:raw.progress,detail:raw.error_code??null});if(raw.stage!=='DONE')setTimeout(poll,POLL_INTERVAL_MS)}catch(e){onError(e)}};void poll();return()=>{stopped=true}},
  async retryProcessing(id){await request(`attendance/sessions/${id}/retry`,{method:'POST'});return getSession(id)},
  getAttendanceSession:getSession,
  downloadSession:(id,format)=>downloadFile(`attendance/sessions/${id}/export?format=${format}`),
  async updateAttendance({recordId,status,reason}){await request(`attendance/records/${recordId}`,{method:'PATCH',body:{status,reason}});const sessions=await request<{items:{id:string}[]}>('attendance/sessions',{query:{page_size:100}});for(const s of sessions.items){const full=await getSession(s.id);if(full.records.some(r=>r.id===recordId))return full}throw new Error('Attendance session not found')},
  async resolveTwinReview({reviewId,resolution}){await request(`attendance/twin-reviews/${reviewId}`,{method:'PATCH',query:{resolution}});const sessions=await request<{items:{id:string}[]}>('attendance/sessions',{query:{page_size:100}});for(const s of sessions.items){const full=await getSession(s.id);if(full.twinReviews.some(r=>r.id===reviewId))return full}throw new Error('Attendance session not found')},
  async getTwinReviews(sessionId){const raw=await request<{items:any[]}>(`attendance/sessions/${sessionId}/twin-reviews`);return raw.items as TwinReview[]},
  async finalizeAttendance({sessionId,acknowledgeUnresolvedReviews}){await request(`attendance/sessions/${sessionId}/finalize`,{method:'POST',body:{acknowledgeUnresolved:acknowledgeUnresolvedReviews??false}});return getSession(sessionId)},
  async getAttendanceHistory(query){const raw=await request<{items:{id:string}[]}>('attendance/sessions',{query:{classId:query?.classId,facultyId:query?.facultyId,from:query?.from,to:query?.to,status:query?.status,search:query?.search,pendingReviewOnly:query?.pendingReviewOnly,page_size:100}});return Promise.all(raw.items.map(async x=>summary(await getSession(x.id))))},
  async getPagedAttendanceHistory(query){const raw=await request<{items:{id:string}[];page:number;page_size:number;total:number;has_more:boolean}>('attendance/sessions',{query:{classId:query?.classId,facultyId:query?.facultyId,from:query?.from,to:query?.to,status:query?.status,search:query?.search,pendingReviewOnly:query?.pendingReviewOnly,page:query?.page,page_size:query?.pageSize}});const items=await Promise.all(raw.items.map(async x=>summary(await getSession(x.id))));return {items,page:raw.page,pageSize:raw.page_size,total:raw.total,hasMore:raw.has_more} as Paginated<AttendanceSessionSummary>},
};
