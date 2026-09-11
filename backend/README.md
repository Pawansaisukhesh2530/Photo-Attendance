# EduTrace Backend

FastAPI and PostgreSQL backend for the EduTrace attendance application. The API owns authentication, administration, enrolment, private image storage, recognition jobs, attendance decisions, exports, settings, and audit history. The Expo client uses these real API routes; there is no mock service switch.

## Quick start on Windows

Prerequisites are Node.js/npm, Python 3.12 or newer, and PostgreSQL on port `5432`. The startup script downloads and validates the configured InsightFace model package.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[test]"
.\install-insightface-gpu.ps1
.\start-local-postgres.ps1 -User postgres -Database edutrace -Port 8010
```

`install-insightface-gpu.ps1` replaces the CPU ONNX Runtime with its GPU build and verifies that InsightFace can access the CUDA execution provider. Skip it on a CPU-only computer.

The PostgreSQL script creates the database when needed, applies Alembic migrations, seeds only the local administrator, downloads the models, starts the local recognition worker, and serves Uvicorn on `http://localhost:8010`. It prompts for the PostgreSQL password unless `PGPASSWORD` is set. Check `/docs`, `/api/v1/health/live`, and `/api/v1/health/ready` before frontend testing.

## Run with Docker

1. Copy `.env.example` to `.env` and replace all secrets.
2. Run `docker compose build`; the image downloads and validates the InsightFace `buffalo_l` package.
3. Run `docker compose up`.
4. Create the first administrator: `docker compose exec api python -m app.seed --email admin@christuniversity.in --password 'replace-with-a-strong-password'`.
5. Open `http://localhost:8000/docs`.

The worker safely returns `UNKNOWN` records when model files are unavailable. It never invents recognition results. Models and thresholds must be validated with a consented classroom dataset before deployment.

## Recognition pipeline

- InsightFace `buffalo_l` uses SCRFD-10GF for five-landmark face detection and a ResNet50 ArcFace recognition model for normalized 512-dimensional embeddings.
- The worker runs both the full image and overlapping high-resolution tiles, maps detections to original coordinates, and merges duplicate boxes.
- Matching uses exact cosine similarity against active embeddings belonging only to students enrolled in the selected classes.
- `EDUTRACE_MODEL_VERSION` is an immutable model/build identifier. Embeddings from a different model version are excluded from matching and must be reprocessed.
- `EDUTRACE_MATCH_THRESHOLD` and `EDUTRACE_AMBIGUITY_MARGIN` must be calibrated from a separate, consented validation set.
- Enrolment merges overlapping detections of the same face and may ignore a tiny secondary portrait such as a face printed on an ID card. Separate, similarly sized faces and unsupported side profiles are rejected. The beta can match from one accepted image, while three to five varied images remain recommended.
- InsightFace uses five landmarks to align and crop every eligible detection to ArcFace's canonical face input before generating its embedding. Classroom faces smaller than 32 pixels on their shortest side remain visible as `UNKNOWN` evidence. Capture original high-resolution images so distant faces retain enough identity detail.

For classes near 100 students, capture 3–4 overlapping high-resolution views. The worker preserves candidate evidence and merges observations into one attendance record per enrolled student.

InsightFace runs detection, alignment, and recognition through ONNX Runtime with CUDA followed by CPU fallback. The InsightFace library code is MIT licensed, while its public pretrained model packages are limited to non-commercial research. Obtain appropriately licensed compatible models before institutional production. Downloaded weights are ignored by Git.

## Connecting the Expo frontend

From the repository root, set `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8010/api/v1` in `.env` for web. For Expo Go on a phone, replace `127.0.0.1` with the computer's LAN IP and restart Metro with `npx expo start --lan`.

Local administrator credentials are `admin@christuniversity.in` / `LocalTest123!`; change them before any shared deployment. Admin-created departments and faculty roles are stored in the settings API and populate the forms' dropdowns.

Every faculty account created through the administration API receives the configured default password `LocalTest123!`. The frontend does not send or generate a separate password.

The worker accepts JPEG, PNG, HEIC, and HEIF uploads. A student enrolment image must contain exactly one clear face. Classroom images may contain many faces; unmatched detections remain `UNKNOWN` evidence and are not attached to an enrolled student.

## Development checks

```powershell
.\.venv\Scripts\python.exe -m app.download_models
.\.venv\Scripts\python.exe -m pytest
```

The beta cosine-similarity threshold is `0.50`, with a `0.05` ambiguity margin. One accepted front-facing enrolment embedding enables matching; three to five varied images improve reliability. These values were validated against the current local sample and still require a representative institutional benchmark before production. Local PostgreSQL may run with `EDUTRACE_PGVECTOR_ENABLED=false`; production should enable the pgvector extension.

See [`../BACKEND_PLAN.md`](../BACKEND_PLAN.md) for capacity, privacy, model licensing, and release gates.

## Capacity benchmark

Copy `benchmark-manifest.example.json`, point it at consented classroom images, set the expected visible-face counts, and run:

```powershell
.\.venv\Scripts\python.exe -m app.benchmark C:\path\to\dataset C:\path\to\manifest.json --output benchmark-results.json
```

This records detector recall and end-to-end per-image latency. Identification accuracy requires labelled identities and must be evaluated separately before attendance use.
