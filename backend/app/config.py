from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="EDUTRACE_", env_file=".env", extra="ignore")

    env: str = "development"
    cors_origins: str = "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006"
    database_url: str = "sqlite:///./edutrace.db"
    pgvector_enabled: bool = False
    redis_url: str = "redis://localhost:6379/0"
    queue_backend: Literal["local", "celery"] = "local"
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "edutrace"
    s3_secret_key: str = "change-this-secret"
    s3_bucket: str = "edutrace-private"
    storage_backend: Literal["local", "s3"] = "local"
    local_storage_path: str = "data/private"
    jwt_secret: str = "development-only-change-this-secret"
    default_account_password: str = Field(default="LocalTest123!", min_length=8, max_length=200)
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    model_version: str = "unconfigured"
    recognition_backend: Literal["insightface"] = "insightface"
    insightface_root: str = "models/insightface"
    insightface_model_pack: str = "buffalo_l"
    insightface_detection_confidence: float = Field(default=0.45, ge=0.01, le=1)
    insightface_detection_size: int = Field(default=1280, ge=320, le=2048)
    insightface_tile_size: int = Field(default=1600, ge=640, le=4096)
    insightface_tile_overlap: float = Field(default=0.25, ge=0, le=0.75)
    insightface_tile_trigger_dimension: int = Field(default=1800, ge=640, le=8192)
    insightface_max_faces_per_image: int = Field(default=250, ge=1, le=1000)
    min_attendance_face_size: int = Field(default=32, ge=16, le=512)
    # ArcFace cosine similarity threshold. Keep the agreed standard baseline unless an
    # environment-specific calibration explicitly overrides it.
    match_threshold: float = Field(default=0.50, ge=-1, le=1)
    ambiguity_margin: float = Field(default=0.05, ge=0, le=2)
    duplicate_template_threshold: float = Field(default=0.995, ge=-1, le=1)
    cross_identity_review_threshold: float = Field(default=0.75, ge=-1, le=1)
    max_upload_bytes: int = 25 * 1024 * 1024
    max_panorama_video_bytes: int = 220 * 1024 * 1024
    max_image_pixels: int = 60_000_000
    # One accepted portrait is enough for beta testing. Additional templates
    # remain strongly recommended for pose and age variation.
    min_enrolment_images: int = Field(default=1, ge=1, le=5)
    max_enrolment_images: int = 5
    min_enrolment_blur_variance: float = Field(default=15.0, ge=0)
    max_enrolment_eye_slope: float = Field(default=0.35, ge=0, le=2)
    min_enrolment_eye_distance_ratio: float = Field(default=0.20, ge=0, le=1)
    max_enrolment_secondary_face_area_ratio: float = Field(default=0.10, ge=0, le=1)
    enrolment_duplicate_face_overlap_ratio: float = Field(default=0.50, ge=0, le=1)
    max_session_images: int = 8
    max_candidates: int = 500

    @field_validator("recognition_backend", mode="before")
    @classmethod
    def migrate_legacy_recognition_backend(cls, value):
        return "insightface" if str(value).lower() == "opencv" else value

    @model_validator(mode="after")
    def align_legacy_model_version(self):
        if self.model_version.startswith("opencv-"):
            self.model_version = "insightface-buffalo-l-v3"
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
