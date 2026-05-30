"""S3-compatible storage backend (MinIO via `minio-py`).

Implements the `StorageBackend` Protocol. The crucial detail is the split
between INTERNAL and PUBLIC endpoints:

  * Internal (`endpoint`) — what the app uses for put/get/list/delete.
    Inside a docker network this is `minio:9000` over plain HTTP. No
    TLS overhead, no cert provisioning, no DNS lookups.

  * Public (`public_endpoint`) — what the browser sees in presigned URLs.
    Behind Caddy this is `https://s3.<DOMAIN>` over HTTPS. The presigned
    URL is *signed* against this endpoint so the browser can hit it
    directly without going through FastAPI.

If `public_endpoint` is omitted, presigned URLs use the internal endpoint,
which is fine in single-host dev (`http://localhost:9000`).

Logical buckets `assets`/`avatars` (from `storage_keys`) are mapped to real
bucket names via constructor args. This keeps the per-deployment bucket
naming separate from the code.
"""
from __future__ import annotations

import io
import logging
from datetime import timedelta
from typing import BinaryIO
from urllib.parse import urlparse

import urllib3
from minio import Minio
from minio.error import S3Error
from urllib3.util.retry import Retry

from api.services.storage_keys import split_logical_key
from api.services.storage_service import ObjectNotFoundError, StorageError

log = logging.getLogger(__name__)


# Shared HTTP pool config for the underlying minio-py client.
#
# Why we build our own urllib3.PoolManager instead of letting minio-py
# create its default one:
#
#   1. Retry on transient failures. R2 occasionally returns 429 (SlowDown),
#      503, or 5xx during edge restarts. minio-py's defaults don't retry
#      429 on PUT, so a single Cloudflare hiccup mid-import would surface
#      to the user as a 500. With exponential backoff (0.5s, 1s, 2s, 4s,
#      8s ≈ 15s total worst case) we ride out edge-level transients
#      transparently.
#
#   2. Wider connection pool. minio-py's default is maxsize=10 per host.
#      With the new ThreadPoolExecutor(8) in import_service.mirror plus
#      concurrent asset GETs from page loads, 10 sockets becomes the
#      bottleneck — extra threads wait on the urllib3 lock, not on R2.
#      32 leaves comfortable headroom for both flows.
#
# Methods covered: every S3 verb we issue. urllib3's default `allowed_methods`
# excludes POST and PUT, which are exactly the ones we need.
_R2_RETRY = Retry(
    total=5,
    connect=3,
    read=3,
    status=5,
    backoff_factor=0.5,
    status_forcelist=(408, 429, 500, 502, 503, 504),
    allowed_methods=frozenset(("GET", "HEAD", "PUT", "POST", "DELETE")),
    raise_on_status=False,  # let minio-py classify the final response
    respect_retry_after_header=True,
)
_R2_POOL_MAXSIZE = 32


def _make_http_client(secure: bool) -> urllib3.PoolManager:
    """Build the urllib3 PoolManager that minio-py will use for all I/O."""
    # `cert_reqs` follows the secure flag: HTTPS → verify the chain;
    # HTTP (internal MinIO) → no TLS at all, so cert config is irrelevant.
    return urllib3.PoolManager(
        timeout=urllib3.Timeout(connect=10, read=60),
        maxsize=_R2_POOL_MAXSIZE,
        retries=_R2_RETRY,
        cert_reqs="CERT_REQUIRED" if secure else "CERT_NONE",
    )


