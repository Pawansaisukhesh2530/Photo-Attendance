import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .errors import Problem
from .models import RefreshToken, Role, User

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


def hash_password(value: str) -> str:
    return password_hash.hash(value)


def verify_password(value: str, encoded: str) -> bool:
    return password_hash.verify(value, encoded)


def _token_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def create_access_token(user: User) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user.id, "role": user.role.value, "iat": now, "exp": now + timedelta(minutes=settings.access_token_minutes)},
        settings.jwt_secret,
        algorithm="HS256",
    )


def create_image_token(session_id: str, image_id: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode({"session_id": session_id, "image_id": image_id, "purpose": "session-image", "iat": now, "exp": now + timedelta(minutes=10)}, settings.jwt_secret, algorithm="HS256")


def verify_image_token(raw: str, session_id: str, image_id: str) -> None:
    try:
        payload = jwt.decode(raw, get_settings().jwt_secret, algorithms=["HS256"])
        valid = payload.get("purpose") == "session-image" and payload.get("session_id") == session_id and payload.get("image_id") == image_id
    except jwt.PyJWTError:
        valid = False
    if not valid:
        raise Problem(401, "Invalid image token", "The image link is invalid or expired.")


def create_panorama_token(draft_id: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode({"draft_id": draft_id, "purpose": "panorama-preview", "iat": now, "exp": now + timedelta(minutes=20)}, settings.jwt_secret, algorithm="HS256")


def verify_panorama_token(raw: str, draft_id: str) -> None:
    try:
        payload = jwt.decode(raw, get_settings().jwt_secret, algorithms=["HS256"])
        valid = payload.get("purpose") == "panorama-preview" and payload.get("draft_id") == draft_id
    except jwt.PyJWTError:
        valid = False
    if not valid:
        raise Problem(401, "Invalid panorama token", "The panorama preview link is invalid or expired.")


def issue_refresh_token(db: Session, user: User) -> str:
    settings = get_settings()
    raw = secrets.token_urlsafe(48)
    db.add(RefreshToken(user_id=user.id, token_hash=_token_hash(raw), expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days)))
    return raw


def rotate_refresh_token(db: Session, raw: str) -> tuple[User, str]:
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _token_hash(raw)))
    now = datetime.now(timezone.utc)
    if not token or token.revoked_at or token.expires_at.replace(tzinfo=timezone.utc) <= now:
        raise Problem(401, "Invalid refresh token", "The refresh token is invalid or expired.")
    user = db.get(User, token.user_id)
    if not user or not user.is_active:
        raise Problem(401, "Inactive account", "The account is not available.")
    token.revoked_at = now
    return user, issue_refresh_token(db, user)


def revoke_refresh_token(db: Session, raw: str) -> None:
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _token_hash(raw)))
    if token and not token.revoked_at:
        token.revoked_at = datetime.now(timezone.utc)


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise Problem(401, "Authentication required", "Provide a bearer access token.")
    try:
        payload = jwt.decode(credentials.credentials, get_settings().jwt_secret, algorithms=["HS256"])
        user_id = payload["sub"]
    except (jwt.PyJWTError, KeyError):
        raise Problem(401, "Invalid access token", "The access token is invalid or expired.")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise Problem(401, "Inactive account", "The account is not available.")
    return user


def require_roles(*roles: Role):
    def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise Problem(403, "Forbidden", "Your role cannot perform this action.")
        return user
    return dependency
