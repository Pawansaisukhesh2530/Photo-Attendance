/**UI/UX POLISH PASS — INTERACTION ANIMATIONS + FULL-SCREEN CAMERA

The functionality is currently working correctly.

Do NOT start the next major phase yet.

I want a focused UI/UX polish pass addressing two issues:

1. Selection/popup/modal animations feel abrupt and unpolished.
2. The camera preview should use the entire available screen rather than
   appearing as a constrained/inset camera area.

Do not change the existing business logic, API contracts, attendance
logic, multi-class logic, or backend boundary.

==================================================
1. INTERACTION / SELECTION ANIMATIONS
==================================================

Currently, when selecting things such as:

- Students
- Classes
- Attendance rows
- Filters
- Review items
- Popup actions
- Bottom sheets
- Modals

the transitions feel abrupt.

Make the interaction experience feel polished and intentional.

Use React Native/Reanimated for animations where appropriate.

Animations should be:

- Fast
- Smooth
- Subtle
- Professional
- Consistent across the application
- Appropriate for both iOS and Android

Do NOT use excessive animations.

The application should feel like a serious college administration
application, not a flashy consumer app.

==================================================
2. SELECTION FEEDBACK
==================================================

When selecting a class/student/item:

Use subtle visual feedback such as:

- Background transition
- Checkmark appearance
- Small scale/opacity transition
- Border transition
- Press feedback

Example:

UNSELECTED
    ↓
tap
    ↓
brief pressed state
    ↓
SELECTED
    ↓
checkmark / selected styling appears smoothly

Avoid instant hard switches where possible.

Do not make the entire row bounce or perform exaggerated animations.

==================================================
3. MODALS
==================================================

Improve all modal presentations.

For centered dialogs:

Opening:

- Background fades in
- Dialog slightly scales from approximately 0.96 → 1
- Dialog opacity transitions from 0 → 1

Closing:

- Dialog fades/scales out smoothly
- Backdrop fades out

The animation should be short and responsive.

Do NOT make the user wait for an animation.

For example:

150–250ms range is appropriate depending on the interaction.

==================================================
4. BOTTOM SHEETS
==================================================

For Bottom Sheets:

Opening:

- Backdrop fades in
- Sheet slides smoothly upward from the bottom

Closing:

- Sheet slides smoothly downward
- Backdrop fades out

Use appropriate easing.

The sheet should feel physically connected to the bottom edge.

Do not use a generic fade-only animation for a bottom sheet.

==================================================
5. BACKDROP
==================================================

When a modal/sheet is open:

- Background content should remain visually present
- Apply a subtle dim/overlay
- Do not make the background completely disappear
- Prevent unintended interaction with the background

Backdrop dismissal should respect the existing behavior of each
component.

IMPORTANT:

Do not change the existing Twin Review behavior where accidental
dismissal must not silently resolve a review.

Preserve:

- Android back behavior
- iOS behavior
- Existing confirmation requirements
- Decide Later behavior

==================================================
6. PRESS FEEDBACK
==================================================

Buttons and interactive cards should have subtle press feedback.

Examples:

Primary button:
normal
→ slightly reduced opacity / scale while pressed
→ returns smoothly

Class card:
normal
→ subtle pressed state
→ selected/navigation state

Avoid excessive scale animations.

Do not cause layout shifts.

==================================================
7. CHECKBOXES / SELECTION CONTROLS
==================================================

Checkbox/check indicators should animate smoothly.

For example:

unchecked
    ↓
tap
    ↓
checkmark appears
    ↓
selected state

Use a short opacity/scale transition.

Do not introduce a large bounce.

==================================================
8. LIST INTERACTIONS
==================================================

For student/class lists:

Do NOT animate every row continuously.

Only animate when:

- A row is pressed
- A row changes selection
- A row is inserted/removed where appropriate
- A filter changes the visible dataset

Avoid unnecessary animations that hurt performance with large
rosters.

The attendance results list can contain approximately 48+ students,
so performance matters.

==================================================
9. CAMERA — FULL SCREEN
==================================================

IMPORTANT CAMERA CHANGE:

The camera preview should use the FULL AVAILABLE SCREEN.

Currently the camera preview is visually constrained/inset.

Change it to a true immersive camera layout.

Desired structure:

┌──────────────────────────────┐
│ X       Take Attendance      │
│         CSE-5A • CSE-5B     │
│                              │
│                              │
│                              │
│          CAMERA              │
│          PREVIEW             │
│                              │
│                              │
│                              │
│                              │
│                              │
│                              │
│                              │
│                              │
│              ◉               │
│                              │
└──────────────────────────────┘

The camera should occupy the entire available screen behind the
camera UI.

Do NOT use a small centered card.

Do NOT leave large page margins around the camera.

The camera preview should extend:

- Edge-to-edge horizontally
- As much vertically as the device allows
- Behind the appropriate safe-area/header overlays where appropriate

==================================================
10. CAMERA OVERLAY
==================================================

Keep the camera controls layered ON TOP of the camera preview.

Structure:

Camera preview
    ↓
Dark gradient/overlay where necessary
    ↓
Header
    ↓
Class context
    ↓
CameraFramingGuide
    ↓
Capture controls

The classroom image should remain the dominant visual element.

Do not make the overlay so dark that the classroom becomes difficult
to see.

==================================================
11. CAMERA HEADER
==================================================

Keep:

X / Close
Take Attendance
Selected class context

Example:

Take Attendance
CSE-5A • CSE-5B

The header should respect:

- iOS safe area
- Android status bar
- Notches
- Dynamic island
- Camera cutouts

The header should remain readable over the camera.

Use a subtle translucent/dark gradient or overlay if necessary.

==================================================
12. CAMERA FRAMING GUIDE
==================================================

Keep the existing CameraFramingGuide:

- Corner brackets
- Rule-of-thirds grid
- No fake detection boxes
- No fake face tracking
- No fake detected count

The guide should be positioned relative to the full-screen preview.

It must not look like a separate card sitting inside the camera.

==================================================
13. CAPTURE BUTTON
==================================================

Keep the current:

- Large 84px capture ring
- 66px core
- Press animation
- Capture spinner
- Shutter flash

But position it naturally over the full-screen camera.

It should have enough spacing from:

- Android gesture/navigation area
- iOS home indicator
- Bottom safe area

Do not place it so low that it becomes uncomfortable to tap.

==================================================
14. CAMERA INSTRUCTIONS
==================================================

The current instruction card should remain, but make sure it does
not dominate the camera.

It can be positioned above or near the capture controls depending
on available screen size.

On smaller phones, prioritize:

1. Camera visibility
2. Capture button
3. Essential instruction
4. Class context

Do not allow secondary UI to cover the classroom unnecessarily.

==================================================
15. CAMERA ORIENTATION / ASPECT RATIO
==================================================

The camera should visually use the device screen dimensions.

Do not distort the camera feed.

Maintain the correct camera aspect ratio.

If the sensor aspect ratio differs from the screen:

- Use cover-style scaling where appropriate
- Crop rather than distort
- Keep the central classroom area visible

The preview must remain visually natural.

==================================================
16. PREVIEW AFTER CAPTURE
==================================================

The captured-photo preview should also use the available screen
effectively.

Do not return to the old small-card presentation.

Show the captured classroom image prominently.

Actions:

[ Use This Photo ]

[ Retake ]

Maintain the existing button hierarchy.

==================================================
17. ACCESSIBILITY
==================================================

Animations must respect reduced-motion preferences where practical.

Do not rely on animation alone to communicate:

- Selection
- Errors
- Loading
- Success

Every state must still be understandable without animation.

Touch targets must remain at least the existing accessible size.

==================================================
18. PERFORMANCE
==================================================

This is a mobile application.

Do not introduce expensive animation logic into large lists.

Prefer:

- Reanimated shared values
- Native-driven animations where possible
- Memoized row components
- Small isolated animated components

Avoid:

- JavaScript timers for every list row
- Continuous animation loops
- Layout thrashing
- Re-rendering the entire roster for one selection

==================================================
19. DESIGN CONSISTENCY
==================================================

Use the existing EduTrace Pro design system.

Do NOT introduce:

- New random colors
- Random border radii
- Different typography
- Inconsistent shadows
- Different button styles
- Unrelated animation styles

Create a small consistent motion language.

Suggested motion principles:

Micro interaction:
~100–180ms

Modal/sheet:
~180–280ms

Screen transition:
~200–300ms

Use appropriate easing rather than linear animation everywhere.

These are guidelines, not hard requirements.

==================================================
20. DO NOT CHANGE
==================================================

Do NOT change:

- Attendance logic
- Multi-class selection logic
- selectedClassIds
- Recognition candidate-pool logic
- Twin logic
- Review logic
- Manual editing
- Finalization
- Post-finalization editing
- Audit
- aiStatus
- status
- Backend contracts
- Mock AI architecture
- Authentication
- Role guards

This is a UI/interaction polish task.

==================================================
21. VERIFY ON REAL DEVICE
==================================================

A physical phone is available.

After implementation, test the UI on the actual phone.

Specifically verify:

CAMERA:

- Full-screen preview
- Header safe area
- Class text readability
- Framing guide placement
- Capture button position
- Bottom gesture area
- Capture animation
- Preview after capture
- Retake
- Use photo

INTERACTIONS:

- Select class
- Deselect class
- Select student
- Open popup
- Open bottom sheet
- Close popup
- Close sheet
- Open Twin Review
- Navigate between review cases

Make sure animations don't feel:

- Slow
- Laggy
- Bouncy
- Excessive
- Delayed

==================================================
22. VERIFICATION COMMANDS
==================================================

Run:

- TypeScript strict
- Expo Doctor
- Android export
- iOS export

Run existing regression tests.

Do not add a testing framework just for this UI pass.

==================================================
23. FINAL REPORT
==================================================

When finished, report:

1. Animation system introduced
2. Components modified
3. Modal improvements
4. Bottom-sheet improvements
5. Selection feedback
6. Camera full-screen implementation
7. Safe-area handling
8. Real-device verification
9. TypeScript result
10. Expo Doctor result
11. Android result
12. iOS result
13. Regression result
14. Any remaining visual issues

Do NOT start the next major phase automatically.

STOP after this UI/UX polish pass and wait for approval.
 * Central API contract for EduTrace Pro.
 *
 * These types describe what the frontend expects the backend to return. They make no
 * assumption about how any of it is produced — database schema, face detection,
 * embedding models, vector search and storage are all backend concerns and are
 * intentionally absent from this file.
 *
 * The backend developer can treat this directory as the agreed interface.
 */

