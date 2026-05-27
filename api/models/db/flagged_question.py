"""Flagged question model — per-user ⚑ mark on a test question."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


from api.database import Base


class FlaggedQuestion(Base):
    """A user has marked this question for later review.

    The flag is per-user (not per-test-owner), so two users browsing the
    same shared test can independently flag different questions.
    """

    __tablename__ = "flagged_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    test_id: Mapped[str] = mapped_column(String(64), nullable=False)
    question_id: Mapped[int] = mapped_column(Integer, nullable=False)
    flagged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "test_id", "question_id", name="uq_flagged_user_test_question"),
    )

    def __repr__(self) -> str:
        return f"<FlaggedQuestion(user_id={self.user_id}, test_id={self.test_id!r}, question_id={self.question_id})>"
