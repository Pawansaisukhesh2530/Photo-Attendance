# EduTrace Pro — Project Handover

## Current state

EduTrace Pro is an Expo/React Native attendance application backed by FastAPI and PostgreSQL. The checked-in application supports administrator and faculty roles, student/class/faculty management, class enrollment, face-photo enrollment, standard classroom-photo attendance, a guided panorama capture, gallery upload for testing, manual attendance correction, audit history, and CSV/XLSX/PDF/JSON exports.

The local computer-vision backend uses OpenCV YuNet for face detection and SFace for embeddings. It accepts JPEG, PNG, and HEIC/HEIF phone images. Large phone images are resized for detection and mapped back to full-resolution coordinates for result overlays.

Last validation performed on September 6, 2026:

- `npm run typecheck` passed.
- `npm run lint` passed.
- Backend test suite passed: 19 tests.
- PostgreSQL readiness returned `{"status":"ready","database":"ok"}`.
- A 4284 × 5712 HEIC classroom photo was stored, processed, and returned six numbered face detections.

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

Place these separately obtained OpenCV-compatible models in `backend/models/`:

```text
face_detection_yunet.onnx
face_recognition_sface.onnx
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
| Administrator | `admin@example.edu` | `LocalTest123!` |
| Faculty | `tester.faculty@example.edu` | `LocalTest123!` |

Change or remove seeded credentials before any shared or production deployment.

## Attendance workflow

1. Sign in as the administrator.
2. Create faculty, students, and classes.
3. Assign faculty to a class and enroll students from the class detail page.
4. Open each student and upload one or more clear enrollment photos. The mobile picker can upload them incrementally.
5. Confirm at least three photos show `Ready`. Each enrollment photo must contain exactly one clear, well-lit face.
6. Sign in as faculty, select a class, and take attendance with Photo or Panorama.
7. For desktop testing, use the class detail `Upload test photo` action.
8. Review detected face boxes and unmatched faces, correct uncertain records if needed, and finalize attendance.

The system deliberately does not guess an identity when the similarity score is below the configured threshold. A detected face can therefore remain unmatched even though face detection succeeded. Recognition quality depends on accepted enrollment photos of the same person under representative lighting and angles.

## Panorama behavior

Panorama mode guides the user through an approximately 120-degree sweep and automatically captures seven overlapping frames. The backend stitches those frames into one classroom image before face detection. Device-motion permission is required. Gallery upload remains available for testing when a camera is unavailable.

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

The local similarity threshold is `0.50`. Enrollment uses a conservative blur-variance floor of `15` plus brightness and exactly-one-face checks. Calibrate both quality and match thresholds with a separate, consented validation dataset before production use. Keep manual review available for uncertain or unmatched results.

## Production work still required

- Replace development passwords and configure a strong JWT secret.
- Use managed object storage instead of local disk.
- Enable Redis/Celery for durable background jobs.
- Enable and validate pgvector where appropriate.
- Add TLS, backups, monitoring, retention rules, and role-specific operational controls.
- Validate recognition accuracy, demographic performance, thresholds, and model licensing with an approved dataset.
- Build a development client if native panorama or other custom native-camera functionality is introduced beyond Expo Go capabilities.
