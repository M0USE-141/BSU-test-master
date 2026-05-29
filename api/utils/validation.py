"""Validation utilities."""
from __future__ import annotations

import re
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session as DbSession

from api.services.questions_service import test_exists as _db_test_exists

# UUID hex (32 lowercase hex chars) — format produced by uuid.uuid4().hex
TEST_ID_PATTERN = r"^[a-f0-9]{32}$"
_TEST_ID_RE = re.compile(TEST_ID_PATTERN)


def validate_id(name: str, value: str) -> str:
    """Validate ID string (no path traversal)."""
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail=f"{name} is required")
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{name} is required")
    if Path(cleaned).name != cleaned or "/" in cleaned or "\\" in cleaned:
        raise HTTPException(status_code=400, detail=f"Invalid {name}")
    return cleaned


def validate_test_id(test_id: str) -> str:
    """Validate that test_id is a 32-char lowercase hex UUID (prevents path traversal)."""
    if not _TEST_ID_RE.match(test_id):
        raise HTTPException(status_code=400, detail="Invalid test ID format")
    return test_id


def validate_test_exists(db: DbSession, test_id: str) -> None:
    """Validate that the test exists in the DB."""
    if not _db_test_exists(db, test_id):
        raise HTTPException(status_code=404, detail="Test not found")