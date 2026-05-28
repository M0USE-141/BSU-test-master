"""Test management endpoints."""
import shutil
import uuid
from pathlib import Path as FilePath
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession, joinedload

from api.config import DATA_DIR
from api.database import get_db
from api.dependencies.auth import get_current_user, get_optional_user
from api.models import TestCreate, TestUpdate
from api.models.db.attempt import Attempt, AttemptStatus
from api.models.db.user import User
from api.models.db.test_collection import AccessLevel, TestCollection
from api.services import access_service
from sqlalchemy import func
from api.utils import assets_dir, json_load, payload_path, test_dir, write_json_atomic
from api.utils.validation import TEST_ID_PATTERN
from api.services.test_service import load_test_payload, save_test_payload
from core.serialization import serialize_metadata, serialize_test_payload
from core.word_extract import WordTestExtractor

router = APIRouter(prefix="/api/tests", tags=["tests"])


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
    """List all tests accessible to the current user."""
    # Collect test directories from disk
    test_entries = [
        (d, d / "test.json")
        for d in sorted(DATA_DIR.iterdir())
        if d.is_dir() and (d / "test.json").exists()
    ]
    all_test_ids = [entry[0].name for entry in test_entries]

    # --- Bulk-load all TestCollections with owners (single query, no N+1) ---
    if all_test_ids:
        stmt = (
            select(TestCollection)
            .options(joinedload(TestCollection.owner))
            .where(TestCollection.test_id.in_(all_test_ids))
        )
        collections_dict: dict[str, TestCollection] = {
            c.test_id: c
            for c in db.execute(stmt).scalars().unique().all()
        }
    else:
        collections_dict = {}

    # Get accessible test IDs from database
    accessible_ids = set(access_service.get_accessible_test_ids(db, current_user))

    tests = []
    for test_directory, payload_file in test_entries:
        test_id = test_directory.name
        payload = payload_file.read_text(encoding="utf-8")
        metadata = serialize_metadata(json_load(payload))

        collection = collections_dict.get(test_id)
        if collection:
            # Test has access control — check if accessible
            if test_id not in accessible_ids:
                continue
            metadata["access_level"] = collection.access_level
            metadata["owner_id"] = collection.owner_id
            metadata["owner_username"] = collection.owner.username
            is_owner = current_user and collection.owner_id == current_user.id
            metadata["is_owner"] = is_owner

            # Apply filter
            if filter_type == "my":
                if not is_owner:
                    continue
            elif filter_type == "shared":
                # Shared means: not owner and not public
                if is_owner or collection.access_level == AccessLevel.PUBLIC:
                    continue
            elif filter_type == "public":
                if collection.access_level != AccessLevel.PUBLIC:
                    continue
        else:
            # No access control record — show to everyone (backwards compatibility)
            metadata["access_level"] = "public"
            metadata["owner_id"] = None
            metadata["owner_username"] = None
            metadata["is_owner"] = False

            # Apply filter for legacy tests (no owner)
            if filter_type == "my" or filter_type == "shared":
                continue

        tests.append(metadata)

    # Optional per-test attempt aggregates — drives Discover sort by
    # popular / best. Single bulk query keyed by test_id avoids N+1.
    if with_stats or sort in {"popular", "best"}:
        # Compute COUNT(completed) and AVG(percent_correct) per test_id.
        # SQLite/SA cast keeps avg as float; round to int for display.
        accessed_ids = [t["id"] for t in tests]
        if accessed_ids:
            stats_rows = db.execute(
                select(
                    Attempt.test_id,
                    func.count(Attempt.id).label("attempts_count"),
                    func.avg(
                        (Attempt.correct_count * 100.0) /
                        func.nullif(Attempt.question_count, 0)
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

    # Sort. Default order is whatever the disk listing returned (mtime-ish).
    if sort == "popular":
        tests.sort(key=lambda t: t.get("attempts_count", 0), reverse=True)
    elif sort == "best":
        # Tests with no completed attempts sink to the bottom rather than
        # being treated as zero.
        tests.sort(key=lambda t: (t.get("avg_score") is None, -(t.get("avg_score") or 0)))
    elif sort == "new":
        # Sort newest first — assumes test directories carry creation order.
        # No-op here since list_tests already iterates sorted dirs; could
        # be extended later with a created_at column on TestCollection.
        pass

    # Apply pagination
    total = len(tests)
    if offset:
        tests = tests[offset:]
    if limit:
        tests = tests[:limit]

    return {
        "tests": tests,
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.post("")
def create_test(
    payload: TestCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, object]:
    """Create a new test."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    test_id = uuid.uuid4().hex
    test_directory = test_dir(test_id)
    test_directory.mkdir(parents=True, exist_ok=True)

    assets_directory = assets_dir(test_id)
    assets_directory.mkdir(parents=True, exist_ok=True)

    test_payload = serialize_test_payload(test_id, title, [], assets_directory)
    if payload.description:
        test_payload["description"] = payload.description.strip()
    save_test_payload(test_id, test_payload)

    # Create TestCollection record with ownership
    access_level = AccessLevel.PRIVATE
    if payload.access_level:
        try:
            access_level = AccessLevel(payload.access_level)
        except ValueError:
            pass  # Use default if invalid
    access_service.get_or_create_collection(db, test_id, current_user.id, access_level)

    # Log activity (Phase 5 final).
    try:
        from api.services import activity_service
        activity_service.log(
            db, current_user.id, "test_created",
            test_id=test_id, payload={"title": title, "accessLevel": access_level.value},
        )
    except Exception:
        pass

    return {"metadata": serialize_metadata(test_payload), "payload": test_payload}


@router.get("/{test_id}")
def get_test(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, object]:
    """Get test payload."""
    payload_file = payload_path(test_id)
    if not payload_file.exists():
        raise HTTPException(status_code=404, detail="Test not found")

    # Check access permission
    if not access_service.can_view_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    payload = payload_file.read_text(encoding="utf-8")
    result = json_load(payload)

    # Add ownership info
    collection = access_service.get_test_collection_with_owner(db, test_id)
    if collection:
        result["is_owner"] = current_user and collection.owner_id == current_user.id
        result["owner_id"] = collection.owner_id
        result["owner_username"] = collection.owner.username
        result["access_level"] = collection.access_level
    else:
        result["is_owner"] = False
        result["owner_id"] = None
        result["owner_username"] = None
        result["access_level"] = "public"

    return result


@router.patch("/{test_id}")
def update_test(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    update: TestUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, object]:
    """Update test metadata."""
    payload_file = payload_path(test_id)
    if not payload_file.exists():
        raise HTTPException(status_code=404, detail="Test not found")

    # Check edit permission
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can edit test")

    title = update.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    payload = json_load(payload_file.read_text(encoding="utf-8"))
    payload["title"] = title
    if update.description is not None:
        payload["description"] = update.description.strip()
    write_json_atomic(payload_file, payload)

    return serialize_metadata(payload)


@router.delete("/{test_id}")
def delete_test(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, str]:
    """Delete test."""
    test_directory = test_dir(test_id)
    if not test_directory.exists() or not test_directory.is_dir():
        raise HTTPException(status_code=404, detail="Test not found")

    # Check edit permission
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can delete test")

    # Delete TestCollection record
    access_service.delete_test_collection(db, test_id)

    shutil.rmtree(test_directory)
    return {"status": "deleted"}


@router.post("/upload")
def upload_test(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    file: UploadFile = File(...),
    symbol: str = Form("*"),
    log_small_tables: bool = Form(False),
    access_level: str = Form("private"),
) -> dict[str, object]:
    """Upload test from Word document."""
    file_name = file.filename or ""
    if FilePath(file_name).suffix.lower() == ".doc":
        raise HTTPException(status_code=400, detail="Поддерживаются только .docx")

    test_id = uuid.uuid4().hex
    test_directory = test_dir(test_id)
    test_directory.mkdir(parents=True, exist_ok=True)

    assets_directory = assets_dir(test_id)
    assets_directory.mkdir(parents=True, exist_ok=True)

    safe_name = FilePath(file.filename or f"upload_{test_id}.docx").name
    file_path = test_directory / safe_name
    file_path.write_bytes(file.file.read())

    extractor = WordTestExtractor(
        file_path,
        symbol,
        log_small_tables,
        assets_directory,
    )
    try:
        tests = extractor.extract()
        test_payload = serialize_test_payload(
            test_id, file_path.stem, tests, assets_directory
        )
        write_json_atomic(payload_path(test_id), test_payload)
    finally:
        extractor.cleanup()

    # Create TestCollection record with ownership
    try:
        parsed_access_level = AccessLevel(access_level)
    except ValueError:
        parsed_access_level = AccessLevel.PRIVATE
    access_service.get_or_create_collection(db, test_id, current_user.id, parsed_access_level)

    return {
        "metadata": serialize_metadata(test_payload),
        "payload": test_payload,
        "logs": extractor.logs,
    }
