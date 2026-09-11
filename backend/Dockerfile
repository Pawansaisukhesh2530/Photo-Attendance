FROM python:3.12-slim
WORKDIR /app
ENV EDUTRACE_INSIGHTFACE_ROOT=/models/insightface
RUN useradd --create-home --uid 10001 edutrace
COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
RUN pip install --no-cache-dir ".[vision]" \
    && pip uninstall -y onnxruntime \
    && pip install --no-cache-dir "onnxruntime-gpu[cuda,cudnn]>=1.30,<2"
RUN mkdir -p /models && python -m app.download_models && chown -R edutrace:edutrace /models
USER edutrace
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
