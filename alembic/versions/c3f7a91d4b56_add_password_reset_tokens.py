"""add_password_reset_tokens

Creates password_reset_tokens table backing the forgot-password flow
shipped in Phase 2 of the UI redesign.

Revision ID: c3f7a91d4b56
Revises: b2c4d6e8f0a2
Create Date: 2026-05-27 19:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3f7a91d4b56'
down_revision: Union[str, Sequence[str], None] = 'b2c4d6e8f0a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "password_reset_tokens",
        sa.Column("id",           sa.Integer(),               nullable=False),
        sa.Column("user_id",      sa.Integer(),               nullable=False),
        sa.Column("token_hash",   sa.String(255),             nullable=False),
        sa.Column("expires_at",   sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at",  sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",   sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_password_reset_tokens_id",         "password_reset_tokens", ["id"],         unique=False)
    op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"], unique=True)
    op.create_index("ix_password_reset_tokens_user_id",    "password_reset_tokens", ["user_id"],    unique=False)


def downgrade() -> None:
    op.drop_index("ix_password_reset_tokens_user_id",    table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_token_hash", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_id",         table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
