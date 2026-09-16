"""Recognize the legacy academic-code migration revision.

This revision was briefly released before the normalized academic workflow was
rebased. Existing databases may still store this identifier in
``alembic_version``. The schema changes it represented are reconciled by the
current additive migrations and ``0014_academic_codes``.
"""

revision = "0012_academic_codes"
down_revision = "0010_academic_hierarchy_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
