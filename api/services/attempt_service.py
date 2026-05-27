"""Service layer for attempts using SQLite database."""
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, func, text
from sqlalchemy.orm import Session as DBSession, joinedload

from api.models.db.attempt import Attempt, AttemptAnswer, AttemptStatus
from api.models.db.question_performance import QuestionPerformance


# ── Mode rules — defence-in-depth match for the client-side gating ──
#
# Defining the rules once on the server lets us reject malicious or
# stale clients that try to take an "Экзамен" with no timer / a fake
# reveal flag. Mirrors what pre-test.js + taking.js enforce visually.
#
# Reference:
#   training        — anything goes.
#   timed           — timer required (positive), no auto-submit
#                     (we never auto-finish from the backend; the
#                     frontend is the soft cap).
#   exam            — timer required (positive); reveal must be false;
#                     order must be 'random'; no flags expected.
#   mistake_review  — informational; question list is fully client-built
#                     so we don't constrain settings here.

_VALID_MODES = {"training", "timed", "exam", "mistake_review"}

# Per-question time budgets in seconds — server hard ceilings, not the
# UI presets. Keep them generous so a slow custom value still fits.
_MODE_MAX_SECONDS_PER_Q = {"timed": 120, "exam": 60}  # plus a floor of 60s
_MODE_MIN_TIME_SECONDS = 60   # at least 60s no matter how few questions


def _validate_mode_settings(settings: dict[str, Any], question_count: int) -> None:
    """Reject settings that contradict the declared mode.

    Question_count comes from the client-supplied questions[] list (the
    same list we store snapshots from). Passing 0 disables the time-cap
    check — it'll just enforce the mode/timer presence.
    """
    if not isinstance(settings, dict):
        return  # legacy clients sending no settings — accept

    raw_mode = settings.get("mode")
    if raw_mode is None:
        return  # legacy clients sending no mode — accept (training default)
    mode = str(raw_mode).lower()
    if mode not in _VALID_MODES:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_mode", "mode": raw_mode},
        )

    if mode in {"timed", "exam"}:
        tls = settings.get("timeLimitSeconds")
        if tls is None or not isinstance(tls, (int, float)) or tls <= 0:
            raise HTTPException(
                status_code=400,
                detail={"code": "time_limit_required", "mode": mode},
            )
        # Cap the timer at a generous multiple of the question count so a
        # client can't issue a 24-hour "Экзамен" and abuse the snapshot.
        per_q = _MODE_MAX_SECONDS_PER_Q.get(mode, 120)
        cap = max(_MODE_MIN_TIME_SECONDS, question_count * per_q)
        if tls > cap:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "time_limit_too_long",
                    "mode": mode,
                    "maxSeconds": cap,
                    "got": int(tls),
                },
            )

    if mode == "exam":
        # Exam locks reveal off + shuffled questions.
        if settings.get("showAnswersImmediately") is True:
            raise HTTPException(
                status_code=400,
                detail={"code": "reveal_forbidden_in_exam"},
            )
        order = settings.get("order")
        if order is not None and order != "random":
            raise HTTPException(
                status_code=400,
                detail={"code": "shuffle_required_in_exam", "got": order},
            )


def get_or_create_attempt(
    db: DBSession,
    attempt_id: str,
    test_id: str,
    client_id: str,
    user_id: int | None = None,
    settings: dict[str, Any] | None = None,
) -> Attempt:
    """
    Get existing attempt or create a new one.
    Validates that test_id and client_id match for existing attempts.
    """
    attempt = db.get(Attempt, attempt_id)

    if attempt:
        # Validate existing attempt matches
        if attempt.test_id != test_id:
            raise HTTPException(status_code=400, detail="Mismatched testId")
        if attempt.client_id != client_id:
            raise HTTPException(status_code=400, detail="Mismatched clientId")
        return attempt

    # Create new attempt
    attempt = Attempt(
        id=attempt_id,
        test_id=test_id,
        client_id=client_id,
        user_id=user_id,
        status=AttemptStatus.IN_PROGRESS.value,
    )
    if settings:
        attempt.settings = settings

    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


