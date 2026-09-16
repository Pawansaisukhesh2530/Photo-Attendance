"""Add class variant and replace UNIQUE(code) with UNIQUE(code, variant)."""
import sqlalchemy as sa

from alembic import op

revision = "0004_class_variant"
down_revision = "0003_institution_code"
branch_labels = None
depends_on = None
NAMING_CONVENTION = {"uq": "uq_%(table_name)s_%(column_0_name)s"}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("classes")}
    # Drop old single-column unique index if present, then create composite.
    indexes = {index["name"] for index in inspector.get_indexes("classes")}
    if "uq_classes_code" in indexes:
        op.drop_index("uq_classes_code", table_name="classes")
    # Also handle the implicit unique from unique=True on the Column.
    existing_uniques = inspector.get_unique_constraints("classes")
    legacy_unique = next((uq for uq in existing_uniques if uq["column_names"] == ["code"]), None)
    composite_exists = any(uq["column_names"] == ["code", "variant"] for uq in existing_uniques)
    with op.batch_alter_table("classes", naming_convention=NAMING_CONVENTION) as batch_op:
        if "variant" not in columns:
            batch_op.add_column(sa.Column("variant", sa.String(length=40), nullable=False, server_default="Lecture"))
        if legacy_unique:
            batch_op.drop_constraint(legacy_unique.get("name") or "uq_classes_code", type_="unique")
        if not composite_exists:
            batch_op.create_unique_constraint("uq_classes_code_variant", ["code", "variant"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing_uniques = inspector.get_unique_constraints("classes")
    columns = {column["name"] for column in inspector.get_columns("classes")}
    composite = next((uq for uq in existing_uniques if uq["column_names"] == ["code", "variant"]), None)
    with op.batch_alter_table("classes", naming_convention=NAMING_CONVENTION) as batch_op:
        if composite:
            batch_op.drop_constraint(composite.get("name") or "uq_classes_code", type_="unique")
        batch_op.create_unique_constraint("uq_classes_code", ["code"])
        if "variant" in columns:
            batch_op.drop_column("variant")
