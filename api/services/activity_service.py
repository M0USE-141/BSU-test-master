"""Activity service — log + list global timeline events.

Write surface: activity_service.log(...) called from existing services
on meaningful state transitions. Failures are swallowed (best-effort)
so a logging hiccup never breaks the underlying operation.

Read surface: list_events() returns a JSON-friendly list ordered newest
first. Caller (api/routes/activity.py) hands the dict straight to the
client.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from api.models.db.activity_event import ActivityEvent

logger = logging.getLogger(__name__)


# Curated event-type set. Strings (not enum) so adding new types in
# downstream services is cheap, but the union is documented here.
EVENT_TYPES = {
    "attempt_completed",
    "test_created",
    "test_shared",
    "cr_proposed",
    "cr_approved",
    "cr_rejected",
    "access_requested",
    "access_granted",
}


def log(
    db: DbSession,
    user_id: int,
    event_type: str,
    *,
    test_id: str | None = None,
    attempt_id: str | None = None,
    target_user_id: int | None = None,
    payload: dict[str, Any] | None = None,
) -> ActivityEvent | None:
    """Write a single event. Returns the row or None on failure.

    Never raises — logging is best-effort and shouldn't block the
    business operation that triggered it.
    """
    try:
        ev = ActivityEvent(
            user_id=user_id,
            event_type=event_type,
            test_id=test_id,
            attempt_id=attempt_id,
            target_user_id=target_user_id,
            created_at=datetime.now(timezone.utc),
        )
        if payload:
            ev.payload = payload
        db.add(ev)
        db.commit()
        db.refresh(ev)
        return ev
    except Exception:
        # Don't let activity logging break the parent transaction.
        try:
            db.rollback()
        except Exception:
            pass
        logger.exception(
            "activity_service.log failed user_id=%s event_type=%s",
            user_id, event_type,
        )
        return None


def list_events(
    db: DbSession,
    user_id: int,
    *,
    limit: int = 50,
    offset: int = 0,
    event_type: str | None = None,
    test_id: str | None = None,
) -> dict[str, Any]:
    """Return a paginated slice of the user's activity feed."""
    stmt = select(ActivityEvent).where(ActivityEvent.user_id == user_id)
    if event_type:
        stmt = stmt.where(ActivityEvent.event_type == event_type)
    if test_id:
        stmt = stmt.where(ActivityEvent.test_id == test_id)
    stmt = stmt.order_by(ActivityEvent.created_at.desc()).offset(offset).limit(limit)
    rows = db.execute(stmt).scalars().all()

    # Total — separate cheap COUNT.
    from sqlalchemy import func
    count_stmt = select(func.count(ActivityEvent.id)).where(ActivityEvent.user_id == user_id)
    if event_type:
        count_stmt = count_stmt.where(ActivityEvent.event_type == event_type)
    if test_id:
        count_stmt = count_stmt.where(ActivityEvent.test_id == test_id)
    total = db.execute(count_stmt).scalar() or 0

    return {
        "events": [_to_dict(e) for e in rows],
        "total": int(total),
        "offset": offset,
        "limit": limit,
    }


def _to_dict(e: ActivityEvent) -> dict[str, Any]:
    return {
        "id": e.id,
        "userId": e.user_id,
        "eventType": e.event_type,
        "testId": e.test_id,
        "attemptId": e.attempt_id,
        "targetUserId": e.target_user_id,
        "payload": e.payload,
        "createdAt": e.created_at.isoformat() if e.created_at else None,
    }
