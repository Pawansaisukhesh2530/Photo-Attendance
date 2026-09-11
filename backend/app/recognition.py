"""InsightFace detection, alignment, embeddings, and class-scoped matching."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

from .config import get_settings


class ModelUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class Detection:
    box: tuple[float, float, float, float]
    landmarks: np.ndarray
    confidence: float
    embedding: np.ndarray | None
    quality: dict


@dataclass(frozen=True)
class MatchDecision:
    student_id: str | None
    status: str
    score: float | None
    reason: str | None
    candidates: list[tuple[str, float]]


@dataclass(frozen=True)
class _DetectedFace:
    box: tuple[float, float, float, float]
    confidence: float
    landmarks: np.ndarray
    embedding: np.ndarray | None
    source: str


def normalize(vector: np.ndarray) -> np.ndarray:
    value = np.asarray(vector, dtype=np.float32).reshape(-1)
    norm = float(np.linalg.norm(value))
    if not np.isfinite(norm) or norm <= 1e-12:
        raise ValueError("Invalid zero or non-finite embedding")
    return value / norm


def decide_match(probe: np.ndarray, gallery: dict[str, list[np.ndarray]]) -> MatchDecision:
    settings = get_settings()
    probe = normalize(probe)
    scores = []
    for student_id, templates in gallery.items():
        if not templates:
            continue
        similarities = sorted(
            (float(np.dot(probe, normalize(template))) for template in templates),
            reverse=True,
        )
        aggregate = similarities[0] if len(similarities) == 1 else 0.7 * similarities[0] + 0.3 * similarities[1]
        scores.append((student_id, aggregate))
    scores.sort(key=lambda item: item[1], reverse=True)
    top = scores[:3]
    if not top or top[0][1] < settings.match_threshold:
        return MatchDecision(None, "UNKNOWN", top[0][1] if top else None, "BELOW_THRESHOLD", top)
    if len(top) > 1 and top[0][1] - top[1][1] < settings.ambiguity_margin:
        return MatchDecision(None, "REVIEW", top[0][1], "AMBIGUOUS_CANDIDATES", top)
    return MatchDecision(top[0][0], "PRESENT", top[0][1], None, top)


def _decode_bgr(content: bytes) -> np.ndarray:
    try:
        with Image.open(BytesIO(content)) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            rgb = np.asarray(image, dtype=np.uint8)
    except Exception as exc:
        raise ValueError("Image could not be decoded") from exc
    return np.ascontiguousarray(rgb[:, :, ::-1])


def _iou(first: _DetectedFace, second: _DetectedFace) -> float:
    ax1, ay1, ax2, ay2 = first.box
    bx1, by1, bx2, by2 = second.box
    intersection = max(0.0, min(ax2, bx2) - max(ax1, bx1)) * max(0.0, min(ay2, by2) - max(ay1, by1))
    first_area = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    second_area = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    return intersection / (first_area + second_area - intersection + 1e-6)


def _deduplicate(faces: list[_DetectedFace], threshold: float = 0.4) -> list[_DetectedFace]:
    kept: list[_DetectedFace] = []
    for face in sorted(faces, key=lambda item: item.confidence, reverse=True):
        if all(_iou(face, existing) <= threshold for existing in kept):
            kept.append(face)
    return kept


def _blur_variance(face: np.ndarray) -> float:
    if face.size == 0 or min(face.shape[:2]) < 3:
        return 0.0
    gray = 0.114 * face[:, :, 0] + 0.587 * face[:, :, 1] + 0.299 * face[:, :, 2]
    laplacian = (
        4 * gray[1:-1, 1:-1]
        - gray[:-2, 1:-1]
        - gray[2:, 1:-1]
        - gray[1:-1, :-2]
        - gray[1:-1, 2:]
    )
    return float(np.var(laplacian))


def _tile_origins(length: int, tile_size: int, step: int) -> list[int]:
    if length <= tile_size:
        return [0]
    origins = list(range(0, length - tile_size + 1, step))
    final = length - tile_size
    if origins[-1] != final:
        origins.append(final)
    return origins


def _model_directory() -> Path:
    settings = get_settings()
    return Path(settings.insightface_root).expanduser().resolve() / "models" / settings.insightface_model_pack


def model_files_status() -> dict[str, bool]:
    directory = _model_directory()
    return {
        "detector_configured": (directory / "det_10g.onnx").is_file(),
        "embedder_configured": (directory / "w600k_r50.onnx").is_file(),
    }


class InsightFaceEngine:
    """Run the InsightFace model pack through ONNX Runtime with CUDA/CPU fallback."""

    def __init__(self):
        settings = get_settings()
        try:
            import onnxruntime as ort
            from insightface.app import FaceAnalysis

            if hasattr(ort, "preload_dlls"):
                ort.preload_dlls(directory="")
            available = ort.get_available_providers()
            providers = [name for name in ("CUDAExecutionProvider", "CPUExecutionProvider") if name in available]
            if not providers:
                raise RuntimeError("ONNX Runtime has no CUDA or CPU execution provider")
            self.app = FaceAnalysis(
                name=settings.insightface_model_pack,
                root=str(Path(settings.insightface_root).expanduser().resolve()),
                allowed_modules=["detection", "recognition"],
                providers=providers,
            )
            self.app.prepare(
                ctx_id=0,
                det_thresh=settings.insightface_detection_confidence,
                det_size=(settings.insightface_detection_size, settings.insightface_detection_size),
            )
        except Exception as exc:
            raise ModelUnavailable(f"InsightFace models could not be loaded: {exc}") from exc
        self.settings = settings
        active = {
            provider
            for model in self.app.models.values()
            for provider in getattr(model, "session", None).get_providers()
        }
        self.providers = [name for name in providers if name in active]

    def _analyse_view(self, image: np.ndarray, offset_x: int, offset_y: int, source: str) -> list[_DetectedFace]:
        result = []
        for face in self.app.get(image, max_num=self.settings.insightface_max_faces_per_image):
            bbox = np.asarray(face.bbox, dtype=np.float32)
            landmarks = np.asarray(face.kps, dtype=np.float32)
            if landmarks.shape != (5, 2):
                continue
            embedding = getattr(face, "normed_embedding", None)
            result.append(
                _DetectedFace(
                    box=(
                        float(bbox[0] + offset_x),
                        float(bbox[1] + offset_y),
                        float(bbox[2] + offset_x),
                        float(bbox[3] + offset_y),
                    ),
                    confidence=float(face.det_score),
                    landmarks=landmarks + np.array([offset_x, offset_y], dtype=np.float32),
                    embedding=normalize(embedding) if embedding is not None else None,
                    source=source,
                )
            )
        return result

    def _detect(self, image: np.ndarray) -> list[_DetectedFace]:
        height, width = image.shape[:2]
        faces = self._analyse_view(image, 0, 0, "full")
        if max(height, width) > self.settings.insightface_tile_trigger_dimension:
            tile = min(self.settings.insightface_tile_size, max(height, width))
            step = max(1, int(tile * (1 - self.settings.insightface_tile_overlap)))
            for y in _tile_origins(height, tile, step):
                for x in _tile_origins(width, tile, step):
                    view = image[y : min(y + tile, height), x : min(x + tile, width)]
                    if min(view.shape[:2]) < 320:
                        continue
                    faces.extend(self._analyse_view(view, x, y, f"tile:{x}:{y}"))
        unique = _deduplicate(faces)
        return sorted(unique, key=lambda item: item.confidence, reverse=True)[: self.settings.insightface_max_faces_per_image]

    def analyse(self, content: bytes) -> list[Detection]:
        image = _decode_bgr(content)
        height, width = image.shape[:2]
        detections = []
        for face in self._detect(image):
            x1, y1, x2, y2 = face.box
            left, top = max(0, int(x1)), max(0, int(y1))
            right, bottom = min(width, int(x2)), min(height, int(y2))
            crop = image[top:bottom, left:right]
            brightness = float(
                np.mean(0.114 * crop[:, :, 0] + 0.587 * crop[:, :, 1] + 0.299 * crop[:, :, 2])
            ) if crop.size else 0.0
            recognition_eligible = min(right - left, bottom - top) >= self.settings.min_attendance_face_size
            quality = {
                "detection_confidence": face.confidence,
                "blur_variance": _blur_variance(crop),
                "mean_brightness": brightness,
                "face_width": right - left,
                "face_height": bottom - top,
                "detector": "InsightFace SCRFD-10GF",
                "embedder": "InsightFace ArcFace ResNet50@WebFace600K",
                "alignment": "insightface_5_point_arcface_crop",
                "execution_providers": self.providers,
                "detection_source": face.source,
                "recognition_eligible": recognition_eligible,
            }
            if not recognition_eligible:
                quality["recognition_skip_reason"] = "FACE_TOO_SMALL_FOR_RECOGNITION"
            detections.append(
                Detection(
                    box=(float(left), float(top), float(right), float(bottom)),
                    landmarks=face.landmarks,
                    confidence=face.confidence,
                    embedding=face.embedding if recognition_eligible else None,
                    quality=quality,
                )
            )
        return detections


@lru_cache(maxsize=1)
def get_face_engine() -> InsightFaceEngine:
    return InsightFaceEngine()
