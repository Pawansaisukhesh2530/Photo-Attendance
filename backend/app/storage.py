import hashlib
import io
from pathlib import Path
from dataclasses import dataclass

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image, ImageOps, UnidentifiedImageError
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

from .config import get_settings
from .errors import Problem

ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "HEIF": "image/heic"}


@dataclass(frozen=True)
class ValidatedImage:
    content: bytes
    checksum: str
    mime_type: str
    width: int
    height: int


def validate_image(content: bytes) -> ValidatedImage:
    settings = get_settings()
    if not content or len(content) > settings.max_upload_bytes:
        raise Problem(413, "Invalid image size", f"Each image must be at most {settings.max_upload_bytes} bytes.")
    try:
        with Image.open(io.BytesIO(content)) as source:
            source.verify()
        with Image.open(io.BytesIO(content)) as source:
            image = ImageOps.exif_transpose(source)
            width, height = image.size
            fmt = source.format or ""
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise Problem(422, "Invalid image", "The uploaded file is not a safe, supported image.")
    if fmt not in ALLOWED_FORMATS:
        raise Problem(415, "Unsupported image", "Use JPEG, PNG, or HEIC images.")
    if width * height > settings.max_image_pixels:
        raise Problem(413, "Image dimensions too large", "The decoded image exceeds the pixel limit.")
    return ValidatedImage(content, hashlib.sha256(content).hexdigest(), ALLOWED_FORMATS[fmt], width, height)


class ObjectStorage:
    def __init__(self):
        s = get_settings()
        self.backend = s.storage_backend
        self.bucket = s.s3_bucket
        self.root = Path(s.local_storage_path).resolve()
        if self.backend == "local":
            self.root.mkdir(parents=True, exist_ok=True)
            self.client = None
            return
        self.client = boto3.client("s3", endpoint_url=s.s3_endpoint, aws_access_key_id=s.s3_access_key, aws_secret_access_key=s.s3_secret_key)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise Problem(400, "Invalid object key", "The storage key is invalid.")
        return path

    def ensure_bucket(self) -> None:
        if self.backend == "local": return
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            self.client.create_bucket(Bucket=self.bucket)

    def put(self, key: str, image: ValidatedImage) -> None:
        if self.backend == "local":
            path = self._path(key); path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(image.content); return
        try:
            self.ensure_bucket()
            self.client.put_object(Bucket=self.bucket, Key=key, Body=image.content, ContentType=image.mime_type)
        except (BotoCoreError, ClientError) as exc:
            raise Problem(503, "Storage unavailable", "The image could not be stored.") from exc

    def get(self, key: str) -> bytes:
        if self.backend == "local":
            try: return self._path(key).read_bytes()
            except OSError as exc: raise Problem(503, "Storage unavailable", "The image could not be loaded.") from exc
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except (BotoCoreError, ClientError) as exc:
            raise Problem(503, "Storage unavailable", "The image could not be loaded.") from exc

    def signed_url(self, key: str) -> str:
        if self.backend == "local":
            raise Problem(501, "Signed URLs unavailable", "Use the authenticated media endpoint in local mode.")
        return self.client.generate_presigned_url("get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=300)
