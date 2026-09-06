from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.openapi.utils import get_openapi
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import get_settings
from .db import Base, engine
from .errors import Problem, problem_handler
from .routes_admin import router as admin_router
from .routes_attendance import router as attendance_router
from .routes_auth import router as auth_router
from .security import require_roles
from .models import Role, User
from fastapi import Depends


@asynccontextmanager
async def lifespan(_: FastAPI):
    if get_settings().env in {"development", "test"}:
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            if engine.dialect.name == "postgresql":
                conn.execute(text("ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS departments JSON"))
                conn.execute(text("ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS faculty_roles JSON"))
            elif engine.dialect.name == "sqlite":
                try: conn.execute(text("ALTER TABLE institution_settings ADD COLUMN departments JSON"))
                except Exception: pass
                try: conn.execute(text("ALTER TABLE institution_settings ADD COLUMN faculty_roles JSON"))
                except Exception: pass
    yield


app = FastAPI(
    title="EduTrace Multi-Image Attendance API",
    version="0.1.0",
    description="Standalone, class-scoped attendance backend. Automated recognition is advisory; faculty decisions are authoritative.",
    lifespan=lifespan,
)
app.add_exception_handler(Problem, problem_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in get_settings().cors_origins.split(",") if x.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(attendance_router, prefix="/api/v1")


def custom_openapi():
    """Keep multipart uploads compatible with Swagger UI's file picker."""
    if app.openapi_schema:return app.openapi_schema
    schema=get_openapi(title=app.title,version=app.version,description=app.description,routes=app.routes)
    def visit(node):
        if isinstance(node,dict):
            if node.get("contentMediaType")=="application/octet-stream":node.pop("contentMediaType");node["format"]="binary"
            for value in node.values():visit(value)
        elif isinstance(node,list):
            for value in node:visit(value)
    visit(schema);app.openapi_schema=schema;return schema


app.openapi=custom_openapi

@app.get("/",include_in_schema=False)
def root():
    return RedirectResponse("/docs")


@app.get("/api/v1/health/live", tags=["System"])
def live():
    return {"status": "ok"}


@app.get("/api/v1/health/ready", tags=["System"])
def ready():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok"}


@app.get("/api/v1/models/status", tags=["System"])
def model_status(_: User = Depends(require_roles(Role.ADMIN))):
    s = get_settings()
    from pathlib import Path
    return {
        "model_version": s.model_version,
        "backend": s.recognition_backend,
        "detector_configured": Path(s.detector_model_path).is_file() or Path(s.yunet_model_path).is_file(),
        "embedder_configured": Path(s.embedder_model_path).is_file() or Path(s.sface_model_path).is_file(),
        "raw_embeddings_exposed": False,
    }
