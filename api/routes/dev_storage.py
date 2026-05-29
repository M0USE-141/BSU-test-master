"""Dev-only presigned-URL emulator for `LocalStorageBackend`.

`LocalStorageBackend.presigned_get/put` returns URLs like:
    /api/dev-storage/<bucket>/<key...>?expires=<ts>&sig=<hmac>

This router validates the HMAC + expiry against the same secret the backend
uses, then either streams the file (GET) or writes the request body (PUT).
This makes the LocalStorageBackend behave like a real S3 endpoint from the
browser's perspective so the same frontend code paths work in dev and prod.

NOT mounted when `STORAGE_BACKEND=s3` — the real S3 endpoint serves those
URLs directly. We still mount it unconditionally because turning it off
when unused costs nothing, and tests/dev scripts may want it.
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from api.dependencies.storage import get_storage
from api.services.storage_local import LocalStorageBackend
from api.services.storage_service import ObjectNotFoundError, StorageBackend

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dev-storage", tags=["dev-storage"])


def _require_local(storage: StorageBackend) -> LocalStorageBackend:
    if not isinstance(storage, LocalStorageBackend):
        # When running against S3 these URLs aren't generated, so an inbound
        # request hitting this route would be a misconfiguration or stale URL.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="dev-storage route is only active for LocalStorageBackend",
        )
    return storage


def _check_signature(
    storage: LocalStorageBackend,
    key: str,
    method: str,
    expires: int | None,
    sig: str | None,
) -> None:
    if expires is None or sig is None:
        raise HTTPException(status_code=400, detail="missing presigned parameters")
    if not storage.verify_signature(key, method, expires, sig):
        raise HTTPException(status_code=403, detail="invalid or expired signature")


@router.get("/{key:path}")
def dev_get(
    key: str,
    request: Request,
    storage: Annotated[StorageBackend, Depends(get_storage)],
):
    local = _require_local(storage)
    expires = _int_or_none(request.query_params.get("expires"))
    sig = request.query_params.get("sig")
    _check_signature(local, key, "GET", expires, sig)

    try:
        stream = local.get_object_stream(key)
    except ObjectNotFoundError:
        raise HTTPException(status_code=404, detail="object not found")

    # Streaming so we don't load large assets into memory.
    return StreamingResponse(stream, media_type="application/octet-stream")


@router.put("/{key:path}")
async def dev_put(
    key: str,
    request: Request,
    storage: Annotated[StorageBackend, Depends(get_storage)],
):
    local = _require_local(storage)
    expires = _int_or_none(request.query_params.get("expires"))
    sig = request.query_params.get("sig")
    _check_signature(local, key, "PUT", expires, sig)

    body = await request.body()
    content_type = request.headers.get("content-type", "application/octet-stream")
    import io
    local.put_object(key, io.BytesIO(body), content_type=content_type, length=len(body))
    return {"ok": True, "size": len(body)}


def _int_or_none(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None
