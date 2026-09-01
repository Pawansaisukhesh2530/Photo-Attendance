import type { Id, IsoDateTime, PageRequest } from './common';

/**
 * Both roles ship in the same binary; the role on the authenticated user decides
 * which navigation group loads. Stitch shows this as a "Faculty View" toggle in the
 * top bar of every admin screen.
 */
export type UserRole = 'FACULTY' | 'ADMIN';

export interface User {
  id: Id;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
  department: string | null;
}

/**
 * Employment state, used by the admin faculty directory.
 *
 * ON_LEAVE is kept distinct from INACTIVE because they mean different things to an
 * administrator: a member on leave still holds their class assignments and will return, while an
 * inactive one has left the institution. Collapsing them would make the directory unable to
 * answer "who needs cover this term".
 */
export type FacultyStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

export interface Faculty extends User {
  role: 'FACULTY';
  employeeId: string;
  designation: string;
  /** Ids of classes assigned to this faculty member for the active session. */
  assignedClassIds: Id[];
  phone: string | null;

  /**
   * Employment state. Optional so records created before the admin area existed remain valid;
   * absent is treated as ACTIVE by the UI rather than as an unknown third state.
   */
  status?: FacultyStatus;

  /** Set when the backend records a joining date. Display only. */
  joinedAt?: IsoDateTime | null;
}

/* ------------------------------------------------------------------ *
 * Admin faculty management
 * ------------------------------------------------------------------ */

export interface FacultyQuery extends PageRequest {
  search?: string;
  department?: string;
  status?: FacultyStatus;
  /** Restricts to faculty assigned to a specific class. */
  classId?: Id;
}

/**
 * Payload for creating a faculty member.
 *
 * For the backend developer: the server owns `id`, and it — not the client — must enforce that
 * `employeeId` and `email` are unique. The client validates shape only. Class assignment is a
 * separate operation (`ClassService.assignFaculty`) so that creating a person and giving them
 * teaching load stay independently auditable.
 */
export interface CreateFacultyRequest {
  name: string;
  email: string;
  employeeId: string;
  department: string;
  designation: string;
  phone?: string | null;
  status?: FacultyStatus;
}

/** Partial update. Omitted fields are left untouched. */
export interface UpdateFacultyRequest {
  facultyId: Id;
  name?: string;
  email?: string;
  department?: string;
  designation?: string;
  phone?: string | null;
  status?: FacultyStatus;
}

/**
 * Credentials accept either an institutional email or an employee ID in the same
 * field, matching the single "Employee ID / Email" input in the Stitch login screen.
 */
export interface LoginRequest {
  identifier: string;
  password: string;
  rememberMe: boolean;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: IsoDateTime;
  user: User;
}

export interface ForgotPasswordRequest {
  identifier: string;
}
