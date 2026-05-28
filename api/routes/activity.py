"""Activity feed route — GET /api/activity."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.db.user import User
from api.services import activity_service

router = APIRouter(prefix="/api", tags=["activity"])


@router.get("/activity")
def list_activity(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    event_type: str | None = Query(None, alias="eventType"),
    test_id: str | None = Query(None, alias="testId"),
) -> dict:
    """Per-user global activity timeline.

    Returns { events: [...], total, offset, limit } newest first.
    Auth required — the feed is scoped to the calling user.
    """
    return activity_service.list_events(
        db, current_user.id,
        limit=limit, offset=offset,
        event_type=event_type, test_id=test_id,
    )
