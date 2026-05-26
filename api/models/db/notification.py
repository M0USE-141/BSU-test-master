"""Notification database model."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import sqlalchemy as sa
from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base


class Notification(Base):
    """In-app notification for a user."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # cr_received | cr_approved | cr_rejected | share_received
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_notifications_user_read", "user_id", "read_at"),
    )

    @property
    def payload(self) -> dict[str, Any]:
        if not self.payload_json:
            return {}
        try:
            return json.loads(self.payload_json)
        except (json.JSONDecodeError, TypeError):
            return {}

    @payload.setter
    def payload(self, value: dict[str, Any]) -> None:
        self.payload_json = json.dumps(value) if value else None

    @property
    def is_read(self) -> bool:
        return self.read_at is not None
