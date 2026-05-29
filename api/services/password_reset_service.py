"""Password reset service.

When SMTP is configured (env vars SMTP_HOST/SMTP_USER/SMTP_PASS), the reset
link is emailed. Otherwise it's logged at INFO level — useful for development
and dev-mode CTF/teacher setups where the admin can just read the link from
the server log.
"""
from __future__ import annotations

import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session as DbSession

from api.models.db.password_reset import PasswordResetToken
from api.models.db.user import User
from api.services.auth_service import hash_password

logger = logging.getLogger(__name__)

# How long a reset link is valid for.
RESET_TOKEN_TTL_MINUTES = 30

# Password rules — also surfaced to the frontend via /api/auth/password-rules.
PASSWORD_MIN_LENGTH = 8
PASSWORD_REQUIRE_DIGIT = True
PASSWORD_REQUIRE_UPPER = True


def password_rules() -> dict:
    """Public, JSON-safe description of password requirements."""
    return {
        "min_length": PASSWORD_MIN_LENGTH,
        "require_digit": PASSWORD_REQUIRE_DIGIT,
        "require_upper": PASSWORD_REQUIRE_UPPER,
    }


def validate_password(password: str) -> list[str]:
    """Return a list of failed rule keys (empty list = OK)."""
    errors: list[str] = []
    if len(password) < PASSWORD_MIN_LENGTH:
        errors.append("min_length")
    if PASSWORD_REQUIRE_DIGIT and not any(c.isdigit() for c in password):
        errors.append("require_digit")
    if PASSWORD_REQUIRE_UPPER and not any(c.isupper() for c in password):
        errors.append("require_upper")
    return errors


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_reset_token(db: DbSession, user: User) -> str:
    """Create a single-use reset token. Returns the plaintext value.

    Delivery is the caller's responsibility — the route hands the token
    to `MailService.send_template` via `BackgroundTasks`.
    """
    plaintext = secrets.token_urlsafe(32)
    record = PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_token(plaintext),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return plaintext


def consume_reset_token(db: DbSession, token: str) -> User | None:
    """Look up an unconsumed, unexpired reset token by its plaintext value.

    Returns the owning user and marks the token consumed, or returns None
    if the token is invalid/expired/already used.
    """
    record = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == _hash_token(token))
        .first()
    )
    if record is None:
        return None
    if record.consumed_at is not None:
        return None
    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    record.consumed_at = datetime.now(timezone.utc)
    db.commit()
    return record.user


def reset_user_password(db: DbSession, user: User, new_password: str) -> None:
    """Hash ``new_password`` and persist it on ``user``."""
    user.hashed_password = hash_password(new_password)
    db.commit()


def deliver_reset_link(user: User, token: str, *, base_url: str) -> None:
    """Deliver the reset link to the user.

    Behavior matrix:
        - SMTP_HOST + SMTP_USER + SMTP_PASS set → send real email.
        - otherwise                            → log a single-line INFO with
          the full reset URL so an admin or developer can hand it over.

    Email sending is intentionally stubbed in this commit; flipping the
    env vars activates it. Falling back to the log is safe in dev and
    explicit enough that a production deploy without SMTP won't go
    unnoticed.
    """
    base = base_url.rstrip("/")
    reset_url = f"{base}/#/auth/reset?token={token}"
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")

    if smtp_host and smtp_user and smtp_pass:
        # Real send. Kept minimal — production deploys can swap this for a
        # template-aware mailer (e.g. fastapi-mail) without touching callers.
        try:
            import smtplib
            from email.message import EmailMessage

            msg = EmailMessage()
            msg["Subject"] = "TestMaster — сброс пароля"
            msg["From"] = os.environ.get("SMTP_FROM", smtp_user)
            msg["To"] = user.email
            msg.set_content(
                f"Здравствуйте,\n\nЧтобы сбросить пароль, перейдите по ссылке:\n"
                f"{reset_url}\n\nСсылка действует {RESET_TOKEN_TTL_MINUTES} минут. "
                f"Если вы не запрашивали сброс — просто проигнорируйте письмо."
            )
            port = int(os.environ.get("SMTP_PORT", "587"))
            with smtplib.SMTP(smtp_host, port) as s:
                s.starttls()
                s.login(smtp_user, smtp_pass)
                s.send_message(msg)
            logger.info("Password reset email sent to user_id=%s", user.id)
            return
        except Exception:
            logger.exception(
                "Failed to send password reset email to user_id=%s; falling back to log delivery",
                user.id,
            )

    logger.info(
        "Password reset link (SMTP not configured) — user=%s email=%s url=%s",
        user.id, user.email, reset_url,
    )
