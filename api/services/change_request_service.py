"""Change request service for test editing proposals."""

import json
import threading
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession, joinedload

# ── Rate limiting: max 5 CR submissions per user per 60 seconds ──────────────
_CR_RATE_WINDOW = 60  # seconds
_CR_RATE_LIMIT = 5

_rate_lock = threading.Lock()
_rate_buckets: dict[int, list[float]] = defaultdict(list)

def _check_rate_limit(user_id: int) -> None:
    import time
    now = time.monotonic()
    with _rate_lock:
        bucket = _rate_buckets[user_id]
        bucket[:] = [t for t in bucket if now - t < _CR_RATE_WINDOW]
        if len(bucket) >= _CR_RATE_LIMIT:
            raise HTTPException(status_code=429, detail="Too many change requests, please wait")
        bucket.append(now)

# ── Per-test file lock to prevent concurrent CR apply races ──────────────────
_apply_locks: dict[str, threading.Lock] = defaultdict(threading.Lock)
_apply_locks_meta = threading.Lock()

from api.models.db.change_request import ChangeRequest, ChangeRequestStatus, ChangeRequestType
from api.models.db.test_collection import TestCollection
from api.models.db.user import User
from api.services import access_service, questions_service
from api.services.test_service import extract_blocks, text_to_blocks
from api.database import SessionLocal


def get_test_collection(db: DbSession, test_id: str) -> TestCollection | None:
    """Get test collection by test_id."""
    stmt = select(TestCollection).where(TestCollection.test_id == test_id)
    return db.execute(stmt).scalar_one_or_none()


def can_create_change_request(
    db: DbSession, test_id: str, user: User
) -> tuple[bool, bool, str | None]:
    """
    Check if user can create a change request.
    Returns (can_propose, is_owner, reason).
    """
    collection = get_test_collection(db, test_id)

    if not collection:
        return False, False, "Test not found"

    is_owner = collection.owner_id == user.id

    # Owner doesn't need to create change requests - they can edit directly
    if is_owner:
        return False, True, "Owner can edit directly"

    # Check if user has access to view the test
    if not access_service.can_view_test(db, test_id, user):
        return False, False, "Access denied"

    # Non-owner with view access can create change requests
    return True, False, None


def create_change_request(
    db: DbSession,
    test_id: str,
    user: User,
    request_type: ChangeRequestType,
    payload: dict,
    question_id: str | None = None,
) -> ChangeRequest:
    """Create a new change request."""
    _check_rate_limit(user.id)

    if len(json.dumps(payload)) > 64 * 1024:
        raise HTTPException(status_code=400, detail="Change request payload exceeds 64 KB limit")

    collection = get_test_collection(db, test_id)
    if not collection:
        raise ValueError("Test not found")

    change_request = ChangeRequest(
        test_collection_id=collection.id,
        user_id=user.id,
        request_type=request_type.value,
        question_id=question_id,
        payload=json.dumps(payload),
        status=ChangeRequestStatus.PENDING.value,
    )

    db.add(change_request)
    db.commit()
    db.refresh(change_request)

    # Notify test owner that a change request was received
    try:
        from api.services.notification_service import create_notification
        create_notification(db, collection.owner_id, "cr_received", {
            "cr_id": change_request.id,
            "test_id": test_id,
            "proposer_id": user.id,
            "proposer_username": user.username,
        })
    except Exception:
        pass  # Notifications are best-effort; never fail the main flow

    # Activity feed (Phase 5 final) — proposer is the actor.
    try:
        from api.services import activity_service
        activity_service.log(
            db, user.id, "cr_proposed",
            test_id=test_id, target_user_id=collection.owner_id,
            payload={"crId": change_request.id, "requestType": request_type.value},
        )
    except Exception:
        pass

    return change_request


def get_change_request(db: DbSession, request_id: int) -> ChangeRequest | None:
    """Get change request by ID with relationships loaded."""
    stmt = (
        select(ChangeRequest)
        .options(
            joinedload(ChangeRequest.user),
            joinedload(ChangeRequest.reviewer),
            joinedload(ChangeRequest.test_collection),
        )
        .where(ChangeRequest.id == request_id)
    )
    return db.execute(stmt).scalar_one_or_none()


