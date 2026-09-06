from functools import lru_cache

from pydantic import Field
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
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    model_version: str = "unconfigured"
    detector_model_path: str = "models/scrfd.onnx"
    embedder_model_path: str = "models/arcface.onnx"
    recognition_backend: Literal["auto", "scrfd_arcface", "opencv"] = "auto"
    yunet_model_path: str = "models/face_detection_yunet.onnx"
    sface_model_path: str = "models/face_recognition_sface.onnx"
    match_threshold: float = Field(default=0.45, ge=-1, le=1)
    ambiguity_margin: float = Field(default=0.05, ge=0, le=2)
    duplicate_template_threshold: float = Field(default=0.995, ge=-1, le=1)
    cross_identity_review_threshold: float = Field(default=0.75, ge=-1, le=1)
    max_upload_bytes: int = 25 * 1024 * 1024
    max_panorama_video_bytes: int = 220 * 1024 * 1024
    max_image_pixels: int = 60_000_000
    min_enrolment_images: int = 3
    max_enrolment_images: int = 5
    min_enrolment_blur_variance: float = Field(default=15.0, ge=0)
    max_session_images: int = 8
    max_candidates: int = 500


@lru_cache
def get_settings() -> Settings:
    return Settings()
