"""User and Session database models."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Index, String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base

if TYPE_CHECKING:
    from api.models.db.change_request import ChangeRequest
    from api.models.db.test_collection import TestCollection


class User(Base):
    """User model for authentication."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Profile fields
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    avatar_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    avatar_size: Mapped[int | None] = mapped_column(nullable=True)

    # UI preferences (persisted server-side so they sync across devices)
    theme: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)    # light|dark|system
    language: Mapped[str | None] = mapped_column(String(10), nullable=True, default=None) # ru|en|uz
    accent: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)   # green|coral|yellow|blue|mono

    # Email preferences (Phase 6 mail service)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    email_notifications: Mapped[bool] = mapped_column(default=True, nullable=False)
    email_digest: Mapped[bool] = mapped_column(default=False, nullable=False)

    # Relationships
    sessions: Mapped[list["Session"]] = relationship(
        "Session",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    owned_tests: Mapped[list["TestCollection"]] = relationship(
        "TestCollection",
        back_populates="owner",
        cascade="all, delete-orphan"
    )
    change_requests: Mapped[list["ChangeRequest"]] = relationship(
        "ChangeRequest",
        back_populates="user",
        foreign_keys="[ChangeRequest.user_id]",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username='{self.username}', email='{self.email}')>"


class Session(Base):
    """Session model for tracking user sessions."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_jti: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    last_activity: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    # Refresh-token rotation. Nullable for backwards-compat with rows created
    # before refresh-flow was introduced. New logins always populate both.
    refresh_jti: Mapped[str | None] = mapped_column(
        String(255), unique=True, index=True, nullable=True
    )
    refresh_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_sessions_active_expires", "is_active", "expires_at"),
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="sessions")

    def __repr__(self) -> str:
        return f"<Session(id={self.id}, user_id={self.user_id}, token_jti='{self.token_jti}')>"
