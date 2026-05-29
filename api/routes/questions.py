"""Question management endpoints — DB-backed."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Path
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.db.flagged_question import FlaggedQuestion
from api.models.db.user import User
from api.services import access_service, questions_service
from api.services.test_service import extract_blocks, text_to_blocks
from api.utils.validation import TEST_ID_PATTERN

router = APIRouter(prefix="/api/tests/{test_id}/questions", tags=["questions"])


def _check_edit_permission(
    test_id: str, db: DbSession, current_user: User,
) -> None:
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(
            status_code=403, detail="Only the test owner can modify questions"
        )


def _build_question_dict(
    payload: dict[str, Any],
    *,
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Normalize a raw editor payload into the stored question dict.

    `existing` is the previously-stored question (for PATCH); when set,
    untouched top-level keys are carried over so partial updates don't
    discard data the caller didn't mean to drop.
    """
    out: dict[str, Any] = dict(existing or {})

    question_blocks = extract_blocks(payload.get("question"))
    question_text = payload.get("questionText")
    if question_blocks is not None:
        out["question"] = {"blocks": question_blocks}
    elif question_text is not None:
        out["question"] = {"blocks": text_to_blocks(str(question_text))}
    elif existing is None:
        # Required for first creation.
        raise HTTPException(status_code=400, detail="Question text is required")

    options_payload = payload.get("options")
    if options_payload is not None:
        if not isinstance(options_payload, list) or not options_payload:
            raise HTTPException(status_code=400, detail="Options are required")
        options: list[dict[str, Any]] = []
        correct_blocks = extract_blocks(payload.get("correct"))
        for index, option in enumerate(options_payload, start=1):
            if not isinstance(option, dict):
                raise HTTPException(status_code=400, detail="Invalid option format")
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
        raise HTTPException(status_code=400, detail="Options are required")

    objects_payload = payload.get("objects")
    if isinstance(objects_payload, list):
        out["objects"] = objects_payload

    return out


@router.post("")
def add_question(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    _check_edit_permission(test_id, db, current_user)
    new_question = _build_question_dict(payload)
    stored = questions_service.add_question(db, test_id, new_question)
    test_payload = questions_service.get_test_payload(db, test_id) or {}
    test_payload["assetsBaseUrl"] = f"/api/tests/{test_id}/assets"
    return {"payload": test_payload, "question": stored}


@router.patch("/{question_id}")
def update_question(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    question_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    _check_edit_permission(test_id, db, current_user)
    existing, _ = questions_service.get_question(db, test_id, question_id)
    merged = _build_question_dict(payload, existing=existing)
    stored = questions_service.replace_question_payload(
        db, test_id, question_id, merged
    )
    test_payload = questions_service.get_test_payload(db, test_id) or {}
    test_payload["assetsBaseUrl"] = f"/api/tests/{test_id}/assets"
    return {"payload": test_payload, "question": stored}


@router.delete("/{question_id}")
def delete_question(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    question_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    _check_edit_permission(test_id, db, current_user)
    dropped = questions_service.delete_question(db, test_id, question_id)
    test_payload = questions_service.get_test_payload(db, test_id) or {}
    test_payload["assetsBaseUrl"] = f"/api/tests/{test_id}/assets"
    return {"payload": test_payload, "question": dropped}


# ---------------------------------------------------------------------------
# Per-user question flagging — unchanged, just lives next to the CRUD.
# Registered BEFORE `{question_id}` so the literal "/flagged" wins routing.
# ---------------------------------------------------------------------------

@router.get("/flagged")
def list_flagged_question_ids(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    if not access_service.can_view_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    rows = (
        db.query(FlaggedQuestion.question_id)
        .filter_by(user_id=current_user.id, test_id=test_id)
        .all()
    )
    return {"testId": test_id, "flagged": [r[0] for r in rows]}


@router.post("/{question_id}/flag")
def flag_question(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    question_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    if not access_service.can_view_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    existing = (
        db.query(FlaggedQuestion)
        .filter_by(user_id=current_user.id, test_id=test_id, question_id=question_id)
        .first()
    )
    if existing is None:
        flag = FlaggedQuestion(
            user_id=current_user.id,
            test_id=test_id,
            question_id=question_id,
            flagged_at=datetime.now(timezone.utc),
        )
        db.add(flag)
        db.commit()
    return {"status": "flagged", "questionId": question_id}


@router.delete("/{question_id}/flag")
def unflag_question(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    question_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    if not access_service.can_view_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    db.query(FlaggedQuestion).filter_by(
        user_id=current_user.id, test_id=test_id, question_id=question_id,
    ).delete()
    db.commit()
    return {"status": "unflagged", "questionId": question_id}
