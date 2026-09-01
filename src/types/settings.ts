import type { Id, IsoDateTime } from './common';

/**
 * Institution-level configuration owned by administrators.
 *
 * ============================================================================
 * The attendance threshold lives HERE, not in `constants/config.ts`.
 *
 * `ATTENDANCE_THRESHOLD` in the constants file is a client-side fallback used by faculty screens
 * that predate this contract. It is a default, not policy. Policy is whatever the institution has
 * configured, and it arrives from the server — which is why `AttendanceReport.threshold` exists
 * and why report UIs read that field rather than the constant.
 *
 * A backend that returns a different threshold here must see every admin surface follow it with no
 * client change.
 * ============================================================================
 */
export interface InstitutionSettings {
  /** Display name of the institution, shown in admin headers and on reports. */
  institutionName: string;
  /** Short code, e.g. "NIT-K". Used where space is tight. */
  institutionCode: string;

  /**
   * The percentage below which a student is flagged. 0..100.
   *
   * Institution policy. Changing it changes who appears in every low-attendance list, so the
   * backend must audit every change (`SETTING_CHANGED`).
   */
  attendanceThreshold: number;

  /** Current academic session label, e.g. "2026-27". */
  academicSession: string;
  /** Departments the institution recognises. Drives admin department facets. */
  departments: string[];
  /** Highest semester number in use. */
  semesterCount: number;

  /**
   * Whether faculty may amend a session after finalizing it.
   *
   * Read-only in the frontend for now: the existing attendance rules permit post-finalization
   * edits and are covered by audit. Exposing a switch that silently changed that behaviour would
   * alter approved attendance semantics, so this is surfaced as status rather than as a control.
   */
  allowPostFinalizationEdits: boolean;

  /** When the settings were last changed, and by whom. Display only. */
  updatedAt: IsoDateTime | null;
  updatedBy: Id | null;
  updatedByName: string | null;
}

/**
 * Partial settings update.
 *
 * Only fields an administrator is allowed to change appear here. `allowPostFinalizationEdits` is
 * deliberately absent — see the note on that field.
 */
export interface UpdateSettingsRequest {
  institutionName?: string;
  institutionCode?: string;
  attendanceThreshold?: number;
  academicSession?: string;
  departments?: string[];
  semesterCount?: number;
}
