"""Application configuration and constants."""
import logging
import os
import sys
import time
from pathlib import Path

# App version for frontend cache-busting.
# In production: set APP_VERSION env var to the deploy hash (e.g. git short SHA).
# In dev:        defaults to the server startup timestamp so each restart
#                invalidates the browser's ES module cache automatically.
_startup_ts = str(int(time.time()))
APP_VERSION: str = os.environ.get("APP_VERSION") or _startup_ts

_SECRET_KEY_PLACEHOLDER = "CHANGE_ME_IN_PRODUCTION_USE_openssl_rand_hex_32"


def _resource_path(relative: str) -> Path:
    """Get path to resource, works for PyInstaller bundles."""
    if getattr(sys, "frozen", False):
        base_dir = Path(sys._MEIPASS)
    else:
        base_dir = Path(__file__).resolve().parent.parent
    return base_dir / relative


def _parse_int_env(name: str, default: int) -> int:
    """Parse integer from environment variable."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


# Directories
DATA_DIR = Path(os.environ.get("TEST_DATA_DIR", Path.cwd() / "data" / "tests"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

STATIC_DIR = _resource_path("static")

# Database
DB_DIR = Path(os.environ.get("DB_DIR", Path.cwd() / "data"))
DB_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.environ.get(
    "DATABASE_URL", f"sqlite:///{DB_DIR / 'testmaster.db'}"
)

# Authentication
SECRET_KEY = os.environ.get("SECRET_KEY", _SECRET_KEY_PLACEHOLDER)
ALGORITHM = "HS256"
# Short access TTL — silently refreshed via HttpOnly cookie when expired.
ACCESS_TOKEN_EXPIRE_MINUTES = _parse_int_env("ACCESS_TOKEN_EXPIRE_MINUTES", 15)
REFRESH_TOKEN_EXPIRE_DAYS = _parse_int_env("REFRESH_TOKEN_EXPIRE_DAYS", 7)
SESSION_EXTEND_MINUTES = _parse_int_env("SESSION_EXTEND_MINUTES", 60)

# Cookie settings for the refresh-token cookie.
#   COOKIE_SECURE=true requires HTTPS — keep false in dev (HTTP at LAN IP).
#   COOKIE_SAMESITE=lax balances CSRF protection vs. usability.
ENV = os.environ.get("ENV", "dev").lower()
COOKIE_SECURE = os.environ.get(
    "COOKIE_SECURE", "true" if ENV == "prod" else "false"
).lower() in {"1", "true", "yes"}
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax").lower()
# Cookie domain — leave empty for "same as request host" (works for LAN IP).
COOKIE_DOMAIN = os.environ.get("COOKIE_DOMAIN", "") or None
REFRESH_COOKIE_NAME = "refresh_token"
# Path is scoped to /api/auth so the cookie is only sent on auth endpoints
# (refresh / logout). Other API calls use the Authorization header.
REFRESH_COOKIE_PATH = "/api/auth"

# Cleanup
ABANDONED_RETENTION_DAYS = _parse_int_env("ABANDONED_RETENTION_DAYS", 90)

# Upload + ownership limits.
#
# 50 MB caps docx uploads at ~30× the largest real-world test file we've
# seen (a 451-image .docx came in at 1.7 MB). Higher would just buy a
# bigger DoS surface — the extractor pulls the entire file into memory
# before parsing.
#
# 500 tests per user matches BSU's department-scale use case (lecturers
# typically hold tens to low hundreds of tests). A higher limit becomes
# justifiable when we add pagination + soft-delete; until then it caps
# accidental upload-loops.
#
# Both are overridable via env for installs with different needs.
MAX_DOCX_UPLOAD_BYTES = _parse_int_env(
    "MAX_DOCX_UPLOAD_BYTES", 50 * 1024 * 1024,
)
MAX_TESTS_PER_USER = _parse_int_env("MAX_TESTS_PER_USER", 500)

# Avatars
AVATARS_DIR = Path(os.environ.get("AVATARS_DIR", Path.cwd() / "data" / "avatars"))
AVATARS_DIR.mkdir(parents=True, exist_ok=True)
AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024  # 2 MB
AVATAR_MAX_DIMENSION = 512  # pixels
AVATAR_ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif"}

# Storage backend (Phase 1 of postgres+minio migration)
# "local" — files under LOCAL_STORAGE_DIR; presigned URLs served by dev_storage route.
# "s3"    — MinIO/S3 via minio-py (added in Phase 3).
STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "local").lower()

LOCAL_STORAGE_DIR = Path(
    os.environ.get("LOCAL_STORAGE_DIR", Path.cwd() / "data" / "storage")
)
LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
# Prefix prepended to LocalStorageBackend presigned URLs. Empty = relative URL
# (the SPA fetches /api/dev-storage/... against the same origin, which works
# in any dev setup). Override only if a tool needs absolute URLs.
LOCAL_STORAGE_PUBLIC_BASE_URL = os.environ.get("LOCAL_STORAGE_PUBLIC_BASE_URL", "")

# S3 / MinIO — read but not validated here; Phase 3 wires them into S3StorageBackend.
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")
S3_PUBLIC_ENDPOINT = os.environ.get("S3_PUBLIC_ENDPOINT", S3_ENDPOINT)
S3_ACCESS_KEY = os.environ.get("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.environ.get("S3_SECRET_KEY", "")
S3_REGION = os.environ.get("S3_REGION", "us-east-1")
S3_BUCKET_ASSETS = os.environ.get("S3_BUCKET_ASSETS", "testmaster-assets")
S3_BUCKET_AVATARS = os.environ.get("S3_BUCKET_AVATARS", "testmaster-avatars")
S3_SECURE = os.environ.get("S3_SECURE", "false").lower() in {"1", "true", "yes"}

# Mail (Phase 6)
# "console" — write to data/mail-debug/*.eml (dev/tests)
# "resend"  — HTTP POST to Resend API (primary production provider)
# "smtp"    — plain smtplib relay (fallback when Resend tier exhausted)
MAIL_PROVIDER = os.environ.get("MAIL_PROVIDER", "console").lower()
MAIL_FROM = os.environ.get("MAIL_FROM", "noreply@testmaster.local")
MAIL_REPLY_TO = os.environ.get("MAIL_REPLY_TO", "")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = _parse_int_env("SMTP_PORT", 587)
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() in {"1", "true", "yes"}

MAIL_DEBUG_DIR = Path(
    os.environ.get("MAIL_DEBUG_DIR", Path.cwd() / "data" / "mail-debug")
)
# Don't pre-create the dir — only ConsoleMailProvider needs it.

# CORS — comma-separated list of allowed origins
_allowed_origins_raw = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000"
)
ALLOWED_ORIGINS: list[str] = [
    o.strip() for o in _allowed_origins_raw.split(",") if o.strip()
]

# Public URL the SPA is served from (used to build absolute links in
# emails). Falls back to first ALLOWED_ORIGINS entry if not set.
PUBLIC_BASE_URL = os.environ.get(
    "PUBLIC_BASE_URL", ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else "",
)


def validate_secret_key() -> None:
    """Validate SECRET_KEY is not the unsafe placeholder.

    Raises RuntimeError in production (ENV=production).
    Logs a warning in all other environments.
    """
    logger = logging.getLogger(__name__)
    if SECRET_KEY != _SECRET_KEY_PLACEHOLDER:
        return

    env = os.environ.get("ENV", "").lower()
    if env == "production":
        raise RuntimeError(
            "SECRET_KEY must be set in production. "
            "Generate a key with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    logger.warning(
        "SECRET_KEY is using the unsafe default placeholder. "
        "Set the SECRET_KEY environment variable before deploying to production."
    )
