import argparse
from sqlalchemy import select

from .db import Base, SessionLocal, engine
from .models import (Faculty, InstitutionSettings, Role, Student, User,
                     AcademicBatch, AcademicProgram, AcademicSection, Department, School, Subject, ProgramSubject)
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


DEMO_CLASSES = [
    {"code": "CS201", "variant": "Lecture", "subject": "Data Structures & Algorithms", "semester": 3, "section": "A"},
    {"code": "CS201", "variant": "Lab", "subject": "Data Structures Lab", "semester": 3, "section": "A"},
    {"code": "CS401", "variant": "Lecture", "subject": "Machine Learning", "semester": 5, "section": "A"},
    {"code": "CS401", "variant": "Lab", "subject": "Machine Learning Lab", "semester": 5, "section": "A"},
    {"code": "CS301", "variant": "Lecture", "subject": "Computer Networks", "semester": 5, "section": "A"},
    {"code": "CS301", "variant": "Lab", "subject": "Computer Networks Lab", "semester": 5, "section": "A"},
    {"code": "CS101", "variant": "Lecture", "subject": "Introduction to Computer Science", "semester": 1, "section": "A"},
    {"code": "CS302", "variant": "Lecture", "subject": "Software Engineering", "semester": 5, "section": "A"},
    {"code": "CS302", "variant": "Lab", "subject": "Software Engineering Lab", "semester": 5, "section": "A"},
    {"code": "CS402", "variant": "Lab", "subject": "Deep Learning Lab", "semester": 5, "section": "A"},
    {"code": "CS501", "variant": "Lecture", "subject": "Advanced AI Topics", "semester": 7, "section": "A"},
]

DEMO_SLOTS = [
    # Monday
    {"day": 1, "start": (9,0), "end": (10,0), "code": "CS201", "variant": "Lecture", "room": "CB 1005"},
    {"day": 1, "start": (10,0), "end": (11,0), "code": "CS401", "variant": "Lecture", "room": "CB 1005"},
    {"day": 1, "start": (11,0), "end": (13,0), "code": "CS201", "variant": "Lab", "room": "CB 1102"},
    {"day": 1, "start": (13,0), "end": (14,0), "code": None, "variant": None, "room": None, "break_label": "Free Hour (1/8)"},
    {"day": 1, "start": (14,0), "end": (16,0), "code": "CS301", "variant": "Lab", "room": "MB 2210"},
    {"day": 1, "start": (16,0), "end": (17,0), "code": None, "variant": None, "room": None, "break_label": "Free Hour (2/8)"},
    # Tuesday
    {"day": 2, "start": (9,0), "end": (10,30), "code": "CS301", "variant": "Lecture", "room": "MB 2115"},
    {"day": 2, "start": (10,30), "end": (12,0), "code": "CS101", "variant": "Lecture", "room": "CB 1220"},
    {"day": 2, "start": (12,0), "end": (13,0), "code": "CS401", "variant": "Lab", "room": "MB 2304"},
    {"day": 2, "start": (13,0), "end": (14,0), "code": None, "variant": None, "room": None, "break_label": "Free Hour (3/8)"},
    {"day": 2, "start": (14,0), "end": (17,0), "code": "CS302", "variant": "Lab", "room": "CB 1012"},
    # Wednesday
    {"day": 3, "start": (9,0), "end": (10,0), "code": "CS201", "variant": "Lecture", "room": "CB 1005"},
    {"day": 3, "start": (10,0), "end": (12,0), "code": None, "variant": None, "room": None, "break_label": "Free Hours (5/8)"},
    {"day": 3, "start": (12,0), "end": (13,30), "code": "CS301", "variant": "Lecture", "room": "MB 2115"},
    {"day": 3, "start": (13,30), "end": (15,0), "code": "CS101", "variant": "Lecture", "room": "CB 1220"},
    {"day": 3, "start": (15,0), "end": (17,0), "code": "CS402", "variant": "Lab", "room": "MB 2428"},
    # Thursday
    {"day": 4, "start": (9,0), "end": (11,0), "code": "CS201", "variant": "Lab", "room": "CB 1102"},
    {"day": 4, "start": (11,0), "end": (12,30), "code": "CS401", "variant": "Lecture", "room": "CB 1005"},
    {"day": 4, "start": (12,30), "end": (13,30), "code": None, "variant": None, "room": None, "break_label": "Free Hour (6/8)"},
    {"day": 4, "start": (13,30), "end": (15,30), "code": "CS401", "variant": "Lab", "room": "MB 2304"},
    {"day": 4, "start": (15,30), "end": (17,0), "code": "CS501", "variant": "Lecture", "room": "MB 2001"},
    # Friday
    {"day": 5, "start": (9,0), "end": (10,0), "code": "CS201", "variant": "Lecture", "room": "CB 1005"},
    {"day": 5, "start": (10,0), "end": (11,30), "code": "CS101", "variant": "Lecture", "room": "CB 1220"},
    {"day": 5, "start": (11,30), "end": (13,30), "code": None, "variant": None, "room": None, "break_label": "Free Hours (8/8)"},
    {"day": 5, "start": (13,30), "end": (15,30), "code": "CS301", "variant": "Lab", "room": "MB 2210"},
    {"day": 5, "start": (15,30), "end": (17,0), "code": "CS302", "variant": "Lecture", "room": "CB 1012"},
]


