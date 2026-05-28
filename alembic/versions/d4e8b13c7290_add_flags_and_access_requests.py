"""add_flags_and_access_requests

Adds:
- flagged_questions table — per-user ⚑ flag on individual test questions
  (used by PreTest "source = flagged" filter, the question pad ⚑ icon,
  and per-question review "Add to review" button).
- access_requests table — a 403-page "Request access" submission creates
  one of these + a notification to the test owner.

Revision ID: d4e8b13c7290
Revises: c3f7a91d4b56
Create Date: 2026-05-27 20:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4e8b13c7290'
down_revision: Union[str, Sequence[str], None] = 'c3f7a91d4b56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── flagged_questions ─────────────────────────────────────────────────
    op.create_table(
        "flagged_questions",
        sa.Column("id",          sa.Integer(),               nullable=False),
        sa.Column("user_id",     sa.Integer(),               nullable=False),
        sa.Column("test_id",     sa.String(64),              nullable=False),
        sa.Column("question_id", sa.Integer(),               nullable=False),
        sa.Column("flagged_at",  sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "test_id", "question_id", name="uq_flagged_user_test_question"),
    )
    op.create_index("ix_flagged_user_test", "flagged_questions", ["user_id", "test_id"], unique=False)

    # ── access_requests ───────────────────────────────────────────────────
    op.create_table(
        "access_requests",
        sa.Column("id",            sa.Integer(),               nullable=False),
        sa.Column("test_id",       sa.String(64),              nullable=False),
        sa.Column("requester_id",  sa.Integer(),               nullable=False),
        sa.Column("message",       sa.Text(),                  nullable=True),
        sa.Column("status",        sa.String(20),              nullable=False),  # pending|approved|rejected
        sa.Column("created_at",    sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at",    sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by",    sa.Integer(),               nullable=True),
        sa.ForeignKeyConstraint(["requester_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["decided_by"],   ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("test_id", "requester_id", "status", name="uq_access_req_test_user_status"),
    )
    op.create_index("ix_access_req_test",    "access_requests", ["test_id"],     unique=False)
    op.create_index("ix_access_req_status",  "access_requests", ["status"],      unique=False)


def downgrade() -> None:
    op.drop_index("ix_access_req_status", table_name="access_requests")
    op.drop_index("ix_access_req_test",   table_name="access_requests")
    op.drop_table("access_requests")

    op.drop_index("ix_flagged_user_test", table_name="flagged_questions")
    op.drop_table("flagged_questions")
