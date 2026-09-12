"""Persist institution academic session and semester count."""

import sqlalchemy as sa

from alembic import op

revision = "0013_academic_settings"
down_revision = "0012_class_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {
        column["name"] for column in inspector.get_columns("institution_settings")
    }
    if "academic_session" not in columns:
        op.add_column(
            "institution_settings",
            sa.Column("academic_session", sa.String(length=30), nullable=True),
        )
    if "semester_count" not in columns:
        op.add_column(
            "institution_settings",
            sa.Column("semester_count", sa.Integer(), nullable=True),
        )
    op.execute(
        "UPDATE institution_settings SET academic_session = '2026-27' "
        "WHERE academic_session IS NULL"
    )
    op.execute(
        "UPDATE institution_settings SET semester_count = 8 "
        "WHERE semester_count IS NULL"
    )
    op.alter_column(
        "institution_settings",
        "academic_session",
        existing_type=sa.String(length=30),
        nullable=False,
    )
    op.alter_column(
        "institution_settings",
        "semester_count",
        existing_type=sa.Integer(),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("institution_settings", "semester_count")
    op.drop_column("institution_settings", "academic_session")
