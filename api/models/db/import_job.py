"""ImportJob — async docx-import work queue.

Phase 5 converts `POST /api/tests/upload` into a 202-Accepted handshake
plus background extraction. Each upload creates one row; the worker
transitions `pending → processing → done|failed`. The source `.docx`
lives at `imports/<job_id>/source.docx` in storage and is cleaned up
by the bucket lifecycle rule (TTL 24h) regardless of job outcome.

We define the table in Phase 4's initial migration so Phase 5 doesn't
need its own schema change.
"""
from __future__ import annotations

import enum
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.database import Base


class ImportJobStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # UUID-hex
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), default=ImportJobStatus.PENDING.value, nullable=False,
    )
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)

    # On success, points at the resulting test. Nullable both because the
    # collection doesn't exist yet during `pending`/`processing` and because
    # cascade-delete on the test should not destroy the audit row.
    test_collection_id: Mapped[int | None] = mapped_column(
        ForeignKey("test_collections.id", ondelete="SET NULL"),
        nullable=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_import_jobs_user_status", "user_id", "status"),
        Index("ix_import_jobs_status_updated", "status", "updated_at"),
    )
