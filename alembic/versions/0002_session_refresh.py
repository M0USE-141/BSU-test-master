"""Add refresh_jti + refresh_expires_at to sessions table.

Phase A of the JWT refresh-flow rollout. Introduces refresh-token tracking
on the existing `sessions` row instead of a separate table — each login
populates `token_jti` (access) AND `refresh_jti` (refresh). Refresh
endpoint rotates both columns atomically.

Existing rows have NULL refresh_jti — clients with only-access tokens are
treated as "no refresh available"; once they re-login the columns fill.

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


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("refresh_jti", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "sessions",
        sa.Column("refresh_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_sessions_refresh_jti", "sessions", ["refresh_jti"]
    )
    op.create_index(
        "ix_sessions_refresh_jti", "sessions", ["refresh_jti"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_sessions_refresh_jti", table_name="sessions")
    op.drop_constraint("uq_sessions_refresh_jti", "sessions", type_="unique")
    op.drop_column("sessions", "refresh_expires_at")
    op.drop_column("sessions", "refresh_jti")
