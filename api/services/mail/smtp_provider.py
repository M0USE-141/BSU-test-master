"""SmtpProvider — plain SMTP relay (Postfix fallback).

Activated only if `MAIL_PROVIDER=smtp` and the SMTP_* env vars are set.
Phase 6 ships the implementation but the spec defers production roll-out
until the Resend free tier is exhausted; until then this is exercised
only by unit tests.
"""
from __future__ import annotations

import logging
import smtplib
import uuid
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

from api.services.mail.provider import MailDeliveryError, MailMessage

log = logging.getLogger(__name__)

CONNECT_TIMEOUT_SEC = 10


class SmtpProvider:
    def __init__(
        self,
        *,
        host: str,
        port: int,
        user: str,
        password: str,
        use_tls: bool,
    ) -> None:
        if not host:
            raise ValueError("SmtpProvider requires non-empty host")
        self._host = host
        self._port = port
        self._user = user
        self._password = password
        self._use_tls = use_tls

    def send(self, message: MailMessage) -> str:
        msg = EmailMessage()
        msg["From"] = message.from_address
        msg["To"] = message.to
        msg["Subject"] = message.subject
        msg["Date"] = formatdate(localtime=True)
        msg_id = make_msgid(domain="testmaster.local")
        msg["Message-ID"] = msg_id
        if message.reply_to:
            msg["Reply-To"] = message.reply_to
        if message.tags:
            msg["X-Tags"] = ",".join(message.tags)
        msg.set_content(message.text_body)
        if message.html_body:
            msg.add_alternative(message.html_body, subtype="html")

        try:
            with smtplib.SMTP(self._host, self._port, timeout=CONNECT_TIMEOUT_SEC) as client:
                client.ehlo()
                if self._use_tls:
                    client.starttls()
                    client.ehlo()
                if self._user:
                    client.login(self._user, self._password)
                client.send_message(msg)
        except (smtplib.SMTPException, OSError) as exc:
            raise MailDeliveryError(f"smtp delivery failed: {exc}") from exc

        log.info("smtp delivered to %s", message.to)
        return msg_id
