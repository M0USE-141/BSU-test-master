"""Drop attempts.client_id, require user_id (no anonymous attempts).

Removes the client-id-based anonymous attempt model. Every attempt now
belongs to an authenticated user — `user_id` becomes NOT NULL and the
FK switches to CASCADE on user delete (matches "no orphaned attempts"
intent). The `client_id` column and its index are dropped.

Rows with `user_id IS NULL` (legacy anonymous attempts) are deleted
because there is no owner to attach them to.

NOTE: idempotent. `0001_pg_initial` delegates to
`Base.metadata.create_all`, which already reflects the post-Phase-C
shape (no client_id, user_id NOT NULL). This migration therefore
inspects the current schema and skips ops that have already been
applied. Both greenfield and pre-Phase-C databases converge here.

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


def _table_columns(inspector, table: str) -> dict[str, dict]:
    return {c["name"]: c for c in inspector.get_columns(table)}


def _table_indexes(inspector, table: str) -> set[str]:
    return {i["name"] for i in inspector.get_indexes(table)}


def _table_fks(inspector, table: str) -> list[dict]:
    return inspector.get_foreign_keys(table)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = _table_columns(inspector, "attempts")
    indexes = _table_indexes(inspector, "attempts")

    # Purge anonymous attempts — they have no user to attach to. Safe to
    # run unconditionally: it's a no-op if user_id is already NOT NULL.
    op.execute("DELETE FROM attempts WHERE user_id IS NULL")

    user_id_nullable = cols.get("user_id", {}).get("nullable", True)

    needs_user_id_alter = user_id_nullable
    user_fk = next(
        (fk for fk in _table_fks(inspector, "attempts")
         if fk.get("referred_table") == "users"
         and fk.get("constrained_columns") == ["user_id"]),
        None,
    )
    needs_fk_swap = user_fk is not None and (user_fk.get("options") or {}).get(
        "ondelete", ""
    ).upper() != "CASCADE"
    has_client_id = "client_id" in cols
    has_client_id_index = "ix_attempts_client_id" in indexes

    # If everything's already in the target shape, fast-exit.
    if not (needs_user_id_alter or needs_fk_swap or has_client_id or has_client_id_index):
        return

    with op.batch_alter_table("attempts") as batch:
        if needs_user_id_alter:
            batch.alter_column(
                "user_id",
                existing_type=sa.Integer(),
                nullable=False,
            )
        if needs_fk_swap and user_fk:
            fk_name = user_fk.get("name") or "attempts_user_id_fkey"
            batch.drop_constraint(fk_name, type_="foreignkey")
            batch.create_foreign_key(
                "attempts_user_id_fkey",
                "users",
                ["user_id"],
                ["id"],
                ondelete="CASCADE",
            )
        if has_client_id_index:
            batch.drop_index("ix_attempts_client_id")
        if has_client_id:
            batch.drop_column("client_id")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = _table_columns(inspector, "attempts")
    indexes = _table_indexes(inspector, "attempts")

    with op.batch_alter_table("attempts") as batch:
        if "client_id" not in cols:
            batch.add_column(sa.Column("client_id", sa.String(length=64), nullable=True))
        if "ix_attempts_client_id" not in indexes:
            batch.create_index("ix_attempts_client_id", ["client_id"], unique=False)
        # Re-add the SET NULL FK if it isn't already in that shape.
        user_fk = next(
            (fk for fk in _table_fks(inspector, "attempts")
             if fk.get("constrained_columns") == ["user_id"]),
            None,
        )
        if user_fk is not None:
            batch.drop_constraint(user_fk.get("name") or "attempts_user_id_fkey",
                                  type_="foreignkey")
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
