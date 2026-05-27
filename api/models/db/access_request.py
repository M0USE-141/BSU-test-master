"""Access-request model.

Created by the 403 page when a user clicks "Request access" on a test
they can't see. The owner reviews + approves/rejects via existing
access_service plumbing; approval implicitly calls add_share.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from api.database import Base


class AccessRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AccessRequest(Base):
    """A user has asked to be granted access to a private/shared test."""

    __tablename__ = "access_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    test_id: Mapped[str] = mapped_column(String(64), nullable=False)
    requester_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=AccessRequestStatus.PENDING.value, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    __table_args__ = (
        # One outstanding request per (test, user, status). Two distinct
        # decided requests can coexist (e.g. an old REJECTED and a new
        # PENDING) without violating the unique key.
        UniqueConstraint("test_id", "requester_id", "status", name="uq_access_req_test_user_status"),
    )

    def __repr__(self) -> str:
        return f"<AccessRequest(id={self.id}, test_id={self.test_id!r}, requester={self.requester_id}, status={self.status!r})>"
