import argparse

from sqlalchemy import select

from .db import Base, SessionLocal, engine
from .models import (CourseClass,Enrolment,Faculty,FacultyClassAssignment,
                     InstitutionSettings,Role,Student,User)
from .security import hash_password

ADMIN_EMAIL = "admin@christuniversity.in"
FACULTY_EMAIL = "tester.faculty@christuniversity.in"


def seed_admin(email: str, password: str) -> None:
    Base.metadata.create_all(engine)
    with SessionLocal.begin() as db:
        normalized_email = email.lower()
        user = db.scalar(select(User).where(User.email == normalized_email))
        if not user and normalized_email == ADMIN_EMAIL:
            user = db.scalar(select(User).where(User.email == "admin@example.edu"))
            if user:
                user.email = normalized_email
        if user:
            return
        db.add(User(email=normalized_email, password_hash=hash_password(password), role=Role.ADMIN))
        if not db.get(InstitutionSettings, 1):
            db.add(InstitutionSettings(id=1))


def seed_demo(password:str="LocalTest123!")->None:
    """Create a minimal, clearly labelled local test scope. Idempotent."""
    Base.metadata.create_all(engine)
    with SessionLocal.begin() as db:
        user=db.scalar(select(User).where(User.email==FACULTY_EMAIL))
        if not user:
            user=db.scalar(select(User).where(User.email=="tester.faculty@example.edu"))
            if user:user.email=FACULTY_EMAIL
        if not user:user=User(email="tester.faculty@example.edu",password_hash=hash_password(password),role=Role.FACULTY);db.add(user);db.flush()
        faculty=db.scalar(select(Faculty).where(Faculty.user_id==user.id))
        if not faculty:faculty=Faculty(user_id=user.id,employee_id="TEST-F001",name="Test Faculty",department="CSE");db.add(faculty);db.flush()
        student=db.scalar(select(Student).where(Student.student_id=="TEST-S001"))
        if not student:student=Student(student_id="TEST-S001",roll_number="TEST-R001",name="Test Student",department="CSE",semester=5,section="A");db.add(student);db.flush()
        course=db.scalar(select(CourseClass).where(CourseClass.code=="TEST-CV-5A"))
        if not course:course=CourseClass(code="TEST-CV-5A",subject="Computer Vision Test",department="CSE",semester=5,section="A",academic_session="2026-27");db.add(course);db.flush()
        if not db.scalar(select(FacultyClassAssignment).where(FacultyClassAssignment.faculty_id==faculty.id,FacultyClassAssignment.class_id==course.id)):db.add(FacultyClassAssignment(faculty_id=faculty.id,class_id=course.id))
        if not db.scalar(select(Enrolment).where(Enrolment.student_id==student.id,Enrolment.class_id==course.id)):db.add(Enrolment(student_id=student.id,class_id=course.id))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--email")
    parser.add_argument("--password", default="LocalTest123!")
    parser.add_argument("--demo",action="store_true")
    args = parser.parse_args()
    if args.email:seed_admin(args.email,args.password)
    if args.demo:seed_demo(args.password)
    if not args.email and not args.demo:parser.error("provide --email or --demo")
