/**
 * Centralised mock fixtures.
 *
 * Every piece of fake data in the app lives here. Components and screens must never
 * define their own placeholder data — when the backend arrives, deleting this
 * directory should be sufficient.
 *
 * Content deliberately reflects the Stitch designs (Dr. Sharma, AI & Machine
 * Learning / CSE-5A, the Arjun / Aryan Sharma twin pair) so the implementation can be
 * compared against the Stitch screens directly.
 */

import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceSessionSummary,
  AttendanceSummary,
  AuditEntry,
  CourseClass,
  Faculty,
  FacultyStatus,
  InstitutionSettings,
  Student,
  TodayClass,
  TwinReview,
} from '@/types';

/* ------------------------------------------------------------------ *
 * Faculty
 * ------------------------------------------------------------------ */

export const mockFaculty: Faculty = {
  id: 'fac-001',
  name: 'Dr. Anil Sharma',
  email: 'anil.sharma@institution.edu',
  role: 'FACULTY',
  avatarUrl: null,
  department: 'Computer Science & Engineering',
  employeeId: 'emp_12345',
  designation: 'Associate Professor',
  assignedClassIds: ['cls-001', 'cls-002', 'cls-003', 'cls-004'],
  phone: '+91 98765 43210',
  status: 'ACTIVE',
  joinedAt: '2019-07-15T00:00:00Z',
};

/** Departments the institution recognises. Drives admin facets and the settings screen. */
export const MOCK_DEPARTMENTS = [
  'Computer Science & Engineering',
  'Electronics & Communication',
  'Mechanical Engineering',
  'Mathematics',
] as const;

/**
 * The institution's faculty directory.
 *
 * `mockFaculty` above is the signed-in lecturer and the owner of all four teaching classes, which
 * is what the Phase 1-8 faculty flows assume. The rest exist so the admin directory has something
 * real to page, search and filter — and so every branch of the UI is reachable from a cold start:
 * all three employment states, four departments, several designations, and members with no class
 * assignment at all (which the "needs a lecturer" workflow depends on).
 *
 * Deterministic. Navigating away and back must not reshuffle a directory.
 */
