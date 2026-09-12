import type { AcademicService } from '@/services/contracts';
import type {
  AcademicKind,
  AcademicOverview,
  AcademicPathItem,
  AcademicRecord,
  AcademicWorkspace,
  ArchiveImpact,
  ProgramSubject,
  SubjectSuggestion,
} from '@/types';

import { request } from './client';

const path = (items: any[] | undefined): AcademicPathItem[] =>
  (items ?? []).map((item) => ({
    kind: item.kind,
    id: item.id,
    code: item.code,
    name: item.name,
  }));

const record = (item: any): AcademicRecord => ({
  id: item.id,
  code: item.code,
  name: item.name,
  active: item.active,
  version: item.version,
  schoolId: item.school_id,
  departmentId: item.department_id,
  programId: item.program_id,
  batchId: item.batch_id,
  startYear: item.start_year,
  endYear: item.end_year,
  path: path(item.path),
  counts: item.counts,
});

const link = (item: any): ProgramSubject => ({
  id: item.id,
  programId: item.program_id,
  subjectId: item.subject_id,
  semesterNumber: item.semester_number ?? null,
});

const parentKey: Record<AcademicKind, string | undefined> = {
  schools: undefined,
  departments: 'school_id',
  programs: 'department_id',
  batches: 'program_id',
  sections: 'batch_id',
  subjects: undefined,
};

export const academicApi: AcademicService = {
  async getTree(includeArchived = false) {
    const value = await request<any>('academic/tree', { query: { includeArchived } });
    return {
      schools: value.schools.map(record),
      departments: value.departments.map(record),
      programs: value.programs.map(record),
      batches: value.batches.map(record),
      sections: value.sections.map(record),
      subjects: value.subjects.map(record),
      programSubjects: (value.programSubjects ?? []).map(link),
    };
  },
  async getLevel(kind, query) {
    const value = await request<any>(`academic/${kind}`, {
      query: {
        search: query?.search,
        parentId: query?.parentId,
        active: query?.active,
        needsCurriculum: query?.needsCurriculum,
        page: query?.page,
        page_size: query?.pageSize,
      },
    });
    return {
      items: value.items.map(record),
      page: value.page,
      pageSize: value.pageSize,
      total: value.total,
      hasMore: value.hasMore,
    };
  },
  getOverview() {
    return request<AcademicOverview>('academic/overview');
  },
  async getWorkspace(kind, id) {
    const value = await request<any>(`academic/${kind}/${id}`);
    return {
      record: record(value.record),
      path: path(value.path),
      counts: value.counts ?? {},
      childKind: value.childKind ?? null,
      children: (value.children ?? []).map(record),
      curriculum: (value.curriculum ?? []).map((item: any) => ({
        id: item.id,
        programId: item.program_id,
        subjectId: item.subject_id,
        semesterNumber: item.semester_number ?? null,
        classCount: item.class_count ?? 0,
        subject: item.subject ? record(item.subject) : undefined,
        program: item.program ? record(item.program) : undefined,
        department: item.department ? record(item.department) : undefined,
        school: item.school ? record(item.school) : undefined,
      })),
      activity: (value.activity ?? []).map((item: any) => ({
        id: item.id,
        action: item.action,
        actorId: item.actor_id,
        reason: item.reason ?? null,
        before: item.before ?? null,
        after: item.after ?? null,
        createdAt: item.created_at,
      })),
    } satisfies AcademicWorkspace;
  },
  async getArchiveImpact(kind, id) {
    const value = await request<any>(`academic/${kind}/${id}/impact`);
    return {
      record: record(value.record),
      dependencies: value.dependencies ?? {},
      canArchive: value.canArchive,
      blocking: value.blocking ?? {},
    } satisfies ArchiveImpact;
  },
  async getSubjectSuggestions(query) {
    const value = await request<any>('academic/subjects/suggestions', { query });
    return (value.items ?? []).map((item: any) => ({
      ...record(item),
      programmeCount: item.programmes ?? 0,
      classCount: item.classes ?? 0,
    } satisfies SubjectSuggestion));
  },
  async create(payload) {
    const key = parentKey[payload.kind];
    return record(await request<any>(`academic/${payload.kind}`, {
      method: 'POST',
      body: {
        code: payload.code,
        name: payload.name,
        ...(key && payload.parentId ? { [key]: payload.parentId } : {}),
        start_year: payload.startYear,
        end_year: payload.endYear,
      },
    }));
  },
  async update(payload) {
    return record(await request<any>(`academic/${payload.kind}/${payload.id}`, {
      method: 'PATCH',
      body: {
        code: payload.code,
        name: payload.name,
        active: payload.active,
        start_year: payload.startYear,
        end_year: payload.endYear,
        version: payload.version,
      },
    }));
  },
  archive: (kind, id) => request<void>(`academic/${kind}/${id}`, { method: 'DELETE' }),
  async linkSubject(programId, subjectId, semesterNumber) {
    return link(await request<any>(`academic/programs/${programId}/subjects`, {
      method: 'POST',
      body: { subject_id: subjectId, semester_number: semesterNumber },
    }));
  },
  unlinkSubject: (programId, subjectId) =>
    request<void>(`academic/programs/${programId}/subjects/${subjectId}`, { method: 'DELETE' }),
  getMappingReport: (query) => request('academic/mapping-report', {
    query: { search: query?.search, page: query?.page, page_size: query?.pageSize },
  }),
};
