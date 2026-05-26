"""add_user_prefs_and_notifications

Adds theme/language/accent preference columns to users table.
Creates notifications table.

Revision ID: b2c4d6e8f0a2
Revises: f911293af21c
Create Date: 2026-05-26 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b2c4d6e8f0a2'
down_revision: Union[str, Sequence[str], None] = '25d2b9dc70be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users: add UI preference columns ─────────────────────────────────────
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("theme",    sa.String(20),  nullable=True))
        batch_op.add_column(sa.Column("language", sa.String(10),  nullable=True))
        batch_op.add_column(sa.Column("accent",   sa.String(20),  nullable=True))

    # ── notifications table ───────────────────────────────────────────────────
    op.create_table(
        "notifications",
        sa.Column("id",           sa.Integer(),                          nullable=False),
        sa.Column("user_id",      sa.Integer(),                          nullable=False),
        sa.Column("kind",         sa.String(50),                         nullable=False),
        sa.Column("payload_json", sa.Text(),                             nullable=True),
        sa.Column("read_at",      sa.DateTime(timezone=True),            nullable=True),
        sa.Column("created_at",   sa.DateTime(timezone=True),            nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_id",         "notifications", ["id"],                unique=False)
    op.create_index("ix_notifications_user_id",    "notifications", ["user_id"],           unique=False)
    op.create_index("ix_notifications_user_read",  "notifications", ["user_id", "read_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_notifications_user_read", table_name="notifications")
    op.drop_index("ix_notifications_user_id",   table_name="notifications")
    op.drop_index("ix_notifications_id",        table_name="notifications")
    op.drop_table("notifications")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("accent")
        batch_op.drop_column("language")
        batch_op.drop_column("theme")
