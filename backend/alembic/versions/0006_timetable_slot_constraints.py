"""Enforce valid timetable days and time ranges."""

from alembic import op


revision = "0006_timetable_slot_constraints"
down_revision = "0005_timetable_slots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_timetable_valid_day",
        "timetable_slots",
        "day_of_week BETWEEN 1 AND 5",
    )
    op.create_check_constraint(
        "ck_timetable_time_order",
        "timetable_slots",
        "start_time < end_time",
    )


def downgrade() -> None:
    op.drop_constraint("ck_timetable_time_order", "timetable_slots", type_="check")
    op.drop_constraint("ck_timetable_valid_day", "timetable_slots", type_="check")
