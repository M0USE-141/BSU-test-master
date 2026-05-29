"""Image processing service for user avatars (storage_service-backed).

The on-disk bookkeeping is gone — bytes live wherever the configured
`StorageBackend` puts them (LocalStorageBackend root in dev, MinIO bucket
in prod). The `User.avatar_path` column still stores the uniqued
filename (`<user_id>_<uuid8>.<ext>`) until Phase 4 renames it to
`avatar_object_key` and switches to a stable `current.jpg`.
"""
from __future__ import annotations

import io
import logging
import uuid
from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

from api.config import (
    AVATAR_ALLOWED_EXTENSIONS,
    AVATAR_MAX_DIMENSION,
    AVATAR_MAX_SIZE_BYTES,
)
from api.dependencies.storage import get_storage_backend
from api.services import storage_keys
from api.services.storage_keys import StorageKeyError
from api.services.storage_service import ObjectNotFoundError, StorageBackend

logger = logging.getLogger(__name__)

# Try to import PIL for image processing
try:
    from PIL import Image

    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    logger.warning("PIL not available, avatar resizing will be skipped")


_CONTENT_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
}


def _media_type_for(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return _CONTENT_TYPES.get(ext, "application/octet-stream")


def validate_avatar_file(file: UploadFile) -> None:
    """Validate uploaded avatar file."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided",
        )

    ext = Path(file.filename).suffix.lower()
    if ext not in AVATAR_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(AVATAR_ALLOWED_EXTENSIONS)}",
        )

    allowed_content_types = {"image/png", "image/jpeg", "image/gif"}
    if file.content_type and file.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid content type: {file.content_type}",
        )


def _resize_in_memory(content: bytes) -> bytes:
    """Resize image bytes to fit AVATAR_MAX_DIMENSION; preserve format.

    Returns the (possibly resized) bytes. If PIL is unavailable or the
    image already fits, returns the input unchanged.
    """
    if not PIL_AVAILABLE:
        return content

    try:
        with Image.open(io.BytesIO(content)) as img:
            fmt = img.format or "JPEG"
            # Normalize palette/alpha to RGB for JPEG output. Other
            # formats (PNG, GIF) keep their original mode so animations
            # and transparency survive.
            if fmt == "JPEG" and img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            width, height = img.size
            if width <= AVATAR_MAX_DIMENSION and height <= AVATAR_MAX_DIMENSION:
                return content

            ratio = min(AVATAR_MAX_DIMENSION / width, AVATAR_MAX_DIMENSION / height)
            new_size = (int(width * ratio), int(height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)

            out = io.BytesIO()
            save_kwargs: dict[str, object] = {"format": fmt, "optimize": True}
            if fmt == "JPEG":
                save_kwargs["quality"] = 85
            img.save(out, **save_kwargs)
            logger.info("Resized avatar from %sx%s to %s", width, height, new_size)
            return out.getvalue()
    except Exception as exc:
        # Resize failures shouldn't block the upload — log and keep original.
        logger.error("Error resizing avatar image: %s", exc)
        return content


_MAGIC = {
    b"\xff\xd8\xff": ".jpg",
    b"\x89PNG\r\n\x1a\n": ".png",
    b"GIF87a": ".gif",
    b"GIF89a": ".gif",
}


def _save_through_storage(
    content: bytes,
    user_id: int,
    storage: StorageBackend,
) -> tuple[str, int]:
    """Process bytes + push to storage. Runs in a thread pool."""
    detected = next(
        (ext for sig, ext in _MAGIC.items() if content[: len(sig)] == sig),
        None,
    )
    if detected is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match a supported image format",
        )

    processed = _resize_in_memory(content)
    filename = f"{user_id}_{uuid.uuid4().hex[:8]}{detected}"

    try:
        key = storage_keys.avatar_legacy_key(user_id, filename)
    except StorageKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        storage.put_object(
            key,
            io.BytesIO(processed),
            content_type=_media_type_for(filename),
            length=len(processed),
        )
    except Exception as exc:
        logger.error("Error saving avatar to storage: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save avatar",
        )

    logger.info("Saved avatar for user %s: %s", user_id, filename)
    return filename, len(processed)


async def process_avatar(file: UploadFile, user_id: int) -> tuple[str, int]:
    """Process and store uploaded avatar.

    Returns (avatar_filename, avatar_size_bytes). The filename matches
    the legacy contract — `User.avatar_path` keeps it verbatim — but the
    bytes now live in the configured `StorageBackend`.
    """
    if not PIL_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Image processing is not available on this server",
        )

    validate_avatar_file(file)

    content = await file.read()

    if len(content) > AVATAR_MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {AVATAR_MAX_SIZE_BYTES // (1024 * 1024)}MB",
        )

    storage = get_storage_backend()
    return await run_in_threadpool(_save_through_storage, content, user_id, storage)


def delete_avatar(user_id: int, avatar_path: str | None) -> bool:
    """Delete an avatar from storage. Returns True if a delete was attempted."""
    if not avatar_path:
        return False

    try:
        key = storage_keys.avatar_legacy_key(user_id, avatar_path)
    except StorageKeyError as exc:
        logger.warning("Refusing to delete invalid avatar path %r: %s", avatar_path, exc)
        return False

    storage = get_storage_backend()
    try:
        storage.delete_object(key)
        logger.info("Deleted avatar: %s", key)
        return True
    except Exception as exc:
        logger.error("Error deleting avatar %s: %s", key, exc)
        return False


def get_avatar_url(user_id: int, avatar_path: str | None) -> str | None:
    """Return the public URL for an avatar (the API proxy endpoint)."""
    if not avatar_path:
        return None
    return f"/api/users/{user_id}/avatar"


def get_avatar_stream(
    user_id: int,
    avatar_path: str | None,
) -> tuple[BinaryIO, str] | None:
    """Open an avatar for streaming. Returns (stream, media_type) or None."""
    if not avatar_path:
        return None
    try:
        key = storage_keys.avatar_legacy_key(user_id, avatar_path)
    except StorageKeyError:
        return None
    storage = get_storage_backend()
    try:
        stream = storage.get_object_stream(key)
    except ObjectNotFoundError:
        return None
    return stream, _media_type_for(avatar_path)
