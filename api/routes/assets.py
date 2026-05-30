"""Asset management endpoints (storage_service-backed).

The flat content-hash model is preserved: uploads land at
`<short_id><ext>` under the test's `materials/` prefix and the SPA
references them via `[[img:abc1234]]` / `[[mathml:abc1234]]` tokens that
resolve to `GET /api/tests/<test_id>/assets/<short_id><ext>`.

The route handlers do NOT touch the filesystem anymore — they go through
the injected `StorageBackend`. In dev that's `LocalStorageBackend`
(files under `data/storage/`); in production it's `S3StorageBackend`
(MinIO).
"""
from __future__ import annotations

import hashlib
import io
import mimetypes
from pathlib import Path as _Path
from typing import Annotated

# defusedxml shields the parser from XXE and billion-laughs attacks —
# critical when accepting MathML uploads from non-owner collaborators.
from defusedxml import ElementTree as ET

from fastapi import APIRouter, Depends, File, HTTPException, Path, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DbSession

from api.database import SessionLocal, get_db
from api.dependencies.auth import get_current_user, get_optional_user
from api.dependencies.storage import get_storage
from api.models.db.user import User
from api.services import access_service
from api.services import storage_keys
from api.services.storage_keys import StorageKeyError
from api.services.storage_service import (
    ObjectNotFoundError,
    StorageBackend,
)
from api.services.questions_service import test_exists
from api.utils.file_utils import SHORT_ID_LEN
from api.utils.validation import TEST_ID_PATTERN

router = APIRouter(prefix="/api/tests/{test_id}/assets", tags=["assets"])

# File-extension classification for the materials panel.
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
# `.tex` carries raw LaTeX (not XML); the others carry MathML.
LATEX_EXTS = {".tex"}
FORMULA_EXTS = {".mml", ".xml", ".mathml"} | LATEX_EXTS

# Max upload size — defense in depth against runaway PUTs. Real limit is
# usually enforced by the reverse proxy (Caddy `request_body max_size`).
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB


def _classify(suffix: str) -> str:
    s = suffix.lower()
    if s in IMAGE_EXTS:
        return "image"
    if s in FORMULA_EXTS:
        return "formula"
    return "other"


def _validate_mathml(data: bytes) -> str:
    """Reject malformed MathML uploads. Returns the decoded XML text."""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="MathML file must be UTF-8")
    try:
        root = ET.fromstring(text)
    except ET.ParseError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid XML in MathML upload: {e}",
        )
    local = root.tag.rsplit("}", 1)[-1] if "}" in root.tag else root.tag
    if local.lower() != "math":
        raise HTTPException(
            status_code=400,
            detail=f"MathML root must be <math>, got <{local}>",
        )
    return text


def _validate_latex(data: bytes) -> str:
    """Reject malformed LaTeX uploads. Returns the decoded source text.

    LaTeX is not XML, so we only enforce UTF-8 + non-empty. The frontend
    wraps it in MathJax `\\(...\\)` delimiters at render time.
    """
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="LaTeX file must be UTF-8")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Empty LaTeX upload")
    return text


def _short_id_for(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()[:SHORT_ID_LEN]


def _safe_suffix(filename: str | None) -> str:
    """Lowercase extension from a filename, validated against known sets.

    Falls back to empty string when no extension. Rejects extensions that
    aren't image/formula — uploads are limited to those classes.
    """
    suffix = _Path(filename or "").suffix.lower()
    if suffix and suffix not in IMAGE_EXTS and suffix not in FORMULA_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported asset type {suffix!r}",
        )
    return suffix


def _guess_content_type(filename: str) -> str:
    ctype, _ = mimetypes.guess_type(filename)
    return ctype or "application/octet-stream"


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("")
def upload_asset(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    storage: Annotated[StorageBackend, Depends(get_storage)],
    file: UploadFile = File(...),
) -> dict[str, str]:
    """Upload an asset (image or MathML formula) to a test.

    Saves under a 7-char sha1-prefix filename. Same content twice → same
    ID (dedup). MathML uploads are validated server-side.
    """
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(
            status_code=403, detail="Only the test owner can upload assets"
        )

    # We still gate by the existence of the test (consistent with the
    # pre-storage_service behavior). `test_exists` consults the DB, not the
    # filesystem.
    if not test_exists(db, test_id):
        raise HTTPException(status_code=404, detail="Test not found")

    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Asset too large")

    suffix = _safe_suffix(file.filename)
    short_id = _short_id_for(data)
    name = f"{short_id}{suffix}"
    kind = _classify(suffix)

    # Validate BEFORE writing — keeps invalid blobs out of storage. `.tex`
    # is raw LaTeX (UTF-8 check only); the rest are MathML (XML + <math>).
    mathml = None
    latex = None
    if kind == "formula":
        if suffix in LATEX_EXTS:
            latex = _validate_latex(data)
        else:
            mathml = _validate_mathml(data)

    try:
        key = storage_keys.material_key(test_id, name)
    except StorageKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Idempotent write — no HEAD-before-PUT. The key is derived from the
    # content's sha1 prefix, so re-uploading the same bytes to the same key
    # is a no-op semantically; saving the HEAD round-trip is a free win
    # (and removes a confusing 404 line from S3 client debug logs).
    storage.put_object(
        key,
        io.BytesIO(data),
        content_type=_guess_content_type(name),
        length=len(data),
    )

    response: dict[str, str] = {
        "id": short_id,
        "src": name,
        "name": file.filename or name,
        "kind": kind,
    }
    if mathml is not None:
        response["mathml"] = mathml
    if latex is not None:
        response["latex"] = latex
    return response


