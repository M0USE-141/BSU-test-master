"""Access control API routes."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Path
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.access import (
    AccessLevel,
    AccessUpdateRequest,
    ShareRequest,
    ShareResponse,
    TestAccessInfo,
)
from api.models.db.access_request import AccessRequest, AccessRequestStatus
from api.models.db.user import User
from api.services import access_service, notification_service
from api.utils.validation import TEST_ID_PATTERN

router = APIRouter(prefix="/api", tags=["access"])


def get_user_by_username(db: DbSession, username: str) -> User | None:
    """Find user by username (case-insensitive) or display_name."""
    from sqlalchemy import select, func

    # Try exact username match first (case-insensitive)
    stmt = select(User).where(func.lower(User.username) == func.lower(username))
    user = db.execute(stmt).scalar_one_or_none()
    if user:
        return user

    # Try display_name match (case-insensitive)
    stmt = select(User).where(func.lower(User.display_name) == func.lower(username))
    return db.execute(stmt).scalar_one_or_none()


@router.get("/tests/{test_id}/access", response_model=TestAccessInfo)
def get_test_access(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> TestAccessInfo:
    """Get access settings for a test."""
    collection = access_service.get_test_collection_with_owner(db, test_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Test not found or no access control set")

    # Check if user can view this test's access info
    if not access_service.can_view_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    shares = access_service.list_shares(db, test_id)

    return TestAccessInfo(
        owner_id=collection.owner_id,
        owner_username=collection.owner.username,
        access_level=AccessLevel(collection.access_level),
        is_owner=collection.owner_id == current_user.id,
        shares_count=len(shares),
    )


@router.patch("/tests/{test_id}/access", response_model=TestAccessInfo)
def update_test_access(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    payload: AccessUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> TestAccessInfo:
    """Update access level for a test (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can change access level")

    collection = access_service.update_access_level(db, test_id, payload.access_level)
    if not collection:
        raise HTTPException(status_code=404, detail="Test not found")

    # Reload with owner
    collection = access_service.get_test_collection_with_owner(db, test_id)
    shares = access_service.list_shares(db, test_id)

    return TestAccessInfo(
        owner_id=collection.owner_id,
        owner_username=collection.owner.username,
        access_level=AccessLevel(collection.access_level),
        is_owner=True,
        shares_count=len(shares),
    )


@router.get("/tests/{test_id}/shares", response_model=list[ShareResponse])
def list_test_shares(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> list[ShareResponse]:
    """List users with shared access (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can view shares")

    shares = access_service.list_shares(db, test_id)

    return [
        ShareResponse(
            id=share.id,
            user_id=share.user_id,
            username=share.user.username,
            email=share.user.email,
            shared_at=share.shared_at,
            shared_by_username=share.shared_by_user.username if share.shared_by_user else None,
        )
        for share in shares
    ]


@router.post("/tests/{test_id}/shares", response_model=ShareResponse)
def add_test_share(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    payload: ShareRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> ShareResponse:
    """Add user to shared access (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can add shares")

    # Check test is in SHARED mode
    collection = access_service.get_test_collection(db, test_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Test not found")

    if collection.access_level != AccessLevel.SHARED.value:
        raise HTTPException(
            status_code=400,
            detail="Test must be in SHARED access level to add shares",
        )

    # Find user to share with
    target_user = get_user_by_username(db, payload.username)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if not target_user.is_active:
        raise HTTPException(status_code=400, detail="Cannot share with an inactive account")

    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")

    share = access_service.add_share(db, test_id, target_user.id, current_user.id)
    if not share:
        raise HTTPException(status_code=500, detail="Failed to create share")

    # Reload to get relationships
    shares = access_service.list_shares(db, test_id)
    for s in shares:
        if s.id == share.id:
            return ShareResponse(
                id=s.id,
                user_id=s.user_id,
                username=s.user.username,
                email=s.user.email,
                shared_at=s.shared_at,
                shared_by_username=s.shared_by_user.username if s.shared_by_user else None,
            )

    raise HTTPException(status_code=500, detail="Share created but not found")


@router.delete("/tests/{test_id}/shares/{user_id}")
def remove_test_share(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    user_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict:
    """Remove user from shared access (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can remove shares")

    success = access_service.remove_share(db, test_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Share not found")

    return {"message": "Share removed"}


# ───────────────────────────────────────────────────────────────────────
#  Access requests — submitted from the 403 page (prototype 2.1)
# ───────────────────────────────────────────────────────────────────────
@router.post("/tests/{test_id}/request-access")
def request_test_access(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    payload: dict = Body(default_factory=dict),
) -> dict:
    """Create an access request + notify the test owner.

    No-ops (still 200) if the caller already has access, so the user
    can't tell whether a private test exists from the response shape.
    """
    collection = access_service.get_test_collection_with_owner(db, test_id)
    if not collection:
        # Behave the same as "no access" — don't reveal existence
        return {"status": "requested"}

    # Already has access? Pretend success, do nothing.
    if access_service.can_view_test(db, test_id, current_user):
        return {"status": "already_accessible"}

    # Don't allow a self-request (owner is checked above; this is defensive)
    if collection.owner_id == current_user.id:
        return {"status": "already_accessible"}

    # If a pending request already exists, keep it idempotent.
    existing = (
        db.query(AccessRequest)
        .filter_by(
            test_id=test_id,
            requester_id=current_user.id,
            status=AccessRequestStatus.PENDING.value,
        )
        .first()
    )
    if existing is None:
        message = payload.get("message") if isinstance(payload, dict) else None
        req = AccessRequest(
            test_id=test_id,
            requester_id=current_user.id,
            message=message,
            status=AccessRequestStatus.PENDING.value,
            created_at=datetime.now(timezone.utc),
        )
        db.add(req)
        db.commit()
        db.refresh(req)

        notification_service.create_notification(
            db,
            user_id=collection.owner_id,
            kind="access_requested",
            payload={
                "requestId": req.id,
                "testId": test_id,
                "requesterId": current_user.id,
                "requesterUsername": current_user.username,
                "requesterDisplayName": current_user.display_name,
                "message": message,
            },
        )

    return {"status": "requested"}


@router.get("/tests/{test_id}/access-requests")
def list_access_requests(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    status: str | None = None,
) -> dict:
    """List access requests for a test (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can view access requests")

    q = db.query(AccessRequest).filter(AccessRequest.test_id == test_id)
    if status:
        q = q.filter(AccessRequest.status == status)
    rows = q.order_by(AccessRequest.created_at.desc()).all()
    return {
        "testId": test_id,
        "requests": [
            {
                "id": r.id,
                "requesterId": r.requester_id,
                "message": r.message,
                "status": r.status,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
                "decidedAt": r.decided_at.isoformat() if r.decided_at else None,
            }
            for r in rows
        ],
    }


@router.post("/tests/{test_id}/access-requests/{request_id}/decide")
def decide_access_request(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    request_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    payload: dict = Body(...),
) -> dict:
    """Approve or reject an access request (owner only).

    On approve: adds the requester to the test's shares. The test must be
    in SHARED mode (the owner can flip it via PATCH /tests/{id}/access first).
    """
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can decide access requests")

    decision = (payload or {}).get("decision")
    if decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="decision must be 'approve' or 'reject'")

    req = db.query(AccessRequest).filter_by(id=request_id, test_id=test_id).first()
    if req is None:
        raise HTTPException(status_code=404, detail="Access request not found")
    if req.status != AccessRequestStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="Access request is not pending")

    if decision == "approve":
        collection = access_service.get_test_collection(db, test_id)
        if collection is None:
            raise HTTPException(status_code=404, detail="Test not found")
        if collection.access_level == AccessLevel.PRIVATE.value:
            raise HTTPException(
                status_code=400,
                detail="Promote the test to SHARED before approving access requests.",
            )
        access_service.add_share(db, test_id, req.requester_id, current_user.id)
        req.status = AccessRequestStatus.APPROVED.value
    else:
        req.status = AccessRequestStatus.REJECTED.value

    req.decided_at = datetime.now(timezone.utc)
    req.decided_by = current_user.id
    db.commit()

    # Notify the requester so the UI can surface the decision in their inbox.
    notification_service.create_notification(
        db,
        user_id=req.requester_id,
        kind=f"access_{req.status}",
        payload={
            "requestId": req.id,
            "testId": test_id,
            "decidedBy": current_user.username,
        },
    )

    return {"status": req.status}
