"""MailService — render + dispatch + audit/retry.

Public surface:

  * `send_template(db, *, to, locale, template, context, event,
                   user_id=None, tags=())` — main entry point.

Internals:
  1. Render Jinja2 `<locale>/<template>.txt` and (optionally) `.html`.
  2. Persist an `outgoing_emails(status=queued)` row.
  3. Hand the rendered `MailMessage` to the configured provider.
  4. Update the row to `sent` (with provider id) or `failed` (with error).

The retry job in `cleanup_service` picks up `failed` rows and replays
them via `replay_failed_email(...)`.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, TemplateNotFound, select_autoescape
from sqlalchemy.orm import Session as DbSession

from api.models.db.outgoing_email import OutgoingEmail, OutgoingEmailStatus
from api.services.mail.provider import MailDeliveryError, MailMessage, MailProvider

log = logging.getLogger(__name__)

# Templates that the SPA actually wires up.
KNOWN_TEMPLATES = frozenset({
    "password_reset",
    "welcome",
    "change_request_received",
    "change_request_resolved",
    "share_received",
})

SUPPORTED_LOCALES = ("ru", "en", "uz")
FALLBACK_LOCALE = "ru"
MAX_ATTEMPTS = 3


class MailService:
    """Render-and-dispatch service. Stateless apart from the Jinja env."""

    def __init__(
        self,
        *,
        provider: MailProvider,
        templates_dir: Path,
        from_address: str,
        reply_to: str | None = None,
    ) -> None:
        if not templates_dir.exists():
            raise RuntimeError(f"mail templates dir missing: {templates_dir}")
        self._provider = provider
        self._from = from_address
        self._reply_to = reply_to or None
        self._env = Environment(
            loader=FileSystemLoader(str(templates_dir)),
            autoescape=select_autoescape(["html"]),
            keep_trailing_newline=True,
        )

    # ----- internals ------------------------------------------------------

    def _resolve_locale(self, locale: str | None) -> str:
        if locale in SUPPORTED_LOCALES:
            return locale  # type: ignore[return-value]
        return FALLBACK_LOCALE

    def _render(
        self,
        locale: str,
        template: str,
        context: dict[str, Any],
    ) -> tuple[str, str | None, str]:
        """Return (text_body, html_body_or_none, subject)."""
        locale = self._resolve_locale(locale)
        # Subject comes from context — i18n strings are usually short
        # enough to pass in directly without a separate .subject file.
        subject = str(context.get("subject", "")).strip()
        if not subject:
            raise ValueError("send_template requires `context['subject']`")
        try:
            txt = self._env.get_template(f"{locale}/{template}.txt").render(**context)
        except TemplateNotFound:
            # Fall back to ru if the locale-specific file is missing.
            txt = self._env.get_template(f"{FALLBACK_LOCALE}/{template}.txt").render(**context)
        try:
            html = self._env.get_template(f"{locale}/{template}.html").render(**context)
        except TemplateNotFound:
            try:
                html = self._env.get_template(f"{FALLBACK_LOCALE}/{template}.html").render(**context)
            except TemplateNotFound:
                html = None
        return txt, html, subject

    # ----- public API ----------------------------------------------------

    def send_template(
        self,
        db: DbSession,
        *,
        to: str,
        locale: str | None,
        template: str,
        context: dict[str, Any],
        event: str,
        user_id: int | None = None,
        tags: list[str] | None = None,
    ) -> str:
        """Render, persist, and dispatch one message. Returns the
        `outgoing_emails.id`. Caller stays HTTP-responsive — invoke this
        through `BackgroundTasks` for endpoints.
        """
        if template not in KNOWN_TEMPLATES:
            log.warning("send_template: unknown template %r", template)
        text_body, html_body, subject = self._render(locale or FALLBACK_LOCALE, template, context)

        message = MailMessage(
            to=to,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            from_address=self._from,
            reply_to=self._reply_to,
            tags=list(tags or [event]),
        )

        row = OutgoingEmail(
            id=uuid.uuid4().hex,
            user_id=user_id,
            event=event,
            to_address=to,
            status=OutgoingEmailStatus.QUEUED.value,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        self._dispatch(db, row, message)
        return row.id

    def replay(self, db: DbSession, row: OutgoingEmail, message: MailMessage) -> None:
        """Re-send a previously-failed message. Used by the retry job."""
        self._dispatch(db, row, message)

    def _dispatch(
        self,
        db: DbSession,
        row: OutgoingEmail,
        message: MailMessage,
    ) -> None:
        row.attempt_count = (row.attempt_count or 0) + 1
        db.commit()
        try:
            provider_id = self._provider.send(message)
        except MailDeliveryError as exc:
            row.status = OutgoingEmailStatus.FAILED.value
            row.error = str(exc)[:2000]
            db.commit()
            log.warning("mail %s send failed (attempt %s): %s",
                        row.id, row.attempt_count, exc)
            return
        except Exception as exc:  # noqa: BLE001 — never bubble out of background
            row.status = OutgoingEmailStatus.FAILED.value
            row.error = f"{type(exc).__name__}: {exc}"[:2000]
            db.commit()
            log.exception("mail %s send raised: %s", row.id, exc)
            return

        row.status = OutgoingEmailStatus.SENT.value
        row.provider_message_id = (provider_id or "")[:255]
        row.error = None
        row.sent_at = datetime.now(timezone.utc)
        db.commit()
        log.info("mail %s sent → %s (provider id %s)", row.id, message.to, provider_id)
