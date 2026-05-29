"""ConsoleMailProvider — dev/test mail sink.

Writes each message to `MAIL_DEBUG_DIR/<ts>_<to>.eml` in standards-
compliant RFC 822 form so Thunderbird, mutt or any other client can
open it directly. The "send" is therefore inspectable but never goes
over the network.
"""
from __future__ import annotations

import logging
import time
import uuid
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

from api.services.mail.provider import MailDeliveryError, MailMessage

log = logging.getLogger(__name__)


class ConsoleMailProvider:
    def __init__(self, debug_dir: Path) -> None:
        self._debug_dir = Path(debug_dir)

    def send(self, message: MailMessage) -> str:
        msg = EmailMessage()
        msg["From"] = message.from_address
        msg["To"] = message.to
        msg["Subject"] = message.subject
        msg["Date"] = formatdate(localtime=True)
        msg_id = make_msgid(domain="console.local")
        msg["Message-ID"] = msg_id
        if message.reply_to:
            msg["Reply-To"] = message.reply_to
        if message.tags:
            msg["X-Tags"] = ",".join(message.tags)
        msg.set_content(message.text_body)
        if message.html_body:
            msg.add_alternative(message.html_body, subtype="html")

        try:
            self._debug_dir.mkdir(parents=True, exist_ok=True)
            ts = time.strftime("%Y%m%d-%H%M%S")
            safe_to = "".join(c for c in message.to if c.isalnum() or c in "._-@")[:64]
            path = self._debug_dir / f"{ts}_{safe_to}_{uuid.uuid4().hex[:6]}.eml"
            path.write_bytes(bytes(msg))
        except OSError as exc:
            raise MailDeliveryError(f"console provider write failed: {exc}") from exc

        log.info("console mail written to %s", path)
        return msg_id
