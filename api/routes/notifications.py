"""Notifications endpoints."""
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.db.user import User
from api.services.notification_service import (
    list_notifications,
    mark_all_read,
    mark_read,
    unread_count,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _serialize(n) -> dict[str, Any]:
    return {
        "id": n.id,
        "kind": n.kind,
        "payload": n.payload,
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "created_at": n.created_at.isoformat(),
        "is_read": n.is_read,
    }


@router.get("")
def get_notifications(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    kind: str | None = Query(None),
    unread: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """List notifications for the current user."""
    items = list_notifications(
        db, current_user.id, kind=kind, unread_only=unread,
        limit=limit, offset=offset,
    )
    return {
        "items": [_serialize(n) for n in items],
        "unread_count": unread_count(db, current_user.id),
        "total": len(items),
    }


@router.post("/{notification_id}/read")
def read_notification(
    notification_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    """Mark a single notification as read."""
    n = mark_read(db, notification_id, current_user.id)
    if n is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return _serialize(n)


@router.post("/read-all")
def read_all_notifications(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    """Mark all notifications as read."""
    count = mark_all_read(db, current_user.id)
    return {"marked_read": count}
