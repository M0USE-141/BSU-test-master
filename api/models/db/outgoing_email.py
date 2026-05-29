"""OutgoingEmail — mail audit + retry queue.

Phase 6 wires up the mail service. Every send creates one row whose
status transitions `queued → sent` (or `failed`, retried by the cleanup
thread up to `attempt_count` cap). Surfaces also support an admin
diagnostic endpoint.

Defined in Phase 4's initial migration so Phase 6 ships without its
own schema change.
"""
from __future__ import annotations

import enum
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.database import Base


class OutgoingEmailStatus(str, enum.Enum):
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"
    BOUNCED = "bounced"


class OutgoingEmail(Base):
    __tablename__ = "outgoing_emails"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # UUID-hex
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event: Mapped[str] = mapped_column(String(50), nullable=False)
    to_address: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default=OutgoingEmailStatus.QUEUED.value, nullable=False,
    )
    provider_message_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempt_count: Mapped[int] = mapped_column(default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True,
    )

    __table_args__ = (
        Index(
            "ix_outgoing_emails_status_created",
            "status", "created_at",
        ),
        Index("ix_outgoing_emails_event_to", "event", "to_address"),
    )
