# EduTrace Pro — Project Handover

## Current state

EduTrace Pro is an Expo/React Native attendance application backed by FastAPI and PostgreSQL. The checked-in application supports administrator and faculty roles, student/class/faculty management, class enrollment, face-photo enrollment, standard classroom-photo attendance, a guided panorama capture, gallery upload for testing, manual attendance correction, audit history, and CSV/XLSX/PDF/JSON exports.

The local recognition backend uses InsightFace `buffalo_l`: SCRFD-10GF detects and aligns faces, and its ResNet50 ArcFace model produces normalized 512-dimensional embeddings. It accepts JPEG, PNG, and HEIC/HEIF phone images. Large classroom images are processed as a full image plus overlapping tiles, and boxes are mapped back to original coordinates for result overlays.

Last validation performed on September 12, 2026:

- `npm run typecheck` passed.
- `npm run lint` passed.
- Backend test suite passed: 34 tests.
- `npx expo-doctor` passed all 21 checks.
- PostgreSQL readiness returned `{"status":"ready","database":"ok"}`.
- Browser smoke tests passed for Dashboard, Academic Structure, Curriculum, Students, Faculty, Classes, Timetable, Attendance, Reports, and Settings with no error overlay.
- The class workspace displayed its normalized academic path, readiness checks, lecturer, 20-student roster, and seven attendance sessions from PostgreSQL.

## Repository layout

The current UI keeps the dark glass hierarchy and native `expo-glass-effect` surfaces where supported, with blur/material fallbacks elsewhere. The later experimental deep aurora animation was reverted, so this handover describes the stable visual baseline.

- `src/app/` — Expo Router screens for authentication, administration, faculty workflows, attendance capture, upload, processing, and results.
- `src/api/` — HTTP boundary and backend response mapping.
- `src/components/` — shared UI and domain components.
- `backend/app/` — FastAPI routes, database models, storage, recognition engines, and worker.
- `backend/alembic/` — PostgreSQL migrations.
- `backend/tests/` — backend API tests.
- `backend/data/private/` — local uploaded images; ignored by Git.
- `backend/models/` — local ONNX model files; ignored by Git.

## Prerequisites

- Node.js and npm.
- Python 3.12–3.14.
- PostgreSQL running locally on port 5432.
- Expo Go on the Android/iOS test device.
- The computer and phone on the same network for Expo LAN mode.

## First-time installation

From the repository root:

```powershell
npm install
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[test]"
```

The test setup downloads this InsightFace package beneath `backend/models/`:

```text
models/insightface/models/buffalo_l/det_10g.onnx
models/insightface/models/buffalo_l/w600k_r50.onnx
```

The model files are intentionally excluded from Git. Confirm their license before redistributing them.

Create a root `.env` file with the API address reachable from the target device:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://YOUR_COMPUTER_LAN_IP:8010/api/v1
```

For web-only development, `http://127.0.0.1:8010/api/v1` is sufficient. The LAN address can change when Wi-Fi, Ethernet, a VPN, or tethering changes. Restart Metro after changing `.env`.

## Running locally on Windows

Open two PowerShell terminals.

Terminal 1 — backend, migrations, seed data, API, and recognition worker:

```powershell
cd "C:\path\to\Attendance\backend"
.\start-local-postgres.ps1 -User postgres -Database edutrace -Port 8010
```

The script asks for the PostgreSQL password without saving it. When a correctly configured `backend/.env` already exists, `./start-local.ps1` can also be used.

Terminal 2 — Expo Metro:

```powershell
cd "C:\path\to\Attendance"
npx expo start --lan
```

Useful URLs:

- Expo web: `http://localhost:8081`
- API documentation: `http://localhost:8010/docs`
- Backend readiness: `http://localhost:8010/api/v1/health/ready`
- Expo Go: use the `exp://LAN_IP:8081` link or QR code printed by Metro.

## Development accounts

Local start scripts seed these development-only accounts:

| Role | Identifier | Password |
| --- | --- | --- |
| Administrator | `admin@christuniversity.in` | `LocalTest123!` |
| Faculty | `tester.faculty@christuniversity.in` | `LocalTest123!` |

Change or remove seeded credentials before any shared or production deployment.

## Attendance workflow

1. Sign in as the administrator.
2. Create faculty, students, and classes.
3. Assign faculty to a class and enroll students from the class detail page.
4. Open each student and upload one or more clear enrollment photos. The mobile picker can upload them incrementally.
5. Confirm at least one photo shows `Ready`; three to five varied photos are recommended. Each enrollment photo must contain exactly one clear, well-lit face.
6. Sign in as faculty, select a class, and take attendance with Photo or Panorama.
7. For desktop testing, use the class detail `Upload test photo` action.
8. Review detected face boxes and unmatched faces, correct uncertain records if needed, and finalize attendance.

The system deliberately does not guess an identity when the similarity score is below the configured threshold. A detected face can therefore remain unmatched even though face detection succeeded. Recognition quality depends on accepted enrollment photos of the same person under representative lighting and angles.

