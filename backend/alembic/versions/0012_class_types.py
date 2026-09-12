"""Add structured institution class types without removing legacy settings."""

import sqlalchemy as sa

from alembic import op

revision = "0012_class_types"
down_revision = "0011_academic_refs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "class_types" not in {column["name"] for column in inspector.get_columns("institution_settings")}:
        op.add_column("institution_settings", sa.Column("class_types", sa.JSON(), nullable=True))
    op.execute("UPDATE institution_settings SET class_types = '[\"Lecture\", \"Lab\", \"Tutorial\"]' WHERE class_types IS NULL")
    op.alter_column("institution_settings", "class_types", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    op.drop_column("institution_settings", "class_types")
