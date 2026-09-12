"""Add lookup indexes declared by the academic hierarchy models."""

from alembic import op
import sqlalchemy as sa


revision = "0010_academic_hierarchy_indexes"
down_revision = "0009_merge_schema_heads"
branch_labels = None
depends_on = None


INDEXES = {
    "academic_batches": ("active", "code", "name", "program_id"),
    "academic_departments": ("active", "code", "name", "school_id"),
    "academic_programs": ("active", "code", "department_id", "name"),
    "academic_sections": ("active", "batch_id", "code", "name"),
    "program_subjects": ("program_id", "subject_id"),
    "schools": ("active", "code", "name"),
    "subjects": ("active", "code", "name"),
}


def upgrade() -> None:
    for table, columns in INDEXES.items():
        existing = {item["name"] for item in sa.inspect(op.get_bind()).get_indexes(table)}
        for column in columns:
            name = f"ix_{table}_{column}"
            if name not in existing:
                op.create_index(name, table, [column], unique=False)


def downgrade() -> None:
    for table, columns in reversed(tuple(INDEXES.items())):
        for column in reversed(columns):
            op.drop_index(f"ix_{table}_{column}", table_name=table)
