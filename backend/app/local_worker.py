"""Small durable worker for local testing without Redis or Docker."""
import argparse
import time
from sqlalchemy import select

from .db import SessionLocal
from .models import JobStatus,RecognitionJob,StudentFaceImage
from .worker import _process_attendance,process_face_enrolment


def run_once()->int:
    completed=0
    with SessionLocal() as db:
        images=list(db.scalars(select(StudentFaceImage).where(StudentFaceImage.revoked_at.is_(None))))
        jobs=list(db.scalars(select(RecognitionJob).where(RecognitionJob.status==JobStatus.QUEUED)))
    for image in images:
        if image.quality.get("status")=="PENDING_MODEL_VALIDATION":
            try:process_face_enrolment.run(image.id)
            except Exception as exc:
                with SessionLocal.begin() as db:
                    row=db.get(StudentFaceImage,image.id)
                    if row:row.quality={"status":"MODEL_ERROR","reason":type(exc).__name__}
            completed+=1
    for job in jobs:
        try:_process_attendance(job.id)
        except Exception:pass
        completed+=1
    return completed


def main():
    parser=argparse.ArgumentParser();parser.add_argument("--once",action="store_true");parser.add_argument("--interval",type=float,default=1);args=parser.parse_args()
    while True:
        count=run_once()
        if args.once:return
        time.sleep(.15 if count else args.interval)


if __name__=="__main__":main()
