"""Add refresh_jti + refresh_expires_at to sessions table.

Phase A of the JWT refresh-flow rollout. Introduces refresh-token tracking
on the existing `sessions` row instead of a separate table — each login
populates `token_jti` (access) AND `refresh_jti` (refresh). Refresh
endpoint rotates both columns atomically.

Existing rows have NULL refresh_jti — clients with only-access tokens are
treated as "no refresh available"; once they re-login the columns fill.

NOTE: idempotent. `0001_pg_initial` delegates to
`Base.metadata.create_all`, which already creates these columns on a
greenfield install (because the live SQLAlchemy models include them).
This migration therefore checks the current schema and skips ops that
have already been applied. This way both "greenfield" and "legacy
pre-Phase-A" databases converge on the same target state.

Revision ID: 0002_session_refresh
Revises: 0001_pg_initial
Create Date: 2026-05-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "0002_session_refresh"
down_revision = "0001_pg_initial"
branch_labels = None
depends_on = None


def _table_columns(inspector, table: str) -> set[str]:
    return {c["name"] for c in inspector.get_columns(table)}


def _table_indexes(inspector, table: str) -> set[str]:
    return {i["name"] for i in inspector.get_indexes(table)}


def _table_unique_constraints(inspector, table: str) -> set[str]:
    return {u["name"] for u in inspector.get_unique_constraints(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = _table_columns(inspector, "sessions")
    indexes = _table_indexes(inspector, "sessions")
    uniques = _table_unique_constraints(inspector, "sessions")

    if "refresh_jti" not in cols:
        op.add_column(
            "sessions",
            sa.Column("refresh_jti", sa.String(length=255), nullable=True),
        )
    if "refresh_expires_at" not in cols:
        op.add_column(
            "sessions",
            sa.Column(
                "refresh_expires_at", sa.DateTime(timezone=True), nullable=True
            ),
        )
    if "uq_sessions_refresh_jti" not in uniques:
        op.create_unique_constraint(
            "uq_sessions_refresh_jti", "sessions", ["refresh_jti"]
        )
    if "ix_sessions_refresh_jti" not in indexes:
        op.create_index(
            "ix_sessions_refresh_jti", "sessions", ["refresh_jti"], unique=False
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = _table_indexes(inspector, "sessions")
    uniques = _table_unique_constraints(inspector, "sessions")
    cols = _table_columns(inspector, "sessions")

    if "ix_sessions_refresh_jti" in indexes:
        op.drop_index("ix_sessions_refresh_jti", table_name="sessions")
    if "uq_sessions_refresh_jti" in uniques:
        op.drop_constraint("uq_sessions_refresh_jti", "sessions", type_="unique")
    if "refresh_expires_at" in cols:
        op.drop_column("sessions", "refresh_expires_at")
    if "refresh_jti" in cols:
        op.drop_column("sessions", "refresh_jti")
