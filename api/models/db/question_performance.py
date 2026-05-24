"""QuestionPerformance aggregate table for per-question analytics."""
from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from api.database import Base


class QuestionPerformance(Base):
    """
    Aggregate table upserted after every attempt finalization.
    Tracks per-question correct/total counts per user (or NULL for anonymous).
    """

    __tablename__ = "question_performance"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    test_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    question_id: Mapped[int] = mapped_column(nullable=False)
    correct_count: Mapped[int] = mapped_column(default=0, nullable=False)
    total_count: Mapped[int] = mapped_column(default=0, nullable=False)
    total_duration_ms: Mapped[int] = mapped_column(default=0, nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("test_id", "user_id", "question_id", name="uq_qperf_test_user_question"),
        Index("ix_qperf_test_user", "test_id", "user_id"),
        Index("ix_qperf_test_question", "test_id", "question_id"),
    )
