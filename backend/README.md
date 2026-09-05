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

## Local beta with the real frontend

Install the backend with the `vision` and `test` extras, place YuNet and SFace ONNX models under `models/`, then start the PostgreSQL-backed API and worker:

```powershell
.\start-local-postgres.ps1 -User postgres -Database edutrace -Port 8010
```

From the repository root, set `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8010/api/v1` in `.env`, run `npm install`, and start the Expo frontend with `npm start -- --web --port 8081`. Sign in as the seeded administrator to create faculty, students, classes, assignments, enrolments, and face photos. Faculty accounts take attendance with 1–8 classroom images. Results include the annotated photograph, model scores, review decisions, and exports.

The local threshold is `0.50`. Calibrate production thresholds on representative, consented classroom images before deployment. Local PostgreSQL may run with `EDUTRACE_PGVECTOR_ENABLED=false`; production should enable the pgvector extension.
## Capacity benchmark

Copy `benchmark-manifest.example.json`, point it at consented classroom images, set the expected visible-face counts, and run:

```sh
python -m app.benchmark /path/to/dataset /path/to/manifest.json --output benchmark-results.json
```

This records detector recall and end-to-end per-image latency. Identification accuracy requires labelled identities and must be evaluated separately before attendance use.
