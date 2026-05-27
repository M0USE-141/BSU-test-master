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
ACCESS_TOKEN_EXPIRE_MINUTES = _parse_int_env("ACCESS_TOKEN_EXPIRE_MINUTES", 60)
SESSION_EXTEND_MINUTES = _parse_int_env("SESSION_EXTEND_MINUTES", 60)

# Avatars
AVATARS_DIR = Path(os.environ.get("AVATARS_DIR", Path.cwd() / "data" / "avatars"))
AVATARS_DIR.mkdir(parents=True, exist_ok=True)
AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024  # 2 MB
AVATAR_MAX_DIMENSION = 512  # pixels
AVATAR_ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif"}

# CORS — comma-separated list of allowed origins
_allowed_origins_raw = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000"
)
ALLOWED_ORIGINS: list[str] = [
    o.strip() for o in _allowed_origins_raw.split(",") if o.strip()
]


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
