"""Storage backend dependency-injection helpers.

Use `Depends(get_storage)` in FastAPI handlers; reuse `get_storage_backend()`
in non-request contexts (CLI scripts, background workers).
"""
from __future__ import annotations

import logging
import threading

from api import config
from api.services.storage_local import LocalStorageBackend
from api.services.storage_service import StorageBackend

log = logging.getLogger(__name__)


# Double-checked-locking singleton instead of @lru_cache.
#
# Why not lru_cache: CPython's lru_cache lock protects the CACHE TABLE from
# corruption, but it does NOT serialize concurrent calls to the underlying
# user_function when the cache is cold. If N threads hit a cold cache at
# the same time, all N enter the user function and create separate
# objects; only the last writer's result becomes the cached one. Verified
# empirically — 40 parallel threads → 40 calls to the init body.
#
# In prod, this manifested as ~40 lines of "Initializing S3 storage
# backend" during startup, each creating its own urllib3.PoolManager
# (with our 32-connection ceiling). That fragmented the R2 connection
# budget across 40 pools instead of pooling cleanly, and made the
# subsequent "Connection pool is full" warnings noisier than needed.
#
# Double-checked locking gives true single-instance semantics: the fast
# path is a lock-free read of an already-set variable; the slow path
# (cold cache) is serialized by the lock.

_backend_instance: StorageBackend | None = None
_backend_lock = threading.Lock()


def get_storage_backend() -> StorageBackend:
    """Return the configured storage backend (process-wide singleton).

    Selection is driven by `STORAGE_BACKEND` env var:
      * "local" (default) — `LocalStorageBackend` rooted at `data/storage/`.
      * "s3"              — `S3StorageBackend`.
    """
    global _backend_instance
    # Fast path — already created. The vast majority of calls hit this.
    if _backend_instance is not None:
        return _backend_instance
    # Slow path — first call(s) race for the lock; only one wins.
    with _backend_lock:
        if _backend_instance is not None:
            return _backend_instance
        _backend_instance = _build_backend()
        return _backend_instance


def _build_backend() -> StorageBackend:
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
