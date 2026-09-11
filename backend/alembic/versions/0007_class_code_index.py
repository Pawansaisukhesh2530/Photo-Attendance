"""Replace the legacy unique class-code index with a regular lookup index."""

from alembic import op
import sqlalchemy as sa


revision = "0007_class_code_index"
down_revision = "0006_timetable_slot_constraints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    indexes = {index["name"]: index for index in inspector.get_indexes("classes")}
    legacy = indexes.get("ix_classes_code")
    if legacy and legacy.get("unique"):
        op.drop_index("ix_classes_code", table_name="classes")
        op.create_index("ix_classes_code", "classes", ["code"], unique=False)
    elif legacy is None:
        op.create_index("ix_classes_code", "classes", ["code"], unique=False)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    indexes = {index["name"]: index for index in inspector.get_indexes("classes")}
    current = indexes.get("ix_classes_code")
    if current and not current.get("unique"):
        op.drop_index("ix_classes_code", table_name="classes")
        op.create_index("ix_classes_code", "classes", ["code"], unique=True)
