"""MailService dependency-injection."""
from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from api import config
from api.services.mail.console_provider import ConsoleMailProvider
from api.services.mail.provider import MailProvider
from api.services.mail.service import MailService

log = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates" / "mail"


@lru_cache(maxsize=1)
def get_mail_service() -> MailService:
    backend = (config.MAIL_PROVIDER or "console").lower()
    provider: MailProvider
    if backend == "resend":
        from api.services.mail.resend_provider import ResendProvider
        if not config.RESEND_API_KEY:
            log.warning("MAIL_PROVIDER=resend but RESEND_API_KEY is empty; falling back to console")
            provider = ConsoleMailProvider(config.MAIL_DEBUG_DIR)
        else:
            provider = ResendProvider(config.RESEND_API_KEY)
    elif backend == "smtp":
        from api.services.mail.smtp_provider import SmtpProvider
        provider = SmtpProvider(
            host=config.SMTP_HOST,
            port=config.SMTP_PORT,
            user=config.SMTP_USER,
            password=config.SMTP_PASSWORD,
            use_tls=config.SMTP_USE_TLS,
        )
    else:
        provider = ConsoleMailProvider(config.MAIL_DEBUG_DIR)

    return MailService(
        provider=provider,
        templates_dir=TEMPLATES_DIR,
        from_address=config.MAIL_FROM,
        reply_to=config.MAIL_REPLY_TO or None,
    )
