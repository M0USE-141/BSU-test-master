"""ResendProvider — Resend transactional email API.

Uses Resend's REST endpoint via `httpx`. We don't depend on the official
`resend` SDK so the import surface stays minimal — just one HTTPS POST.

Resend rejects messages with a clear error code in the JSON body; we
surface that as `MailDeliveryError` so the caller can store it on the
`outgoing_emails` row.
"""
from __future__ import annotations

import logging

import httpx

from api.services.mail.provider import MailDeliveryError, MailMessage

log = logging.getLogger(__name__)

RESEND_API = "https://api.resend.com/emails"
# Hard cap so a misbehaving Resend endpoint can't wedge a background
# task forever. Sending a transactional email should take <2s.
REQUEST_TIMEOUT_SEC = 10


class ResendProvider:
    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("ResendProvider requires non-empty api_key")
        self._api_key = api_key

    def send(self, message: MailMessage) -> str:
        body: dict[str, object] = {
            "from": message.from_address,
            "to": [message.to],
            "subject": message.subject,
            "text": message.text_body,
        }
        if message.html_body:
            body["html"] = message.html_body
        if message.reply_to:
            body["reply_to"] = message.reply_to
        if message.tags:
            # Resend tags are name/value pairs; we use the tag as the name
            # and "true" as a placeholder value.
            body["tags"] = [{"name": t, "value": "true"} for t in message.tags]

        try:
            response = httpx.post(
                RESEND_API,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
                timeout=REQUEST_TIMEOUT_SEC,
            )
        except httpx.HTTPError as exc:
            raise MailDeliveryError(f"resend transport error: {exc}") from exc

        if response.status_code >= 400:
            # Try to extract Resend's structured error; fall back to the body text.
            try:
                err = response.json()
                detail = err.get("message") or err.get("error") or response.text
            except ValueError:
                detail = response.text
            raise MailDeliveryError(
                f"resend rejected ({response.status_code}): {detail}"
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise MailDeliveryError(f"resend returned non-JSON: {response.text}") from exc

        msg_id = data.get("id")
        if not msg_id:
            raise MailDeliveryError(f"resend response missing id: {data}")
        log.info("resend delivered message %s to %s", msg_id, message.to)
        return msg_id
