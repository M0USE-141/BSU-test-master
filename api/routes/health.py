"""Liveness / readiness endpoint.

`GET /api/health` is the contract Caddy / k8s / uptime checks consume.
We deliberately don't check MinIO from here: if MinIO is down the app
still serves cached SPA bundles and most metadata endpoints; making
health fail there would cause cascading 503s during isolated S3
outages. Only the DB check is required for the app to function.
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session as DbSession

from api.config import APP_VERSION
from api.database import get_db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health(
    response: Response,
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, str]:
    """Return `{db: ok|fail, version}`.

    Always returns 200 OK on `db: ok`; flips to 503 on `db: fail` so
    upstream monitors can act on the HTTP code without parsing JSON.
    """
    try:
        db.execute(text("SELECT 1"))
        return {"db": "ok", "version": APP_VERSION}
    except Exception as exc:  # noqa: BLE001 — health must never raise
        log.warning("health: DB check failed: %s", exc)
        response.status_code = 503
        return {"db": "fail", "version": APP_VERSION}
