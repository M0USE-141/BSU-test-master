"""Async docx import — polling endpoints.

`POST /api/tests/upload` (in `routes/tests.py`) creates a job and returns
the id immediately. Clients hit these endpoints to monitor progress.
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.db.import_job import ImportJob
from api.models.db.user import User
from api.services import import_service

router = APIRouter(prefix="/api/import-jobs", tags=["import-jobs"])


def _serialize(job: ImportJob) -> dict[str, Any]:
    return {
        "id": job.id,
        "status": job.status,
        "sourceFilename": job.source_filename,
        "testCollectionId": job.test_collection_id,
        "errorMessage": job.error_message,
        "createdAt": job.created_at.isoformat() if job.created_at else None,
        "updatedAt": job.updated_at.isoformat() if job.updated_at else None,
    }


@router.get("/me")
def list_my_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    status: str | None = Query(None, pattern="^(pending|processing|done|failed)$"),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, list[dict[str, Any]]]:
    jobs = import_service.list_user_jobs(db, current_user.id, status=status, limit=limit)
    return {"jobs": [_serialize(j) for j in jobs]}


@router.get("/{job_id}")
def get_job(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    job = import_service.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Import job not found")
    if job.user_id != current_user.id:
        # Don't leak existence of other users' jobs.
        raise HTTPException(status_code=404, detail="Import job not found")
    return _serialize(job)
