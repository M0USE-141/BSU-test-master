"""Storage key builders — the SINGLE source of truth for object paths.

All object keys for the storage backend (local FS, MinIO/S3) are constructed
here. Direct string concatenation in routes/services is forbidden — it bypasses
the UUID/filename validation that protects against path-traversal attacks.

Keys are returned in the form `<logical_bucket>/<path>`, e.g.
    "assets/tests/<test_uuid>/questions/<question_uuid>/img-001.png"
    "avatars/users/42/current.jpg"
    "assets/imports/<job_uuid>/source.docx"

`<logical_bucket>` is one of {"assets", "avatars"}. Backends translate these
to real bucket names via config (see `S3_BUCKET_ASSETS`, `S3_BUCKET_AVATARS`).
"""
from __future__ import annotations

import re
from uuid import UUID

# Logical buckets — translated to physical bucket names by the backend.
BUCKET_ASSETS = "assets"
BUCKET_AVATARS = "avatars"

# Allowed avatar variants — closed set.
AVATAR_VARIANTS = frozenset({"current", "thumb-64"})

# Filename whitelist: ASCII letters, digits, underscore, hyphen, dot.
# No leading dot, max 100 chars, must contain extension separator.
_SAFE_FILENAME_RE = re.compile(r"^[A-Za-z0-9_\-]+\.[A-Za-z0-9]{1,10}$")
_MAX_FILENAME_LEN = 100


class StorageKeyError(ValueError):
    """Raised when an invalid component is passed to a key builder."""


def _validate_uuid(value: str, *, name: str) -> str:
    """Ensure `value` is a valid UUID string. Returns it unchanged."""
    if not isinstance(value, str):
        raise StorageKeyError(f"{name} must be str, got {type(value).__name__}")
    try:
        UUID(value)
    except (ValueError, AttributeError) as exc:
        raise StorageKeyError(f"{name} is not a valid UUID: {value!r}") from exc
    return value


def _validate_filename(filename: str) -> str:
    """Ensure filename matches the safe pattern. Returns it unchanged."""
    if not isinstance(filename, str):
        raise StorageKeyError("filename must be str")
    if len(filename) > _MAX_FILENAME_LEN:
        raise StorageKeyError(f"filename too long ({len(filename)} > {_MAX_FILENAME_LEN})")
    if not _SAFE_FILENAME_RE.match(filename):
        raise StorageKeyError(
            f"filename {filename!r} contains disallowed characters; "
            "allowed: A-Z a-z 0-9 _ - and a single extension"
        )
    return filename


def asset_key(test_id: str, question_id: str, filename: str) -> str:
    """Build object key for an asset attached to a question (Phase 4+ model)."""
    test_id = _validate_uuid(test_id, name="test_id")
    question_id = _validate_uuid(question_id, name="question_id")
    filename = _validate_filename(filename)
    return f"{BUCKET_ASSETS}/tests/{test_id}/questions/{question_id}/{filename}"


def material_key(test_id: str, filename: str) -> str:
    """Build object key for a flat per-test material (current content-hash model).

    Filename is `<sha1[:7]><ext>` produced by `save_upload_with_id`. This
    matches the current asset contract where the SPA references uploads via
    `[[img:abc1234]]` / `[[mathml:abc1234]]` tokens that resolve to
    `/api/tests/<test_id>/assets/<abc1234><ext>`. Used until Phase 4 moves
    assets under per-question prefixes.
    """
    test_id = _validate_uuid(test_id, name="test_id")
    filename = _validate_filename(filename)
    return f"{BUCKET_ASSETS}/tests/{test_id}/materials/{filename}"


def materials_prefix(test_id: str) -> str:
    """Prefix for all materials of a test (flat per-test model)."""
    test_id = _validate_uuid(test_id, name="test_id")
    return f"{BUCKET_ASSETS}/tests/{test_id}/materials/"


def test_settings_key(test_id: str, filename: str) -> str:
    """Build object key for a test-level asset (cover image, etc.)."""
    test_id = _validate_uuid(test_id, name="test_id")
    filename = _validate_filename(filename)
    return f"{BUCKET_ASSETS}/tests/{test_id}/settings/{filename}"


def import_source_key(job_id: str) -> str:
    """Build object key for the raw .docx of an import job."""
    job_id = _validate_uuid(job_id, name="job_id")
    return f"{BUCKET_ASSETS}/imports/{job_id}/source.docx"


def import_artifact_key(job_id: str, filename: str) -> str:
    """Build object key for an intermediate artifact of an import job."""
    job_id = _validate_uuid(job_id, name="job_id")
    filename = _validate_filename(filename)
    return f"{BUCKET_ASSETS}/imports/{job_id}/extracted/{filename}"


def avatar_legacy_key(user_id: int, filename: str) -> str:
    """Phase 2 transitional avatar key: `avatars/users/<id>/<filename>`.

    `User.avatar_path` currently stores a uniqued filename like
    `42_abc12345.jpg`. Phase 4 renames the column to `avatar_object_key`
    with a stable `current.jpg`/`thumb-64.jpg` shape (see `avatar_key`).
    Until then, we preserve the per-upload filename to avoid touching
    the DB schema.
    """
    if not isinstance(user_id, int) or user_id <= 0:
        raise StorageKeyError(f"user_id must be a positive int, got {user_id!r}")
    filename = _validate_filename(filename)
    return f"{BUCKET_AVATARS}/users/{user_id}/{filename}"


def avatar_key(user_id: int, variant: str = "current") -> str:
    """Build object key for a user's avatar.

    `variant` is one of the values in `AVATAR_VARIANTS`.
    Extension is fixed to `.jpg` (all avatars are re-encoded to JPEG on upload).
    """
    if not isinstance(user_id, int) or user_id <= 0:
        raise StorageKeyError(f"user_id must be a positive int, got {user_id!r}")
    if variant not in AVATAR_VARIANTS:
        raise StorageKeyError(
            f"variant must be one of {sorted(AVATAR_VARIANTS)}, got {variant!r}"
        )
    return f"{BUCKET_AVATARS}/users/{user_id}/{variant}.jpg"


def test_prefix(test_id: str) -> str:
    """Return the prefix that contains all assets of a test."""
    test_id = _validate_uuid(test_id, name="test_id")
    return f"{BUCKET_ASSETS}/tests/{test_id}/"


def import_prefix(job_id: str) -> str:
    """Return the prefix that contains all artifacts of an import job."""
    job_id = _validate_uuid(job_id, name="job_id")
    return f"{BUCKET_ASSETS}/imports/{job_id}/"


def user_avatars_prefix(user_id: int) -> str:
    """Return the prefix for all avatar variants of a user."""
    if not isinstance(user_id, int) or user_id <= 0:
        raise StorageKeyError(f"user_id must be a positive int, got {user_id!r}")
    return f"{BUCKET_AVATARS}/users/{user_id}/"


def split_logical_key(key: str) -> tuple[str, str]:
    """Split `<bucket>/<rest>` into (bucket, rest).

    Raises StorageKeyError if the bucket is unknown.
    """
    bucket, _, rest = key.partition("/")
    if bucket not in (BUCKET_ASSETS, BUCKET_AVATARS):
        raise StorageKeyError(f"unknown logical bucket {bucket!r} in key {key!r}")
    if not rest:
        raise StorageKeyError(f"key has no object path: {key!r}")
    return bucket, rest
