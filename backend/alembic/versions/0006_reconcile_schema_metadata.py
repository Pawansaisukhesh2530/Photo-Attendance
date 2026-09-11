"""Reconcile indexes and institution setting nullability.

Revision ID: 0006_reconcile_schema_metadata
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_reconcile_schema_metadata"
down_revision = "0005_timetable_slots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    class_indexes = {index["name"]: index for index in inspector.get_indexes("classes")}
    code_index = class_indexes.get("ix_classes_code")
    if code_index and code_index.get("unique"):
        op.drop_index("ix_classes_code", table_name="classes")
        op.create_index("ix_classes_code", "classes", ["code"], unique=False)

    op.execute("UPDATE institution_settings SET departments = '[\"CSE\"]' WHERE departments IS NULL")
    op.execute("UPDATE institution_settings SET faculty_roles = '[\"Assistant Professor\"]' WHERE faculty_roles IS NULL")
    op.alter_column("institution_settings", "departments", existing_type=sa.JSON(), nullable=False)
    op.alter_column("institution_settings", "faculty_roles", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    op.alter_column("institution_settings", "faculty_roles", existing_type=sa.JSON(), nullable=True)
    op.alter_column("institution_settings", "departments", existing_type=sa.JSON(), nullable=True)
    op.drop_index("ix_classes_code", table_name="classes")
    op.create_index("ix_classes_code", "classes", ["code"], unique=True)
