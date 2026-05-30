"""Test management endpoints — DB-backed (Phase 4 cutover).

Payload now lives in `test_collections` (metadata) + `questions` (rows).
The docx upload flow extracts to a temporary directory, mirrors extracted
assets into storage, and writes question rows in one shot via
`questions_service.replace_all`. Phase 5 will convert the upload to
202-Accepted + BackgroundTasks; for now it stays synchronous.
"""
from __future__ import annotations

import logging
import uuid
from pathlib import Path as FilePath
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Path, Query, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession, joinedload

from api.config import MAX_DOCX_UPLOAD_BYTES, MAX_TESTS_PER_USER
from api.database import SessionLocal, get_db
from api.dependencies.auth import get_current_user, get_optional_user
from api.dependencies.storage import get_storage, get_storage_backend
from api.models import TestCreate, TestUpdate
from api.models.db.attempt import Attempt, AttemptStatus
from api.models.db.question import Question
from api.models.db.test_collection import AccessLevel, TestCollection
from api.models.db.user import User
from api.services import access_service, import_service, questions_service
from api.services import storage_keys
from api.services.storage_keys import StorageKeyError
from api.services.storage_service import StorageBackend
from api.utils.validation import TEST_ID_PATTERN

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tests", tags=["tests"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _metadata_for(tc: TestCollection, question_count: int) -> dict[str, object]:
    """Build a serialize_metadata-shaped dict directly from the DB row."""
    return {
        "id": tc.test_id,
        "title": tc.title or "",
        "description": tc.description or "",
        "questionCount": question_count,
    }


def _enforce_test_quota(db: DbSession, user: User) -> None:
    """Raise 409 if the user has hit the per-owner test cap."""
    used = access_service.count_user_tests(db, user.id)
    if used >= MAX_TESTS_PER_USER:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "test_limit_reached",
                "message": (
                    f"You've reached the {MAX_TESTS_PER_USER}-test limit. "
                    "Delete an existing test before creating a new one."
                ),
                "limit": MAX_TESTS_PER_USER,
                "used": used,
            },
        )


def _drop_storage_prefix(test_id: str) -> None:
    """Best-effort cleanup of a test's storage objects."""
    try:
        storage = get_storage_backend()
        storage.delete_prefix(storage_keys.test_prefix(test_id))
    except (StorageKeyError, Exception) as exc:  # noqa: BLE001
        log.warning("storage cleanup failed for test %s: %s", test_id, exc)


def _augment_with_ownership(
    payload: dict[str, object],
    tc: TestCollection | None,
    current_user: User | None,
) -> dict[str, object]:
    """Inject ownership fields into a test payload (same as legacy behavior)."""
    if tc is not None:
        payload["is_owner"] = bool(
            current_user is not None and tc.owner_id == current_user.id
        )
        payload["owner_id"] = tc.owner_id
        payload["owner_username"] = tc.owner.username if tc.owner else None
        payload["access_level"] = tc.access_level
    else:
        payload["is_owner"] = False
        payload["owner_id"] = None
        payload["owner_username"] = None
        payload["access_level"] = "public"
    return payload


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
def list_tests(
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[DbSession, Depends(get_db)],
    filter_type: str | None = Query(None, alias="filter"),
    limit: int | None = Query(None, ge=1, le=100),
    offset: int = Query(0, ge=0),
    with_stats: bool = Query(False, alias="with_stats"),
    sort: str | None = Query(None, pattern="^(new|popular|best)$"),
) -> dict[str, object]:
    """List tests accessible to the current user (DB-backed)."""
    # Pull every collection + owner in one query (no N+1).
    stmt = select(TestCollection).options(joinedload(TestCollection.owner))
    collections: list[TestCollection] = list(
        db.execute(stmt).scalars().unique().all()
    )
    if not collections:
        return {"tests": [], "total": 0, "offset": offset, "limit": limit}

    # Per-test question counts in one grouped query.
    counts = dict(
        db.execute(
            select(Question.test_collection_id, func.count(Question.id))
            .where(
                Question.test_collection_id.in_([c.id for c in collections])
            )
            .group_by(Question.test_collection_id)
        ).all()
    )

    accessible_ids = set(access_service.get_accessible_test_ids(db, current_user))

    tests: list[dict[str, object]] = []
    for tc in collections:
        if tc.test_id not in accessible_ids:
            continue
        is_owner = current_user is not None and tc.owner_id == current_user.id
        if filter_type == "my" and not is_owner:
            continue
        if filter_type == "shared" and (
            is_owner or tc.access_level == AccessLevel.PUBLIC.value
        ):
            continue
        if filter_type == "public" and tc.access_level != AccessLevel.PUBLIC.value:
            continue
        meta = _metadata_for(tc, counts.get(tc.id, 0))
        meta["access_level"] = tc.access_level
        meta["owner_id"] = tc.owner_id
        meta["owner_username"] = tc.owner.username if tc.owner else None
        meta["is_owner"] = is_owner
        tests.append(meta)

    # Attempt stats — optional, drives Discover sort.
    if with_stats or sort in {"popular", "best"}:
        accessed_ids = [str(t["id"]) for t in tests]
        if accessed_ids:
            stats_rows = db.execute(
                select(
                    Attempt.test_id,
                    func.count(Attempt.id).label("attempts_count"),
                    func.avg(
                        (Attempt.correct_count * 100.0)
                        / func.nullif(Attempt.question_count, 0)
                    ).label("avg_score"),
                )
                .where(
                    Attempt.test_id.in_(accessed_ids),
                    Attempt.status == AttemptStatus.COMPLETED.value,
                )
                .group_by(Attempt.test_id)
            ).all()
            stats_map = {
                r.test_id: {
                    "attempts_count": int(r.attempts_count or 0),
                    "avg_score": round(float(r.avg_score)) if r.avg_score is not None else None,
                }
                for r in stats_rows
            }
        else:
            stats_map = {}
        for t in tests:
            s = stats_map.get(t["id"], {"attempts_count": 0, "avg_score": None})
            t["attempts_count"] = s["attempts_count"]
            t["avg_score"] = s["avg_score"]

    if sort == "popular":
        tests.sort(key=lambda t: t.get("attempts_count", 0), reverse=True)
    elif sort == "best":
        tests.sort(
            key=lambda t: (t.get("avg_score") is None, -(t.get("avg_score") or 0))
        )
    elif sort == "new":
        # Newest first by created_at — we have it on TestCollection now.
        # The simplest stable approach: re-sort the result list by the
        # collection's created_at.
        tc_by_id = {c.test_id: c for c in collections}
        tests.sort(
            key=lambda t: tc_by_id[t["id"]].created_at,
            reverse=True,
        )

    total = len(tests)
    if offset:
        tests = tests[offset:]
    if limit:
        tests = tests[:limit]

    return {"tests": tests, "total": total, "offset": offset, "limit": limit}