class S3StorageBackend:
    """MinIO/S3 implementation of `StorageBackend`."""

    def __init__(
        self,
        *,
        endpoint: str,
        public_endpoint: str | None,
        access_key: str,
        secret_key: str,
        region: str,
        bucket_assets: str,
        bucket_avatars: str,
        secure: bool,
    ) -> None:
        if not endpoint:
            raise StorageError("S3StorageBackend requires non-empty endpoint")
        if not access_key or not secret_key:
            raise StorageError("S3StorageBackend requires access_key and secret_key")

        internal_host, internal_secure = _split_endpoint(endpoint, fallback_secure=secure)
        self._client = Minio(
            internal_host,
            access_key=access_key,
            secret_key=secret_key,
            region=region,
            secure=internal_secure,
            http_client=_make_http_client(internal_secure),
        )

        # Separate client for presigned URLs — its `endpoint` is what gets
        # baked into the signed URL the browser fetches. The presigning
        # client never makes outbound requests itself, so it gets its own
        # minimal http_client (still configured with retries for symmetry).
        if public_endpoint and public_endpoint != endpoint:
            public_host, public_secure = _split_endpoint(
                public_endpoint, fallback_secure=True,
            )
            self._public_client: Minio = Minio(
                public_host,
                access_key=access_key,
                secret_key=secret_key,
                region=region,
                secure=public_secure,
                http_client=_make_http_client(public_secure),
            )
        else:
            # Same as internal — fine for single-host dev.
            self._public_client = self._client

        self._buckets = {
            "assets": bucket_assets,
            "avatars": bucket_avatars,
        }

    # ----- key resolution -------------------------------------------------

    def _resolve(self, key: str) -> tuple[str, str]:
        """Logical key (`assets/path/...`) → (real bucket, object name)."""
        logical_bucket, obj = split_logical_key(key)
        return self._buckets[logical_bucket], obj

    # ----- StorageBackend Protocol ---------------------------------------

    def put_object(
        self,
        key: str,
        data: BinaryIO,
        *,
        content_type: str,
        length: int | None = None,
    ) -> None:
        bucket, obj = self._resolve(key)
        # `length=-1` + sensible `part_size` lets minio-py chunked-upload
        # unknown-size streams. For known size we pass it through.
        if length is None:
            try:
                self._client.put_object(
                    bucket, obj, data,
                    length=-1,
                    part_size=10 * 1024 * 1024,
                    content_type=content_type,
                )
            except S3Error as exc:
                raise StorageError(f"put_object failed for {key}: {exc}") from exc
        else:
            try:
                self._client.put_object(
                    bucket, obj, data,
                    length=length,
                    content_type=content_type,
                )
            except S3Error as exc:
                raise StorageError(f"put_object failed for {key}: {exc}") from exc

    def get_object_stream(self, key: str) -> BinaryIO:
        bucket, obj = self._resolve(key)
        try:
            response = self._client.get_object(bucket, obj)
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchObject"}:
                raise ObjectNotFoundError(key) from exc
            raise StorageError(f"get_object failed for {key}: {exc}") from exc
        # `response` is an urllib3 HTTPResponse — file-like (read/close/iter).
        # Caller is expected to close it (the dev_storage and assets routes
        # both wrap streams in `_iter_and_close`).
        return _MinioStreamAdapter(response)

    def get_object_bytes(self, key: str) -> bytes:
        stream = self.get_object_stream(key)
        try:
            return stream.read()
        finally:
            try:
                stream.close()
            except Exception:  # noqa: BLE001
                pass

    def delete_object(self, key: str) -> None:
        bucket, obj = self._resolve(key)
        try:
            self._client.remove_object(bucket, obj)
        except S3Error as exc:
            # MinIO returns success even for missing objects, but treat
            # NoSuchKey defensively.
            if exc.code in {"NoSuchKey", "NoSuchObject"}:
                return
            raise StorageError(f"delete_object failed for {key}: {exc}") from exc

    def delete_prefix(self, prefix: str) -> int:
        from minio.deleteobjects import DeleteObject

        bucket, obj_prefix = self._resolve(prefix.rstrip("/"))
        # minio-py expects no trailing slash to list "under" the prefix.
        objects = self._client.list_objects(
            bucket, prefix=obj_prefix + "/", recursive=True,
        )
        names = [DeleteObject(o.object_name) for o in objects if o.object_name]
        if not names:
            return 0
        errors = list(self._client.remove_objects(bucket, names))
        if errors:
            for err in errors:
                log.warning("delete_prefix %s: %s", prefix, err)
        return len(names) - len(errors)

    def object_exists(self, key: str) -> bool:
        bucket, obj = self._resolve(key)
        try:
            self._client.stat_object(bucket, obj)
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchObject"}:
                return False
            raise StorageError(f"object_exists failed for {key}: {exc}") from exc
        return True

    def list_prefix(self, prefix: str) -> list[str]:
        bucket, obj_prefix = self._resolve(prefix.rstrip("/"))
        logical_bucket = next(
            name for name, real in self._buckets.items() if real == bucket
        )
        out: list[str] = []
        for o in self._client.list_objects(
            bucket, prefix=obj_prefix + "/", recursive=True,
        ):
            if o.object_name:
                out.append(f"{logical_bucket}/{o.object_name}")
        return out

    def presigned_get(
        self,
        key: str,
        *,
        expires: timedelta = timedelta(hours=1),
    ) -> str:
        bucket, obj = self._resolve(key)
        try:
            return self._public_client.presigned_get_object(bucket, obj, expires=expires)
        except S3Error as exc:
            raise StorageError(f"presigned_get failed for {key}: {exc}") from exc

    def presigned_put(
        self,
        key: str,
        *,
        expires: timedelta = timedelta(minutes=15),
        content_type: str | None = None,
    ) -> str:
        bucket, obj = self._resolve(key)
        # minio-py's presigned_put_object doesn't take content_type at sign
        # time (content type is enforced by the *client* when uploading).
        # We accept the arg in the protocol for parity with S3 SDKs that do.
        try:
            return self._public_client.presigned_put_object(bucket, obj, expires=expires)
        except S3Error as exc:
            raise StorageError(f"presigned_put failed for {key}: {exc}") from exc


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _split_endpoint(value: str, *, fallback_secure: bool) -> tuple[str, bool]:
    """Parse `http(s)://host:port` or `host:port` into (host:port, secure).

    minio-py's `endpoint` is the bare `host[:port]` form; the TLS flag is
    a separate `secure=` kwarg. Accepting URL-shaped values here lets the
    config use the natural `S3_ENDPOINT=http://minio:9000` form.
    """
    if "://" in value:
        parsed = urlparse(value)
        if parsed.scheme not in ("http", "https"):
            raise StorageError(f"unsupported S3 endpoint scheme {parsed.scheme!r}")
        host = parsed.netloc
        if not host:
            raise StorageError(f"S3 endpoint missing host: {value!r}")
        return host, parsed.scheme == "https"
    return value, fallback_secure


class _MinioStreamAdapter:
    """Thin adapter so an urllib3 HTTPResponse looks more file-like.

    urllib3's `release_conn()` returns the connection to the pool, which
    is what we actually want on close (rather than killing the socket).
    """

    def __init__(self, response) -> None:
        self._response = response

    def read(self, size: int = -1) -> bytes:
        if size is None or size < 0:
            return self._response.read()
        return self._response.read(size)

    def close(self) -> None:
        try:
            self._response.close()
        finally:
            try:
                self._response.release_conn()
            except Exception:  # noqa: BLE001
                pass

    # Context manager so callers can use `with storage.get_object_stream(...) as s:`
    # uniformly across LocalStorageBackend (file objects) and S3StorageBackend.
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()
