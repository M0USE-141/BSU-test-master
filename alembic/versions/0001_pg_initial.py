"""pg_initial — single squashed baseline for the postgres+minio cutover.

Revision ID: 0001_pg_initial
Revises:
Create Date: 2026-05-28

Phase 4 of the postgres+minio migration. Because the spec said "no
existing prod data to migrate", we replace the 10-migration history with
one fresh baseline that describes the CURRENT model graph. New
installations run a single `alembic upgrade head` and get a complete
schema.

The migration delegates schema creation to `Base.metadata.create_all`
(the same path `init_db()` uses at boot) rather than enumerating every
column. This keeps the migration in lockstep with the SQLAlchemy
models and prevents drift between the two sources of truth. The trade-
off — we can't write a useful `downgrade()` — is acceptable for a
greenfield baseline. Subsequent migrations will use proper `op.*` ops.

Postgres-only extras (GIN index on `questions.payload`) are added in a
dialect-guarded block at the end. SQLite skips them silently.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from api.database import Base
# Side-effect import: registers every model class with Base.metadata.
# Without this `create_all` would only see classes the env.py touched.
from api.models.db import (  # noqa: F401
    Attempt, AttemptAnswer, AttemptStatus,
    ChangeRequest, ChangeRequestType, ChangeRequestStatus,
    ImportJob, ImportJobStatus,
    Notification,
    OutgoingEmail, OutgoingEmailStatus,
    Question,
    QuestionPerformance,
    Session, User,
    TestCollection, TestShare, AccessLevel,
)
from api.models.db.access_request import AccessRequest  # noqa: F401
from api.models.db.activity_event import ActivityEvent  # noqa: F401
from api.models.db.flagged_question import FlaggedQuestion  # noqa: F401
from api.models.db.password_reset import PasswordResetToken  # noqa: F401


# revision identifiers, used by Alembic.
revision = "0001_pg_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)

    # Postgres-only: GIN index over questions.payload (jsonb_path_ops) for
    # fast `payload @> '...'` containment queries used by search.py.
    # On other dialects we skip — SQLite has no GIN.
    if bind.dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_questions_payload_gin "
            "ON questions USING gin (payload jsonb_path_ops)"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_questions_payload_gin")
    Base.metadata.drop_all(bind=bind)
