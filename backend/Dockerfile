FROM python:3.12-slim
WORKDIR /app
RUN useradd --create-home --uid 10001 edutrace
COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
RUN pip install --no-cache-dir ".[vision]"
USER edutrace
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
