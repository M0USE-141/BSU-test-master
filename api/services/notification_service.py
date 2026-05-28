"""Notification service — create and query notifications."""
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from api.models.db.notification import Notification


def create_notification(
    db: DbSession,
    user_id: int,
    kind: str,
    payload: dict[str, Any] | None = None,
) -> Notification:
    """Create a new notification for a user."""
    n = Notification(user_id=user_id, kind=kind)
    if payload:
        n.payload = payload
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


def list_notifications(
    db: DbSession,
    user_id: int,
    kind: str | None = None,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[Notification]:
    """List notifications for a user, newest first."""
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
    )
    if kind:
        stmt = stmt.where(Notification.kind == kind)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    stmt = stmt.offset(offset).limit(limit)
    return list(db.execute(stmt).scalars().all())


def mark_read(db: DbSession, notification_id: int, user_id: int) -> Notification | None:
    """Mark a single notification as read (only if owned by user_id)."""
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user_id:
        return None
    if n.read_at is None:
        n.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(n)
    return n


def mark_all_read(db: DbSession, user_id: int) -> int:
    """Mark all unread notifications as read. Returns count updated."""
    from sqlalchemy import update
    result = db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc))
    )
    db.commit()
    return result.rowcount


def unread_count(db: DbSession, user_id: int) -> int:
    """Count unread notifications for a user."""
    from sqlalchemy import func
    row = db.execute(
        select(func.count(Notification.id))
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    ).scalar()
    return row or 0


def count_notifications(
    db: DbSession,
    user_id: int,
    kind: str | None = None,
    unread_only: bool = False,
) -> int:
    """Count total notifications matching the given filters."""
    from sqlalchemy import func
    stmt = select(func.count(Notification.id)).where(Notification.user_id == user_id)
    if kind:
        stmt = stmt.where(Notification.kind == kind)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    return db.execute(stmt).scalar() or 0
