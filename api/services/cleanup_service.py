"""Service for cleanup operations."""
import logging
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from api.config import ABANDONED_RETENTION_DAYS
from api.database import SessionLocal
from api.models.db.attempt import Attempt, AttemptStatus


def cleanup_abandoned_attempts() -> int:
    """Remove old abandoned attempts from database."""
    if ABANDONED_RETENTION_DAYS <= 0:
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(days=ABANDONED_RETENTION_DAYS)
    logger = logging.getLogger(__name__)

    try:
        db = SessionLocal()
        try:
            result = db.execute(
                delete(Attempt).where(
                    Attempt.status == AttemptStatus.ABANDONED.value,
                    Attempt.started_at < cutoff,
                )
            )
            db.commit()
            deleted = result.rowcount
            if deleted > 0:
                logger.info(f"Cleaned up {deleted} abandoned attempts")
            return deleted
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to cleanup abandoned attempts: {e}")
        return 0


def schedule_events_cleanup() -> tuple[threading.Thread, threading.Event]:
    """Schedule periodic cleanup of old attempts.

    Returns:
        Tuple of (thread, stop_event) for graceful shutdown.
        Call stop_event.set() then thread.join(timeout=5) to stop.
    """
    cleanup_interval = 24 * 60 * 60  # 24 hours
    stop_event = threading.Event()

    def _worker() -> None:
        # Initial delay before first cleanup (60 seconds)
        if stop_event.wait(60):
            return  # Stop requested during initial delay
        while not stop_event.is_set():
            try:
                cleanup_abandoned_attempts()
            except Exception:
                pass
            # Wait for next interval or stop signal
            if stop_event.wait(cleanup_interval):
                return

    thread = threading.Thread(
        target=_worker,
        name="attempts_cleanup",
        daemon=True,
    )
    thread.start()
    return thread, stop_event