def list_change_requests(
    db: DbSession,
    test_id: str,
    status: ChangeRequestStatus | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[ChangeRequest], int, int]:
    """
    List change requests for a test.
    Returns (items, total_count, pending_count).
    """
    collection = get_test_collection(db, test_id)
    if not collection:
        return [], 0, 0

    # Base query
    base_query = select(ChangeRequest).where(
        ChangeRequest.test_collection_id == collection.id
    )

    # Count total (direct WHERE — no subquery wrapper)
    count_stmt = select(func.count(ChangeRequest.id)).where(
        ChangeRequest.test_collection_id == collection.id
    )
    total = db.execute(count_stmt).scalar() or 0

    # Count pending
    pending_stmt = select(func.count(ChangeRequest.id)).where(
        ChangeRequest.test_collection_id == collection.id,
        ChangeRequest.status == ChangeRequestStatus.PENDING.value,
    )
    pending_count = db.execute(pending_stmt).scalar() or 0

    # Apply status filter
    if status:
        base_query = base_query.where(ChangeRequest.status == status.value)

    # Get items with pagination
    stmt = (
        base_query
        .options(
            joinedload(ChangeRequest.user),
            joinedload(ChangeRequest.reviewer),
        )
        .order_by(ChangeRequest.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    items = list(db.execute(stmt).scalars().all())
    return items, total, pending_count


def get_change_request_stats(db: DbSession, test_id: str) -> dict[str, int]:
    """Get statistics for change requests."""
    collection = get_test_collection(db, test_id)
    if not collection:
        return {"pending": 0, "approved": 0, "rejected": 0, "total": 0}

    # Count by status
    stmt = (
        select(ChangeRequest.status, func.count())
        .where(ChangeRequest.test_collection_id == collection.id)
        .group_by(ChangeRequest.status)
    )

    results = db.execute(stmt).all()
    counts = {status: count for status, count in results}

    pending = counts.get(ChangeRequestStatus.PENDING.value, 0)
    approved = counts.get(ChangeRequestStatus.APPROVED.value, 0)
    rejected = counts.get(ChangeRequestStatus.REJECTED.value, 0)

    return {
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "total": pending + approved + rejected,
    }


def approve_change_request(
    db: DbSession,
    request_id: int,
    reviewer: User,
    comment: str | None = None,
) -> ChangeRequest:
    """Approve a change request and apply the changes."""
    change_request = get_change_request(db, request_id)
    if not change_request:
        raise ValueError("Change request not found")

    if change_request.status != ChangeRequestStatus.PENDING.value:
        raise ValueError("Change request is not pending")

    # Apply the changes
    test_id = change_request.test_collection.test_id
    _apply_change_request(test_id, change_request)

    # Update status
    change_request.status = ChangeRequestStatus.APPROVED.value
    change_request.reviewed_at = datetime.now(timezone.utc)
    change_request.reviewed_by = reviewer.id
    change_request.review_comment = comment

    db.commit()
    db.refresh(change_request)

    # Notify proposer that their CR was approved
    try:
        from api.services.notification_service import create_notification
        create_notification(db, change_request.user_id, "cr_approved", {
            "cr_id": change_request.id,
            "test_id": test_id,
            "reviewer_username": reviewer.username,
        })
    except Exception:
        pass

    # Activity feed (Phase 5 final) — reviewer is the actor.
    try:
        from api.services import activity_service
        activity_service.log(
            db, reviewer.id, "cr_approved",
            test_id=test_id, target_user_id=change_request.user_id,
            payload={"crId": change_request.id},
        )
    except Exception:
        pass

    return change_request


def reject_change_request(
    db: DbSession,
    request_id: int,
    reviewer: User,
    comment: str | None = None,
) -> ChangeRequest:
    """Reject a change request."""
    change_request = get_change_request(db, request_id)
    if not change_request:
        raise ValueError("Change request not found")

    if change_request.status != ChangeRequestStatus.PENDING.value:
        raise ValueError("Change request is not pending")

    # Update status
    change_request.status = ChangeRequestStatus.REJECTED.value
    change_request.reviewed_at = datetime.now(timezone.utc)
    change_request.reviewed_by = reviewer.id
    change_request.review_comment = comment

    db.commit()
    db.refresh(change_request)

    # Notify proposer that their CR was rejected
    try:
        from api.services.notification_service import create_notification
        test_id = change_request.test_collection.test_id
        create_notification(db, change_request.user_id, "cr_rejected", {
            "cr_id": change_request.id,
            "test_id": test_id,
            "reviewer_username": reviewer.username,
            "comment": comment,
        })
    except Exception:
        pass

    # Activity feed (Phase 5 final) — reviewer is the actor.
    try:
        from api.services import activity_service
        activity_service.log(
            db, reviewer.id, "cr_rejected",
            test_id=change_request.test_collection.test_id,
            target_user_id=change_request.user_id,
            payload={"crId": change_request.id},
        )
    except Exception:
        pass

    return change_request


def _apply_change_request(test_id: str, change_request: ChangeRequest) -> None:
    """Apply a change request to the test, holding a per-test lock to prevent races."""
    with _apply_locks_meta:
        lock = _apply_locks[test_id]

    with lock:
        payload = json.loads(change_request.payload)
        request_type = ChangeRequestType(change_request.request_type)

        if request_type == ChangeRequestType.ADD_QUESTION:
            _apply_add_question(test_id, payload)
        elif request_type == ChangeRequestType.EDIT_QUESTION:
            question_id = change_request.question_id
            if question_id:
                _apply_edit_question(test_id, int(question_id), payload)
        elif request_type == ChangeRequestType.DELETE_QUESTION:
            question_id = change_request.question_id
            if question_id:
                _apply_delete_question(test_id, int(question_id))
        elif request_type == ChangeRequestType.EDIT_SETTINGS:
            _apply_edit_settings(test_id, payload)


def _build_question_payload(payload: dict, *, existing: dict | None = None) -> dict:
    """Render a CR-style payload into the stored question dict shape.

    Mirrors `routes.questions._build_question_dict` — kept here so the
    CR worker doesn't import a route helper. The two converge on the
    same shape; keep changes in lock-step.
    """
    out: dict = dict(existing or {})

    question_blocks = extract_blocks(payload.get("question"))
    question_text = payload.get("questionText")
    if question_blocks is not None:
        out["question"] = {"blocks": question_blocks}
    elif question_text is not None:
        out["question"] = {"blocks": text_to_blocks(str(question_text))}
    elif existing is None:
        out["question"] = {"blocks": text_to_blocks("")}

    options_payload = payload.get("options")
    if options_payload is not None and isinstance(options_payload, list):
        options: list[dict] = []
        correct_blocks = extract_blocks(payload.get("correct"))
        for index, option in enumerate(options_payload, start=1):
            if not isinstance(option, dict):
                continue
            content_blocks = extract_blocks(option.get("content"))
            if content_blocks is None:
                content_blocks = text_to_blocks(str(option.get("text", "")))
            is_correct = bool(option.get("isCorrect"))
            if is_correct and correct_blocks is None:
                correct_blocks = content_blocks
            options.append({
                "id": index,
                "content": {"blocks": content_blocks},
                "isCorrect": is_correct,
            })
        out["options"] = options
        out["correct"] = {"blocks": correct_blocks or text_to_blocks("")}
    elif existing is None:
        out["options"] = []
        out["correct"] = {"blocks": text_to_blocks("")}

    objects_payload = payload.get("objects")
    if isinstance(objects_payload, list):
        out["objects"] = objects_payload

    return out


def _apply_add_question(test_id: str, payload: dict) -> None:
    """Append a new question via questions_service (own DB session — CR
    apply runs outside the route's request scope)."""
    with SessionLocal() as db:
        new_question = _build_question_payload(payload)
        questions_service.add_question(db, test_id, new_question)


def _apply_edit_question(test_id: str, question_id: int, payload: dict) -> None:
    with SessionLocal() as db:
        existing, _ = questions_service.get_question(db, test_id, question_id)
        merged = _build_question_payload(payload, existing=existing)
        questions_service.replace_question_payload(db, test_id, question_id, merged)


def _apply_delete_question(test_id: str, question_id: int) -> None:
    with SessionLocal() as db:
        questions_service.delete_question(db, test_id, question_id)


def _apply_edit_settings(test_id: str, payload: dict) -> None:
    with SessionLocal() as db:
        kwargs: dict = {}
        if "title" in payload:
            kwargs["title"] = payload.get("title")
        if "description" in payload:
            kwargs["description"] = payload.get("description")
        if not kwargs:
            return
        questions_service.save_test_settings(db, test_id, **kwargs)
