import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { academicService } from '@/services';
import type { AcademicCreateRequest, AcademicKind, AcademicQuery, AcademicUpdateRequest } from '@/types';

export const academicKeys = {
  all: ['academic'] as const,
  tree: ['academic', 'tree'] as const,
  overview: ['academic', 'overview'] as const,
  report: ['academic', 'mapping-report'] as const,
  levels: ['academic', 'levels'] as const,
  workspaces: ['academic', 'workspaces'] as const,
};

export function useAcademicTree(includeArchived = false) {
  return useQuery({
    queryKey: [...academicKeys.tree, includeArchived],
    queryFn: () => academicService.getTree(includeArchived),
  });
}

export function useAcademicOverview() {
  return useQuery({ queryKey: academicKeys.overview, queryFn: () => academicService.getOverview() });
}

export function useAcademicLevel(kind: AcademicKind, query?: AcademicQuery) {
  return useQuery({
    queryKey: [...academicKeys.levels, kind, query],
    queryFn: () => academicService.getLevel(kind, query),
  });
}

export function useAcademicWorkspace(kind: AcademicKind, id: string | undefined) {
  return useQuery({
    queryKey: [...academicKeys.workspaces, kind, id],
    queryFn: () => academicService.getWorkspace(kind, id!),
    enabled: Boolean(id),
  });
}

export function useArchiveImpact(kind: AcademicKind, id: string | undefined) {
  return useQuery({
    queryKey: [...academicKeys.workspaces, kind, id, 'impact'],
    queryFn: () => academicService.getArchiveImpact(kind, id!),
    enabled: Boolean(id),
  });
}

export function useSubjectSuggestions(code: string, name: string) {
  return useQuery({
    queryKey: [...academicKeys.levels, 'subjects', 'suggestions', code, name],
    queryFn: () => academicService.getSubjectSuggestions({ code, name }),
    enabled: code.trim().length > 1 || name.trim().length > 2,
  });
}

function useInvalidateAcademic() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: academicKeys.all });
}

export function useCreateAcademic() {
  const done = useInvalidateAcademic();
  return useMutation({
    mutationFn: (payload: AcademicCreateRequest) => academicService.create(payload),
    onSuccess: done,
  });
}

export function useUpdateAcademic() {
  const done = useInvalidateAcademic();
  return useMutation({
    mutationFn: (payload: AcademicUpdateRequest) => academicService.update(payload),
    onSuccess: done,
  });
}

export function useArchiveAcademic() {
  const done = useInvalidateAcademic();
  return useMutation({
    mutationFn: (payload: { kind: AcademicKind; id: string }) =>
      academicService.archive(payload.kind, payload.id),
    onSuccess: done,
  });
}

export function useMappingReport() {
  return useQuery({
    queryKey: academicKeys.report,
    queryFn: () => academicService.getMappingReport({ pageSize: 100 }),
  });
}

export function useLinkProgramSubject() {
  const done = useInvalidateAcademic();
  return useMutation({
    mutationFn: (payload: { programId: string; subjectId: string; semesterNumber?: number }) =>
      academicService.linkSubject(payload.programId, payload.subjectId, payload.semesterNumber),
    onSuccess: done,
  });
}

export function useUnlinkProgramSubject() {
  const done = useInvalidateAcademic();
  return useMutation({
    mutationFn: (payload: { programId: string; subjectId: string }) =>
      academicService.unlinkSubject(payload.programId, payload.subjectId),
    onSuccess: done,
  });
}
