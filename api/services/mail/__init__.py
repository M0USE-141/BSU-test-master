"""Mail service package — provider-abstracted transactional email."""
from api.services.mail.provider import MailDeliveryError, MailMessage, MailProvider
from api.services.mail.service import MailService

__all__ = ["MailDeliveryError", "MailMessage", "MailProvider", "MailService"]
