"""Question management endpoints."""
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Path
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.db.user import User
from api.services import access_service
from api.utils.validation import TEST_ID_PATTERN
from api.services.test_service import (
    extract_blocks,
    find_question,
    load_test_payload,
    save_test_payload,
    text_to_blocks,
)

router = APIRouter(prefix="/api/tests/{test_id}/questions", tags=["questions"])


def _check_edit_permission(
    test_id: str,  # already validated by Path() at route level
    db: DbSession,
    current_user: User,
) -> None:
    """Raise 403 if current_user cannot edit the test."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(
            status_code=403, detail="Only the test owner can modify questions"
        )


@router.post("")
def add_question(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    payload: dict[str, object] = Body(...),
) -> dict[str, object]:
    """Add new question to test."""
    _check_edit_permission(test_id, db, current_user)

    test_payload = load_test_payload(test_id)
    questions = test_payload.get("questions", [])
    if not isinstance(questions, list):
        raise HTTPException(status_code=400, detail="Invalid test payload")

    question_blocks = extract_blocks(payload.get("question"))
    question_text = payload.get("questionText")
    if question_blocks is None:
        if not isinstance(question_text, str) or not question_text.strip():
            raise HTTPException(
                status_code=400, detail="Question text is required"
            )
        question_blocks = text_to_blocks(question_text)

    options_payload = payload.get("options")
    if not isinstance(options_payload, list) or not options_payload:
        raise HTTPException(status_code=400, detail="Options are required")

    next_id = max((q.get("id", 0) for q in questions if isinstance(q, dict)), default=0) + 1
    options = []
    correct_blocks = extract_blocks(payload.get("correct"))

    for index, option in enumerate(options_payload, start=1):
        if not isinstance(option, dict):
            raise HTTPException(status_code=400, detail="Invalid option format")

        content_blocks = extract_blocks(option.get("content"))
        if content_blocks is None:
            option_text = str(option.get("text", ""))
            content_blocks = text_to_blocks(option_text)

        is_correct = bool(option.get("isCorrect"))
        if is_correct and correct_blocks is None:
            correct_blocks = content_blocks

        options.append(
            {
                "id": index,
                "content": {"blocks": content_blocks},
                "isCorrect": is_correct,
            }
        )

    new_question = {
        "id": next_id,
        "question": {"blocks": question_blocks},
        "options": options,
        "correct": {"blocks": correct_blocks or text_to_blocks("")},
    }

    objects_payload = payload.get("objects")
    if isinstance(objects_payload, list):
        new_question["objects"] = objects_payload

    questions.append(new_question)
    test_payload["questions"] = questions
    save_test_payload(test_id, test_payload)

    return {"payload": test_payload, "question": new_question}


@router.patch("/{question_id}")
def update_question(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    question_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    payload: dict[str, object] = Body(...),
) -> dict[str, object]:
    """Update existing question."""
    _check_edit_permission(test_id, db, current_user)

    test_payload = load_test_payload(test_id)
    question, _ = find_question(test_payload, question_id)

    question_blocks = extract_blocks(payload.get("question"))
    question_text = payload.get("questionText")
    if question_blocks is not None:
        question["question"] = {"blocks": question_blocks}
    elif question_text is not None:
        question["question"] = {"blocks": text_to_blocks(str(question_text))}

    options_payload = payload.get("options")
    if options_payload is not None:
        if not isinstance(options_payload, list) or not options_payload:
            raise HTTPException(status_code=400, detail="Options are required")

        options = []
        correct_blocks = extract_blocks(payload.get("correct"))

        for index, option in enumerate(options_payload, start=1):
            if not isinstance(option, dict):
                raise HTTPException(
                    status_code=400, detail="Invalid option format"
                )

            content_blocks = extract_blocks(option.get("content"))
            if content_blocks is None:
                option_text = str(option.get("text", ""))
                content_blocks = text_to_blocks(option_text)

            is_correct = bool(option.get("isCorrect"))
            if is_correct and correct_blocks is None:
                correct_blocks = content_blocks

            options.append(
                {
                    "id": index,
                    "content": {"blocks": content_blocks},
                    "isCorrect": is_correct,
                }
            )

        question["options"] = options
        question["correct"] = {
            "blocks": correct_blocks or text_to_blocks("")
        }

    objects_payload = payload.get("objects")
    if objects_payload is not None:
        if not isinstance(objects_payload, list):
            raise HTTPException(
                status_code=400, detail="Invalid objects format"
            )
        question["objects"] = objects_payload

    save_test_payload(test_id, test_payload)
    return {"payload": test_payload, "question": question}


@router.delete("/{question_id}")
def delete_question(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    question_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, object]:
    """Delete question from test."""
    _check_edit_permission(test_id, db, current_user)

    test_payload = load_test_payload(test_id)
    question, index = find_question(test_payload, question_id)

    questions = test_payload.get("questions", [])
    if not isinstance(questions, list):
        raise HTTPException(status_code=400, detail="Invalid test payload")

    questions.pop(index)
    test_payload["questions"] = questions
    save_test_payload(test_id, test_payload)

    return {"payload": test_payload, "question": question}
