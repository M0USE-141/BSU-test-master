"""add_activity_events

Phase 5 final — global activity timeline. Captures per-user events
(attempt_completed, test_created, test_shared, cr_proposed/approved/
rejected, access_requested/granted) so the /activity screen has
something to render.

Revision ID: e5c192f8a371
Revises: d4e8b13c7290
Create Date: 2026-05-28 21:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e5c192f8a371'
down_revision: Union[str, Sequence[str], None] = 'd4e8b13c7290'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "activity_events",
        sa.Column("id",              sa.Integer(),               nullable=False),
        sa.Column("user_id",         sa.Integer(),               nullable=False),
        sa.Column("event_type",      sa.String(40),              nullable=False),
        sa.Column("test_id",         sa.String(64),              nullable=True),
        sa.Column("attempt_id",      sa.String(64),              nullable=True),
        sa.Column("target_user_id",  sa.Integer(),               nullable=True),
        sa.Column("payload_json",    sa.Text(),                  nullable=True),
        sa.Column("created_at",      sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"],         ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_user_id"],  ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_activity_user_created", "activity_events", ["user_id", "created_at"], unique=False)
    op.create_index("ix_activity_event_type",   "activity_events", ["event_type"], unique=False)
    op.create_index("ix_activity_test_id",      "activity_events", ["test_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_activity_test_id",      table_name="activity_events")
    op.drop_index("ix_activity_event_type",   table_name="activity_events")
    op.drop_index("ix_activity_user_created", table_name="activity_events")
    op.drop_table("activity_events")
