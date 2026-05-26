"""Search endpoint — searches test titles from on-disk JSON payloads."""
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession, joinedload

from api.config import DATA_DIR
from api.database import get_db
from api.dependencies.auth import get_optional_user
from api.models.db.test_collection import AccessLevel, TestCollection
from api.models.db.user import User
from api.services import access_service
from api.utils import json_load
from core.serialization import serialize_metadata

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search")
def search(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(20, ge=1, le=100),
    db: DbSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """
    Full-text search over test titles (LIKE match against on-disk payloads).
    Returns tests visible to the current user.
    """
    q_lower = q.lower()
    # DATA_DIR already points to the tests root (data/tests/)
    if not DATA_DIR.exists():
        return {"results": [], "total": 0, "query": q}

    # Get list of test dirs that have a payload
    test_entries = [
        (d, d / "test.json")
        for d in DATA_DIR.iterdir()
        if d.is_dir() and (d / "test.json").exists()
    ]

    # Determine accessible test IDs
    accessible_ids = set(access_service.get_accessible_test_ids(db, current_user))

    # Bulk-load collections
    all_ids = [e[0].name for e in test_entries]
    if all_ids:
        collections = {
            c.test_id: c
            for c in db.execute(
                select(TestCollection)
                .options(joinedload(TestCollection.owner))
                .where(TestCollection.test_id.in_(all_ids))
            ).scalars().unique().all()
        }
    else:
        collections = {}

    results = []
    for test_dir, payload_file in test_entries:
        test_id = test_dir.name
        collection = collections.get(test_id)

        # Visibility check
        if collection and test_id not in accessible_ids:
            continue

        try:
            raw = payload_file.read_text(encoding="utf-8")
            data = json_load(raw)
            metadata = serialize_metadata(data)
        except Exception:
            continue

        title = metadata.get("title", "")
        if q_lower not in title.lower():
            continue

        entry: dict[str, Any] = {
            "id": test_id,
            "title": title,
            "questionCount": metadata.get("questionCount", 0),
        }
        if collection:
            entry["access_level"] = collection.access_level
            entry["owner_id"] = collection.owner_id
            entry["owner_username"] = collection.owner.username if collection.owner else None

        results.append(entry)
        if len(results) >= limit:
            break

    return {"results": results, "total": len(results), "query": q}