def seed_demo(password:str="LocalTest123!")->None:
    """Create local test accounts and a canonical academic hierarchy. Idempotent."""
    Base.metadata.create_all(engine)
    with SessionLocal.begin() as db:
        user=db.scalar(select(User).where(User.email==FACULTY_EMAIL))
        if not user:
            user=db.scalar(select(User).where(User.email=="tester.faculty@example.edu"))
            if user:user.email=FACULTY_EMAIL
        if not user:user=User(email=FACULTY_EMAIL,password_hash=hash_password(password),role=Role.FACULTY);db.add(user);db.flush()
        faculty=db.scalar(select(Faculty).where(Faculty.user_id==user.id))
        if not faculty:faculty=Faculty(user_id=user.id,employee_id="TEST-F001",name="Test Faculty",department="CSE");db.add(faculty);db.flush()

        student=db.scalar(select(Student).where(Student.student_id=="TEST-S001"))
        if not student:student=Student(student_id="TEST-S001",roll_number="TEST-R001",name="Test Student",department="CSE",semester=5,section="A");db.add(student);db.flush()

        school = db.scalar(select(School).where(School.code == "CHRIST"))
        if not school:
            school = School(code="CHRIST", name="Christ University"); db.add(school); db.flush()
        department = db.scalar(select(Department).where(Department.school_id == school.id, Department.code == "CSE"))
        if not department:
            department = Department(school_id=school.id, code="CSE", name="Computer Science and Engineering"); db.add(department); db.flush()
        program = db.scalar(select(AcademicProgram).where(AcademicProgram.department_id == department.id, AcademicProgram.code == "BTECH-CSE"))
        if not program:
            program = AcademicProgram(department_id=department.id, code="BTECH-CSE", name="B.Tech Computer Science"); db.add(program); db.flush()
        batch = db.scalar(select(AcademicBatch).where(AcademicBatch.program_id == program.id, AcademicBatch.code == "2024"))
        if not batch:
            batch = AcademicBatch(program_id=program.id, code="2024", name="2024–2028", start_year=2024, end_year=2028); db.add(batch); db.flush()
        if not db.scalar(select(AcademicSection).where(AcademicSection.batch_id == batch.id, AcademicSection.code == "A")):
            db.add(AcademicSection(batch_id=batch.id, code="A", name="Section A"))
        for code, name in (("CS201", "Data Structures & Algorithms"), ("CS401", "Machine Learning"), ("CS301", "Computer Networks")):
            subject = db.scalar(select(Subject).where(Subject.code == code))
            if not subject:
                subject = Subject(code=code, name=name); db.add(subject); db.flush()
            if not db.scalar(select(ProgramSubject).where(ProgramSubject.program_id == program.id, ProgramSubject.subject_id == subject.id)):
                db.add(ProgramSubject(program_id=program.id, subject_id=subject.id))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--email")
    parser.add_argument("--password", default="LocalTest123!")
    parser.add_argument("--demo",action="store_true")
    args = parser.parse_args()
    if args.email:seed_admin(args.email,args.password)
    if args.demo:seed_demo(args.password)
    if not args.email and not args.demo:parser.error("provide --email or --demo")
