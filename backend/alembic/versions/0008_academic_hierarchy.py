"""Add normalized academic hierarchy and programme subjects."""

from alembic import op
import sqlalchemy as sa


revision = "0008_academic_hierarchy"
down_revision = "0007_class_code_index"
branch_labels = None
depends_on = None


def _table(name, columns, constraints=()):
    op.create_table(name, *columns, *constraints)


def upgrade() -> None:
    _table("schools", [
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("code"),
    ])
    _table("academic_departments", [
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("school_id", sa.String(36), sa.ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("school_id", "code"),
    ])
    _table("academic_programs", [
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("department_id", sa.String(36), sa.ForeignKey("academic_departments.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("department_id", "code"),
    ])
    _table("academic_batches", [
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("program_id", sa.String(36), sa.ForeignKey("academic_programs.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("start_year", sa.Integer(), nullable=False),
        sa.Column("end_year", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("program_id", "code"),
        sa.CheckConstraint("start_year <= end_year", name="ck_batch_year_order"),
    ])
    _table("academic_sections", [
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("batch_id", sa.String(36), sa.ForeignKey("academic_batches.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("batch_id", "code"),
    ])
    _table("subjects", [
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("code"),
    ])
    _table("program_subjects", [
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("program_id", sa.String(36), sa.ForeignKey("academic_programs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.String(36), sa.ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False),
        sa.UniqueConstraint("program_id", "subject_id"),
    ])


def downgrade() -> None:
    op.drop_table("program_subjects")
    op.drop_table("subjects")
    op.drop_table("academic_sections")
    op.drop_table("academic_batches")
    op.drop_table("academic_programs")
    op.drop_table("academic_departments")
    op.drop_table("schools")
