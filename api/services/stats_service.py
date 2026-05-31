"""Service layer for statistics using SQLite database."""
from datetime import datetime
from typing import Any

from sqlalchemy import and_, cast, func, select, text
from sqlalchemy.types import String as SAString
from sqlalchemy.orm import Session as DBSession

from api.models.db.attempt import Attempt, AttemptAnswer, AttemptStatus
from api.models.db.question import Question
from api.models.db.question_performance import QuestionPerformance
from api.models.db.test_collection import TestCollection


# Accuracy rank thresholds (single source of truth — frontend only colors by rank).
ACC_GOLD = 90.0    # accuracy >= 90% -> gold (green); mastered, not weak
ACC_SILVER = 60.0  # 60% <= accuracy < 90% -> silver (yellow); below -> bronze (red)


def compute_accuracy(correct: int, total: int) -> tuple[float, str]:
    """Return (accuracy_percent, rank) for a personal per-question accuracy.

    accuracy = correct / total * 100. Never-answered (total == 0) is rank
    "none". A question is "weak" when accuracy < ACC_GOLD (mastered >= 90%).
    """
    if total == 0:
        return 0.0, "none"
    accuracy = round(correct / total * 100, 1)
    if accuracy >= ACC_GOLD:
        rank = "gold"
    elif accuracy >= ACC_SILVER:
        rank = "silver"
    else:
        rank = "bronze"
    return accuracy, rank


def get_attempt_stats(db: DBSession, attempt_id: str) -> dict[str, Any] | None:
    """
    Get statistics for a single attempt.
    Returns formatted statistics dict or None if attempt not found.
    """
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        return None

    # Get answers for per-question data
    answers = list(
        db.execute(
            select(AttemptAnswer)
            .where(AttemptAnswer.attempt_id == attempt_id)
            .order_by(AttemptAnswer.question_index)
        ).scalars().all()
    )

    return format_attempt_stats(attempt, answers)


def format_attempt_stats(
    attempt: Attempt,
    answers: list[AttemptAnswer] | None = None,
) -> dict[str, Any]:
    """Format attempt into statistics dict."""
    question_count = attempt.question_count or 0
    answered_count = attempt.answered_count or 0
    correct_count = attempt.correct_count or 0
    incorrect_count = answered_count - correct_count
    skipped_count = question_count - answered_count

    # Calculate percentages
    percent_correct = (correct_count / question_count * 100) if question_count else 0
    percent_incorrect = (incorrect_count / question_count * 100) if question_count else 0
    percent_unanswered = (skipped_count / question_count * 100) if question_count else 0

    # Accuracy = correct / answered (how accurate the given answers were)
    accuracy = (correct_count / answered_count * 100) if answered_count else 0

    # Answer rate = answered / total
    answer_rate = (answered_count / question_count * 100) if question_count else 0

    # Average time per question
    avg_time = 0
    if answers:
        total_duration = sum(a.duration_ms for a in answers if a.duration_ms)
        avg_time = total_duration / len(answers) if answers else 0

    # Build per-question data
    per_question = []
    if answers:
        for answer in answers:
            per_question.append({
                "questionId": answer.question_id,
                "index": answer.question_index,
                "isCorrect": answer.is_correct,
                "isSkipped": answer.is_skipped,
                "durationMs": answer.duration_ms,
                "answerIndex": answer.answer_index,
                # Question snapshot for preview
                "questionText": answer.question_text,
                "options": answer.options,
                "correctOptionIndex": answer.correct_option_index,
            })

    return {
        "attemptId": attempt.id,
        "testId": attempt.test_id,
        "userId": attempt.user_id,
        "status": attempt.status,
        "startedAt": attempt.started_at.isoformat() if attempt.started_at else None,
        "finishedAt": attempt.finished_at.isoformat() if attempt.finished_at else None,
        "totalDurationMs": attempt.total_duration_ms,
        "questionCount": question_count,
        "answeredCount": answered_count,
        "correctCount": correct_count,
        "incorrectCount": incorrect_count,
        "skippedCount": skipped_count,
        "percentCorrect": round(percent_correct, 1),
        "percentIncorrect": round(percent_incorrect, 1),
        "percentUnanswered": round(percent_unanswered, 1),
        "accuracy": round(accuracy, 1),
        "answerRate": round(answer_rate, 1),
        "avgTimePerQuestion": round(avg_time, 0),
        "settings": attempt.settings,
        "perQuestion": per_question,
    }


