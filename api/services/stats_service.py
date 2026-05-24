"""Service layer for statistics using SQLite database."""
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, select, text
from sqlalchemy.orm import Session as DBSession

from api.models.db.attempt import Attempt, AttemptAnswer, AttemptStatus
from api.models.db.question_performance import QuestionPerformance


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
        "clientId": attempt.client_id,
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
    client_id: str | None = None,
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
    """
    # Build base query
    query = select(Attempt)
    count_query = select(func.count(Attempt.id))

    # Apply filters
    conditions = []
    if client_id:
        conditions.append(Attempt.client_id == client_id)
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
            "clientId": attempt.client_id,
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
    client_id: str | None = None,
    user_id: int | None = None,
    test_id: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> dict[str, Any]:
    """
    Calculate aggregate statistics across multiple attempts using server-side SQL.
    """
    conditions = [Attempt.status == AttemptStatus.COMPLETED.value]
    if client_id:
        conditions.append(Attempt.client_id == client_id)
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
        func.avg(Attempt.percent_correct).label("avg_percent"),
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
            func.avg(Attempt.percent_correct).label("avg_percent"),
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
            "clientId": attempt.client_id,
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
    threshold: float = 0.6,
    limit: int = 10,
) -> list[dict]:
    """Return questions where personal correct rate < threshold (default 60%). Worst first."""
    rows = db.execute(
        select(QuestionPerformance)
        .where(
            QuestionPerformance.test_id == test_id,
            QuestionPerformance.user_id == user_id,
            QuestionPerformance.total_count > 0,
        )
        .order_by(
            (QuestionPerformance.correct_count * 1.0 / QuestionPerformance.total_count).asc()
        )
        .limit(limit)
    ).scalars().all()

    result = []
    for row in rows:
        rate = row.correct_count / row.total_count if row.total_count > 0 else 0.0
        if rate < threshold:
            result.append({
                "questionId": row.question_id,
                "correctCount": row.correct_count,
                "totalCount": row.total_count,
                "accuracyRate": round(rate * 100, 1),
                "avgDurationMs": row.total_duration_ms // row.total_count if row.total_count else 0,
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

    days = [date.fromisoformat(r[0]) for r in rows]
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


def get_activity_by_week(db: DBSession, test_id: str, weeks: int = 4) -> list[dict]:
    """Attempt count per ISO week, last N weeks."""
    rows = db.execute(
        text(
            "SELECT strftime('%Y-W%W', started_at) as week, COUNT(*) as cnt "
            "FROM attempts WHERE test_id = :tid AND status = 'completed' "
            "GROUP BY week ORDER BY week DESC LIMIT :w"
        ),
        {"tid": test_id, "w": weeks}
    ).fetchall()

    return [{"week": r[0], "count": r[1]} for r in reversed(rows)]
