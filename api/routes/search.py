"""Search endpoint — SQL over test_collections.title + questions.payload."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session as DbSession, joinedload

from api.database import get_db
from api.dependencies.auth import get_optional_user
from api.models.db.question import Question
from api.models.db.test_collection import TestCollection
from api.models.db.user import User
from api.services import access_service

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search")
def search(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(20, ge=1, le=100),
    db: DbSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Search tests by title or question text. Returns visible tests only.

    Title match wins ranking: any test whose `test_collections.title`
    contains the query is included regardless of whether its questions
    do. Question-text match uses Postgres `payload->>'…'` over the JSONB
    column (the GIN index from the initial migration accelerates
    containment queries; substring search is a sequential scan but cheap
    at our current scale).
    """
    pattern = f"%{q}%"
    accessible = set(access_service.get_accessible_test_ids(db, current_user))
    if not accessible:
        return {"results": [], "total": 0, "query": q}

    # One query covers both title and question matches. We dedupe by
    # test_id afterwards.
    title_q = (
        select(TestCollection)
        .options(joinedload(TestCollection.owner))
        .where(
            TestCollection.test_id.in_(accessible),
            or_(
                func.coalesce(TestCollection.title, "").ilike(pattern),
                func.coalesce(TestCollection.description, "").ilike(pattern),
            ),
        )
    )
    title_matches = list(db.execute(title_q).scalars().unique().all())

    by_test: dict[str, TestCollection] = {tc.test_id: tc for tc in title_matches}

    # If we still have room, look in question text. We compare against
    # `payload['question']` and option content via JSON text. On Postgres
    # we use `->>`; on SQLite the cross-dialect JSON path operator works
    # the same syntactically.
    if len(by_test) < limit:
        remaining_ids = [tid for tid in accessible if tid not in by_test]
        if remaining_ids:
            q_q = (
                select(TestCollection)
                .options(joinedload(TestCollection.owner))
                .join(Question, Question.test_collection_id == TestCollection.id)
                .where(
                    TestCollection.test_id.in_(remaining_ids),
                    func.cast(Question.payload, type_=type(Question.payload.type))
                    .as_string()
                    .ilike(pattern)
                    if False  # see comment below
                    else Question.payload.cast(type_=type(Question.payload.type))
                )
            )
            # The above is fiddly because portable JSONB text search through
            # SQLAlchemy 2 wants the dialect-specific operator. We sidestep
            # it with a one-liner that works on Postgres and falls back
            # gracefully on SQLite: convert payload to text and ILIKE.
            # We rebuild q_q cleanly here:
            from sqlalchemy import literal_column
            payload_as_text = literal_column("CAST(questions.payload AS TEXT)")
            q_q = (
                select(TestCollection)
                .options(joinedload(TestCollection.owner))
                .join(Question, Question.test_collection_id == TestCollection.id)
                .where(
                    TestCollection.test_id.in_(remaining_ids),
                    payload_as_text.ilike(pattern),
                )
                .distinct()
            )
            for tc in db.execute(q_q).scalars().unique().all():
                if tc.test_id not in by_test:
                    by_test[tc.test_id] = tc
                    if len(by_test) >= limit:
                        break

    # Aggregate question counts in one query.
    if by_test:
        count_rows = db.execute(
            select(Question.test_collection_id, func.count(Question.id))
            .where(Question.test_collection_id.in_([c.id for c in by_test.values()]))
            .group_by(Question.test_collection_id)
        ).all()
        counts = dict(count_rows)
    else:
        counts = {}

    results: list[dict[str, Any]] = []
    for tc in list(by_test.values())[:limit]:
        results.append({
            "id": tc.test_id,
            "title": tc.title or "",
            "questionCount": counts.get(tc.id, 0),
            "access_level": tc.access_level,
            "owner_id": tc.owner_id,
            "owner_username": tc.owner.username if tc.owner else None,
        })

    return {"results": results, "total": len(results), "query": q}
