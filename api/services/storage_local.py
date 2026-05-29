"""Local filesystem storage backend — dev and unit-test default.

Files are stored under `<root>/<bucket>/<key>`. `presigned_get`/`presigned_put`
return URLs to the in-process dev endpoint (`/api/dev-storage/...?sig=<hmac>`)
which validates the signature and serves/accepts the file. This mimics
S3 presigned URLs closely enough for the frontend to work identically against
either backend.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import shutil
import time
from datetime import timedelta
from pathlib import Path
from typing import BinaryIO
from urllib.parse import quote, urlencode

from api.services.storage_service import ObjectNotFoundError, StorageError

log = logging.getLogger(__name__)


class LocalStorageBackend:
    """FS-backed implementation of `StorageBackend`.

    Args:
        root: directory under which `<bucket>/<key>` trees live.
        signing_secret: HMAC key used to sign presigned URLs. MUST be unique
            per deployment (defaults derived from SECRET_KEY).
        public_base_url: prefix prepended to presigned URLs, e.g.
            "http://localhost:8000". Defaults to a relative URL.
    """

    def __init__(
        self,
        root: Path,
        *,
        signing_secret: str,
        public_base_url: str = "",
    ) -> None:
        self._root = Path(root).resolve()
        self._root.mkdir(parents=True, exist_ok=True)
        self._secret = signing_secret.encode("utf-8")
        self._public_base_url = public_base_url.rstrip("/")

    # ----- internal helpers ------------------------------------------------

    def _resolve(self, key: str) -> Path:
        """Map a logical key to an absolute path, with path-traversal guard."""
        if not key or key.startswith("/") or ".." in key.split("/"):
            raise StorageError(f"refusing to resolve unsafe key {key!r}")
        path = (self._root / key).resolve()
        if not str(path).startswith(str(self._root)):
            raise StorageError(f"key {key!r} escapes storage root")
        return path

    def _sign(self, key: str, method: str, expires_at: int) -> str:
        msg = f"{method}\n{key}\n{expires_at}".encode("utf-8")
        return hmac.new(self._secret, msg, hashlib.sha256).hexdigest()

    def verify_signature(self, key: str, method: str, expires_at: int, sig: str) -> bool:
        """Check a presigned URL's HMAC and expiry. Used by `dev_storage` route."""
        if expires_at < int(time.time()):
            return False
        expected = self._sign(key, method, expires_at)
        return hmac.compare_digest(expected, sig)

    # ----- StorageBackend protocol ----------------------------------------

    def put_object(
        self,
        key: str,
        data: BinaryIO,
        *,
        content_type: str,
        length: int | None = None,
    ) -> None:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        try:
            with tmp.open("wb") as fh:
                shutil.copyfileobj(data, fh)
            tmp.replace(path)
        except Exception:
            if tmp.exists():
                tmp.unlink(missing_ok=True)
            raise

    def get_object_stream(self, key: str) -> BinaryIO:
        path = self._resolve(key)
        if not path.is_file():
            raise ObjectNotFoundError(key)
        return path.open("rb")

    def get_object_bytes(self, key: str) -> bytes:
        path = self._resolve(key)
        if not path.is_file():
            raise ObjectNotFoundError(key)
        return path.read_bytes()

    def delete_object(self, key: str) -> None:
        path = self._resolve(key)
        if path.is_file():
            path.unlink()

    def delete_prefix(self, prefix: str) -> int:
        """Delete every file under prefix. Removes empty directories."""
        # Allow prefix with or without trailing slash.
        path = self._resolve(prefix.rstrip("/"))
        if not path.exists():
            return 0
        if path.is_file():
            path.unlink()
            return 1
        count = 0
        for child in path.rglob("*"):
            if child.is_file():
                child.unlink()
                count += 1
        # Best-effort dir cleanup; ignore not-empty races.
        try:
            shutil.rmtree(path)
        except OSError:
            pass
        return count

    def object_exists(self, key: str) -> bool:
        try:
            return self._resolve(key).is_file()
        except StorageError:
            return False

    def list_prefix(self, prefix: str) -> list[str]:
        path = self._resolve(prefix.rstrip("/"))
        if not path.is_dir():
            return []
        result: list[str] = []
        for child in path.rglob("*"):
            if child.is_file():
                # Re-derive logical key relative to root.
                result.append(str(child.relative_to(self._root)).replace("\\", "/"))
        return result

    def presigned_get(
        self,
        key: str,
        *,
        expires: timedelta = timedelta(hours=1),
    ) -> str:
        return self._build_signed_url(key, method="GET", expires=expires)

    def presigned_put(
        self,
        key: str,
        *,
        expires: timedelta = timedelta(minutes=15),
        content_type: str | None = None,
    ) -> str:
        # content_type is informational for the local backend; the dev route
        # writes whatever bytes the client uploads.
        return self._build_signed_url(key, method="PUT", expires=expires)

    def _build_signed_url(self, key: str, *, method: str, expires: timedelta) -> str:
        expires_at = int(time.time() + expires.total_seconds())
        sig = self._sign(key, method, expires_at)
        query = urlencode({"expires": expires_at, "sig": sig})
        # We URL-quote the key so it can safely contain `/`-separated segments
        # without the routing layer mis-parsing them.
        encoded_key = quote(key, safe="/")
        return f"{self._public_base_url}/api/dev-storage/{encoded_key}?{query}"
