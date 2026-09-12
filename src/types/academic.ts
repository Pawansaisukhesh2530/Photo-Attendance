import type { Id, PageRequest, Paginated } from './common';

export type AcademicKind = 'schools' | 'departments' | 'programs' | 'batches' | 'sections' | 'subjects';
export interface AcademicPathItem { kind:AcademicKind; id:Id; code:string; name:string }
export type AcademicCounts = Record<string, number>;
export interface AcademicRecord { id:Id; code:string; name:string; active:boolean; version:number; schoolId?:Id; departmentId?:Id; programId?:Id; batchId?:Id; startYear?:number; endYear?:number; path?:AcademicPathItem[]; counts?:AcademicCounts }
export interface ProgramSubject { id:Id; programId:Id; subjectId:Id; semesterNumber:number|null }
export interface AcademicTree { schools:AcademicRecord[]; departments:AcademicRecord[]; programs:AcademicRecord[]; batches:AcademicRecord[]; sections:AcademicRecord[]; subjects:AcademicRecord[]; programSubjects:ProgramSubject[] }
export interface AcademicQuery extends PageRequest { search?:string; parentId?:Id; active?:boolean; needsCurriculum?:boolean }
export interface AcademicCreateRequest { kind:AcademicKind; code:string; name:string; parentId?:Id; startYear?:number; endYear?:number }
export interface AcademicUpdateRequest { kind:AcademicKind; id:Id; version:number; code?:string; name?:string; active?:boolean; startYear?:number; endYear?:number }
export interface StudentAcademicMapping { schoolId:Id; departmentId:Id; programId:Id; batchId:Id; sectionId:Id }
export interface MappingReportItem { id:Id; studentId:string; rollNumber:string; name:string; version:number; mappingStatus:'NEEDS_MAPPING'; mappingNote:string|null; legacy:{department:string;semester:number;section:string} }
export type MappingReport = Paginated<MappingReportItem>;
export interface AcademicAttentionItem { key:string; label:string; count:number; href:string; query:Record<string,string|boolean|number> }
export interface AcademicOverview { counts:{schools:number;departments:number;programs:number;batches:number;sections:number;subjects:number;students:number;faculty:number;classes:number}; attention:AcademicAttentionItem[] }
export interface AcademicActivity { id:Id; action:string; actorId:Id; reason:string|null; before:Record<string,unknown>|null; after:Record<string,unknown>|null; createdAt:string }
export interface CurriculumWorkspaceItem { id:Id; programId:Id; subjectId?:Id; semesterNumber:number|null; classCount:number; subject?:AcademicRecord; program?:AcademicRecord; department?:AcademicRecord; school?:AcademicRecord }
export interface AcademicWorkspace { record:AcademicRecord; path:AcademicPathItem[]; counts:AcademicCounts; childKind:AcademicKind|null; children:AcademicRecord[]; curriculum:CurriculumWorkspaceItem[]; activity:AcademicActivity[] }
export interface ArchiveImpact { record:AcademicRecord; dependencies:AcademicCounts; canArchive:boolean; blocking:AcademicCounts }
export interface SubjectSuggestion extends AcademicRecord { programmeCount:number; classCount:number }