def start_attempt(
    db: DBSession,
    attempt_id: str,
    test_id: str,
    client_id: str,
    user_id: int | None = None,
    settings: dict[str, Any] | None = None,
    questions: list[dict[str, Any]] | None = None,
) -> Attempt:
    """
    Start a new attempt with question snapshots.

    Args:
        db: Database session
        attempt_id: Unique attempt identifier
        test_id: Test being attempted
        client_id: Client identifier (for anonymous users)
        user_id: Optional authenticated user ID
        settings: Attempt settings (question count, randomization, etc.)
        questions: List of questions in the attempt (from session)
    """
    # Validate mode rules before persisting anything. Skipped when the
    # attempt already exists (clients resuming an in-progress attempt
    # don't re-pass settings).
    if settings is not None and db.get(Attempt, attempt_id) is None:
        _validate_mode_settings(settings, len(questions or []))

    attempt = get_or_create_attempt(
        db, attempt_id, test_id, client_id, user_id, settings
    )

    # Store question snapshots
    if questions:
        attempt.question_count = len(questions)

        for index, q_data in enumerate(questions):
            question_id = q_data.get("questionId")
            if not isinstance(question_id, int):
                continue

            # Check if answer already exists
            existing = db.execute(
                select(AttemptAnswer).where(
                    AttemptAnswer.attempt_id == attempt_id,
                    AttemptAnswer.question_id == question_id,
                )
            ).scalar_one_or_none()

            if existing:
                continue

            # Get question data from session format
            q_obj = q_data.get("question", {})

            answer = AttemptAnswer(
                attempt_id=attempt_id,
                question_id=question_id,
                question_index=index,
                is_skipped=True,  # Default to skipped until answered
            )

            # Store question snapshot for preview
            if isinstance(q_obj, dict):
                answer.question_text = q_obj.get("question")
                answer.options = q_obj.get("options", [])

                # Find correct option index
                correct_opt = q_obj.get("correct")
                options = q_obj.get("options", [])
                if correct_opt and options:
                    for idx, opt in enumerate(options):
                        if opt == correct_opt or (
                            isinstance(opt, dict)
                            and isinstance(correct_opt, dict)
                            and opt.get("isCorrect")
                        ):
                            answer.correct_option_index = idx
                            break

            db.add(answer)

        db.commit()
        db.refresh(attempt)

    return attempt


def record_answer(
    db: DBSession,
    attempt_id: str,
    question_id: int,
    answer_index: int | None,
    duration_ms: int = 0,
    is_skipped: bool = False,
    canonical_answer_index: int | None = None,
) -> AttemptAnswer:
    """
    Record or update an answer for a question in an attempt.
    is_correct is computed server-side from the stored correct_option_index snapshot.
    """
    answer = db.execute(
        select(AttemptAnswer).where(
            AttemptAnswer.attempt_id == attempt_id,
            AttemptAnswer.question_id == question_id,
        )
    ).scalar_one_or_none()

    if not answer:
        answer = AttemptAnswer(
            attempt_id=attempt_id,
            question_id=question_id,
            question_index=0,
        )
        db.add(answer)

    # Compute correctness server-side — never trust client-sent value
    if is_skipped or answer_index is None:
        computed_correct = None
    elif answer.correct_option_index is not None:
        computed_correct = answer_index == answer.correct_option_index
    else:
        # No snapshot available (legacy attempt); fall back to None (unknown)
        computed_correct = None

    answer.answer_index = answer_index
    answer.canonical_answer_index = canonical_answer_index
    answer.is_correct = computed_correct
    answer.is_skipped = is_skipped
    answer.duration_ms = duration_ms
    answer.answered_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(answer)
    return answer


def skip_question(
    db: DBSession,
    attempt_id: str,
    question_id: int,
    duration_ms: int = 0,
) -> AttemptAnswer:
    """Mark a question as skipped."""
    return record_answer(
        db,
        attempt_id,
        question_id,
        answer_index=None,
        duration_ms=duration_ms,
        is_skipped=True,
    )


def finish_attempt(
    db: DBSession,
    attempt_id: str,
    total_duration_ms: int = 0,
) -> Attempt:
    """
    Finish an attempt and calculate final statistics.
    """
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # Calculate final statistics from answers
    answers = db.execute(
        select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt_id)
    ).scalars().all()

    answered_count = 0
    correct_count = 0

    for answer in answers:
        if not answer.is_skipped and answer.answer_index is not None:
            answered_count += 1
            if answer.is_correct:
                correct_count += 1

    # Update attempt
    attempt.status = AttemptStatus.COMPLETED.value
    attempt.finished_at = datetime.now(timezone.utc)
    attempt.total_duration_ms = total_duration_ms
    attempt.answered_count = answered_count
    attempt.correct_count = correct_count

    db.commit()
    db.refresh(attempt)

    # Upsert per-question performance aggregates
    upsert_question_performance(db, attempt)

    return attempt


def abandon_attempt(db: DBSession, attempt_id: str) -> Attempt | None:
    """Mark an attempt as abandoned."""
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        return None

    attempt.status = AttemptStatus.ABANDONED.value
    db.commit()
    db.refresh(attempt)
    return attempt


def get_attempt(db: DBSession, attempt_id: str) -> Attempt | None:
    """Get attempt by ID with answers loaded."""
    return db.execute(
        select(Attempt)
        .options(joinedload(Attempt.answers))
        .where(Attempt.id == attempt_id)
    ).unique().scalar_one_or_none()


def get_attempts_by_client(
    db: DBSession,
    client_id: str,
    test_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Attempt]:
    """
    Get attempts for a client, optionally filtered by test_id and status.
    """
    query = select(Attempt).where(Attempt.client_id == client_id)

    if test_id:
        query = query.where(Attempt.test_id == test_id)
    if status:
        query = query.where(Attempt.status == status)

    query = query.order_by(Attempt.started_at.desc()).limit(limit).offset(offset)

    return list(db.execute(query).scalars().all())


