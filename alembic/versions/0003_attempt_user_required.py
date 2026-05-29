"""Drop attempts.client_id, require user_id (no anonymous attempts).

Removes the client-id-based anonymous attempt model. Every attempt now
belongs to an authenticated user — `user_id` becomes NOT NULL and the
FK switches to CASCADE on user delete (matches "no orphaned attempts"
intent). The `client_id` column and its index are dropped.

Rows with `user_id IS NULL` (legacy anonymous attempts) are deleted
because there is no owner to attach them to.

Revision ID: 0003_attempt_user_required
Revises: 0002_session_refresh
Create Date: 2026-05-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0003_attempt_user_required"
down_revision = "0002_session_refresh"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Purge anonymous attempts — they have no user to attach to.
    op.execute("DELETE FROM attempts WHERE user_id IS NULL")

    # Drop the old FK with ON DELETE SET NULL, then re-add with CASCADE
    # and NOT NULL. PG names the constraint `attempts_user_id_fkey` by
    # default; alembic can reflect it via batch ops but here we know
    # the name from the autogenerate convention.
    with op.batch_alter_table("attempts") as batch:
        batch.alter_column(
            "user_id",
            existing_type=sa.Integer(),
            nullable=False,
        )
        batch.drop_constraint("attempts_user_id_fkey", type_="foreignkey")
        batch.create_foreign_key(
            "attempts_user_id_fkey",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
        # Drop client_id index and column.
        batch.drop_index("ix_attempts_client_id")
        batch.drop_column("client_id")


def downgrade() -> None:
    with op.batch_alter_table("attempts") as batch:
        batch.add_column(sa.Column("client_id", sa.String(length=64), nullable=True))
        batch.create_index("ix_attempts_client_id", ["client_id"], unique=False)
        batch.drop_constraint("attempts_user_id_fkey", type_="foreignkey")
        batch.create_foreign_key(
            "attempts_user_id_fkey",
            "users",
            ["user_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.alter_column(
            "user_id",
            existing_type=sa.Integer(),
            nullable=True,
        )
    # Backfill client_id with a placeholder so the NOT NULL re-add (if a
    # later migration restores it) doesn't fail. Left empty here because
    # we don't know the original values.