export type {
  ApiError,
  ApiErrorKind,
  BoundingBox,
  Id,
  IsoDate,
  IsoDateTime,
  PageRequest,
  Paginated,
} from './common';

export type {
  AuthSession,
  CreateFacultyRequest,
  Faculty,
  FacultyQuery,
  FacultyStatus,
  ForgotPasswordRequest,
  LoginRequest,
  UpdateFacultyRequest,
  User,
  UserRole,
} from './user';

export type {
  Student,
  StudentAttendanceEntry,
  StudentProfile,
  StudentQuery,
  StudentSummary,
} from './student';

export type {
  AssignFacultyRequest,
  ClassAttendanceState,
  ClassQuery,
  ClassSchedule,
  ClassStatus,
  CourseClass,
  CreateClassRequest,
  TodayClass,
  UpdateClassRequest,
  UpdateEnrolmentRequest,
} from './class';

export type {
  AttendanceHistoryQuery,
  AttendanceRecord,
  AttendanceSession,
  AttendanceSessionSummary,
  AttendanceStatus,
  AttendanceSummary,
  CaptureAttendanceRequest,
  FinalizeSessionRequest,
  ProcessingProgress,
  ProcessingStage,
  ProcessingWarning,
  ProcessingWarningCode,
  ResolveTwinReviewRequest,
  ReviewReason,
  SessionClassRef,
  SessionStatus,
  TwinResolution,
  TwinReview,
  TwinReviewCandidate,
  UpdateAttendanceRequest,
} from './attendance';

export type {
  AttendanceReport,
  AttendanceTrendPoint,
  ClassAttendanceStat,
  FacultyAttendanceStat,
  ReportQuery,
  ReportStudentQuery,
  StudentAttendanceStat,
} from './report';

export type {
  InstitutionSettings,
  UpdateSettingsRequest,
} from './settings';

export type {
  AuditAction,
  AuditEntityType,
  AuditEntry,
  AuditQuery,
} from './audit';
