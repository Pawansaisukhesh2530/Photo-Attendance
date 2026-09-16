"""Enforce valid timetable days and time ranges."""

import sqlalchemy as sa

from alembic import op

revision = "0006_timetable_slot_constraints"
down_revision = "0005_timetable_slots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = {
        constraint["name"]
        for constraint in sa.inspect(op.get_bind()).get_check_constraints("timetable_slots")
    }
    with op.batch_alter_table("timetable_slots") as table_op:
        if "ck_timetable_valid_day" not in existing:
            table_op.create_check_constraint(
                "ck_timetable_valid_day",
                "day_of_week BETWEEN 1 AND 5",
            )
        if "ck_timetable_time_order" not in existing:
            table_op.create_check_constraint(
                "ck_timetable_time_order",
                "start_time < end_time",
            )


def downgrade() -> None:
    existing = {
        constraint["name"]
        for constraint in sa.inspect(op.get_bind()).get_check_constraints("timetable_slots")
    }
    with op.batch_alter_table("timetable_slots") as table_op:
        if "ck_timetable_time_order" in existing:
            table_op.drop_constraint("ck_timetable_time_order", type_="check")
        if "ck_timetable_valid_day" in existing:
            table_op.drop_constraint("ck_timetable_valid_day", type_="check")
