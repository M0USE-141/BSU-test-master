"""Async docx import — moves the heavy lifting out of the HTTP handler.

`POST /api/tests/upload` returns `202 + {job_id}` immediately. The actual
work (extracting the docx, converting WMF/EMF, mirroring assets to
storage, writing question rows) runs in `BackgroundTasks` via
`run_import`. Clients poll `GET /api/import-jobs/{id}` until status is
`done` or `failed`.

Recovery: on app startup `recover_stale_jobs()` flips any job stuck in
`processing` for more than `STALE_MINUTES` to `failed("interrupted")`.
The previous process may have died mid-extract; we don't try to resume.
"""
from __future__ import annotations

import io
import logging
import shutil
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from api.database import SessionLocal
from api.dependencies.storage import get_storage_backend
from api.models.db.import_job import ImportJob, ImportJobStatus
from api.models.db.test_collection import AccessLevel
from api.services import access_service, questions_service, storage_keys
from api.services.storage_keys import StorageKeyError
from api.services.storage_service import StorageBackend
from core.serialization import serialize_test_payload
from core.word_extract import WordTestExtractor

log = logging.getLogger(__name__)


# Jobs that have been "processing" for longer than this on startup are
# assumed to be victims of a crashed worker and get failed. 10 min is a
# loose upper bound for the slowest legitimate extraction we've seen.
STALE_MINUTES = 10


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_import(
    db: DbSession,
    storage: StorageBackend,
    user_id: int,
    source_filename: str,
    docx_bytes: bytes,
) -> str:
    """Create the job record + park the docx in storage. Returns job_id.

    The DB write (job row) is committed FIRST, and we release the
    session's connection BEFORE the (potentially multi-second) R2 PUT
    of the source docx. A typical .docx is 5–30 MB; with the pool fixed
    at size 20+10 and many concurrent uploads, holding the connection
    through that network write was a real source of pool pressure.

    Caller must not reuse `db` after this returns — it has been closed.
    """
    job_id = uuid.uuid4().hex
    job = ImportJob(
        id=job_id,
        user_id=user_id,
        status=ImportJobStatus.PENDING.value,
        source_filename=source_filename[:255] or "upload.docx",
    )
    db.add(job)
    db.commit()
    # Detach + release the connection before any network I/O below.
    # SQLAlchemy's session.close() returns the underlying connection to
    # the pool; calling close() twice is a no-op so the upload_test
    # handler's defensive `db.close()` afterwards is safe.
    db.close()

    try:
        key = storage_keys.import_source_key(_hyphenate(job_id))
    except StorageKeyError as exc:
        # Should never happen — job_id is a fresh UUID — but if it does,
        # mark the job failed via a fresh session (db is already closed).
        _set_status(None, job_id, ImportJobStatus.FAILED, error=str(exc))
        raise
    storage.put_object(
        key,
        io.BytesIO(docx_bytes),
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        length=len(docx_bytes),
    )
    return job_id


