"""Initial EduTrace schema.

Revision ID: 0001_initial
"""
from alembic import op

from app.db import Base
from app import models  # noqa: F401
from app.config import get_settings

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql" and get_settings().pgvector_enabled:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    Base.metadata.create_all(bind=op.get_bind())
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""CREATE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'Audit entries are append-only'; END; $$ LANGUAGE plpgsql""")
        op.execute("CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_entries FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation()")
        op.execute("""CREATE FUNCTION preserve_ai_result() RETURNS trigger AS $$
        BEGIN
          IF NEW.ai_status IS DISTINCT FROM OLD.ai_status OR NEW.score IS DISTINCT FROM OLD.score OR NEW.model_version IS DISTINCT FROM OLD.model_version THEN
            RAISE EXCEPTION 'Original AI result is immutable';
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql""")
        op.execute("CREATE TRIGGER attendance_ai_immutable BEFORE UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION preserve_ai_result()")


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION IF EXISTS reject_audit_mutation()")
        op.execute("DROP FUNCTION IF EXISTS preserve_ai_result()")
