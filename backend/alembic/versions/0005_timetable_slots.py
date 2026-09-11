"""Add timetable_slots table for faculty weekly schedules."""
from alembic import op
import sqlalchemy as sa

revision = "0005_timetable_slots"
down_revision = "0004_class_variant"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "timetable_slots" not in inspector.get_table_names():
        op.create_table(
            "timetable_slots",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("faculty_id", sa.String(length=36), sa.ForeignKey("faculty.id", ondelete="CASCADE"), nullable=False),
            sa.Column("class_id", sa.String(length=36), sa.ForeignKey("classes.id", ondelete="RESTRICT"), nullable=True),
            sa.Column("slot_type", sa.Enum("CLASS", "FREE", name="slottype"), nullable=False, server_default="CLASS"),
            sa.Column("day_of_week", sa.Integer(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("room", sa.String(length=80), nullable=True),
            sa.Column("break_label", sa.String(length=120), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.UniqueConstraint("faculty_id", "class_id", "day_of_week", "start_time", name="uq_timetable_class"),
            sa.CheckConstraint("slot_type != 'CLASS' OR class_id IS NOT NULL", name="ck_timetable_class_requires_class_id"),
            sa.CheckConstraint("slot_type != 'FREE' OR class_id IS NULL", name="ck_timetable_free_must_be_null_class"),
        )
        op.create_index("ix_timetable_slots_faculty_id", "timetable_slots", ["faculty_id"])
        op.create_index("ix_timetable_slots_faculty_day", "timetable_slots", ["faculty_id", "day_of_week"])

        # Partial unique index for FREE slots: prevents duplicate free slots at same day+time.
        op.execute(
            "CREATE UNIQUE INDEX uq_timetable_free_start "
            "ON timetable_slots (faculty_id, day_of_week, start_time) "
            "WHERE slot_type = 'FREE'"
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "timetable_slots" in inspector.get_table_names():
        op.execute("DROP INDEX IF EXISTS uq_timetable_free_start")
        op.drop_table("timetable_slots")