function buildFacultyDirectory(): Faculty[] {
  const seeds: {
    name: string;
    department: (typeof MOCK_DEPARTMENTS)[number];
    designation: string;
    status: FacultyStatus;
    classIds?: string[];
    joined: string;
  }[] = [
    { name: 'Dr. Meenakshi Iyer', department: 'Computer Science & Engineering', designation: 'Professor', status: 'ACTIVE', joined: '2011-06-01' },
    { name: 'Prof. Rajesh Nair', department: 'Computer Science & Engineering', designation: 'Assistant Professor', status: 'ACTIVE', joined: '2020-08-10' },
    { name: 'Dr. Sunita Deshmukh', department: 'Computer Science & Engineering', designation: 'Associate Professor', status: 'ON_LEAVE', joined: '2015-01-20' },
    { name: 'Prof. Imran Qureshi', department: 'Computer Science & Engineering', designation: 'Assistant Professor', status: 'ACTIVE', joined: '2022-07-04' },
    { name: 'Dr. Latha Krishnan', department: 'Electronics & Communication', designation: 'Professor', status: 'ACTIVE', joined: '2009-09-15' },
    { name: 'Prof. Vivek Bhandarkar', department: 'Electronics & Communication', designation: 'Associate Professor', status: 'ACTIVE', joined: '2016-03-01' },
    { name: 'Dr. Pallavi Rane', department: 'Electronics & Communication', designation: 'Assistant Professor', status: 'INACTIVE', joined: '2018-11-12' },
    { name: 'Prof. Girish Hegde', department: 'Mechanical Engineering', designation: 'Professor', status: 'ACTIVE', joined: '2008-07-21' },
    { name: 'Dr. Shalini Barve', department: 'Mechanical Engineering', designation: 'Associate Professor', status: 'ACTIVE', joined: '2014-02-17' },
    { name: 'Prof. Anand Tiwari', department: 'Mechanical Engineering', designation: 'Assistant Professor', status: 'ON_LEAVE', joined: '2021-01-11' },
    { name: 'Dr. Kavitha Subramanian', department: 'Mathematics', designation: 'Professor', status: 'ACTIVE', joined: '2010-08-02' },
    { name: 'Prof. Deepak Chaturvedi', department: 'Mathematics', designation: 'Associate Professor', status: 'ACTIVE', joined: '2017-06-19' },
    { name: 'Dr. Nandini Prabhu', department: 'Mathematics', designation: 'Assistant Professor', status: 'INACTIVE', joined: '2019-10-08' },
    { name: 'Prof. Sameer Wadekar', department: 'Computer Science & Engineering', designation: 'Assistant Professor', status: 'ACTIVE', joined: '2023-07-03' },
    { name: 'Dr. Rekha Joshipura', department: 'Electronics & Communication', designation: 'Associate Professor', status: 'ACTIVE', joined: '2013-04-22' },
    { name: 'Prof. Tarun Malviya', department: 'Mechanical Engineering', designation: 'Assistant Professor', status: 'ACTIVE', joined: '2024-01-15' },
    { name: 'Dr. Anjali Sengupta', department: 'Mathematics', designation: 'Assistant Professor', status: 'ACTIVE', joined: '2022-08-29' },
    { name: 'Prof. Mohan Raghavan', department: 'Computer Science & Engineering', designation: 'Professor', status: 'ACTIVE', joined: '2007-05-30' },
    { name: 'Dr. Farida Contractor', department: 'Electronics & Communication', designation: 'Assistant Professor', status: 'ACTIVE', joined: '2021-09-06' },
    { name: 'Prof. Ketan Bhagat', department: 'Mechanical Engineering', designation: 'Associate Professor', status: 'ACTIVE', joined: '2012-12-03' },
    { name: 'Dr. Swarna Lakshmi', department: 'Mathematics', designation: 'Professor', status: 'ACTIVE', joined: '2006-07-17' },
    { name: 'Prof. Yogesh Pardeshi', department: 'Computer Science & Engineering', designation: 'Assistant Professor', status: 'ON_LEAVE', joined: '2023-02-13' },
    { name: 'Dr. Bhargavi Menon', department: 'Electronics & Communication', designation: 'Professor', status: 'ACTIVE', joined: '2010-11-25' },
    { name: 'Prof. Ravi Shankar Dubey', department: 'Mechanical Engineering', designation: 'Assistant Professor', status: 'INACTIVE', joined: '2020-03-09' },
    { name: 'Dr. Trupti Vaidya', department: 'Mathematics', designation: 'Associate Professor', status: 'ACTIVE', joined: '2015-08-18' },
    { name: 'Prof. Salim Merchant', department: 'Computer Science & Engineering', designation: 'Associate Professor', status: 'ACTIVE', joined: '2014-10-27' },
    { name: 'Dr. Harini Balaji', department: 'Electronics & Communication', designation: 'Assistant Professor', status: 'ACTIVE', joined: '2022-01-31' },
    { name: 'Prof. Devendra Pawar', department: 'Mechanical Engineering', designation: 'Professor', status: 'ACTIVE', joined: '2005-06-14' },
    { name: 'Dr. Ishita Bhattacharya', department: 'Mathematics', designation: 'Assistant Professor', status: 'ACTIVE', joined: '2023-11-20' },
    { name: 'Prof. Nikhilesh Kamat', department: 'Computer Science & Engineering', designation: 'Assistant Professor', status: 'ACTIVE', joined: '2024-07-08' },
  ];

  return [
    mockFaculty,
    ...seeds.map((seed, index) => {
      const slug = seed.name
        .replace(/^(Dr\.|Prof\.)\s+/, '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(/\s+/)
        .join('.');

      return {
        id: `fac-${String(index + 2).padStart(3, '0')}`,
        name: seed.name,
        email: `${slug}@institution.edu`,
        role: 'FACULTY' as const,
        avatarUrl: null,
        department: seed.department,
        employeeId: `emp_${String(20000 + (index + 2) * 37)}`,
        designation: seed.designation,
        // Only fac-001 teaches the four mock classes. Everyone else is unassigned, which is what
        // makes the assignment workflow and the "unassigned" filter demonstrable.
        assignedClassIds: seed.classIds ?? [],
        phone: `+91 9${String(80000 + index * 811).padStart(9, '0').slice(0, 9)}`,
        status: seed.status,
        joinedAt: `${seed.joined}T00:00:00Z`,
      };
    }),
  ];
}

export const mockFacultyDirectory: Faculty[] = buildFacultyDirectory();

export const mockAdmin = {
  id: 'adm-001',
  name: 'Priya Menon',
  email: 'priya.menon@institution.edu',
  role: 'ADMIN' as const,
  avatarUrl: null,
  department: 'Academic Administration',
};

/* ------------------------------------------------------------------ *
 * Classes
 * ------------------------------------------------------------------ */

export const mockClasses: CourseClass[] = [
  {
    id: 'cls-001',
    subject: 'AI & Machine Learning',
    classCode: 'CSE-5',
    section: 'A',
    displayCode: 'CSE-5A',
    semester: 5,
    academicSession: '2026-27',
    department: 'Computer Science & Engineering',
    status: 'ACTIVE',
    facultyId: 'fac-001',
    facultyName: mockFaculty.name,
    studentCount: 48,
    attendancePercentage: 92,
    schedule: [{ dayOfWeek: 4, startTime: '09:00', endTime: '10:00', room: 'Room 402' }],
  },
  {
    id: 'cls-002',
    subject: 'Database Systems',
    classCode: 'CSE-5',
    section: 'B',
    displayCode: 'CSE-5B',
    semester: 5,
    academicSession: '2026-27',
    department: 'Computer Science & Engineering',
    status: 'ACTIVE',
    facultyId: 'fac-001',
    facultyName: mockFaculty.name,
    studentCount: 52,
    attendancePercentage: 88,
    schedule: [{ dayOfWeek: 4, startTime: '11:00', endTime: '12:00', room: 'Lab 2' }],
  },
  {
    id: 'cls-003',
    subject: 'Data Structures',
    classCode: 'CSE-3',
    section: 'A',
    displayCode: 'CSE-3A',
    semester: 3,
    academicSession: '2026-27',
    department: 'Computer Science & Engineering',
    status: 'ACTIVE',
    facultyId: 'fac-001',
    facultyName: mockFaculty.name,
    studentCount: 45,
    attendancePercentage: 94,
    schedule: [{ dayOfWeek: 4, startTime: '14:00', endTime: '15:00', room: 'Room 210' }],
  },
  {
    id: 'cls-004',
    subject: 'Algorithms Lab',
    classCode: 'CSE-3',
    section: 'B-L1',
    displayCode: 'CSE-3B-L1',
    semester: 3,
    academicSession: '2026-27',
    department: 'Computer Science & Engineering',
    status: 'ACTIVE',
    facultyId: 'fac-001',
    facultyName: mockFaculty.name,
    studentCount: 30,
    // Deliberately below ATTENDANCE_THRESHOLD (75) so the amber ring and the
    // below-threshold warning on the class card are exercised by the default fixtures.
    attendancePercentage: 68,
    schedule: [{ dayOfWeek: 2, startTime: '10:00', endTime: '12:00', room: 'Lab 1' }],
  },
];

/**
 * Additional classes across the institution, for the admin catalogue.
 *
 * Kept separate from `mockClasses` and appended below rather than mixed in, because every Phase
 * 1-8 flow assumes `mockClasses` is exactly the four classes `fac-001` teaches — attendance scope,
 * the candidate pool, report aggregation and the today-dashboard all derive from it. These have no
 * roster in `mockStudentsByClass` and no attendance sessions, which is deliberate: they exercise
 * the admin catalogue's paging, department and semester filters, the "no lecturer assigned"
 * workflow, the ARCHIVED state, and the empty-report path for a class with no recorded sessions.
 */
function buildInstitutionCatalogue(): CourseClass[] {
  const seeds: {
    subject: string;
    code: string;
    section: string;
    semester: number;
    department: (typeof MOCK_DEPARTMENTS)[number];
    facultyId: string | null;
    pct: number;
    count: number;
    status?: 'ACTIVE' | 'ARCHIVED';
  }[] = [
    { subject: 'Operating Systems', code: 'CSE-4', section: 'A', semester: 4, department: 'Computer Science & Engineering', facultyId: 'fac-002', pct: 87, count: 51 },
    { subject: 'Computer Networks', code: 'CSE-4', section: 'B', semester: 4, department: 'Computer Science & Engineering', facultyId: 'fac-003', pct: 79, count: 49 },
    { subject: 'Software Engineering', code: 'CSE-6', section: 'A', semester: 6, department: 'Computer Science & Engineering', facultyId: 'fac-005', pct: 91, count: 44 },
    { subject: 'Compiler Design', code: 'CSE-6', section: 'B', semester: 6, department: 'Computer Science & Engineering', facultyId: null, pct: 0, count: 46 },
    { subject: 'Digital Signal Processing', code: 'ECE-5', section: 'A', semester: 5, department: 'Electronics & Communication', facultyId: 'fac-006', pct: 84, count: 55 },
    { subject: 'VLSI Design', code: 'ECE-6', section: 'A', semester: 6, department: 'Electronics & Communication', facultyId: 'fac-007', pct: 72, count: 42 },
    { subject: 'Microcontrollers Lab', code: 'ECE-4', section: 'B-L1', semester: 4, department: 'Electronics & Communication', facultyId: 'fac-016', pct: 66, count: 28 },
    { subject: 'Embedded Systems', code: 'ECE-7', section: 'A', semester: 7, department: 'Electronics & Communication', facultyId: null, pct: 0, count: 38 },
    { subject: 'Thermodynamics', code: 'MEC-3', section: 'A', semester: 3, department: 'Mechanical Engineering', facultyId: 'fac-009', pct: 89, count: 60 },
    { subject: 'Fluid Mechanics', code: 'MEC-4', section: 'A', semester: 4, department: 'Mechanical Engineering', facultyId: 'fac-010', pct: 81, count: 58 },
    { subject: 'Machine Design', code: 'MEC-6', section: 'A', semester: 6, department: 'Mechanical Engineering', facultyId: 'fac-021', pct: 74, count: 47 },
    { subject: 'Manufacturing Lab', code: 'MEC-5', section: 'B-L2', semester: 5, department: 'Mechanical Engineering', facultyId: 'fac-029', pct: 69, count: 26 },
    { subject: 'Linear Algebra', code: 'MAT-2', section: 'A', semester: 2, department: 'Mathematics', facultyId: 'fac-012', pct: 93, count: 72 },
    { subject: 'Probability & Statistics', code: 'MAT-3', section: 'A', semester: 3, department: 'Mathematics', facultyId: 'fac-013', pct: 86, count: 68 },
    { subject: 'Discrete Mathematics', code: 'MAT-2', section: 'B', semester: 2, department: 'Mathematics', facultyId: 'fac-018', pct: 90, count: 70 },
    { subject: 'Numerical Methods', code: 'MAT-4', section: 'A', semester: 4, department: 'Mathematics', facultyId: null, pct: 0, count: 64 },
    { subject: 'Legacy Data Mining', code: 'CSE-7', section: 'A', semester: 7, department: 'Computer Science & Engineering', facultyId: 'fac-019', pct: 77, count: 31, status: 'ARCHIVED' },
    { subject: 'Legacy Analog Circuits', code: 'ECE-3', section: 'B', semester: 3, department: 'Electronics & Communication', facultyId: 'fac-015', pct: 71, count: 35, status: 'ARCHIVED' },
  ];

  return seeds.map((seed, index) => {
    const holder = mockFacultyDirectory.find((f) => f.id === seed.facultyId);
    return {
      id: `cls-${String(index + 101)}`,
      subject: seed.subject,
      classCode: seed.code,
      section: seed.section,
      displayCode: `${seed.code}${seed.section}`,
      semester: seed.semester,
      academicSession: '2026-27',
      department: seed.department,
      status: seed.status ?? ('ACTIVE' as const),
      facultyId: seed.facultyId ?? '',
      facultyName: holder?.name ?? '',
      studentCount: seed.count,
      attendancePercentage: seed.pct,
      schedule: [
        {
          dayOfWeek: (index % 5) + 1,
          startTime: `${String(9 + (index % 7)).padStart(2, '0')}:00`,
          endTime: `${String(10 + (index % 7)).padStart(2, '0')}:00`,
          room: `Room ${200 + index}`,
        },
      ],
    };
  });
}

/**
 * Every class in the institution: the four teaching classes plus the wider catalogue.
 *
 * Admin reads this. Faculty reads `mockClasses`. Keeping them separate is what stops the admin
 * catalogue leaking into the attendance candidate pool.
 */
export const mockAllClasses: CourseClass[] = [...mockClasses, ...buildInstitutionCatalogue()];

/* ------------------------------------------------------------------ *
 * Institution settings
 * ------------------------------------------------------------------ */

/**
 * Institution settings, mutated in memory by the mock settings service.
 *
 * `attendanceThreshold` starts at the same value as `ATTENDANCE_THRESHOLD` so the admin area and
 * the existing faculty screens agree on a cold start. It is a starting value, not a hard-coded
 * policy: changing it here must move every admin surface that reads settings.
 */
export const mockInstitutionSettings: InstitutionSettings = {
  institutionName: 'Sardar Institute of Technology',
  institutionCode: 'SIT',
  attendanceThreshold: 75,
  academicSession: '2026-27',
  departments: [...MOCK_DEPARTMENTS],
  semesterCount: 8,
  // Approved by the user in Phase 4 and covered by audit, so this is reported rather than offered
  // as a switch. Flipping it would change attendance semantics.
  allowPostFinalizationEdits: true,
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
};

const today = new Date().toISOString().slice(0, 10);

/**
 * Today's classes, arranged to exercise every `ClassAttendanceState` the dashboard
 * has to render: not yet taken, needing review, finished, and not scheduled.
 */
export const mockTodayClasses: TodayClass[] = [
  {
    ...mockClasses[0]!,
    date: today,
    startTime: '09:00',
    endTime: '10:00',
    room: 'Room 402',
    attendanceState: 'PENDING',
    sessionId: null,
    presentCount: null,
    lastCapturedAt: null,
  },
  {
    // Captured but with unresolved twin cases, so the dashboard's "Pending review"
    // metric and the AWAITING_REVIEW card state are both exercised from launch.
    ...mockClasses[1]!,
    date: today,
    startTime: '11:00',
    endTime: '12:00',
    room: 'Lab 2',
    attendanceState: 'AWAITING_REVIEW',
    sessionId: 'ses-review-001',
    presentCount: null,
    lastCapturedAt: `${today}T11:04:00Z`,
  },
  {
    ...mockClasses[2]!,
    date: today,
    startTime: '14:00',
    endTime: '15:00',
    room: 'Room 210',
    attendanceState: 'COMPLETED',
    sessionId: 'ses-past-001',
    presentCount: 42,
    lastCapturedAt: `${today}T14:05:00Z`,
  },
];

/* ------------------------------------------------------------------ *
 * Students
 * ------------------------------------------------------------------ */

const FIRST_NAMES = [
  'Aanya', 'Rahul', 'Kavya', 'Ishaan', 'Meera', 'Vikram', 'Ananya', 'Rohan',
  'Diya', 'Karthik', 'Sneha', 'Aditya', 'Nisha', 'Varun', 'Pooja', 'Siddharth',
  'Tanvi', 'Nikhil', 'Riya', 'Aman', 'Shreya', 'Dev', 'Lakshmi', 'Manish',
  'Divya', 'Sanjay', 'Neha', 'Harsh', 'Priyanka', 'Rajat', 'Swati', 'Akash',
  'Gauri', 'Vivek', 'Anita', 'Yash', 'Ritu', 'Sameer', 'Preeti', 'Kunal',
  'Radhika', 'Naveen', 'Bhavna', 'Gaurav', 'Suman',
];

const LAST_NAMES = [
  'Gupta', 'Verma', 'Iyer', 'Reddy', 'Nair', 'Singh', 'Desai', 'Kulkarni',
  'Joshi', 'Chopra', 'Bose', 'Rao', 'Malhotra', 'Pillai', 'Bhatt',
];

/**
 * Builds a deterministic roster. Determinism matters: navigating away and back must
 * not reshuffle names, or the mock stops behaving like a real API.
 */
function buildRoster(
  classId: string,
  displayCode: string,
  count: number,
  semester: number,
  section: string,
): Student[] {
  const students: Student[] = [];

  // Institutional IDs are globally unique; the roll number is the per-class identifier. Seeding
  // from the class ordinal keeps them distinct across rosters — without it every class produced
  // "CS-2024-001", so a search by institutional ID returned four different people.
  const cohort = Number(classId.replace(/\D/g, '')) || 0;

  for (let i = 0; i < count; i += 1) {
    const rollSuffix = String(i + 1).padStart(2, '0');

    // Names are drawn from a seed that is offset per class and never repeats a first/last
    // combination. Indexing purely on `i` gave every roster the same name at the same position,
    // so a directory spanning four classes showed "Aanya Gupta" four times — indistinguishable
    // from a duplication bug on the one screen whose job is finding a specific person.
    const nameSeed = (cohort - 1) * 60 + i;
    const first = FIRST_NAMES[nameSeed % FIRST_NAMES.length]!;
    const last = LAST_NAMES[Math.floor(nameSeed / FIRST_NAMES.length) % LAST_NAMES.length]!;

    students.push({
      id: `${classId}-stu-${rollSuffix}`,
      studentId: `CS-2024-${String(cohort * 100 + i + 1).padStart(4, '0')}`,
      rollNumber: `${displayCode}-${rollSuffix}`,
      name: `${first} ${last}`,
      avatarUrl: null,
      department: 'Computer Science & Engineering',
      // Taken from the class rather than hard-coded. Deriving section from the display code broke
      // on lab codes like "CSE-3B-L1", which yielded a section of "1".
      semester,
      section,
      // Spread across the threshold so low-attendance filtering has something to find.
      overallAttendance: 68 + ((i * 13) % 32),
      faceEnrolled: i % 17 !== 0,
      twinGroupId: null,
      primaryClassId: classId,
    });
  }

  // Two look-alike pairs per roster, at rolls 14/15 and 27/28.
  //
  // Each pair is class-specific. They used to be hard-coded, which put the same two names, the
  // same institutional IDs and — worse — the same `twinGroupId` into all four rosters. That broke
  // in two ways: an institutional ID stopped identifying one person, and a two-class session
  // produced a twin group with four members while `buildTwinReview` only ever pairs the first
  // two, leaving two students stuck at REVIEW with no case through which to resolve them.
  //
  // Roster 1 keeps the Stitch names (Arjun / Aryan Sharma, CS-2023-042/043) because that is the
  // pair the "Review Ambiguous Match" screen shows.
  const pairs = TWIN_PAIRS_BY_COHORT[cohort] ?? [];

  for (const pair of pairs) {
    const first = students[pair.index];
    const second = students[pair.index + 1];
    if (!first || !second) continue;

    // Group id is scoped to the class, so a group never spans rosters by accident. The one
    // deliberate cross-class pair is linked separately, below.
    const groupId = `twin-grp-${classId}-${pair.key}`;

    Object.assign(first, {
      name: pair.a.name,
      studentId: pair.a.studentId,
      twinGroupId: groupId,
      faceEnrolled: true,
    });
    Object.assign(second, {
      name: pair.b.name,
      studentId: pair.b.studentId,
      twinGroupId: groupId,
      faceEnrolled: true,
    });
  }

  return students;
}

/**
 * Look-alike pairs, keyed by class ordinal.
 *
 * Two pairs per roster: without a second case the consecutive-review flow would be unreachable
 * and therefore untested. Twins are normally enrolled together, so a cluster inside one class is
 * the realistic shape; the one cross-class pair below is the deliberate exception.
 */
const TWIN_PAIRS_BY_COHORT: Record<
  number,
  { index: number; key: string; a: { name: string; studentId: string }; b: { name: string; studentId: string } }[]
> = {
  1: [
    {
      index: 13,
      key: 'a',
      a: { name: 'Arjun Sharma', studentId: 'CS-2023-042' },
      b: { name: 'Aryan Sharma', studentId: 'CS-2023-043' },
    },
    {
      index: 26,
      key: 'b',
      a: { name: 'Neha Kulkarni', studentId: 'CS-2023-088' },
      b: { name: 'Nisha Kulkarni', studentId: 'CS-2023-089' },
    },
  ],
  2: [
    {
      index: 13,
      key: 'a',
      a: { name: 'Kabir Menon', studentId: 'CS-2023-142' },
      b: { name: 'Kabeer Menon', studentId: 'CS-2023-143' },
    },
    {
      index: 26,
      key: 'b',
      a: { name: 'Tara Saxena', studentId: 'CS-2023-188' },
      b: { name: 'Tarini Saxena', studentId: 'CS-2023-189' },
    },
  ],
  3: [
    {
      index: 13,
      key: 'a',
      a: { name: 'Advait Kamath', studentId: 'CS-2023-242' },
      b: { name: 'Advaith Kamath', studentId: 'CS-2023-243' },
    },
    {
      index: 26,
      key: 'b',
      a: { name: 'Ira Bhandari', studentId: 'CS-2023-288' },
      b: { name: 'Isha Bhandari', studentId: 'CS-2023-289' },
    },
  ],
  4: [
    {
      index: 13,
      key: 'a',
      a: { name: 'Veer Rathod', studentId: 'CS-2023-342' },
      b: { name: 'Vir Rathod', studentId: 'CS-2023-343' },
    },
    {
      index: 26,
      key: 'b',
      a: { name: 'Anvi Salvi', studentId: 'CS-2023-388' },
      b: { name: 'Aanvi Salvi', studentId: 'CS-2023-389' },
    },
  ],
};

export const mockStudentsByClass: Record<string, Student[]> = {
  'cls-001': buildRoster('cls-001', 'CSE-5A', 48, 5, 'A'),
  'cls-002': buildRoster('cls-002', 'CSE-5B', 52, 5, 'B'),
  'cls-003': buildRoster('cls-003', 'CSE-3A', 45, 3, 'A'),
  'cls-004': buildRoster('cls-004', 'CSE-3B-L1', 30, 3, 'B-L1'),
};

/**
 * Cross-enrolment, used only when building a student *profile*.
 *
 * Each mock roster creates its own student objects, so roster membership alone would make every
 * student belong to exactly one class — and a profile could never show the multi-class relationship
 * the architecture supports.
 *
 * This map is deliberately kept out of `mockStudentsByClass`. Adding these students to a second
 * roster would change roster sizes and pull them into that class's recognition candidate pool,
 * which would alter approved attendance behaviour. Profiles read it; attendance never does.
 */
export const MOCK_CROSS_ENROLMENT: Record<string, string[]> = {
  'cls-001-stu-01': ['cls-001', 'cls-003'],
  'cls-001-stu-02': ['cls-001', 'cls-004'],
  'cls-002-stu-01': ['cls-002', 'cls-003'],
  'cls-003-stu-05': ['cls-003', 'cls-004'],
};

/**
 * A look-alike pair split across CSE-5A and CSE-5B.
 *
 * This is the fixture that makes the scoping rule testable rather than merely claimed:
 *
 *   - Select both classes  -> both are in the pool, so the pair is ambiguous and the twin review
 *                             fires across classes.
 *   - Select CSE-5A only   -> the CSE-5B counterpart is out of scope, so there is nothing to
 *                             confuse the CSE-5A student with and they are matched normally.
 *
 * Without a cross-class pair, "the pool is restricted" would be an assertion no test could
 * distinguish from the alternative.
 */
(function linkCrossClassTwins(): void {
  const a = mockStudentsByClass['cls-001']?.[5];
  const b = mockStudentsByClass['cls-002']?.[5];
  if (!a || !b) return;

  Object.assign(a, {
    name: 'Rohan Deshpande',
    studentId: 'CS-2023-201',
    twinGroupId: 'twin-grp-cross',
    faceEnrolled: true,
  });
  Object.assign(b, {
    name: 'Rohit Deshpande',
    studentId: 'CS-2023-202',
    twinGroupId: 'twin-grp-cross',
    faceEnrolled: true,
  });
})();

export const mockStudents: Student[] = Object.values(mockStudentsByClass).flat();

/* ------------------------------------------------------------------ *
 * Attendance
 * ------------------------------------------------------------------ */

/** Faces the mock reports as detected but unmatched. Constant, to keep totals stable. */
export const MOCK_UNMATCHED_FACES = 2;

export function summarise(
  records: AttendanceRecord[],
  unmatchedFaces = MOCK_UNMATCHED_FACES,
): AttendanceSummary {
  const present = records.filter((r) => r.status === 'PRESENT').length;
  const absent = records.filter((r) => r.status === 'ABSENT').length;
  const review = records.filter((r) => r.status === 'REVIEW').length;
  const unknown = records.filter((r) => r.status === 'UNKNOWN').length;
  const recognized = records.filter((r) => r.confidence !== null).length;
  const total = records.length;

  return {
    total,
    present,
    absent,
    review,
    unknown,
    recognized,
    unmatchedFaces,
    percentage: total === 0 ? 0 : Math.round((present / total) * 100),
  };
}

/** Deterministic pseudo-grid position for a detected face, so boxes never jitter. */
function faceBoxFor(index: number) {
  return {
    x: 0.06 + (index % 7) * 0.125,
    y: 0.18 + (Math.floor(index / 7) % 5) * 0.145,
    width: 0.062,
    height: 0.095,
  };
}

/**
 * Produces a plausible recognition result for a roster.
 *
 * ============================================================================
 * SCRIPTED OUTPUT. This function never opens, reads or inspects the photograph.
 * The photo URI is not even passed to it. Every value below is derived from the
 * student's index in the roster.
 * ============================================================================
 *
 * The distribution is chosen so that every state the results UI can render is reachable
 * from the default fixtures — a mock where the review path is unreachable would let the
 * review UI rot untested until the real backend arrived and exposed all of it at once.
 *
 * For a 48-student roster this yields roughly:
 *   2  REVIEW  (twin ambiguity, ~50% confidence each)
 *   2  REVIEW  (low confidence)
 *   3  UNKNOWN (occluded / not determinable)
 *   4  ABSENT  (not detected)
 *   37 PRESENT (high confidence)
 */
export function buildRecords(
  students: Student[],
  sessionId: string,
  /** studentId -> selected class that put them in scope. */
  classByStudentId?: Map<string, string>,
  /**
   * Twin groups that actually have two or more members in the candidate pool. A twin whose
   * counterpart is out of scope is matched normally — there is nothing in scope to confuse them
   * with. Omitted means "treat every twin group as ambiguous", which is the single-class default.
   */
  ambiguousTwinGroups?: Set<string>,
): AttendanceRecord[] {
  /**
   * Position of each student within their own twin group, in pool order.
   *
   * `buildTwinReview` calls the first member of a group candidate A and gives them the higher
   * score, so the record has to agree. Deciding this from roster-index parity — as it used to —
   * made the confidence in the results table contradict the confidence in the review modal for
   * any pair sitting at an even index.
   */
  const twinOrder = new Map<string, number>();
  const groupSeen = new Map<string, number>();
  for (const student of students) {
    if (!student.twinGroupId) continue;
    const seen = groupSeen.get(student.twinGroupId) ?? 0;
    twinOrder.set(student.id, seen);
    groupSeen.set(student.twinGroupId, seen + 1);
  }

  return students.map((student, index) => {
    const base = {
      // Scoped to the session. A student-only id would collide across every session of the
      // same class, and any lookup by record id would then resolve to the wrong session.
      id: `rec-${sessionId}-${student.id}`,
      classId: classByStudentId?.get(student.id) ?? student.primaryClassId,
      studentId: student.id,
      rollNumber: student.rollNumber,
      studentName: student.name,
      avatarUrl: student.avatarUrl,
      editedBy: null,
      editedByName: null,
      editedAt: null,
      editReason: null,
    };

    // 1. Twins — the ambiguous-match case. Always review, never auto-assigned.
    //    Only ambiguous if the counterpart is also in the candidate pool.
    const isAmbiguousTwin =
      student.twinGroupId !== null &&
      (ambiguousTwinGroups === undefined || ambiguousTwinGroups.has(student.twinGroupId));

    if (isAmbiguousTwin && student.twinGroupId !== null) {
      const meta = twinGroupMeta(student.twinGroupId);
      // The first member of the group — candidate A in the review — scores marginally higher.
      const isFirstOfPair = (twinOrder.get(student.id) ?? 0) === 0;
      const groupBox = meta.box;

      return {
        ...base,
        status: 'REVIEW',
        aiStatus: 'REVIEW',
        confidence: isFirstOfPair ? meta.a : meta.b,
        reviewRequired: true,
        reviewReason: 'TWIN_AMBIGUITY',
        // The pair sit beside each other in the frame, so offset the second box.
        faceBox: isFirstOfPair
          ? groupBox
          : { ...groupBox, x: Math.min(0.9, groupBox.x + 0.15) },
      };
    }

    // 2. Not detected in the frame at all — a positive absence determination.
    if (index % 11 === 7) {
      return {
        ...base,
        status: 'ABSENT',
        aiStatus: 'ABSENT',
        confidence: null,
        reviewRequired: false,
        reviewReason: 'NOT_DETECTED',
        faceBox: null,
      };
    }

    // 3. Detected but not determinable — occluded by a head or a raised laptop.
    if (index % 19 === 9) {
      return {
        ...base,
        status: 'UNKNOWN',
        aiStatus: 'UNKNOWN',
        confidence: 0.28 + ((index * 3) % 9) / 100,
        reviewRequired: true,
        reviewReason: 'OCCLUDED',
        faceBox: faceBoxFor(index),
      };
    }

    // 4. Matched, but not confidently enough to record without a human look.
    if (index % 29 === 6) {
      return {
        ...base,
        status: 'REVIEW',
        aiStatus: 'REVIEW',
        confidence: 0.56 + ((index * 5) % 8) / 100,
        reviewRequired: true,
        reviewReason: 'LOW_CONFIDENCE',
        faceBox: faceBoxFor(index),
      };
    }

    // 5. Confident match.
    return {
      ...base,
      status: 'PRESENT',
      aiStatus: 'PRESENT',
      confidence: 0.88 + ((index * 7) % 11) / 100,
      reviewRequired: false,
      reviewReason: null,
      faceBox: faceBoxFor(index),
    };
  });
}

interface TwinGroupMeta {
  box: { x: number; y: number; width: number; height: number };
  a: number;
  b: number;
}

/** Explicit meta for the groups whose numbers appear in the Stitch design. */
const NAMED_TWIN_GROUP_META: Record<string, TwinGroupMeta> = {
  // The pair on the Stitch "Review Ambiguous Match" screen.
  'twin-grp-cls-001-a': { box: { x: 0.31, y: 0.42, width: 0.07, height: 0.11 }, a: 0.52, b: 0.49 },
  'twin-grp-cls-001-b': { box: { x: 0.62, y: 0.28, width: 0.07, height: 0.1 }, a: 0.51, b: 0.5 },
  // Spans CSE-5A and CSE-5B. Ambiguous only when both are selected; with either alone the
  // counterpart is out of scope and the in-scope student is matched normally.
  'twin-grp-cross': { box: { x: 0.18, y: 0.6, width: 0.07, height: 0.1 }, a: 0.53, b: 0.48 },
};

/**
 * Per-group detected-face position and the pair's similarity scores.
 *
 * Derived for groups without explicit meta, so adding a look-alike pair to any roster needs no
 * change here. Derivation is a cheap string hash — deterministic, so a face crop never jumps
 * position between renders of the same session.
 */
function twinGroupMeta(groupId: string): TwinGroupMeta {
  const named = NAMED_TWIN_GROUP_META[groupId];
  if (named) return named;

  let hash = 0;
  for (let i = 0; i < groupId.length; i += 1) {
    hash = (hash * 31 + groupId.charCodeAt(i)) % 997;
  }

  return {
    box: {
      x: 0.12 + (hash % 11) * 0.06,
      y: 0.2 + (Math.floor(hash / 11) % 5) * 0.13,
      width: 0.07,
      height: 0.105,
    },
    // Both close to the decision boundary — that is what makes the pair ambiguous.
    a: 0.5 + (hash % 5) / 100,
    b: 0.47 + (hash % 4) / 100,
  };
}

/**
 * Builds one review per twin group present in the roster.
 *
 * Groups are discovered from `twinGroupId` rather than hard-coded, so adding another pair to
 * a roster automatically produces another case to review.
 */
export function buildTwinReview(sessionId: string, students: Student[]): TwinReview[] {
  const groups = new Map<string, Student[]>();

  for (const student of students) {
    if (!student.twinGroupId) continue;
    const existing = groups.get(student.twinGroupId) ?? [];
    existing.push(student);
    groups.set(student.twinGroupId, existing);
  }

  const reviews: TwinReview[] = [];

  for (const [groupId, members] of [...groups.entries()].sort()) {
    const [a, b] = members;
    // A group with only one member in scope produces no review. Its counterpart is in an
    // unselected class and must not be offered as a candidate.
    if (!a || !b) continue;

    const meta = twinGroupMeta(groupId);

    reviews.push({
      id: `twin-${sessionId}-${groupId}`,
      sessionId,
      detectedFaceUrl: null,
      detectedFaceBox: meta.box,
      studentA: {
        studentId: a.id,
        name: a.name,
        rollNumber: a.rollNumber,
        avatarUrl: a.avatarUrl,
        semester: a.semester,
        confidence: meta.a,
      },
      studentB: {
        studentId: b.id,
        name: b.name,
        rollNumber: b.rollNumber,
        avatarUrl: b.avatarUrl,
        semester: b.semester,
        confidence: meta.b,
      },
      resolution: null,
      resolvedBy: null,
      resolvedAt: null,
    });
  }

  return reviews;
}

/** A previously finalized session, so post-finalization editing is demonstrable from launch. */
function buildFinalizedSession(): AttendanceSession {
  const students = mockStudentsByClass['cls-003'] ?? [];
  const records = buildRecords(students, 'ses-past-001').map((record) =>
    record.status === 'REVIEW'
      ? { ...record, status: 'PRESENT' as const, reviewRequired: false }
      : record,
  );

  return {
    id: 'ses-past-001',
    selectedClassIds: ['cls-003'],
    classes: [
      { id: 'cls-003', subject: 'Data Structures', displayCode: 'CSE-3A', studentCount: students.length },
    ],
    classId: 'cls-003',
    className: 'Data Structures',
    classDisplayCode: 'CSE-3A',
    facultyId: 'fac-001',
    date: today,
    capturedAt: `${today}T14:05:00Z`,
    finalizedAt: `${today}T14:12:00Z`,
    status: 'FINALIZED',
    photoUri: null,
    photoWidth: 2048,
    photoHeight: 1536,
    summary: summarise(records),
    records,
    twinReviews: [],
    warnings: [],
  };
}

/**
 * A captured session still holding unresolved twin cases.
 *
 * Present from launch so the dashboard's pending-review metric is non-zero and the
 * review workflow has something real to open in Phase 5.
 */
function buildAwaitingReviewSession(): AttendanceSession {
  const students = mockStudentsByClass['cls-002'] ?? [];
  const records = buildRecords(students, 'ses-review-001');

  return {
    id: 'ses-review-001',
    selectedClassIds: ['cls-002'],
    classes: [
      { id: 'cls-002', subject: 'Database Systems', displayCode: 'CSE-5B', studentCount: students.length },
    ],
    classId: 'cls-002',
    className: 'Database Systems',
    classDisplayCode: 'CSE-5B',
    facultyId: 'fac-001',
    date: today,
    capturedAt: `${today}T11:04:00Z`,
    finalizedAt: null,
    status: 'PENDING_REVIEW',
    photoUri: null,
    photoWidth: 2048,
    photoHeight: 1536,
    summary: summarise(records),
    records,
    twinReviews: buildTwinReview('ses-review-001', students),
    warnings: [
      {
        code: 'UNKNOWN_FACES_PRESENT',
        message: '2 detected faces could not be matched to this roster.',
        severity: 'INFO',
      },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Historical corpus
 * ------------------------------------------------------------------ */

/** Teaching days in the corpus. 10 keeps per-student granularity at a whole 10%. */
const HISTORY_SESSION_COUNT = 10;

/** Days between teaching days, so the corpus spans ~3 weeks rather than 10 days. */
const HISTORY_DAY_STEP = 2;

/**
 * Per-student variation applied to the class rate, in percentage points.
 *
 * Sums to zero so a roster's mean lands on the class rate, and the -26 entry guarantees that
 * every class contains students below the threshold — otherwise the low-attendance section and
 * the amber treatments would be unreachable in a report scoped to a healthy class.
 */
const RATE_JITTER = [5, -5, 9, -9, 2, -2, -26, 26];

function isoDaysAgo(days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** The attendance rate the corpus should produce for a given student, 0..100. */
function targetRateFor(classRate: number, studentIndex: number): number {
  const jitter = RATE_JITTER[studentIndex % RATE_JITTER.length]!;
  return Math.max(10, Math.min(100, classRate + jitter));
}

/**
 * Records for one historical session.
 *
 * Separate from `buildRecords`, which produces a *recognition* result complete with confidences,
 * review flags and face boxes. A finalized historical session has none of that ambiguity left in
 * it: every student is either PRESENT or ABSENT, because whoever taught the class resolved it at
 * the time. Reusing `buildRecords` here would leave permanent REVIEW rows in the corpus, and
 * every report would then have to reason about unresolved cases from weeks ago.
 *
 * Presence is decided by `(sessionIndex * 7 + studentIndex) % n < presentCount`. Because
 * gcd(7, 10) = 1, iterating `sessionIndex` over the ten sessions visits all ten residues exactly
 * once, so each student ends up with exactly `presentCount` attended sessions and a derived
 * percentage that lands on their target rate. Deterministic, and exact rather than approximate.
 */
function buildHistoricalRecords(
  students: Student[],
  sessionId: string,
  classId: string,
  classRate: number,
  sessionIndex: number,
): AttendanceRecord[] {
  return students.map((student, studentIndex) => {
    const presentCount = Math.round(
      (targetRateFor(classRate, studentIndex) / 100) * HISTORY_SESSION_COUNT,
    );
    const slot = (sessionIndex * 7 + studentIndex) % HISTORY_SESSION_COUNT;
    const present = slot < presentCount;

    // One deterministic record per class carries an edit, so History's "edited" flag and the
    // audit comparison stay reachable from a cold start.
    const edited = sessionIndex === 3 && studentIndex === 2;

    return {
      id: `rec-${sessionId}-${student.id}`,
      classId,
      studentId: student.id,
      rollNumber: student.rollNumber,
      studentName: student.name,
      avatarUrl: student.avatarUrl,
      status: present ? ('PRESENT' as const) : ('ABSENT' as const),
      // The recogniser's original verdict. Where a human later corrected it, the two differ —
      // which is the whole point of keeping both.
      aiStatus: edited ? ('ABSENT' as const) : present ? ('PRESENT' as const) : ('ABSENT' as const),
      confidence: present ? 0.9 : null,
      reviewRequired: false,
      reviewReason: null,
      faceBox: present ? faceBoxFor(studentIndex) : null,
      editedBy: edited ? mockFaculty.id : null,
      editedByName: edited ? mockFaculty.name : null,
      editedAt: edited ? `${isoDaysAgo((sessionIndex + 1) * HISTORY_DAY_STEP)}T15:20:00Z` : null,
      editReason: edited ? 'Marked present after checking the paper register' : null,
    };
  });
}

/**
 * Finalized sessions for the weeks before today, one per class per teaching day.
 *
 * Reports derive every figure from recorded sessions, so without a corpus the Reports screen
 * would have two data points and no trend. This is also what makes newly captured attendance
 * visibly move the report: the aggregator reads the same session store the capture flow writes to.
 *
 * These replace two earlier history rows (`ses-past-002`, `ses-past-003`) that existed only as
 * summaries with no session behind them — tapping either from History threw NOT_FOUND — and whose
 * class names and display codes contradicted `mockClasses`.
 */
function buildHistoricalSessions(): AttendanceSession[] {
  const sessions: AttendanceSession[] = [];

  for (let sessionIndex = 0; sessionIndex < HISTORY_SESSION_COUNT; sessionIndex += 1) {
    // Newest first in the loop reads backwards, so index 0 is the oldest day.
    const daysAgo = (HISTORY_SESSION_COUNT - sessionIndex) * HISTORY_DAY_STEP;
    const date = isoDaysAgo(daysAgo);

    for (const course of mockClasses) {
      const students = mockStudentsByClass[course.id] ?? [];
      if (students.length === 0) continue;

      const sessionId = `ses-hist-${course.id}-${String(sessionIndex + 1).padStart(2, '0')}`;
      const records = buildHistoricalRecords(
        students,
        sessionId,
        course.id,
        course.attendancePercentage,
        sessionIndex,
      );

      const capturedAt = `${date}T${course.schedule[0]?.startTime ?? '09:00'}:00Z`;

      sessions.push({
        id: sessionId,
        selectedClassIds: [course.id],
        classes: [
          {
            id: course.id,
            subject: course.subject,
            displayCode: course.displayCode,
            studentCount: students.length,
          },
        ],
        classId: course.id,
        className: course.subject,
        classDisplayCode: course.displayCode,
        facultyId: course.facultyId,
        date,
        capturedAt,
        finalizedAt: `${date}T${course.schedule[0]?.endTime ?? '10:00'}:00Z`,
        status: 'FINALIZED',
        photoUri: null,
        photoWidth: 2048,
        photoHeight: 1536,
        // No unmatched faces claimed on a historical session: there is no photo to have detected
        // them in, and inventing a count would put a number on the screen nothing can justify.
        summary: summarise(records, 0),
        records,
        twinReviews: [],
        warnings: [],
      });
    }
  }

  return sessions;
}

export const mockHistoricalSessions: AttendanceSession[] = buildHistoricalSessions();

/**
 * Finalized sessions for a few catalogue classes owned by other lecturers.
 *
 * Without these, every recorded session in the mock belongs to `fac-001`, so the admin report's
 * faculty breakdown would only ever have one entry and the whole dimension would be unreachable.
 *
 * These records reference synthetic enrolments that exist ONLY as attendance records — the students
 * are not added to `mockStudentsByClass`. That is deliberate and it matters:
 *
 *   - `studentRows` walks rosters, so the institution student count stays exactly 175 and no
 *     student's per-student figure is polluted by a class they are not enrolled in.
 *   - `buildCandidatePool` only resolves ids from `mockStudentsByClass`, so nothing here can leak
 *     into the recognition scope of a faculty capture.
 *   - `byClassTally` is built from `record.classId`, so the class and faculty breakdowns still get
 *     real numbers.
 *
 * The honest reading is that these classes' rosters are not modelled in this mock, only their
 * attendance totals are.
 */
function buildCatalogueSessions(): AttendanceSession[] {
  // Chosen to span three departments and three lecturers, including one class below threshold.
  const participating = [
    { classId: 'cls-101', rate: 87, size: 51 },
    { classId: 'cls-105', rate: 84, size: 55 },
    { classId: 'cls-109', rate: 89, size: 60 },
    { classId: 'cls-106', rate: 72, size: 42 },
    { classId: 'cls-112', rate: 69, size: 26 },
  ];

  const sessions: AttendanceSession[] = [];

  for (const entry of participating) {
    const course = mockAllClasses.find((c) => c.id === entry.classId);
    if (!course || !course.facultyId) continue;

    for (let sessionIndex = 0; sessionIndex < 6; sessionIndex += 1) {
      const daysAgo = (6 - sessionIndex) * 3;
      const date = isoDaysAgo(daysAgo);
      const sessionId = `ses-cat-${course.id}-${String(sessionIndex + 1).padStart(2, '0')}`;

      const records: AttendanceRecord[] = Array.from({ length: entry.size }, (_, i) => {
        // Same exact-count trick as the roster corpus: gcd(7, 6) = 1, so each synthetic student
        // lands on their target rate across the six sessions.
        const target = Math.max(10, Math.min(100, entry.rate + (RATE_JITTER[i % RATE_JITTER.length] ?? 0)));
        const presentCount = Math.round((target / 100) * 6);
        const present = (sessionIndex * 7 + i) % 6 < presentCount;
        const roll = `${course.displayCode}-${String(i + 1).padStart(2, '0')}`;

        return {
          id: `rec-${sessionId}-${i}`,
          classId: course.id,
          // Namespaced so these can never collide with a real roster id.
          studentId: `cat-${course.id}-stu-${String(i + 1).padStart(2, '0')}`,
          rollNumber: roll,
          studentName: roll,
          avatarUrl: null,
          status: present ? ('PRESENT' as const) : ('ABSENT' as const),
          aiStatus: present ? ('PRESENT' as const) : ('ABSENT' as const),
          confidence: present ? 0.9 : null,
          reviewRequired: false,
          reviewReason: null,
          faceBox: null,
          editedBy: null,
          editedByName: null,
          editedAt: null,
          editReason: null,
        };
      });

      sessions.push({
        id: sessionId,
        selectedClassIds: [course.id],
        classes: [
          {
            id: course.id,
            subject: course.subject,
            displayCode: course.displayCode,
            studentCount: entry.size,
          },
        ],
        classId: course.id,
        className: course.subject,
        classDisplayCode: course.displayCode,
        facultyId: course.facultyId,
        date,
        capturedAt: `${date}T${course.schedule[0]?.startTime ?? '09:00'}:00Z`,
        finalizedAt: `${date}T${course.schedule[0]?.endTime ?? '10:00'}:00Z`,
        status: 'FINALIZED',
        photoUri: null,
        photoWidth: 2048,
        photoHeight: 1536,
        summary: summarise(records, 0),
        records,
        twinReviews: [],
        warnings: [],
      });
    }
  }

  return sessions;
}

export const mockCatalogueSessions: AttendanceSession[] = buildCatalogueSessions();

export const mockAttendanceSessions: AttendanceSession[] = [
  buildFinalizedSession(),
  buildAwaitingReviewSession(),
  ...mockHistoricalSessions,
  ...mockCatalogueSessions,
];

/** Summary projection of a session, matching what `syncHistory` produces at runtime. */
function summariseSession(session: AttendanceSession): AttendanceSessionSummary {
  return {
    id: session.id,
    classId: session.classId,
    className: session.className,
    classDisplayCode: session.classDisplayCode,
    classCount: session.selectedClassIds.length,
    date: session.date,
    capturedAt: session.capturedAt,
    status: session.status,
    summary: session.summary,
    hasManualEdits: session.records.some((r) => r.editedAt !== null),
  };
}

export const mockAttendanceHistory: AttendanceSessionSummary[] = [
  {
    id: 'ses-review-001',
    classId: 'cls-002',
    className: 'Database Systems',
    classDisplayCode: 'CSE-5B',
    classCount: 1,
    date: today,
    capturedAt: `${today}T11:04:00Z`,
    status: 'PENDING_REVIEW',
    summary: mockAttendanceSessions[1]!.summary,
    hasManualEdits: false,
  },
  {
    id: 'ses-past-001',
    classId: 'cls-003',
    className: 'Data Structures',
    classDisplayCode: 'CSE-3A',
    classCount: 1,
    date: today,
    capturedAt: `${today}T14:05:00Z`,
    status: 'FINALIZED',
    summary: mockAttendanceSessions[0]!.summary,
    hasManualEdits: true,
  },
  // Derived from the historical corpus rather than hand-written, so every row resolves to a real
  // session and no summary can drift from the records it claims to describe. The two rows that
  // used to sit here were summary-only and contradicted `mockClasses` on both name and size.
  ...mockHistoricalSessions.map(summariseSession),
  ...mockCatalogueSessions.map(summariseSession),
];

/* ------------------------------------------------------------------ *
 * Audit
 * ------------------------------------------------------------------ */

export const mockAuditEntries: AuditEntry[] = [
  {
    id: 'aud-001',
    action: 'ATTENDANCE_CAPTURED',
    at: `${today}T14:05:00Z`,
    actorId: 'fac-001',
    actorName: mockFaculty.name,
    actorRole: 'Associate Professor',
    sessionId: 'ses-past-001',
    classDisplayCode: 'CSE-3A',
    studentId: null,
    studentName: null,
    rollNumber: null,
    previousStatus: null,
    newStatus: null,
    reason: null,
  },
  {
    id: 'aud-002',
    action: 'STATUS_CHANGED',
    at: `${today}T14:09:00Z`,
    actorId: 'fac-001',
    actorName: mockFaculty.name,
    actorRole: 'Associate Professor',
    sessionId: 'ses-past-001',
    classDisplayCode: 'CSE-3A',
    studentId: 'cls-003-stu-14',
    studentName: 'Arjun Sharma',
    rollNumber: 'CSE-3A-14',
    previousStatus: 'REVIEW',
    newStatus: 'PRESENT',
    reason: 'Confirmed visually during class',
  },
  {
    id: 'aud-003',
    action: 'SESSION_FINALIZED',
    at: `${today}T14:12:00Z`,
    actorId: 'fac-001',
    actorName: mockFaculty.name,
    actorRole: 'Associate Professor',
    sessionId: 'ses-past-001',
    classDisplayCode: 'CSE-3A',
    studentId: null,
    studentName: null,
    rollNumber: null,
    previousStatus: null,
    newStatus: null,
    reason: null,
  },
];
