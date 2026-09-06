import type { StudentService } from '@/services/contracts';
import type { FaceImageInfo, Paginated, Student, StudentProfile } from '@/types';

import { request, uploadFiles } from './client';

export const studentsApi: StudentService = {
  getStudents: (query) =>
    request<Paginated<Student>>('students', {
      query: {
        classId: query?.classId,
        search: query?.search,
        department: query?.department,
        semester: query?.semester,
        lowAttendanceOnly: query?.lowAttendanceOnly,
        // Omitted when undefined by `request`, so the server applies its own defaults.
        page: query?.page,
        page_size: query?.pageSize,
      },
    }),

  getStudent: (studentId) => request<StudentProfile>(`students/${studentId}`),
  createStudent:(p)=>request<Student>('students',{method:'POST',body:{student_id:p.studentId,roll_number:p.rollNumber,name:p.name,department:p.department,semester:p.semester,section:p.section}}),
  async getFaceImages(studentId){const x=await request<{items:any[]}>(`students/${studentId}/face-images`);return x.items.map(i=>({id:i.id,status:i.quality?.status??'PENDING',reason:i.quality?.reason??null,imageUrl:i.image_url,revokedAt:i.revoked_at,width:i.width??0,height:i.height??0,detectedFaces:typeof i.quality?.detected_faces==='number'?i.quality.detected_faces:i.quality?.status==='ACCEPTED'?1:null})) as FaceImageInfo[]},
  async uploadFaceImages(studentId,uris){await uploadFiles(`students/${studentId}/face-images`,uris)},
  revokeFaceImage:(studentId,imageId)=>request<void>(`students/${studentId}/face-images/${imageId}`,{method:'DELETE'}),
  reprocessFaceImages:(studentId)=>request<void>(`students/${studentId}/face-images/reprocess`,{method:'POST'}),
};