def get_attempts_list(
    db: DBSession,
    user_id: int | None = None,
    test_id: str | None = None,
    status: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """
    Get list of attempts with basic stats (for attempt list view).
    Returns tuple of (attempts_list, total_count).

    All attempts belong to a logged-in user — anonymous `client_id`
    tracking was removed. Callers must scope by `user_id` (own history)
    or `test_id` (owner analytics).
    """
    # Build base query
    query = select(Attempt)
    count_query = select(func.count(Attempt.id))

    # Apply filters
    conditions = []
    if user_id:
        conditions.append(Attempt.user_id == user_id)
    if test_id:
        conditions.append(Attempt.test_id == test_id)
    if status:
        conditions.append(Attempt.status == status)
    if start_date:
        conditions.append(Attempt.started_at >= start_date)
    if end_date:
        conditions.append(Attempt.started_at <= end_date)

    if conditions:
        query = query.where(and_(*conditions))
        count_query = count_query.where(and_(*conditions))

    # Get total count
    total = db.execute(count_query).scalar() or 0

    # Get paginated results
    query = query.order_by(Attempt.started_at.desc()).limit(limit).offset(offset)
    attempts = list(db.execute(query).scalars().all())

    # Format results (without per-question data for list view)
    results = []
    for attempt in attempts:
        results.append({
            "attemptId": attempt.id,
            "testId": attempt.test_id,
            "userId": attempt.user_id,
            "status": attempt.status,
            "startedAt": attempt.started_at.isoformat() if attempt.started_at else None,
            "finishedAt": attempt.finished_at.isoformat() if attempt.finished_at else None,
            "totalDurationMs": attempt.total_duration_ms,
            "questionCount": attempt.question_count,
            "answeredCount": attempt.answered_count,
            "correctCount": attempt.correct_count,
            "percentCorrect": attempt.percent_correct,
        })

    return results, total


def get_aggregate_stats(
    db: DBSession,
    user_id: int | None = None,
    test_id: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> dict[str, Any]:
    """
    Calculate aggregate statistics across multiple attempts using server-side SQL.
    """
    conditions = [Attempt.status == AttemptStatus.COMPLETED.value]
    if user_id:
        conditions.append(Attempt.user_id == user_id)
    if test_id:
        conditions.append(Attempt.test_id == test_id)
    if start_date:
        conditions.append(Attempt.started_at >= start_date)
    if end_date:
        conditions.append(Attempt.started_at <= end_date)

    # Single aggregate query — no full object materialisation
    agg_stmt = select(
        func.count(Attempt.id).label("attempt_count"),
        func.coalesce(func.sum(Attempt.question_count), 0).label("total_questions"),
        func.coalesce(func.sum(Attempt.answered_count), 0).label("total_answered"),
        func.coalesce(func.sum(Attempt.correct_count), 0).label("total_correct"),
        func.coalesce(func.sum(Attempt.total_duration_ms), 0).label("total_duration"),
        func.avg(
            Attempt.correct_count * 100.0 / func.nullif(Attempt.question_count, 0)
        ).label("avg_percent"),
    ).where(and_(*conditions))

    row = db.execute(agg_stmt).one()

    if not row.attempt_count:
        return {
            "attemptCount": 0,
            "totalQuestions": 0,
            "totalAnswered": 0,
            "totalCorrect": 0,
            "avgPercentCorrect": 0,
            "avgTimePerQuestion": 0,
            "totalDurationMs": 0,
        }

    avg_time = row.total_duration / row.total_questions if row.total_questions else 0

    return {
        "attemptCount": row.attempt_count,
        "totalQuestions": row.total_questions,
        "totalAnswered": row.total_answered,
        "totalCorrect": row.total_correct,
        "avgPercentCorrect": round(row.avg_percent or 0, 1),
        "avgTimePerQuestion": round(avg_time, 0),
        "totalDurationMs": row.total_duration,
    }


def get_test_owner_stats(
    db: DBSession,
    test_id: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """
    Get statistics for a test (for test owners).
    Shows all users who attempted the test.
    """
    base_conditions = [
        Attempt.test_id == test_id,
        Attempt.status == AttemptStatus.COMPLETED.value,
    ]
    if start_date:
        base_conditions.append(Attempt.started_at >= start_date)
    if end_date:
        base_conditions.append(Attempt.started_at <= end_date)

    count_query = select(func.count(Attempt.id)).where(and_(*base_conditions))
    total = db.execute(count_query).scalar() or 0

    # Paginated attempt list
    list_query = (
        select(Attempt)
        .where(and_(*base_conditions))
        .order_by(Attempt.started_at.desc())
        .limit(limit)
        .offset(offset)
    )
    attempts = list(db.execute(list_query).scalars().all())

    # Server-side aggregate totals (no in-memory summation)
    if total > 0:
        agg_stmt = select(
            func.coalesce(func.sum(Attempt.correct_count), 0).label("total_correct"),
            func.coalesce(func.sum(Attempt.question_count), 0).label("total_questions"),
            func.avg(
                Attempt.correct_count * 100.0 / func.nullif(Attempt.question_count, 0)
            ).label("avg_percent"),
        ).where(and_(*base_conditions))
        agg = db.execute(agg_stmt).one()
        total_correct = int(agg.total_correct or 0)
        total_questions = int(agg.total_questions or 0)
        avg_percent = float(agg.avg_percent or 0)
    else:
        total_correct = 0
        total_questions = 0
        avg_percent = 0.0

    # Format attempt list
    attempt_list = []
    for attempt in attempts:
        attempt_list.append({
            "attemptId": attempt.id,
            "userId": attempt.user_id,
            "startedAt": attempt.started_at.isoformat() if attempt.started_at else None,
            "finishedAt": attempt.finished_at.isoformat() if attempt.finished_at else None,
            "questionCount": attempt.question_count,
            "correctCount": attempt.correct_count,
            "percentCorrect": attempt.percent_correct,
            "totalDurationMs": attempt.total_duration_ms,
        })

    return {
        "testId": test_id,
        "totalAttempts": total,
        "totalCorrect": total_correct,
        "totalQuestions": total_questions,
        "avgPercentCorrect": round(avg_percent, 1),
        "attempts": attempt_list,
    }


def get_weak_questions(
    db: DBSession,
    test_id: str,
    user_id: int,
    threshold: float = 0.9,
    limit: int = 10,
) -> list[dict]:
    """Return questions where personal correct rate < threshold (default 90%). Worst first."""
    rows = db.execute(
        select(QuestionPerformance)
        .where(
            QuestionPerformance.test_id == test_id,
            QuestionPerformance.user_id == user_id,
            QuestionPerformance.total_count > 0,
            QuestionPerformance.correct_count * 1.0 / QuestionPerformance.total_count < threshold,
        )
        .order_by(
            (QuestionPerformance.correct_count * 1.0 / QuestionPerformance.total_count).asc()
        )
        .limit(limit)
    ).scalars().all()

    result = []
    for row in rows:
        rate = row.correct_count / row.total_count
        result.append({
            "questionId": row.question_id,
            "correctCount": row.correct_count,
            "totalCount": row.total_count,
            "accuracyRate": round(rate * 100, 1),
            "avgDurationMs": row.total_duration_ms // row.total_count,
        })
    return result


def get_my_question_stats(db: DBSession, test_id: str, user_id: int) -> list[dict]:
    """Per-question personal accuracy for every question of a test.

    Enumerates ALL questions (LEFT JOIN performance) so never-answered
    questions appear with correct=0,total=0,rank="none" — powers the
    "untaken" practice source. Ordered by question order_index.

    JOIN KEY: the stable public id `payload["id"]` (NOT `order_index`, which
    shifts on delete, and NOT `Question.id`, a UUID). `question_performance.
    question_id` stores this same public id (the serializer/frontend id).
    """
    rows = db.execute(
        select(
            Question.payload["id"],
            QuestionPerformance.correct_count,
            QuestionPerformance.total_count,
            QuestionPerformance.total_duration_ms,
        )
        .join(TestCollection, Question.test_collection_id == TestCollection.id)
        .outerjoin(
            QuestionPerformance,
            and_(
                cast(QuestionPerformance.question_id, SAString)
                == cast(Question.payload["id"], SAString),
                QuestionPerformance.user_id == user_id,
                QuestionPerformance.test_id == test_id,
            ),
        )
        .where(TestCollection.test_id == test_id)
        .order_by(Question.order_index)
    ).all()

    result: list[dict] = []
    for pid_raw, correct, total, dur in rows:
        try:
            qid = int(pid_raw)
        except (TypeError, ValueError):
            continue
        correct = correct or 0
        total = total or 0
        accuracy, rank = compute_accuracy(correct, total)
        result.append({
            "questionId": qid,
            "correct": correct,
            "total": total,
            "accuracy": accuracy,
            "rank": rank,
            "avgDurationMs": ((dur or 0) // total) if total else 0,
        })
    return result


def get_streak(db: DBSession, user_id: int) -> int:
    """Compute current consecutive-day streak from completed attempts."""
    from datetime import date, timedelta

    rows = db.execute(
        text(
            "SELECT DISTINCT DATE(started_at) as day FROM attempts "
            "WHERE user_id = :uid AND status = 'completed' "
            "ORDER BY day DESC"
        ),
        {"uid": user_id}
    ).fetchall()

    if not rows:
        return 0

    # Postgres returns DATE columns as `datetime.date` objects; SQLite
    # returns them as ISO-format strings. Normalize.
    days = [
        r[0] if isinstance(r[0], date) else date.fromisoformat(r[0])
        for r in rows
    ]
    today = date.today()
    streak = 0
    current = today

    for day in days:
        if day == current or day == current - timedelta(days=1):
            streak += 1
            current = day
        else:
            break

    return streak


def get_owner_kpis(db: DBSession, test_id: str) -> dict:
    """4 KPI cards for owner analytics: totalAttempts, uniqueStudents, avgScore, passRate."""
    row = db.execute(
        select(
            func.count(Attempt.id).label("total_attempts"),
            func.count(func.distinct(Attempt.user_id)).label("unique_students"),
            func.avg(
                Attempt.correct_count * 100.0 / func.nullif(Attempt.question_count, 0)
            ).label("avg_score"),
        )
        .where(
            Attempt.test_id == test_id,
            Attempt.status == "completed",
        )
    ).one()

    total = row.total_attempts or 0
    pass_count = db.execute(
        select(func.count(Attempt.id))
        .where(
            Attempt.test_id == test_id,
            Attempt.status == "completed",
            Attempt.correct_count * 100.0 / func.nullif(Attempt.question_count, 0) >= 60,
        )
    ).scalar() or 0

    return {
        "totalAttempts": total,
        "uniqueStudents": row.unique_students or 0,
        "avgScore": round(float(row.avg_score or 0.0), 1),
        "passRate": round((pass_count / total * 100) if total > 0 else 0.0, 1),
    }


def get_owner_question_difficulty(db: DBSession, test_id: str) -> list[dict]:
    """Question difficulty across ALL users for test owner. Ordered worst first."""
    rows = db.execute(
        select(
            QuestionPerformance.question_id,
            func.sum(QuestionPerformance.correct_count).label("total_correct"),
            func.sum(QuestionPerformance.total_count).label("total_attempts"),
            func.sum(QuestionPerformance.total_duration_ms).label("total_dur"),
        )
        .where(QuestionPerformance.test_id == test_id)
        .group_by(QuestionPerformance.question_id)
        .order_by(
            (func.sum(QuestionPerformance.correct_count) * 1.0 /
             func.sum(QuestionPerformance.total_count)).asc()
        )
    ).all()

    result = []
    for row in rows:
        total = row.total_attempts or 0
        correct = row.total_correct or 0
        rate = (correct / total * 100) if total > 0 else 0.0
        result.append({
            "questionId": row.question_id,
            "correctRate": round(rate, 1),
            "totalAttempts": total,
            "avgDurationMs": (row.total_dur // total) if total > 0 else 0,
        })
    return result


def get_score_distribution(db: DBSession, test_id: str) -> list[dict]:
    """Score distribution in 10% buckets across all completed attempts."""
    rows = db.execute(
        select(Attempt.correct_count * 100.0 / func.nullif(Attempt.question_count, 0))
        .where(
            Attempt.test_id == test_id,
            Attempt.status == "completed",
        )
    ).scalars().all()

    buckets = [0] * 10
    for pct in rows:
        idx = min(int((pct or 0) // 10), 9)
        buckets[idx] += 1

    return [
        {"bucket": f"{i*10}-{(i+1)*10}%", "count": buckets[i]}
        for i in range(10)
    ]


def get_activity_heatmap(db: DBSession, user_id: int, weeks: int = 12) -> dict:
    """Return daily attempt counts for the last N weeks (for heatmap rendering)."""
    from datetime import date, timedelta

    total_days = weeks * 7
    today = date.today()
    start_date = today - timedelta(days=total_days - 1)

    rows = db.execute(
        text(
            "SELECT DATE(finished_at) as day, COUNT(*) as cnt "
            "FROM attempts "
            "WHERE user_id = :uid AND status = 'completed' "
            "  AND finished_at >= :start "
            "GROUP BY DATE(finished_at)"
        ),
        {"uid": user_id, "start": start_date.isoformat()}
    ).fetchall()

    counts = {r[0]: r[1] for r in rows}

    days = []
    for i in range(total_days):
        d = (start_date + timedelta(days=i)).isoformat()
        days.append({"date": d, "count": counts.get(d, 0)})

    return {"days": days, "weeks": weeks}


def get_activity_by_week(db: DBSession, test_id: str, weeks: int = 4) -> list[dict]:
    """Attempt count per ISO week, last N weeks.

    Dialect-aware: `strftime` is SQLite-only. On Postgres we use
    `to_char(ts, 'IYYY-"W"IW')` which yields the same `YYYY-Www` format
    (ISO year + ISO week, e.g. `2026-W22`). The prod incident that
    surfaced this: `psycopg2.errors.UndefinedFunction: function
    strftime(unknown, timestamp with time zone) does not exist` →
    `GET /api/tests/.../owner-analytics` returned 500.
    """
    dialect = db.bind.dialect.name if db.bind is not None else "sqlite"
    if dialect == "postgresql":
        # `IYYY` = ISO year, `IW` = ISO week number (01-53), `"W"`
        # injects a literal "W" between them. Matches the SQLite format.
        week_expr = "to_char(started_at, 'IYYY-\"W\"IW')"
    else:
        week_expr = "strftime('%Y-W%W', started_at)"

    rows = db.execute(
        text(
            f"SELECT {week_expr} as week, COUNT(*) as cnt "
            "FROM attempts WHERE test_id = :tid AND status = 'completed' "
            "GROUP BY week ORDER BY week DESC LIMIT :w"
        ),
        {"tid": test_id, "w": weeks}
    ).fetchall()

    return [{"week": r[0], "count": r[1]} for r in reversed(rows)]
