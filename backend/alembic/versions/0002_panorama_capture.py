"""Add panorama capture drafts and session capture mode.

Revision ID: 0002_panorama_capture
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_panorama_capture"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 uses metadata.create_all(), so a brand-new database may already contain
    # newly modelled objects. Existing databases stamped at 0001 still need them.
    inspector = sa.inspect(op.get_bind())
    session_columns = {column["name"] for column in inspector.get_columns("attendance_sessions")}
    if "capture_mode" not in session_columns:
        op.add_column("attendance_sessions", sa.Column("capture_mode", sa.String(length=20), nullable=False, server_default="STANDARD"))
    if "panorama_drafts" not in inspector.get_table_names():
        op.create_table(
            "panorama_drafts",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("faculty_id", sa.String(length=36), sa.ForeignKey("faculty.id", ondelete="CASCADE"), nullable=False),
            sa.Column("object_key", sa.String(length=600), nullable=False, unique=True),
            sa.Column("checksum", sa.String(length=64), nullable=False),
            sa.Column("mime_type", sa.String(length=100), nullable=False, server_default="image/jpeg"),
            sa.Column("width", sa.Integer(), nullable=False),
            sa.Column("height", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_panorama_drafts_faculty_id", "panorama_drafts", ["faculty_id"])
        op.create_index("ix_panorama_drafts_checksum", "panorama_drafts", ["checksum"])
        op.create_index("ix_panorama_drafts_created_at", "panorama_drafts", ["created_at"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "panorama_drafts" in inspector.get_table_names():
        op.drop_table("panorama_drafts")
    if "capture_mode" in {column["name"] for column in inspector.get_columns("attendance_sessions")}:
        op.drop_column("attendance_sessions", "capture_mode")
