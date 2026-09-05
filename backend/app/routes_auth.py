from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .errors import Problem
from .models import User
from .schemas import LoginRequest, RefreshRequest, TokenPair, UserOut
from .security import (create_access_token, current_user, issue_refresh_token,
                       revoke_refresh_token, rotate_refresh_token, verify_password)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise Problem(401, "Invalid credentials", "The email or password is incorrect.")
    refresh = issue_refresh_token(db, user)
    db.commit()
    return TokenPair(access_token=create_access_token(user), refresh_token=refresh)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    user, refresh_token = rotate_refresh_token(db, payload.refresh_token)
    db.commit()
    return TokenPair(access_token=create_access_token(user), refresh_token=refresh_token)


@router.post("/logout", status_code=204)
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    revoke_refresh_token(db, payload.refresh_token)
    db.commit()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
