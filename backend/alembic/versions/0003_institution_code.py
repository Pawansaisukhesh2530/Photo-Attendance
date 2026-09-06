"""Add admin-managed institution short code."""
from alembic import op
import sqlalchemy as sa

revision = "0003_institution_code"
down_revision = "0002_panorama_capture"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("institution_settings")}
    if "institution_code" not in columns:
        op.add_column("institution_settings", sa.Column("institution_code", sa.String(length=20), nullable=False, server_default="EDU"))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "institution_code" in {column["name"] for column in inspector.get_columns("institution_settings")}:
        op.drop_column("institution_settings", "institution_code")