def get_attempts_by_user(
    db: DBSession,
    user_id: int,
    test_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Attempt]:
    """
    Get attempts for a user, optionally filtered by test_id and status.
    """
    query = select(Attempt).where(Attempt.user_id == user_id)

    if test_id:
        query = query.where(Attempt.test_id == test_id)
    if status:
        query = query.where(Attempt.status == status)

    query = query.order_by(Attempt.started_at.desc()).limit(limit).offset(offset)

    return list(db.execute(query).scalars().all())


def get_attempts_by_test(
    db: DBSession,
    test_id: str,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Attempt]:
    """
    Get all attempts for a test (for owner statistics).
    """
    query = select(Attempt).where(Attempt.test_id == test_id)

    if status:
        query = query.where(Attempt.status == status)

    query = query.order_by(Attempt.started_at.desc()).limit(limit).offset(offset)

    return list(db.execute(query).scalars().all())


def count_attempts(
    db: DBSession,
    client_id: str | None = None,
    user_id: int | None = None,
    test_id: str | None = None,
    status: str | None = None,
) -> int:
    """Count attempts matching criteria."""
    query = select(func.count(Attempt.id))

    if client_id:
        query = query.where(Attempt.client_id == client_id)
    if user_id:
        query = query.where(Attempt.user_id == user_id)
    if test_id:
        query = query.where(Attempt.test_id == test_id)
    if status:
        query = query.where(Attempt.status == status)

    return db.execute(query).scalar() or 0


def get_attempt_answers(db: DBSession, attempt_id: str) -> list[AttemptAnswer]:
    """Get all answers for an attempt, ordered by question index."""
    return list(
        db.execute(
            select(AttemptAnswer)
            .where(AttemptAnswer.attempt_id == attempt_id)
            .order_by(AttemptAnswer.question_index)
        ).scalars().all()
    )


def upsert_question_performance(db: DBSession, attempt: Attempt) -> None:
    """
    Upsert QuestionPerformance rows after attempt finalization.

    Uses INSERT OR IGNORE + UPDATE pattern for SQLite compatibility.
    Handles NULL user_id (anonymous) by using IS NULL comparison in the
    UPDATE WHERE clause, since SQLite does not consider NULL == NULL in
    unique constraints.
    """
    from datetime import datetime, timezone as tz
    now = datetime.now(tz.utc)

    answers = db.execute(
        select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.id)
    ).scalars().all()

    for answer in answers:
        if answer.is_skipped or answer.answer_index is None:
            continue

        is_correct_int = 1 if answer.is_correct else 0
        dur = answer.duration_ms or 0

        # INSERT OR IGNORE creates the row if it doesn't exist yet
        # We use a sentinel for the unique constraint: NULL user_id is stored as-is
        # but the UPDATE uses IS NULL comparison to target the right row
        db.execute(
            text(
                "INSERT OR IGNORE INTO question_performance "
                "(test_id, user_id, question_id, correct_count, total_count, "
                "total_duration_ms, last_seen_at) "
                "VALUES (:test_id, :user_id, :qid, 0, 0, 0, NULL)"
            ),
            {
                "test_id": attempt.test_id,
                "user_id": attempt.user_id,
                "qid": answer.question_id,
            }
        )

        # UPDATE the matching row. For NULL user_id we use IS NULL comparison.
        if attempt.user_id is None:
            db.execute(
                text(
                    "UPDATE question_performance SET "
                    "correct_count = correct_count + :correct, "
                    "total_count = total_count + 1, "
                    "total_duration_ms = total_duration_ms + :dur, "
                    "last_seen_at = :now "
                    "WHERE test_id = :test_id AND question_id = :qid "
                    "AND user_id IS NULL"
                ),
                {
                    "correct": is_correct_int,
                    "dur": dur,
                    "now": now.isoformat(),
                    "test_id": attempt.test_id,
                    "qid": answer.question_id,
                }
            )
        else:
            db.execute(
                text(
                    "UPDATE question_performance SET "
                    "correct_count = correct_count + :correct, "
                    "total_count = total_count + 1, "
                    "total_duration_ms = total_duration_ms + :dur, "
                    "last_seen_at = :now "
                    "WHERE test_id = :test_id AND question_id = :qid "
                    "AND user_id = :user_id"
                ),
                {
                    "correct": is_correct_int,
                    "dur": dur,
                    "now": now.isoformat(),
                    "test_id": attempt.test_id,
                    "qid": answer.question_id,
                    "user_id": attempt.user_id,
                }
            )

    db.commit()


def delete_attempt(db: DBSession, attempt_id: str) -> bool:
    """Delete an attempt and all its answers."""
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        return False

    db.delete(attempt)
    db.commit()
    return True
