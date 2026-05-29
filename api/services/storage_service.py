"""Storage backend Protocol — abstract object storage interface.

Two implementations:
  * `LocalStorageBackend`  — files under `data/storage/<bucket>/<key>` (dev/tests).
  * `S3StorageBackend`     — MinIO/S3 via `minio-py` (production; added in Phase 3).

Consumers receive a `StorageBackend` instance through dependency injection
(`api.dependencies.storage.get_storage`). They MUST build keys via
`api.services.storage_keys` and MUST NOT concatenate paths manually.

Design notes
------------
* All methods are synchronous. FastAPI handlers run them in the threadpool
  via the default `Depends`, and `minio-py` itself is sync.
* `presigned_get` / `presigned_put` return a URL the browser can use directly
  for download/upload. In the S3 backend the URL points at the PUBLIC endpoint
  (`s3.domain.uz`), not the internal docker hostname.
* Failures raise `StorageError` (or subclasses). Backends do NOT swallow errors.
"""
from __future__ import annotations

from datetime import timedelta
from typing import BinaryIO, Protocol, runtime_checkable


class StorageError(Exception):
    """Base error for storage backend failures."""


class ObjectNotFoundError(StorageError):
    """Raised when an object does not exist for a read/delete operation."""


@runtime_checkable
class StorageBackend(Protocol):
    """Object storage interface — pluggable backend.

    Keys are logical: `"<bucket>/<path>"` where `<bucket>` is `"assets"` or
    `"avatars"` (see `api.services.storage_keys`). Backends translate logical
    buckets to physical ones.
    """

    def put_object(
        self,
        key: str,
        data: BinaryIO,
        *,
        content_type: str,
        length: int | None = None,
    ) -> None:
        """Upload `data` under `key`. Overwrites any existing object.

        `length` is required by some backends (S3 chunked uploads); pass `None`
        if you don't know it — backends may buffer or use multipart.
        """
        ...

    def get_object_stream(self, key: str) -> BinaryIO:
        """Open the object for reading. Caller is responsible for closing.

        Intended for server-side reads (e.g. import worker reading source.docx).
        DO NOT use this to proxy bytes to the browser — use `presigned_get`.
        """
        ...

    def get_object_bytes(self, key: str) -> bytes:
        """Read the entire object into memory. For small files only."""
        ...

    def delete_object(self, key: str) -> None:
        """Delete one object. Silent no-op if it doesn't exist."""
        ...

    def delete_prefix(self, prefix: str) -> int:
        """Delete every object whose key starts with `prefix`. Returns count."""
        ...

    def object_exists(self, key: str) -> bool:
        """Return True if an object with `key` exists."""
        ...

    def list_prefix(self, prefix: str) -> list[str]:
        """List object keys under `prefix` (non-recursive caveats vary)."""
        ...

    def presigned_get(
        self,
        key: str,
        *,
        expires: timedelta = timedelta(hours=1),
    ) -> str:
        """Return a URL the browser can use to GET this object directly."""
        ...

    def presigned_put(
        self,
        key: str,
        *,
        expires: timedelta = timedelta(minutes=15),
        content_type: str | None = None,
    ) -> str:
        """Return a URL the browser can use to PUT this object directly."""
        ...
