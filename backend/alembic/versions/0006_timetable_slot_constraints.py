"""Enforce valid timetable days and time ranges."""

from alembic import op
import sqlalchemy as sa


revision = "0006_timetable_slot_constraints"
down_revision = "0005_timetable_slots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = {
        constraint["name"]
        for constraint in sa.inspect(op.get_bind()).get_check_constraints("timetable_slots")
    }
    if "ck_timetable_valid_day" not in existing:
        op.create_check_constraint(
            "ck_timetable_valid_day",
            "timetable_slots",
            "day_of_week BETWEEN 1 AND 5",
        )
    if "ck_timetable_time_order" not in existing:
        op.create_check_constraint(
            "ck_timetable_time_order",
            "timetable_slots",
            "start_time < end_time",
        )


def downgrade() -> None:
    existing = {
        constraint["name"]
        for constraint in sa.inspect(op.get_bind()).get_check_constraints("timetable_slots")
    }
    if "ck_timetable_time_order" in existing:
        op.drop_constraint("ck_timetable_time_order", "timetable_slots", type_="check")
    if "ck_timetable_valid_day" in existing:
        op.drop_constraint("ck_timetable_valid_day", "timetable_slots", type_="check")
