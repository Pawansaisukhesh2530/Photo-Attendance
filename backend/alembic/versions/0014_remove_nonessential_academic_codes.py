"""Keep academic codes only for programmes and subjects."""

import sqlalchemy as sa

from alembic import op

revision = "0014_academic_codes"
down_revision = "0013_academic_settings"
branch_labels = None
depends_on = None


TABLES = (
    ("schools", None),
    ("academic_departments", "school_id"),
    ("academic_batches", "program_id"),
    ("academic_sections", "batch_id"),
)
NAMING_CONVENTION = {
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "ix": "ix_%(table_name)s_%(column_0_name)s",
}


def upgrade() -> None:
    bind = op.get_bind()
    for table, _ in TABLES:
        inspector = sa.inspect(bind)
        columns = {column["name"] for column in inspector.get_columns(table)}
        if "code" not in columns:
            continue
        index_name = f"ix_{table}_code"
        indexes = {index["name"] for index in inspector.get_indexes(table)}
        if index_name in indexes:
            op.drop_index(index_name, table_name=table)
        with op.batch_alter_table(table, naming_convention=NAMING_CONVENTION) as batch_op:
            batch_op.drop_column("code")


def downgrade() -> None:
    for table, _ in reversed(TABLES):
        inspector = sa.inspect(op.get_bind())
        columns = {column["name"] for column in inspector.get_columns(table)}
        if "code" in columns:
            continue
        with op.batch_alter_table(table, naming_convention=NAMING_CONVENTION) as batch_op:
            batch_op.add_column(sa.Column("code", sa.String(length=30), nullable=True))
        op.execute(sa.text(f'UPDATE "{table}" SET code = UPPER(SUBSTR(id, 1, 12)) WHERE code IS NULL'))
        with op.batch_alter_table(table, naming_convention=NAMING_CONVENTION) as batch_op:
            batch_op.alter_column("code", existing_type=sa.String(length=30), nullable=False)
            batch_op.create_index(f"ix_{table}_code", ["code"], unique=False)
