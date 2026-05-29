"""Question — normalized per-test question rows.

Phase 4 of the postgres+minio migration moves test payload from
`data/tests/<uuid>/test.json` into the database. Each question becomes
one row whose `payload` JSONB stores ContentItem-blocks (text/img/
formula/code), options, correct_option_index, explanation, tags.

`id` is a UUID string (not auto-increment int) so:
  * S3 object keys can embed it stably (`tests/<test_uuid>/questions/<id>/img-001.png`).
  * Change-request payloads can refer to it without collisions across tests.
  * Cross-references from `attempt_answers`/`question_performance`/
    `flagged_question` survive renumbering.

Ordering is maintained by `order_index` (0-based, unique within a test).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base
from api.models.db.types import JsonDict

if TYPE_CHECKING:
    from api.models.db.test_collection import TestCollection


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # UUID-hex
    test_collection_id: Mapped[int] = mapped_column(
        ForeignKey("test_collections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(nullable=False)
    payload: Mapped[dict] = mapped_column(JsonDict, nullable=False)
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
        UniqueConstraint(
            "test_collection_id", "order_index", name="uq_question_order",
        ),
        Index(
            "ix_questions_collection_order",
            "test_collection_id", "order_index",
        ),
        # GIN on JSONB is created in a Postgres-only branch of the
        # initial migration (SQLite doesn't support it).
    )

    test_collection: Mapped["TestCollection"] = relationship(
        "TestCollection", back_populates="questions",
    )
