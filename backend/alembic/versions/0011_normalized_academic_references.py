"""Add additive academic references and persisted student mapping state."""

import sqlalchemy as sa

from alembic import op

revision = "0011_academic_refs"
down_revision = "0010_academic_hierarchy_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    mapping_status = sa.Enum("NEEDS_MAPPING", "MAPPED", name="mappingstatus")
    mapping_status.create(op.get_bind(), checkfirst=True)
    if "semester_number" not in {x["name"] for x in inspector.get_columns("program_subjects")}:
        op.add_column("program_subjects", sa.Column("semester_number", sa.Integer(), nullable=True))
        op.create_check_constraint("ck_program_subject_semester", "program_subjects", "semester_number IS NULL OR (semester_number BETWEEN 1 AND 16)")

    if "department_id" not in {x["name"] for x in inspector.get_columns("faculty")}:
        op.add_column("faculty", sa.Column("department_id", sa.String(36), nullable=True))
        op.create_foreign_key("fk_faculty_department", "faculty", "academic_departments", ["department_id"], ["id"], ondelete="RESTRICT")
        op.create_index("ix_faculty_department_id", "faculty", ["department_id"])

    student_columns = {x["name"] for x in inspector.get_columns("students")}
    if "mapping_status" not in student_columns:
        for name, target in (("school_id", "schools"), ("department_id", "academic_departments"),
                             ("program_id", "academic_programs"), ("batch_id", "academic_batches"),
                             ("section_id", "academic_sections")):
            op.add_column("students", sa.Column(name, sa.String(36), nullable=True))
            op.create_foreign_key(f"fk_students_{name}", "students", target, [name], ["id"], ondelete="RESTRICT")
            op.create_index(f"ix_students_{name}", "students", [name])
        op.add_column("students", sa.Column("mapping_status", mapping_status, nullable=False, server_default="NEEDS_MAPPING"))
        op.add_column("students", sa.Column("mapping_note", sa.String(500), nullable=True))
        op.create_index("ix_students_mapping_status", "students", ["mapping_status"])
    op.execute("UPDATE students SET mapping_status='NEEDS_MAPPING', mapping_note='Legacy academic values require explicit administrator mapping.'")

    if "program_subject_id" not in {x["name"] for x in inspector.get_columns("classes")}:
        op.add_column("classes", sa.Column("program_subject_id", sa.String(36), nullable=True))
        op.add_column("classes", sa.Column("section_id", sa.String(36), nullable=True))
        op.create_foreign_key("fk_classes_program_subject", "classes", "program_subjects", ["program_subject_id"], ["id"], ondelete="RESTRICT")
        op.create_foreign_key("fk_classes_section", "classes", "academic_sections", ["section_id"], ["id"], ondelete="RESTRICT")
        op.create_index("ix_classes_program_subject_id", "classes", ["program_subject_id"])
        op.create_index("ix_classes_section_id", "classes", ["section_id"])


def downgrade() -> None:
    for name in ("section_id", "program_subject_id"):
        op.drop_index(f"ix_classes_{name}", table_name="classes")
        op.drop_constraint(f"fk_classes_{'section' if name == 'section_id' else 'program_subject'}", "classes", type_="foreignkey")
        op.drop_column("classes", name)
    op.drop_index("ix_students_mapping_status", table_name="students")
    op.drop_column("students", "mapping_note")
    op.drop_column("students", "mapping_status")
    for name in ("section_id", "batch_id", "program_id", "department_id", "school_id"):
        op.drop_index(f"ix_students_{name}", table_name="students")
        op.drop_constraint(f"fk_students_{name}", "students", type_="foreignkey")
        op.drop_column("students", name)
    op.drop_index("ix_faculty_department_id", table_name="faculty")
    op.drop_constraint("fk_faculty_department", "faculty", type_="foreignkey")
    op.drop_column("faculty", "department_id")
    op.drop_constraint("ck_program_subject_semester", "program_subjects", type_="check")
    op.drop_column("program_subjects", "semester_number")
    sa.Enum(name="mappingstatus").drop(op.get_bind(), checkfirst=True)