Android camera captures allow Expo to normalize sensor orientation before upload. The backend also applies EXIF orientation consistently when validating dimensions, running face detection, stitching panorama frames, and generating annotated previews. This keeps face boxes aligned with the photograph even for gallery files or older camera vendors that store rotation as metadata.

## Panorama behavior

Panorama mode guides the user through an approximately 120-degree upright sweep. It automatically captures seven overlapping frames only after the phone reaches the next angle, is level, and remains stable for 300 ms. The camera route follows device orientation so ordinary wide classroom photos can be taken in landscape. Android sweep progress combines absolute azimuth with the portrait gyroscope axis because sensor vendors do not report portrait rotation consistently. Faculty can also tap the shutter after moving to capture the next overlapping view manually, so an unreliable sensor cannot strand a sweep. Zoom and continuous torch settings are locked after a sweep starts so every frame has consistent camera geometry and lighting. The backend contract is unchanged: the frontend uploads the seven source files to `POST /api/v1/attendance/panorama/frames`, then attaches the returned draft to a normal attendance session. The backend stitches those frames into one classroom image before face detection. Motion permission is requested on iOS; Android reads its available rotation and acceleration sensors directly because Expo otherwise maps this call to the unrelated Physical activity permission. Gallery upload remains available for testing when a camera is unavailable.

## Storage and privacy

Local uploads are stored under `backend/data/private/` and database records are stored in PostgreSQL. Both the uploaded images and database contents are excluded from Git. They may contain biometric and attendance data and must be handled according to the institution's privacy and retention requirements.

The following local-only items must never be committed:

- Root and backend `.env` files.
- PostgreSQL dumps containing real people or attendance records.
- `backend/data/` uploaded images.
- `.venv/` and `node_modules/`.
- Secret keys, access tokens, or production passwords.

## Validation commands

```powershell
npm run typecheck
npm run lint
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Run `git diff --check` before committing. Do not commit root/backend `.env` files, private image data, model weights, database dumps, `node_modules`, or `.venv`.

## Current recognition notes

During the latest local test, the classroom photo contained six detectable faces. All six remained unmatched because the roster had insufficient usable face enrollment data. One student had four saved photos, but only one was accepted: the other images contained two faces, no detectable face, or excessive blur. Uploading at least two more accepted single-person portraits is required before treating recognition results as meaningful.

The standard similarity threshold is `0.50` (overridable through `EDUTRACE_MATCH_THRESHOLD` for a validated deployment). Enrollment uses a conservative blur-variance floor of `15`, brightness and exactly-one-face checks, and rejects severe side profiles. Automatic matching requires at least one accepted enrolment image and skips classroom faces smaller than 32 pixels. InsightFace aligns and crops eligible faces from five landmarks before ArcFace embedding. Calibrate quality and match thresholds with a separate, consented validation dataset before production use. Keep manual review available for uncertain or unmatched results.

## Production work still required

- Replace development passwords and configure a strong JWT secret.
- Use managed object storage instead of local disk.
- Enable Redis/Celery for durable background jobs.
- Enable and validate pgvector where appropriate.
- Add TLS, backups, monitoring, retention rules, and role-specific operational controls.
- Validate recognition accuracy, demographic performance, thresholds, and model licensing with an approved dataset.
- Build a development client if native panorama or other custom native-camera functionality is introduced beyond Expo Go capabilities.
# Academic structure migration status

Revision `0011_academic_refs` adds nullable academic foreign keys and persisted student mapping state. All 21 existing students explicitly reference School of Sciences → Computer Science → BCA. The backend blocks enrolment of unmapped students and validates every hierarchy path.

After explicit administrator mapping, 20 students are fully mapped to School of Sciences → Computer Science → BCA → Batch - 1 → Section A. `TEST-S001` remains `NEEDS_MAPPING`: its programme is BCA, while batch and section remain nullable because those values were not explicitly supplied. Its legacy CSE / Semester 5 / A values are preserved and are not used as inferred foreign keys. Run `python scripts/export_mapping_report.py` from `backend` for the current reconciliation report.

Revision `0012_class_types` adds Settings-managed class types. Class creation and editing validate those values server-side. The current database is authoritative and contains 21 students, one class with 20 enrolments, seven attendance sessions, and their protected attendance, recognition, face-enrolment, and audit records. Deleted historical data must not be reconstructed unless a backup is separately inspected and approved. The legacy academic text fields remain in the API and database for additive compatibility.

Revision `0013_academic_settings` persists the institution academic-session label and semester count. Settings now controls both values, and new class forms consume them instead of deriving them from the computer's current year.

The admin application now exposes grouped navigation, nine hierarchy/people/teaching dashboard metrics, exact attention links, complete hierarchy CRUD with safe archive impact checks, reusable curriculum assignments, explicit student placement, hierarchy-scoped faculty/classes/timetable/attendance/reports, a reviewed Class → Faculty → Roster → Timetable creation flow, class setup readiness, faculty/class activity, and exports for the current report scope in CSV, XLSX, PDF, and JSON. Faculty assignment is optional during class setup when no lecturer has been mapped to the selected Department; the class workspace and Dashboard then surface the missing assignment. Report exports preserve the selected Subject filter, and query-cache identities include every hierarchy filter so switching context cannot reuse another scope's results.
