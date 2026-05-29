"""Attempt management endpoints.

All endpoints require authentication — anonymous attempts were dropped
in favour of `user_id`-only ownership. The previous `clientId` query/body
parameter is gone; authorization compares `attempt.user_id` against
the bearer's `current_user.id`.
"""
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.db.user import User
from api.services.attempt_service import (
    start_attempt,
    record_answer,
    skip_question,
    finish_attempt,
    abandon_attempt,
    get_attempt,
)
from api.utils import validate_id, validate_test_exists


router = APIRouter(prefix="/api/attempts", tags=["attempts"])


class StartAttemptRequest(BaseModel):
    """Request to start a new attempt."""
    attemptId: str = Field(..., min_length=1)
    testId: str = Field(..., min_length=1)
    settings: dict[str, Any] | None = None
    questions: list[dict[str, Any]] | None = None


class RecordAnswerRequest(BaseModel):
    """Request to record an answer."""
    testId: str = Field(..., min_length=1)
    questionId: int
    answerIndex: int | None = None
    canonicalAnswerIndex: int | None = None
    durationMs: int = 0
    isSkipped: bool = False


class FinishAttemptRequest(BaseModel):
    """Request to finish an attempt."""
    testId: str = Field(..., min_length=1)
    totalDurationMs: int = 0


def _own_attempt_or_404(db: DbSession, attempt_id: str, user_id: int):
    """Fetch the attempt and raise 404 if it doesn't belong to `user_id`.

    404 (not 403) on the wrong-owner case to avoid leaking attempt-id
    existence to other users.
    """
    attempt = get_attempt(db, attempt_id)
    if not attempt or attempt.user_id != user_id:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return attempt


@router.post("/start")
def start_new_attempt(
    payload: StartAttemptRequest,
    db: Annotated[DbSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Start a new test attempt for the current user."""
    attempt_id = validate_id("attemptId", payload.attemptId)
    test_id = validate_id("testId", payload.testId)
    validate_test_exists(db, test_id)

    attempt = start_attempt(
        db=db,
        attempt_id=attempt_id,
        test_id=test_id,
        user_id=current_user.id,
        settings=payload.settings,
        questions=payload.questions,
    )

    return {
        "status": "started",
        "attemptId": attempt.id,
        "testId": attempt.test_id,
        "questionCount": attempt.question_count,
    }


@router.post("/{attempt_id}/answer")
def record_attempt_answer(
    attempt_id: str,
    payload: RecordAnswerRequest,
    db: Annotated[DbSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Record an answer for a question in the attempt."""
    attempt_id = validate_id("attemptId", attempt_id)
    test_id = validate_id("testId", payload.testId)

    attempt = _own_attempt_or_404(db, attempt_id, current_user.id)
    if attempt.test_id != test_id:
        raise HTTPException(status_code=400, detail="Mismatched testId")

    if payload.isSkipped:
        answer = skip_question(
            db=db,
            attempt_id=attempt_id,
            question_id=payload.questionId,
            duration_ms=payload.durationMs,
        )
    else:
        answer = record_answer(
            db=db,
            attempt_id=attempt_id,
            question_id=payload.questionId,
            answer_index=payload.answerIndex,
            canonical_answer_index=payload.canonicalAnswerIndex,
            duration_ms=payload.durationMs,
        )

    # Security: hide isCorrect when show_answers is off — prevents probing all options
    show_answers = attempt.settings.get("showAnswersImmediately", True)
    is_correct_response = answer.is_correct if show_answers else None

    return {
        "status": "recorded",
        "attemptId": attempt_id,
        "questionId": answer.question_id,
        "isCorrect": is_correct_response,
    }


@router.post("/{attempt_id}/finish")
def finish_test_attempt(
    attempt_id: str,
    payload: FinishAttemptRequest,
    db: Annotated[DbSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Finish an attempt and calculate final statistics."""
    attempt_id = validate_id("attemptId", attempt_id)
    test_id = validate_id("testId", payload.testId)

    attempt = _own_attempt_or_404(db, attempt_id, current_user.id)
    if attempt.test_id != test_id:
        raise HTTPException(status_code=400, detail="Mismatched testId")

    attempt = finish_attempt(
        db=db,
        attempt_id=attempt_id,
        total_duration_ms=payload.totalDurationMs,
    )

    return {
        "status": "finished",
        "attemptId": attempt.id,
        "questionCount": attempt.question_count,
        "answeredCount": attempt.answered_count,
        "correctCount": attempt.correct_count,
        "percentCorrect": attempt.percent_correct,
        "totalDurationMs": attempt.total_duration_ms,
    }


@router.post("/{attempt_id}/abandon")
def abandon_test_attempt(
    attempt_id: str,
    db: Annotated[DbSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Mark an attempt as abandoned (user left without finishing)."""
    attempt_id = validate_id("attemptId", attempt_id)

    _own_attempt_or_404(db, attempt_id, current_user.id)

    attempt = abandon_attempt(db, attempt_id)
    return {
        "status": "abandoned",
        "attemptId": attempt.id,
    }


@router.get("/{attempt_id}")
def get_attempt_details(
    attempt_id: str,
    db: Annotated[DbSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Get details for a specific attempt (must belong to current user)."""
    attempt_id = validate_id("attemptId", attempt_id)
    attempt = _own_attempt_or_404(db, attempt_id, current_user.id)

    # Format answers for response
    answers = []
    for answer in sorted(attempt.answers, key=lambda a: a.question_index):
        answers.append({
            "questionId": answer.question_id,
            "questionIndex": answer.question_index,
            "answerIndex": answer.answer_index,
            "isCorrect": answer.is_correct,
            "isSkipped": answer.is_skipped,
            "durationMs": answer.duration_ms,
        })

    return {
        "attemptId": attempt.id,
        "testId": attempt.test_id,
        "userId": attempt.user_id,
        "status": attempt.status,
        "startedAt": attempt.started_at.isoformat() if attempt.started_at else None,
        "finishedAt": attempt.finished_at.isoformat() if attempt.finished_at else None,
        "questionCount": attempt.question_count,
        "answeredCount": attempt.answered_count,
        "correctCount": attempt.correct_count,
        "percentCorrect": attempt.percent_correct,
        "totalDurationMs": attempt.total_duration_ms,
        "settings": attempt.settings,
        "answers": answers,
    }
