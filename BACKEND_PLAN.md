# EduTrace Multi-Image Attendance Backend

## Goal

Build a standalone FastAPI backend for authentication, institution administration, multi-image face enrolment, multi-image classroom attendance, review, finalization, reports, and append-only audit history. Frontend integration is outside this repository change.

## Architecture

- FastAPI and Pydantic provide the versioned REST API and OpenAPI contract.
- SQLAlchemy 2 and Alembic manage PostgreSQL 17 with pgvector.
- Celery and Redis execute recognition jobs outside request handlers.
- S3-compatible object storage holds private source images; MinIO is used locally.
- ONNX Runtime loads separately licensed SCRFD and ArcFace-compatible ONNX models, preferring CUDA and falling back to CPU.
- Docker Compose runs PostgreSQL, Redis, MinIO, the API, and one GPU worker.

## Core invariants

- Faculty can create attendance sessions only for assigned classes.
- Recognition candidates are the union of students enrolled in the selected classes and never the institution-wide student set.
- A session accepts 1-8 classroom images and a student accepts 3-5 active enrolment images.
- `(session_id, student_id)` is unique.
- Automated status/evidence is immutable; faculty status is amended separately.
- When recognition succeeds, an enrolled student with active face enrolment and no accepted observation is marked `ABSENT`.
- Missing face enrolment, unusable session images, model failure, conflicting identities, and ambiguous results remain `UNKNOWN` or `REVIEW`.
- Finalized changes require a reason and always create an audit event.
- Audit events have no update or delete API.
- Processing is idempotent by session, image checksums, and model version.

## Recognition pipeline

1. Validate and privately store uploads.
2. Decode safely, normalize orientation, and calculate quality metrics.
3. Detect at multiple scales and overlapping tiles; merge duplicate boxes.
4. Align detected faces and generate normalized embeddings in GPU batches.
5. Compare only with active embeddings in the selected-class candidate set.
6. Aggregate scores per student and retain leading candidates as evidence.
7. Apply calibrated acceptance and ambiguity thresholds.
8. Merge repeated sightings across images and upsert one record per eligible student.

Real model weights are deployment inputs. Public InsightFace weights must not be shipped unless their license is appropriate for the institution.

## Capacity target

- 1-8 classroom images per session; 3-4 overlapping high-resolution images recommended for approximately 100 students.
- Up to 150 detected faces per image and 500 eligible students per combined session.
- Target completion: 60 seconds for four suitable images on the available RTX 3050 6 GB.
- Accuracy and latency are accepted only after a consented classroom benchmark at 25, 50, 75, and approximately 100 students.

## Delivery gates

- Unit and integration tests cover authorization, candidate isolation, pagination, image limits, retries, status transitions, finalization, amendments, and auditing.
- No out-of-scope matches or duplicate attendance records; absence is produced only after successful recognition against an active student gallery.
- OpenAPI documents all integration endpoints and RFC 9457 errors.
- Deployment documentation records model license, version, thresholds, retention, and benchmark results.
