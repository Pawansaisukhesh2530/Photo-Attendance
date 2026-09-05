# EduTrace Backend

Standalone FastAPI backend for multi-image classroom attendance.

## Run locally

1. Copy `.env.example` to `.env` and replace all secrets.
2. Place separately licensed detector and embedding ONNX files under `models/`.
3. Run `docker compose up --build`.
4. Create the first administrator:
   `docker compose exec api python -m app.seed --email admin@example.edu --password 'replace-with-a-strong-password'`
5. Open `http://localhost:8000/docs`.

The worker safely returns `UNKNOWN` records when model files are not configured. It never invents recognition results. Model adapters and thresholds must be validated with a consented classroom dataset before deployment.

## Model contract

- `scrfd.onnx` must use the common InsightFace SCRFD score, bounding-box, and five-landmark output layout.
- `arcface.onnx` must accept aligned 112×112 RGB face crops and return 512-dimensional embeddings.
- Set `EDUTRACE_MODEL_VERSION` to an immutable model/build identifier.
- Confirm the model-weight license before use. The repository intentionally contains no weights.
- Tune `EDUTRACE_MATCH_THRESHOLD` and `EDUTRACE_AMBIGUITY_MARGIN` only from a separate, consented validation set.

For classes near 100 students, capture 3–4 overlapping high-resolution views. The worker combines full-frame and overlapping tiled detections, preserves candidate evidence, and merges observations into one record per enrolled student.

## Development checks

```sh
python -m pip install -e ".[test]"
pytest
```

See [`../BACKEND_PLAN.md`](../BACKEND_PLAN.md) for capacity, privacy, model licensing, and release gates.

## Temporary recognition tester

For a simple local run without Docker, install the project plus `vision` and `test`, place the OpenCV YuNet and SFace ONNX models in `models/`, and run:

```powershell
.\start-local.ps1
```

Open `http://127.0.0.1:8000/tester`. The page supports administrator and faculty login, 3–5 face enrolment images, 1–8 classroom images, job polling, annotated detections, faculty corrections, finalization, and CSV, Excel, PDF, or JSON downloads. Local mode uses `data/private` and a separate polling worker. Production continues to use S3-compatible storage and Celery by setting `EDUTRACE_STORAGE_BACKEND=s3` and `EDUTRACE_QUEUE_BACKEND=celery`.

OpenCV publishes `0.363` as an LFW verification reference for SFace. The local classroom tester uses a stricter cosine threshold of `0.50` because crowded-image testing showed unrelated faces reaching roughly `0.45`. Calibrate the production threshold on representative consented classroom images before deployment.

Create the labelled local faculty, student, class, assignment, and enrolment used by the tester with:

```powershell
$env:EDUTRACE_DATABASE_URL = "sqlite:///$($env:TEMP.Replace('\','/'))/edutrace-local/edutrace.db"
& "$env:TEMP\edutrace-backend-venv\Scripts\python.exe" -m app.seed --demo
```

To run the tester against a local PostgreSQL server that does not have pgvector installed:

```powershell
$env:PGPASSWORD = "<your local PostgreSQL password>"
.\start-local-postgres.ps1 -User postgres
```

This development fallback stores embeddings as PostgreSQL JSON because exact matching happens in the worker. Production should keep `EDUTRACE_PGVECTOR_ENABLED=true` and install the `vector` extension.

## Capacity benchmark

Copy `benchmark-manifest.example.json`, point it at consented classroom images, set the expected visible-face counts, and run:

```sh
python -m app.benchmark /path/to/dataset /path/to/manifest.json --output benchmark-results.json
```

This records detector recall and end-to-end per-image latency. Identification accuracy requires labelled identities and must be evaluated separately before attendance use.
