"""Export unresolved student hierarchy mappings without modifying data."""
import csv
from pathlib import Path
from sqlalchemy import select
from app.db import SessionLocal
from app.models import MappingStatus, Student

target=Path("data/student-academic-mapping-report.csv")
target.parent.mkdir(parents=True,exist_ok=True)
with SessionLocal() as db, target.open("w",newline="",encoding="utf-8") as stream:
    writer=csv.writer(stream)
    writer.writerow(["student_uuid","student_id","roll_number","name","mapping_status","legacy_department","legacy_semester","legacy_section","mapping_note"])
    for item in db.scalars(select(Student).where(Student.mapping_status==MappingStatus.NEEDS_MAPPING).order_by(Student.name)):
        writer.writerow([item.id,item.student_id,item.roll_number,item.name,item.mapping_status.value,item.department,item.semester,item.section,item.mapping_note or ""])
print(f"Wrote {target}")
