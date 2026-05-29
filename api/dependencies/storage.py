"""Storage backend dependency-injection helpers.

Use `Depends(get_storage)` in FastAPI handlers; reuse `get_storage_backend()`
in non-request contexts (CLI scripts, background workers).
"""
from __future__ import annotations

import logging
from functools import lru_cache

from api import config
from api.services.storage_local import LocalStorageBackend
from api.services.storage_service import StorageBackend

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_storage_backend() -> StorageBackend:
    """Return the configured storage backend (cached singleton).

    Selection is driven by `STORAGE_BACKEND` env var:
      * "local" (default) — `LocalStorageBackend` rooted at `data/storage/`.
      * "s3"              — `S3StorageBackend` (added in Phase 3).
    """
    backend_name = (config.STORAGE_BACKEND or "local").lower()
    if backend_name == "s3":
        # Imported lazily so `minio-py` is optional for dev installs.
        try:
            from api.services.storage_s3 import S3StorageBackend  # type: ignore[import-not-found]
        except ImportError as exc:
            raise RuntimeError(
                "STORAGE_BACKEND=s3 but storage_s3 backend is not yet available; "
                "install minio (`pip install minio`) and ensure Phase 3 is merged."
            ) from exc
        log.info("Initializing S3 storage backend")
        return S3StorageBackend(
            endpoint=config.S3_ENDPOINT,
            public_endpoint=config.S3_PUBLIC_ENDPOINT,
            access_key=config.S3_ACCESS_KEY,
            secret_key=config.S3_SECRET_KEY,
            region=config.S3_REGION,
            bucket_assets=config.S3_BUCKET_ASSETS,
            bucket_avatars=config.S3_BUCKET_AVATARS,
            secure=config.S3_SECURE,
        )

    log.info("Initializing local storage backend at %s", config.LOCAL_STORAGE_DIR)
    return LocalStorageBackend(
        root=config.LOCAL_STORAGE_DIR,
        signing_secret=config.SECRET_KEY,
        public_base_url=config.LOCAL_STORAGE_PUBLIC_BASE_URL,
    )


def get_storage() -> StorageBackend:
    """FastAPI `Depends(...)` entry point. Thin wrapper around the singleton."""
    return get_storage_backend()