# ---------------------------------------------------------------------------
# Materials listing (editor panel)
# ---------------------------------------------------------------------------

@router.get("/materials")
def list_materials(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User | None, Depends(get_optional_user)],
    storage: Annotated[StorageBackend, Depends(get_storage)],
) -> dict[str, list[dict[str, str]]]:
    """List every uploaded image/formula for this test.

    Note on DB scope: we open a short session ONLY for the access check
    and close it before iterating S3. The remaining loop fetches every
    MathML body from storage, which can take seconds — holding a pooled
    Postgres connection across that loop starves the pool under load
    (this used to cause `QueuePool limit reached` cascades).
    """
    with SessionLocal() as db:
        if not access_service.can_view_test(db, test_id, current_user):
            raise HTTPException(status_code=403, detail="Access denied")
    # ↑ connection released — none of the work below needs the DB.

    try:
        prefix = storage_keys.materials_prefix(test_id)
    except StorageKeyError:
        return {"items": []}

    items: list[dict[str, str]] = []
    for key in sorted(storage.list_prefix(prefix)):
        # Logical key format: assets/tests/<id>/materials/<short_id><ext>
        # The trailing segment IS the filename — no nested dirs are
        # created by the upload path, so a simple basename split works.
        name = key.rsplit("/", 1)[-1]
        suffix = _Path(name).suffix.lower()
        kind = _classify(suffix)
        if kind == "other":
            continue
        entry: dict[str, str] = {
            "id": _Path(name).stem,
            "src": name,
            "name": name,
            "kind": kind,
        }
        if kind == "formula":
            try:
                text = storage.get_object_bytes(key).decode("utf-8")
            except (ObjectNotFoundError, UnicodeDecodeError):
                continue
            # `.tex` → raw LaTeX; everything else in FORMULA_EXTS → MathML.
            entry["latex" if suffix in LATEX_EXTS else "mathml"] = text
        items.append(entry)

    return {"items": items}


# ---------------------------------------------------------------------------
# Delete by short ID
# ---------------------------------------------------------------------------

@router.delete("/{asset_id}")
def delete_asset(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    asset_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    storage: Annotated[StorageBackend, Depends(get_storage)],
) -> dict[str, object]:
    """Delete an asset by its short ID (file stem)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(
            status_code=403, detail="Only the test owner can delete assets"
        )

    # Restrict ID to a content-hash short form: 1-32 hex chars.
    if (
        not asset_id
        or not all(c in "0123456789abcdefABCDEF" for c in asset_id)
        or len(asset_id) > 32
    ):
        raise HTTPException(status_code=400, detail="Invalid asset id")

    try:
        prefix = storage_keys.materials_prefix(test_id)
    except StorageKeyError:
        raise HTTPException(status_code=404, detail="Asset not found")

    removed: list[str] = []
    for key in storage.list_prefix(prefix):
        name = key.rsplit("/", 1)[-1]
        if _Path(name).stem == asset_id:
            storage.delete_object(key)
            removed.append(name)

    if not removed:
        raise HTTPException(status_code=404, detail="Asset not found")

    return {"status": "deleted", "id": asset_id, "removed": removed}


# ---------------------------------------------------------------------------
# Catch-all GET — registered LAST so literal routes like /materials win.
# ---------------------------------------------------------------------------

@router.get("/{asset_path:path}")
def get_asset(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    asset_path: str,
    current_user: Annotated[User | None, Depends(get_optional_user)],
    storage: Annotated[StorageBackend, Depends(get_storage)],
) -> StreamingResponse:
    """Get test asset bytes by filename (preserves legacy URL contract).

    We stream through the app rather than redirecting to a presigned URL —
    redirecting would require rewriting every `[[img:abc1234]]` token in
    question payloads to the presigned URL on every render. Streaming
    costs one extra hop but keeps URLs stable and authz centralized.

    DB scope is deliberately a SHORT `with SessionLocal()` block instead of
    `Depends(get_db)`. With the dependency, FastAPI keeps the session open
    until Starlette finishes iterating the StreamingResponse body — and
    streaming a multi-MB asset from R2 takes hundreds of ms while pinning
    one Postgres connection. On a test page with many `[[img:...]]` tokens
    the browser fires those GETs in parallel, and the pool (size 20 + 10
    overflow) is exhausted in seconds. Closing the session before the
    StreamingResponse fixes the leak.
    """
    with SessionLocal() as db:
        if not access_service.can_view_test(db, test_id, current_user):
            raise HTTPException(status_code=403, detail="Access denied")
    # ↑ connection released before the R2 round-trip + body stream.

    # The catch-all path is *just* the filename in the current contract
    # (no slashes in tokens). We refuse anything else to keep behaviour
    # explicit and traversal impossible.
    if "/" in asset_path or "\\" in asset_path or asset_path in ("", ".", ".."):
        raise HTTPException(status_code=400, detail="Invalid asset path")

    try:
        key = storage_keys.material_key(test_id, asset_path)
    except StorageKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        stream = storage.get_object_stream(key)
    except ObjectNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")

    return StreamingResponse(
        _iter_and_close(stream),
        media_type=_guess_content_type(asset_path),
    )


def _iter_and_close(stream, chunk_size: int = 64 * 1024):
    """Yield from a binary stream, guaranteeing close() on exhaustion.

    Starlette closes generator-based content reliably; raw file handles
    can linger on Windows (where the next `unlink` then fails with
    EBUSY). Wrapping the stream here gives us the close hook for free.
    """
    try:
        while True:
            chunk = stream.read(chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        try:
            stream.close()
        except Exception:  # noqa: BLE001
            pass
