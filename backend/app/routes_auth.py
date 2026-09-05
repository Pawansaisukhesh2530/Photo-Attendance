from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .errors import Problem
from .models import Faculty, User
from .schemas import LoginRequest, RefreshRequest
from .config import get_settings
from .security import (create_access_token, current_user, issue_refresh_token,
                       revoke_refresh_token, rotate_refresh_token, verify_password)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _user_json(db:Session,user:User):
    faculty=db.scalar(select(Faculty).where(Faculty.user_id==user.id))
    return {"id":user.id,"name":faculty.name if faculty else "Administrator","email":user.email,
            "role":user.role.value,"avatarUrl":None,"department":faculty.department if faculty else None}


def _session_json(db:Session,user:User,refresh_token:str):
    settings=get_settings()
    access_token=create_access_token(user)
    return {"accessToken":access_token,"refreshToken":refresh_token,
            "access_token":access_token,"refresh_token":refresh_token,"token_type":"bearer",
            "expiresAt":(datetime.now(timezone.utc)+timedelta(minutes=settings.access_token_minutes)).isoformat(),
            "user":_user_json(db,user)}


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    identifier=payload.identifier.lower()
    user = db.scalar(select(User).where(User.email == identifier))
    if not user:
        user=db.scalar(select(User).join(Faculty,Faculty.user_id==User.id).where(Faculty.employee_id.ilike(identifier)))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise Problem(401, "Invalid credentials", "The email or password is incorrect.")
    refresh = issue_refresh_token(db, user)
    db.commit()
    return _session_json(db,user,refresh)


@router.post("/refresh")
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    user, refresh_token = rotate_refresh_token(db, payload.refresh_token)
    db.commit()
    return _session_json(db,user,refresh_token)


@router.post("/logout", status_code=204)
def logout(payload: RefreshRequest|None=None, db: Session = Depends(get_db)):
    if payload:revoke_refresh_token(db, payload.refresh_token)
    db.commit()


@router.get("/me")
def me(user: User = Depends(current_user),db:Session=Depends(get_db)):
    return _user_json(db,user)


@router.post("/forgot-password",status_code=204)
def forgot_password():
    # Deliberately non-enumerating. Email delivery is configured by the deployment owner.
    return None