def run_import(
    job_id: str,
    *,
    symbol: str = "*",
    log_small_tables: bool = False,
    access_level: str = "private",
    title_override: str | None = None,
    description_override: str | None = None,
) -> None:
    """Background worker entry point. Owns its own DB session.

    Idempotent enough to survive double-dispatch: a job already in `done`
    or `failed` is left alone.
    """
    storage = get_storage_backend()
    with SessionLocal() as db:
        job = db.get(ImportJob, job_id)
        if job is None:
            log.warning("run_import: job %s not found", job_id)
            return
        if job.status in {ImportJobStatus.DONE.value, ImportJobStatus.FAILED.value}:
            log.info("run_import: job %s already %s, skipping", job_id, job.status)
            return
        job.status = ImportJobStatus.PROCESSING.value
        db.commit()

    workdir = Path(tempfile.mkdtemp(prefix=f"docx_import_{job_id}_"))
    assets_directory = workdir / "assets"
    assets_directory.mkdir(parents=True, exist_ok=True)
    docx_path = workdir / "source.docx"
    test_id = uuid.uuid4().hex

    try:
        # Pull the source docx back out of storage.
        src_key = storage_keys.import_source_key(_hyphenate(job_id))
        with storage.get_object_stream(src_key) as src_stream:
            docx_path.write_bytes(src_stream.read())

        extractor = WordTestExtractor(
            docx_path, symbol, log_small_tables, assets_directory,
        )
        try:
            tests = extractor.extract()
            test_payload = serialize_test_payload(
                test_id, docx_path.stem, tests, assets_directory,
            )
            # Mirror assets to storage BEFORE extractor.cleanup() wipes
            # the temp dir. The payload references filenames extractor
            # produced; without this mirror, `GET /assets/<name>`
            # returns 404 even though the question payload has the
            # right `<img src="...">`.
            _mirror_assets_to_storage(test_id, assets_directory, storage)
        finally:
            extractor.cleanup()

        with SessionLocal() as db:
            try:
                parsed_access_level = AccessLevel(access_level)
            except ValueError:
                parsed_access_level = AccessLevel.PRIVATE

            job = db.get(ImportJob, job_id)
            if job is None:
                log.warning("run_import: job %s vanished mid-run", job_id)
                return

            access_service.get_or_create_collection(
                db, test_id, job.user_id, parsed_access_level,
            )
            # Title priority: explicit override > original filename (without
            # .docx) > extractor's guess (which is "source" because we save
            # the docx under a fixed local name).
            inferred_title = (
                title_override
                or (Path(job.source_filename).stem if job.source_filename else None)
                or test_payload.get("title")
            )
            questions_service.save_test_settings(
                db, test_id,
                title=inferred_title,
                description=description_override or test_payload.get("description"),
            )
            questions_service.replace_all(
                db, test_id, list(test_payload.get("questions", [])),
            )

            collection = access_service.get_test_collection(db, test_id)
            job = db.get(ImportJob, job_id)
            job.status = ImportJobStatus.DONE.value
            job.test_collection_id = collection.id if collection else None
            db.commit()
            log.info("import %s completed for test %s", job_id, test_id)
    except Exception as exc:  # noqa: BLE001 — best-effort import; surface to user via job
        log.exception("import %s failed: %s", job_id, exc)
        # `db=None` so _set_status opens, commits, AND closes its own
        # session. Passing `SessionLocal()` here used to leak (see the
        # history note in _set_status).
        _set_status(
            None,
            job_id,
            ImportJobStatus.FAILED,
            error=f"{type(exc).__name__}: {exc}",
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def get_job(db: DbSession, job_id: str) -> ImportJob | None:
    return db.get(ImportJob, job_id)


def list_user_jobs(
    db: DbSession,
    user_id: int,
    *,
    status: str | None = None,
    limit: int = 50,
) -> list[ImportJob]:
    stmt = select(ImportJob).where(ImportJob.user_id == user_id)
    if status:
        stmt = stmt.where(ImportJob.status == status)
    stmt = stmt.order_by(ImportJob.created_at.desc()).limit(limit)
    return list(db.execute(stmt).scalars().all())


def recover_stale_jobs(stale_minutes: int = STALE_MINUTES) -> int:
    """Flip stuck `processing` jobs to `failed`. Called once on startup."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=stale_minutes)
    with SessionLocal() as db:
        stmt = (
            select(ImportJob)
            .where(
                ImportJob.status == ImportJobStatus.PROCESSING.value,
                ImportJob.updated_at < cutoff,
            )
        )
        stale = list(db.execute(stmt).scalars().all())
        for job in stale:
            job.status = ImportJobStatus.FAILED.value
            job.error_message = "interrupted: worker exited mid-processing"
        if stale:
            db.commit()
            log.info("recovered %s stale import jobs", len(stale))
        return len(stale)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _hyphenate(uuid_hex: str) -> str:
    """Convert a 32-char hex UUID to canonical 8-4-4-4-12 form.

    `storage_keys.import_source_key` validates against UUID format, which
    expects hyphenated form. Job ids are stored as `uuid.uuid4().hex` (no
    hyphens) for compactness in URLs.
    """
    return str(uuid.UUID(uuid_hex))


# Concurrency for the asset mirror. Each file is one PUT to R2/MinIO. 8
# wide is comfortably below R2's per-bucket rate (thousands ops/sec) and
# leaves headroom for normal traffic on the shared urllib3 pool. The
# minio-py HTTP pool defaults to maxsize=10 — keeping mirror at 8 avoids
# starving other concurrent S3 work in the same process.
_MIRROR_MAX_WORKERS = 8


def _mirror_assets_to_storage(
    test_id: str,
    assets_directory: Path,
    storage: StorageBackend,
) -> None:
    """Push extracted assets into the materials/ prefix of the new test.

    Concurrency: a ThreadPoolExecutor fans out PUTs across `_MIRROR_MAX_WORKERS`
    threads. On a typical docx with ~25 materials this cuts mirror wall-clock
    from ~5s (sequential) to ~0.5s.

    No HEAD-before-PUT: the object key is `<sha1-prefix><ext>` derived from
    the content. Re-uploading the same bytes to the same key is idempotent
    on every S3-compatible backend we support (MinIO, Cloudflare R2), so
    the previous `if storage.object_exists(key): continue` was a wasted
    round-trip — 26 HEAD 404s per fresh import showed up as red lines in
    the platform log.

    Errors: any failing PUT raises; we collect through `as_completed` so
    the caller sees the first error and aborts the import. Partial state
    in R2 from earlier successful PUTs is acceptable — the test row never
    gets written, so those orphans are just bytes (cleanable by lifecycle
    rule or a future sweeper).
    """
    if not assets_directory.exists():
        log.warning("mirror: assets_directory %s does not exist for test %s",
                    assets_directory, test_id)
        return
    files = [src for src in assets_directory.iterdir() if src.is_file()]
    if not files:
        log.warning("mirror: no files in %s for test %s — nothing to upload",
                    assets_directory, test_id)
        return
    log.info("mirror: uploading %d asset(s) for test %s", len(files), test_id)

    successes: list[str] = []
    failures: list[tuple[str, str]] = []

    def _upload_one(src: Path) -> tuple[str, str | None]:
        """Return (filename, key) on success, (filename, None) on skip-on-invalid-key.
        Raises on actual upload errors so `as_completed` surfaces them.
        """
        try:
            key = storage_keys.material_key(test_id, src.name)
        except StorageKeyError as exc:
            log.warning("mirror skip %s: invalid key — %s", src.name, exc)
            return src.name, None
        size = src.stat().st_size
        # Open per-task: file handles aren't thread-safe. Streaming via the
        # open file (not pre-reading into memory) keeps memory flat even
        # for large WMF/PNG outputs.
        with src.open("rb") as fh:
            storage.put_object(
                key, fh,
                content_type="application/octet-stream",
                length=size,
            )
        return src.name, key

    # `ThreadPoolExecutor` over network-bound work — the GIL doesn't hurt
    # because each thread spends its time in C/socket code waiting on R2.
    workers = min(_MIRROR_MAX_WORKERS, len(files))
    first_exc: BaseException | None = None
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="mirror") as pool:
        futures = {pool.submit(_upload_one, src): src for src in files}
        for fut in as_completed(futures):
            src = futures[fut]
            try:
                name, key = fut.result()
                if key is not None:
                    successes.append(name)
            except Exception as exc:  # noqa: BLE001 — collect, surface once
                failures.append((src.name, f"{type(exc).__name__}: {exc}"))
                log.error("mirror PUT failed for %s (test %s): %s",
                          src.name, test_id, exc)
                if first_exc is None:
                    first_exc = exc
    log.info("mirror complete for test %s: %d uploaded, %d failed",
             test_id, len(successes), len(failures))
    if first_exc is not None:
        # Re-raise the first error AFTER all threads have drained — this
        # gives us a complete success/failure picture in the logs above
        # before the import is marked as failed by the caller.
        raise first_exc


def _set_status(
    db: DbSession | None,
    job_id: str,
    status: ImportJobStatus,
    *,
    error: str | None = None,
) -> None:
    """Update a job's status row.

    Pass `db=None` to make this function own the session (open + commit +
    close). Pass an existing `DbSession` to participate in the caller's
    session lifecycle — we will NOT close it.

    History: the previous version computed
        `own = not isinstance(db, DbSession) or db is None`
    which always evaluates to False when `db` is a real session (the
    typical case — even the error path in `run_import` was calling this
    with `SessionLocal()` directly). That meant every failed import
    leaked one Postgres connection forever; ~30 failed imports drained
    the SQLAlchemy pool, and the next `cleanup_service` tick hit a
    `QueuePool limit reached` TimeoutError. That cascade was the actual
    root cause behind the recurring `retry_failed_emails raised` errors
    in production logs after the bigger pool-tuning fix.
    """
    own = db is None
    session = db if db is not None else SessionLocal()
    try:
        job = session.get(ImportJob, job_id)
        if job is None:
            return
        job.status = status.value
        if error is not None:
            job.error_message = error[:2000]
        session.commit()
    finally:
        if own:
            session.close()


# ---------------------------------------------------------------------------
# Cleanup of finished imports
# ---------------------------------------------------------------------------

def cleanup_source_object(job_id: str) -> None:
    """Best-effort: drop the `imports/<id>/source.docx` from storage.

    The bucket lifecycle rule also deletes `imports/*` after 24h, so
    calling this is a convenience for tidy testing rather than a hard
    requirement.
    """
    storage = get_storage_backend()
    try:
        key = storage_keys.import_source_key(_hyphenate(job_id))
    except StorageKeyError:
        return
    try:
        storage.delete_object(key)
    except Exception as exc:  # noqa: BLE001
        log.warning("cleanup_source_object failed for %s: %s", job_id, exc)
