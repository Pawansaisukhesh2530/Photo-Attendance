"""Download and validate the configured InsightFace model package."""

from .recognition import get_face_engine, model_files_status


def main() -> None:
    engine = get_face_engine()
    status = model_files_status()
    if not all(status.values()):
        raise RuntimeError(f"Model download did not produce the expected files: {status}")
    print(
        f"Ready: pack={engine.settings.insightface_model_pack}, "
        f"detector=SCRFD-10GF, embedder=ArcFace, providers={engine.providers}"
    )


if __name__ == "__main__":
    main()
