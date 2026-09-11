"""Add class variant and replace UNIQUE(code) with UNIQUE(code, variant)."""
from alembic import op
import sqlalchemy as sa

revision = "0004_class_variant"
down_revision = "0003_institution_code"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("classes")}

    if "variant" not in columns:
        op.add_column("classes", sa.Column("variant", sa.String(length=40), nullable=False, server_default="Lecture"))

    # Drop old single-column unique index if present, then create composite.
    indexes = {index["name"] for index in inspector.get_indexes("classes")}
    if "uq_classes_code" in indexes:
        op.drop_index("uq_classes_code", table_name="classes")
    # Also handle the implicit unique from unique=True on the Column.
    existing_uniques = inspector.get_unique_constraints("classes")
    for uq in existing_uniques:
        if uq["column_names"] == ["code"]:
            op.drop_constraint(uq["name"], "classes", type_="unique")
            break

    existing_uniques = inspector.get_unique_constraints("classes")
    if not any(uq["column_names"] == ["code", "variant"] for uq in existing_uniques):
        op.create_unique_constraint("uq_classes_code_variant", "classes", ["code", "variant"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing_uniques = inspector.get_unique_constraints("classes")
    for uq in existing_uniques:
        if uq["column_names"] == ["code", "variant"]:
            op.drop_constraint(uq["name"], "classes", type_="unique")
            break
    op.create_unique_constraint("uq_classes_code", "classes", ["code"])

    columns = {column["name"] for column in inspector.get_columns("classes")}
    if "variant" in columns:
        op.drop_column("classes", "variant")
