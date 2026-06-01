"""Question CRUD — replaces the file-based test_service payload I/O.

The SPA contract is preserved: question lookups still use the integer
`payload["id"]`. Internally each row also carries a UUID `Question.id`
(PK), used only for FK targets from `question_performance`/
`flagged_question` (added in a future migration) and for stable S3
object keys when the upload model moves to per-question prefixes.

Public API used by the routes/services:

  * `test_exists(db, test_id)`            → bool
  * `list_questions(db, test_id)`         → list[dict]    — full payload list
  * `get_question(db, test_id, qid)`      → (dict, idx)   — int qid lookup
  * `add_question(db, test_id, payload)`  → dict          — append, returns new question
  * `update_question(db, test_id, qid, p)`→ dict          — replace (merge top-level keys)
  * `delete_question(db, test_id, qid)`   → None          — drop + compact order
  * `replace_all(db, test_id, payloads)`  → None          — bulk replace (used by docx import)
  * `get_test_payload(db, test_id)`       → dict | None   — test.json-shaped dict

Callers pass the public `test_id` slug (UUID-hex string), not the
internal `test_collections.id` PK — same convention the URLs use.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import cast, func, select
from sqlalchemy.types import String as SAString
from sqlalchemy.orm import Session as DbSession

from api.models.db.question import Question
from api.models.db.test_collection import TestCollection


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_collection(db: DbSession, test_id: str) -> TestCollection:
    tc = db.execute(
        select(TestCollection).where(TestCollection.test_id == test_id)
    ).scalar_one_or_none()
    if tc is None:
        raise HTTPException(status_code=404, detail="Test not found")
    return tc


def _payload_int_id_filter(public_id: int):
    """SQL predicate matching `payload->>'id' == public_id`.

    Postgres JSONB supports `payload['id'].as_string()`. SQLAlchemy 2's
    cross-dialect JSON also exposes `[...].as_string()` for SQLite. The
    cast to `String` keeps the comparison textual — JSON numbers are
    serialized without spaces, so '5' matches both `5` and `"5"`.
    """
    return cast(Question.payload["id"], SAString) == str(public_id)


def _find_question_row(
    db: DbSession,
    tc_id: int,
    public_id: int,
) -> Question | None:
    return db.execute(
        select(Question).where(
            Question.test_collection_id == tc_id,
            _payload_int_id_filter(public_id),
        )
    ).scalar_one_or_none()


def _next_public_id(db: DbSession, tc_id: int) -> int:
    """Next integer payload-id for this test (max + 1, 1-based)."""
    rows = db.execute(
        select(Question.payload).where(Question.test_collection_id == tc_id)
    ).scalars().all()
    max_id = 0
    for p in rows:
        try:
            v = int(p.get("id", 0)) if isinstance(p, dict) else 0
        except (TypeError, ValueError):
            v = 0
        if v > max_id:
            max_id = v
    return max_id + 1


def _ensure_payload_id(payload: dict[str, Any], public_id: int) -> dict[str, Any]:
    """Return payload with `id` stamped to public_id (int)."""
    out = dict(payload)
    out["id"] = public_id
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def test_exists(db: DbSession, test_id: str) -> bool:
    """True if a TestCollection with this slug is in the DB."""
    return db.execute(
        select(func.count()).select_from(TestCollection).where(
            TestCollection.test_id == test_id
        )
    ).scalar_one() > 0


def list_questions(db: DbSession, test_id: str) -> list[dict[str, Any]]:
    """Return every question payload for the test, in order."""
    tc = _get_collection(db, test_id)
    rows = db.execute(
        select(Question).where(Question.test_collection_id == tc.id)
        .order_by(Question.order_index)
    ).scalars().all()
    return [r.payload for r in rows]


def get_question(
    db: DbSession,
    test_id: str,
    question_id: int,
) -> tuple[dict[str, Any], int]:
    """Return (payload, order_index) for the int-id question. 404 if missing."""
    tc = _get_collection(db, test_id)
    row = _find_question_row(db, tc.id, question_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return row.payload, row.order_index


def get_correct_option_index(
    db: DbSession,
    test_id: str,
    question_id: int,
) -> int | None:
    """Authoritative index of the correct option for a question.

    Reads the marked-correct option straight from the `questions` table
    (`payload.options[].isCorrect`) rather than a per-attempt snapshot.
    Used as a safety net when an attempt-answer's `correct_option_index`
    snapshot is absent — e.g. the `/start` snapshot lost the race against
    the `/answer` write, or `/start` never succeeded. Returns None (never
    raises) when the test/question is gone or no option is marked correct.
    """
    tc = db.execute(
        select(TestCollection).where(TestCollection.test_id == test_id)
    ).scalar_one_or_none()
    if tc is None:
        return None
    row = _find_question_row(db, tc.id, question_id)
    if row is None:
        return None
    options = (row.payload or {}).get("options") or []
    for index, option in enumerate(options):
        if isinstance(option, dict) and option.get("isCorrect"):
            return index
    return None


def add_question(
    db: DbSession,
    test_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Append a question. Returns the stored payload (with assigned int id)."""
    tc = _get_collection(db, test_id)
    public_id = int(payload.get("id") or _next_public_id(db, tc.id))
    if _find_question_row(db, tc.id, public_id) is not None:
        public_id = _next_public_id(db, tc.id)
    next_index = db.execute(
        select(func.coalesce(func.max(Question.order_index), -1) + 1).where(
            Question.test_collection_id == tc.id
        )
    ).scalar_one()
    stored = _ensure_payload_id(payload, public_id)
    row = Question(
        id=str(uuid.uuid4()),
        test_collection_id=tc.id,
        order_index=next_index,
        payload=stored,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.payload


def replace_question_payload(
    db: DbSession,
    test_id: str,
    question_id: int,
    new_payload: dict[str, Any],
) -> dict[str, Any]:
    """Overwrite the whole payload of an existing question (id preserved)."""
    tc = _get_collection(db, test_id)
    row = _find_question_row(db, tc.id, question_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Question not found")
    row.payload = _ensure_payload_id(new_payload, question_id)
    db.commit()
    db.refresh(row)
    return row.payload


def delete_question(db: DbSession, test_id: str, question_id: int) -> dict[str, Any]:
    """Delete + compact order. Returns the dropped payload (for 200 response)."""
    tc = _get_collection(db, test_id)
    row = _find_question_row(db, tc.id, question_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Question not found")
    payload = row.payload
    deleted_index = row.order_index
    db.delete(row)
    # Flush the DELETE before the bulk UPDATE so the unique constraint
    # on (test_collection_id, order_index) doesn't trip when we shift
    # rows down to fill the gap.
    db.flush()
    db.execute(
        Question.__table__.update()
        .where(
            Question.test_collection_id == tc.id,
            Question.order_index > deleted_index,
        )
        .values(order_index=Question.order_index - 1)
    )
    db.commit()
    return payload


def replace_all(
    db: DbSession,
    test_id: str,
    payloads: list[dict[str, Any]],
) -> None:
    """Replace every question for this test with `payloads` (preserving int ids)."""
    tc = _get_collection(db, test_id)
    db.execute(
        Question.__table__.delete().where(Question.test_collection_id == tc.id)
    )
    rows: list[Question] = []
    for idx, payload in enumerate(payloads):
        pid_raw = payload.get("id")
        try:
            public_id = int(pid_raw) if pid_raw is not None else idx + 1
        except (TypeError, ValueError):
            public_id = idx + 1
        rows.append(
            Question(
                id=str(uuid.uuid4()),
                test_collection_id=tc.id,
                order_index=idx,
                payload=_ensure_payload_id(payload, public_id),
            )
        )
    db.add_all(rows)
    db.commit()


def get_test_payload(db: DbSession, test_id: str) -> dict[str, Any] | None:
    """Return a test.json-shaped dict for the test, or None if missing."""
    tc = db.execute(
        select(TestCollection).where(TestCollection.test_id == test_id)
    ).scalar_one_or_none()
    if tc is None:
        return None
    settings: dict[str, Any] = dict(tc.settings) if tc.settings else {}
    if tc.title is not None:
        settings.setdefault("title", tc.title)
    if tc.description is not None:
        settings.setdefault("description", tc.description)
    return {
        **settings,
        "id": tc.test_id,
        "questions": list_questions(db, test_id),
    }


def save_test_settings(
    db: DbSession,
    test_id: str,
    *,
    title: str | None = None,
    description: str | None = None,
    settings: dict[str, Any] | None = None,
) -> None:
    """Update test-level metadata. Pass-through `None` means 'do not touch'."""
    tc = _get_collection(db, test_id)
    if title is not None:
        tc.title = title or None
    if description is not None:
        tc.description = description or None
    if settings is not None:
        tc.settings = settings if settings else None
    db.commit()
