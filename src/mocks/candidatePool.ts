import type { Id, Student } from '@/types';

import { mockStudentsByClass } from './fixtures';

export interface CandidatePool {
  /** Every in-scope student, in selected-class order. */
  students: Student[];
  /** studentId -> the selected class that put them in scope. */
  classByStudentId: Map<Id, Id>;
  /**
   * Twin groups with two or more members *inside this pool*.
   *
   * A student flagged as a twin whose counterpart is not in scope is not ambiguous — there is
   * nothing in the pool to confuse them with, so they are matched normally. This is what makes
   * the scoping rule observable rather than merely asserted.
   */
  ambiguousTwinGroups: Set<string>;
}

/**
 * Builds the recognition candidate pool from the selected classes.
 *
 * ============================================================================
 * THIS IS THE SCOPE BOUNDARY. Recognition may only consider students returned
 * here. Nothing downstream re-widens it.
 *
 * In the real system this construction belongs on the server: the client sends
 * `selectedClassIds` and the backend resolves enrolment itself. It lives here only because the
 * mock has to stand in for that. The client must never ship the whole student database and
 * match locally — that is both a privacy problem and the exact behaviour this rule forbids.
 * ============================================================================
 *
 * Unknown class ids are skipped rather than throwing: a stale id should narrow the scope, never
 * widen it or fail the capture outright.
 */
export function buildCandidatePool(selectedClassIds: Id[]): CandidatePool {
  const students: Student[] = [];
  const classByStudentId = new Map<Id, Id>();
  const groupCounts = new Map<string, number>();

  // De-duplicate ids so a repeated selection cannot double-count a roster.
  for (const classId of [...new Set(selectedClassIds)]) {
    const roster = mockStudentsByClass[classId];
    if (!roster) continue;

    for (const student of roster) {
      // First selected class wins if a student somehow appears in two rosters, so each student
      // yields exactly one attendance record.
      if (classByStudentId.has(student.id)) continue;

      classByStudentId.set(student.id, classId);
      students.push(student);

      if (student.twinGroupId) {
        groupCounts.set(student.twinGroupId, (groupCounts.get(student.twinGroupId) ?? 0) + 1);
      }
    }
  }

  const ambiguousTwinGroups = new Set(
    [...groupCounts.entries()].filter(([, count]) => count >= 2).map(([group]) => group),
  );

  return { students, classByStudentId, ambiguousTwinGroups };
}

/**
 * Students who are NOT in scope for a given selection.
 *
 * Exists only so the mock can prove the exclusion rule — it is never used to produce attendance.
 * The real backend has no equivalent and needs none.
 */
export function outOfScopeStudents(selectedClassIds: Id[]): Student[] {
  const selected = new Set(selectedClassIds);
  return Object.entries(mockStudentsByClass)
    .filter(([classId]) => !selected.has(classId))
    .flatMap(([, roster]) => roster);
}
