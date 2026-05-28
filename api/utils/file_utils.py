"""File handling utilities."""
import hashlib
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

# Short content-hash IDs let the editor reference uploads by a 7-char
# string instead of full filenames. Same file uploaded twice gets the
# same ID (dedup). 16^7 = 268M slots → collision risk negligible for
# per-test asset sets.
SHORT_ID_LEN = 7


def safe_asset_path(base_dir: Path, asset_path: str) -> Path:
    """Resolve asset path safely (prevent path traversal)."""
    resolved = (base_dir / asset_path).resolve()
    if base_dir.resolve() not in resolved.parents and resolved != base_dir.resolve():
        raise HTTPException(status_code=400, detail="Invalid asset path")
    return resolved


def save_upload_file(upload: UploadFile, target_dir: Path) -> Path:
    """Save uploaded file to target directory.

    Legacy callers keep the original filename (with uuid suffix on
    collision). For new content-hash naming use ``save_upload_with_id``.
    """
    target_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(upload.filename or "asset").name
    candidate = target_dir / safe_name
    if candidate.exists():
        suffix = candidate.suffix
        candidate = target_dir / f"{candidate.stem}_{uuid.uuid4().hex[:8]}{suffix}"
    candidate.write_bytes(upload.file.read())
    return candidate


def save_upload_with_id(upload: UploadFile, target_dir: Path) -> tuple[Path, str, bytes]:
    """Save an upload under a sha1-based short ID.

    Returns (saved_path, short_id, file_bytes). Existing files with the
    same content are not rewritten — the caller still gets the bytes for
    further inspection (e.g. XML validation).
    """
    target_dir.mkdir(parents=True, exist_ok=True)
    data = upload.file.read()
    short_id = hashlib.sha1(data).hexdigest()[:SHORT_ID_LEN]
    suffix = Path(upload.filename or "").suffix.lower()
    target = target_dir / f"{short_id}{suffix}"
    if not target.exists():
        target.write_bytes(data)
    return target, short_id, data