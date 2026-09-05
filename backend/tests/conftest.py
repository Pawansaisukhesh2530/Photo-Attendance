import os
import tempfile
from pathlib import Path

os.environ["EDUTRACE_ENV"] = "test"
test_root=Path(tempfile.gettempdir())/"edutrace-tests"
test_root.mkdir(parents=True,exist_ok=True)
os.environ["EDUTRACE_DATABASE_URL"] = f"sqlite:///{(test_root/'test-edutrace.db').as_posix()}"
os.environ["EDUTRACE_LOCAL_STORAGE_PATH"] = str(test_root/"private")
os.environ["EDUTRACE_JWT_SECRET"] = "test-secret-that-is-long-enough-for-tests"

import pytest
from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import Faculty, InstitutionSettings, Role, User
from app.security import create_access_token, hash_password


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client():
    with TestClient(app) as value:
        yield value


@pytest.fixture
def identities():
    with SessionLocal.begin() as db:
        admin = User(email="admin@example.edu", password_hash=hash_password("StrongPass123!"), role=Role.ADMIN)
        faculty_user = User(email="faculty@example.edu", password_hash=hash_password("StrongPass123!"), role=Role.FACULTY)
        other_user = User(email="other@example.edu", password_hash=hash_password("StrongPass123!"), role=Role.FACULTY)
        db.add_all([admin, faculty_user, other_user]); db.flush()
        faculty = Faculty(user_id=faculty_user.id, employee_id="FAC001", name="Faculty One", department="CSE")
        other = Faculty(user_id=other_user.id, employee_id="FAC002", name="Faculty Two", department="CSE")
        db.add_all([faculty, other, InstitutionSettings(id=1)]); db.flush()
        result = {
            "admin_id": admin.id,
            "faculty_user_id": faculty_user.id,
            "other_user_id": other_user.id,
            "faculty_id": faculty.id,
            "other_id": other.id,
            "admin_token": create_access_token(admin),
            "faculty_token": create_access_token(faculty_user),
            "other_token": create_access_token(other_user),
        }
    return result


def auth(token: str):
    return {"Authorization": f"Bearer {token}"}
