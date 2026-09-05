from fastapi import APIRouter,Depends,Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .errors import Problem
from .models import User
from .security import create_access_token

router=APIRouter(tags=["Local tester"])


@router.post("/tester/bootstrap",include_in_schema=False)
def bootstrap(request:Request,db:Session=Depends(get_db)):
    """Issue short-lived credentials only to the explicitly enabled localhost tester."""
    host=request.client.host if request.client else ""
    if not get_settings().tester_enabled or host not in {"127.0.0.1","::1","testclient"}:
        raise Problem(404,"Not found","The local tester is not enabled.")
    admin=db.scalar(select(User).where(User.email=="admin@example.edu"))
    faculty=db.scalar(select(User).where(User.email=="tester.faculty@example.edu"))
    if not admin or not faculty:raise Problem(503,"Tester not seeded","Run the local demo seed first.")
    return {"admin_token":create_access_token(admin),"faculty_token":create_access_token(faculty)}
