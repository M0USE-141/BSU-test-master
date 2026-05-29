"""Mail provider Protocol — the interface every backend implements.

Three concrete implementations live next to this file:
  * ResendProvider — Resend HTTP API (production primary).
  * SmtpProvider   — plain smtplib (production fallback / self-hosted).
  * ConsoleMailProvider — writes .eml files to disk for dev/tests.

Keep this module dependency-free of any specific transport library so
imports stay cheap and the Protocol can be implemented from outside.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable


@dataclass(slots=True)
class MailMessage:
    """One outbound email, fully rendered."""

    to: str
    subject: str
    text_body: str
    html_body: str | None
    from_address: str
    reply_to: str | None = None
    tags: list[str] = field(default_factory=list)


class MailDeliveryError(Exception):
    """Raised when a provider refused/failed to dispatch the message."""


@runtime_checkable
class MailProvider(Protocol):
    def send(self, message: MailMessage) -> str:
        """Send the message. Returns a provider-specific message id.

        Raises `MailDeliveryError` on any provider-side failure.
        """
        ...