@router.post("")
def create_test(
    payload: TestCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, object]:
    """Create an empty test (DB-backed)."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    _enforce_test_quota(db, current_user)

    test_id = uuid.uuid4().hex
    access_level = AccessLevel.PRIVATE
    if payload.access_level:
        try:
            access_level = AccessLevel(payload.access_level)
        except ValueError:
            pass
    access_service.get_or_create_collection(db, test_id, current_user.id, access_level)
    questions_service.save_test_settings(
        db, test_id,
        title=title,
        description=(payload.description.strip() if payload.description else None),
    )

    try:
        from api.services import activity_service
        activity_service.log(
            db, current_user.id, "test_created",
            test_id=test_id,
            payload={"title": title, "accessLevel": access_level.value},
        )
    except Exception:  # noqa: BLE001 — activity is best-effort
        pass

    test_payload = questions_service.get_test_payload(db, test_id) or {}
    test_payload["assetsBaseUrl"] = f"/api/tests/{test_id}/assets"
    return {
        "metadata": _metadata_for(
            access_service.get_test_collection(db, test_id),
            len(test_payload.get("questions", [])),
        ),
        "payload": test_payload,
    }


@router.get("/{test_id}")
def get_test(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, object]:
    """Return the test payload (DB-backed)."""
    payload = questions_service.get_test_payload(db, test_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Test not found")
    if not access_service.can_view_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    payload["assetsBaseUrl"] = f"/api/tests/{test_id}/assets"
    tc = access_service.get_test_collection_with_owner(db, test_id)
    return _augment_with_ownership(payload, tc, current_user)


@router.patch("/{test_id}")
def update_test(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    update: TestUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, object]:
    """Update test metadata (title/description)."""
    if not questions_service.test_exists(db, test_id):
        raise HTTPException(status_code=404, detail="Test not found")
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can edit test")

    title = update.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    questions_service.save_test_settings(
        db, test_id,
        title=title,
        description=(update.description.strip() if update.description is not None else None),
    )

    tc = access_service.get_test_collection(db, test_id)
    counts = db.execute(
        select(func.count(Question.id)).where(
            Question.test_collection_id == tc.id
        )
    ).scalar_one()
    return _metadata_for(tc, counts)


@router.delete("/{test_id}")
def delete_test(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, str]:
    """Delete a test (and its questions via CASCADE) + storage cleanup."""
    if not questions_service.test_exists(db, test_id):
        raise HTTPException(status_code=404, detail="Test not found")
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can delete test")

    access_service.delete_test_collection(db, test_id)
    _drop_storage_prefix(test_id)
    return {"status": "deleted"}


@router.post("/upload")
def upload_test(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    storage: Annotated[StorageBackend, Depends(get_storage)],
    file: UploadFile = File(...),
    # Symbol/text that marks the correct answer in the docx. Any string
    # works since the extractor uses plain `startswith` (no regex), but
    # we cap at 32 chars to keep payloads sane and prevent abuse.
    symbol: str = Form("*", max_length=32),
    log_small_tables: bool = Form(False),
    access_level: str = Form("private"),
    title: str | None = Form(None),
    description: str | None = Form(None),
) -> dict[str, object]:
    """Import a .docx and return the full test payload.

    The SPA's import wizard expects a synchronous `{metadata, payload}`
    response so it can render the review step immediately. We still
    record an `ImportJob` row for audit + crash recovery (the row goes
    straight to `done` on success or `failed` with the error message).
    For very large files the request blocks until extraction finishes —
    typical processing time is a few seconds on a modern host. If we
    ever need 202 + polling, switch to BackgroundTasks here and update
    `static/js/screens/desktop/import.js` to poll `/api/import-jobs/`.
    """
    file_name = file.filename or "upload.docx"
    suffix = FilePath(file_name).suffix.lower()
    if suffix == ".doc":
        raise HTTPException(status_code=400, detail="Поддерживаются только .docx")
    if suffix and suffix != ".docx":
        raise HTTPException(status_code=400, detail="Поддерживаются только .docx")

    # Per-user test cap — check before reading the body so abusive
    # uploads don't get a chance to consume bandwidth.
    _enforce_test_quota(db, current_user)

    docx_bytes = file.file.read()
    if not docx_bytes:
        raise HTTPException(status_code=400, detail="Empty upload")
    if len(docx_bytes) > MAX_DOCX_UPLOAD_BYTES:
        mb = MAX_DOCX_UPLOAD_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail={
                "code": "file_too_large",
                "message": f"File exceeds the {mb} MB limit.",
                "limit_bytes": MAX_DOCX_UPLOAD_BYTES,
                "size_bytes": len(docx_bytes),
            },
        )

    # Snapshot every attribute of `current_user` we'll need BEFORE
    # start_import closes the shared FastAPI request session. The User
    # instance comes from `Depends(get_current_user)`, which is bound to
    # the same `Depends(get_db)` session passed in via `db`. When
    # start_import closes that session, current_user gets detached and
    # any later attribute access raises DetachedInstanceError (we hit
    # this in prod after the previous deploy — see incident logs).
    current_user_id = current_user.id

    # CRITICAL: release the request-scoped DB connection BEFORE the
    # import runs. start_import itself closes `db` after committing
    # the job row and BEFORE its multi-MB R2 PUT of the source docx;
    # without that, this handler held one pooled connection for the
    # full ~4s of extract + WMF conversion + 26x R2 PUTs and
    # concurrent uploads exhausted the pool.
    job_id = import_service.start_import(
        db, storage, current_user_id, FilePath(file_name).name, docx_bytes,
    )
    # start_import already closed `db`; calling close() again is a no-op,
    # but kept for defensive clarity in case start_import is refactored.
    db.close()

    # Synchronous run — same code path the BackgroundTasks worker uses.
    # Errors raise (caught and recorded by import_service.run_import); on
    # exit the job is either `done` (with test_collection_id) or `failed`.
    import_service.run_import(
        job_id,
        symbol=symbol,
        log_small_tables=log_small_tables,
        access_level=access_level,
        title_override=(title.strip() if title and title.strip() else None),
        description_override=(description.strip() if description and description.strip() else None),
    )

    # Re-open a short session to inspect the import outcome AND build the
    # response payload. Same session for both so we don't checkout twice.
    from api.models.db.import_job import ImportJob, ImportJobStatus
    with SessionLocal() as fresh_db:
        job = fresh_db.get(ImportJob, job_id)
        if job is None or job.status != ImportJobStatus.DONE.value:
            detail = (job.error_message if job else None) or "Import failed"
            raise HTTPException(status_code=500, detail=detail)

        # The job stores the INT PK; access_service uses the public slug,
        # so fetch via the ORM directly.
        tc = fresh_db.get(TestCollection, job.test_collection_id)
        if tc is None:
            raise HTTPException(status_code=500, detail="Import succeeded but test missing")
        payload = questions_service.get_test_payload(fresh_db, tc.test_id) or {}
        payload["assetsBaseUrl"] = f"/api/tests/{tc.test_id}/assets"
        metadata = _metadata_for(tc, len(payload.get("questions", [])))
        _ = current_user_id  # silence "unused"; kept for future BG dispatch

    return {
        "metadata": metadata,
        "payload": payload,
        "logs": [],
        "jobId": job_id,
    }
