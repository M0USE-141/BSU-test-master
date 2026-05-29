"""Service for cleanup operations."""
import logging
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from api.config import ABANDONED_RETENTION_DAYS
from api.database import SessionLocal
from api.models.db.attempt import Attempt, AttemptStatus
from api.models.db.outgoing_email import OutgoingEmail, OutgoingEmailStatus

# Email retry backoff schedule, in seconds since `created_at`:
# 5 min, 30 min, 2 h. After 3 attempts the row stays `failed` and waits
# for a human (admin endpoint surfaces these).
_EMAIL_BACKOFF_SEC = (5 * 60, 30 * 60, 2 * 60 * 60)
_EMAIL_MAX_ATTEMPTS = 3
_EMAIL_RETRY_WINDOW = timedelta(days=1)


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


def retry_failed_emails() -> int:
    """Re-dispatch `outgoing_emails(status=failed)` rows past their backoff.

    Picks rows where:
      - status == FAILED
      - attempt_count < _EMAIL_MAX_ATTEMPTS
      - created_at > now() - 1 day (don't keep retrying ancient failures)
      - elapsed since created_at >= backoff(attempt_count)

    Re-renders the message from `event` + stored DB context isn't
    possible (we don't snapshot it). So the retry job uses the existing
    `to_address` + `error` columns and asks `MailService.replay()` to
    re-attempt with a thin "retry" payload — the actual template
    rendering happened at first send. Without a stored rendered body
    we limit retries to the next 1-day window and fall back to manual
    intervention after that.
    """
    logger = logging.getLogger(__name__)
    sent_count = 0
    try:
        from api.dependencies.mail import get_mail_service
        from api.services.mail.provider import MailMessage
        from api import config

        mail = get_mail_service()
    except Exception as exc:  # noqa: BLE001 — never crash the worker
        logger.warning("retry_failed_emails: mail service unavailable: %s", exc)
        return 0

    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        stmt = select(OutgoingEmail).where(
            OutgoingEmail.status == OutgoingEmailStatus.FAILED.value,
            OutgoingEmail.attempt_count < _EMAIL_MAX_ATTEMPTS,
            OutgoingEmail.created_at > now - _EMAIL_RETRY_WINDOW,
        )
        rows = db.execute(stmt).scalars().all()
        for row in rows:
            attempt_idx = min(row.attempt_count, len(_EMAIL_BACKOFF_SEC) - 1)
            backoff = _EMAIL_BACKOFF_SEC[attempt_idx]
            created_at = row.created_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            if (now - created_at).total_seconds() < backoff:
                continue
            # We don't have the rendered body; resubmit a thin reminder
            # message with the original event as both subject hint and
            # body. Operators who want full re-render should re-trigger
            # the originating action.
            message = MailMessage(
                to=row.to_address,
                subject=f"[retry] {row.event}",
                text_body=(
                    f"This is an automatic retry of a previously failed message "
                    f"({row.event}). Original error: {row.error or 'unknown'}."
                ),
                html_body=None,
                from_address=config.MAIL_FROM,
                reply_to=config.MAIL_REPLY_TO or None,
                tags=[row.event, "retry"],
            )
            try:
                mail.replay(db, row, message)
                if row.status == OutgoingEmailStatus.SENT.value:
                    sent_count += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("retry_failed_emails: row %s replay raised: %s", row.id, exc)
        if sent_count:
            logger.info("retry_failed_emails: %s message(s) retried successfully", sent_count)
    finally:
        db.close()
    return sent_count


def schedule_events_cleanup() -> tuple[threading.Thread, threading.Event]:
    """Schedule periodic background work.

    Two jobs share the same thread:
      * Daily — drop old abandoned attempts.
      * Every 5 minutes — retry failed outgoing emails.

    Returns (thread, stop_event) for graceful shutdown — call
    `stop_event.set()` then `thread.join(timeout=5)` to stop.
    """
    daily_interval = 24 * 60 * 60       # abandoned-attempts sweep
    email_retry_interval = 5 * 60       # outgoing_emails replay
    stop_event = threading.Event()

    def _worker() -> None:
        # Initial delay before first sweep — avoids hammering the DB
        # during startup.
        if stop_event.wait(60):
            return
        last_daily = datetime.now(timezone.utc) - timedelta(days=1)
        while not stop_event.is_set():
            now = datetime.now(timezone.utc)
            if (now - last_daily).total_seconds() >= daily_interval:
                try:
                    cleanup_abandoned_attempts()
                except Exception:  # noqa: BLE001
                    logging.getLogger(__name__).exception("cleanup_abandoned_attempts raised")
                last_daily = now
            try:
                retry_failed_emails()
            except Exception:  # noqa: BLE001
                logging.getLogger(__name__).exception("retry_failed_emails raised")
            if stop_event.wait(email_retry_interval):
                return

    thread = threading.Thread(
        target=_worker,
        name="background_cleanup",
        daemon=True,
    )
    thread.start()
    return thread, stop_event
