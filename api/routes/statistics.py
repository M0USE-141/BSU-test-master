"""Statistics endpoints using SQLite database."""
import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.responses import StreamingResponse
import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.db.user import User
from api.services import access_service
from api.services.stats_service import (
    get_attempt_stats,
    get_attempts_list,
    get_aggregate_stats,
    get_test_owner_stats,
    get_weak_questions,
    get_streak,
    get_owner_kpis,
    get_owner_question_difficulty,
    get_score_distribution,
    get_activity_by_week,
    get_activity_heatmap,
)
from api.models.db.attempt import Attempt, AttemptStatus
from api.utils import validate_id, validate_test_exists
from api.utils.validation import TEST_ID_PATTERN


router = APIRouter(prefix="/api", tags=["statistics"])


def parse_date(date_str: str | None) -> datetime | None:
    """Parse ISO date string to datetime, raising 400 on invalid input."""
    if not date_str:
        return None
    try:
        if "T" in date_str:
            return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return datetime.fromisoformat(date_str + "T00:00:00")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {date_str!r}")


@router.get("/stats/attempts")
def list_attempt_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    test_id: str | None = Query(None, alias="testId"),
    start_date: str | None = Query(None, alias="startDate"),
    end_date: str | None = Query(None, alias="endDate"),
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """List the current user's attempts with optional filters."""
    if test_id:
        test_id = validate_id("testId", test_id)

    attempts, total = get_attempts_list(
        db=db,
        user_id=current_user.id,
        test_id=test_id,
        status=status,
        start_date=parse_date(start_date),
        end_date=parse_date(end_date),
        limit=limit,
        offset=offset,
    )

    return {
        "attempts": attempts,
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/stats/attempts.csv")
def export_attempts_csv(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    test_id: str | None = Query(None, alias="testId"),
    status: str | None = Query(None),
) -> StreamingResponse:
    """Stream attempts as CSV. Owners can scope by testId; otherwise own only."""
    if test_id:
        test_id = validate_id("testId", test_id)

    # If a test is scoped and caller is its owner, fetch all attempts of the
    # test. Otherwise scope to caller's own attempts.
    if test_id and access_service.can_edit_test(db, test_id, current_user):
        attempts, _ = get_attempts_list(db=db, test_id=test_id, status=status, limit=10000)
    else:
        attempts, _ = get_attempts_list(
            db=db,
            user_id=current_user.id,
            test_id=test_id,
            status=status,
            limit=10000,
        )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "attemptId", "testId", "userId", "status",
        "startedAt", "finishedAt", "durationMs",
        "questionCount", "answeredCount", "correctCount", "percentCorrect",
    ])
    for a in attempts:
        writer.writerow([
            a.get("attemptId", ""),
            a.get("testId", ""),
            a.get("userId", "") or "",
            a.get("status", ""),
            a.get("startedAt", "") or "",
            a.get("finishedAt", "") or "",
            a.get("totalDurationMs", 0),
            a.get("questionCount", 0),
            a.get("answeredCount", 0),
            a.get("correctCount", 0),
            round(a.get("percentCorrect", 0) or 0, 1),
        ])

    buf.seek(0)
    filename = "attempts" + (("-" + test_id) if test_id else "") + ".csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/stats/attempts/{attempt_id}")
def get_single_attempt_stats(
    attempt_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    """
    Get detailed statistics for a single attempt.

    Returns full attempt data including per-question breakdown with
    question snapshots for preview. The attempt must belong to the
    current user (404 if not — avoid leaking attempt-id existence).
    """
    attempt_id = validate_id("attemptId", attempt_id)

    stats = get_attempt_stats(db, attempt_id)
    if not stats or stats.get("userId") != current_user.id:
        raise HTTPException(status_code=404, detail="Attempt not found")

    return stats


@router.get("/stats/aggregate")
def get_aggregate_statistics(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    test_id: str | None = Query(None, alias="testId"),
    start_date: str | None = Query(None, alias="startDate"),
    end_date: str | None = Query(None, alias="endDate"),
) -> dict[str, Any]:
    """
    Aggregate stats for the authenticated user (current_user-scoped).

    Kept as a separate endpoint from `/stats/me/aggregate` for back-compat
    with FE callers that hit either path; both now require auth.
    """
    if test_id:
        test_id = validate_id("testId", test_id)

    return get_aggregate_stats(
        db=db,
        user_id=current_user.id,
        test_id=test_id,
        start_date=parse_date(start_date),
        end_date=parse_date(end_date),
    )


@router.get("/tests/{test_id}/statistics")
def get_test_statistics(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    start_date: str | None = Query(None, alias="startDate"),
    end_date: str | None = Query(None, alias="endDate"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """
    Get statistics for a test (owner only).

    Returns aggregated statistics for all attempts on this test,
    including per-user breakdown.
    """
    validate_test_exists(db, test_id)

    # Check if user is owner
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can view test statistics")

    return get_test_owner_stats(
        db=db,
        test_id=test_id,
        start_date=parse_date(start_date),
        end_date=parse_date(end_date),
        limit=limit,
        offset=offset,
    )


@router.get("/stats/me/aggregate")
def get_my_aggregate_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    test_id: str | None = Query(None, alias="testId"),
) -> dict[str, Any]:
    """Aggregate stats for the authenticated user."""
    if test_id:
        test_id = validate_id("testId", test_id)
    return get_aggregate_stats(db=db, user_id=current_user.id, test_id=test_id)


@router.get("/stats/heatmap")
def get_heatmap(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    weeks: int = Query(12, ge=1, le=52),
) -> dict[str, Any]:
    """Activity heatmap: daily completed-attempt counts for the last N weeks."""
    return get_activity_heatmap(db, current_user.id, weeks)


@router.get("/tests/{test_id}/weak-questions")
def list_weak_questions(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    """Personal weak questions (correct rate < 60%) for authenticated user."""
    validate_test_exists(db, test_id)
    return {"questions": get_weak_questions(db, test_id, current_user.id)}


@router.get("/stats/streak")
def get_user_streak(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    """Current consecutive-day streak for logged-in user."""
    return {"streak": get_streak(db, current_user.id)}


@router.get("/tests/{test_id}/owner-analytics")
def get_owner_analytics(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    """Full owner analytics: KPIs, question difficulty, score distribution, activity."""
    validate_test_exists(db, test_id)
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can view analytics")

    return {
        "kpis": get_owner_kpis(db, test_id),
        "questionDifficulty": get_owner_question_difficulty(db, test_id),
        "scoreDistribution": get_score_distribution(db, test_id),
        "activityByWeek": get_activity_by_week(db, test_id),
    }


@router.get("/stats/me/trend")
def get_my_trend(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    days: int = Query(30, ge=7, le=365),
) -> dict[str, Any]:
    """
    Per-user score trend: daily avg_score + attempts_count for the last N days.
    Returns [{date, avg_score, attempts_count}, ...] sorted ascending.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (
        db.execute(
            select(
                func.date(Attempt.started_at).label("date"),
                func.avg(
                    func.cast(Attempt.correct_count, sa.Float())
                    / func.cast(func.nullif(Attempt.question_count, 0), sa.Float())
                    * 100
                ).label("avg_score"),
                func.count(Attempt.id).label("attempts_count"),
            )
            .where(
                Attempt.user_id == current_user.id,
                Attempt.status == AttemptStatus.COMPLETED.value,
                Attempt.started_at >= since,
            )
            .group_by(func.date(Attempt.started_at))
            .order_by(func.date(Attempt.started_at))
        )
        .all()
    )

    return {
        "trend": [
            {
                "date": str(row.date),
                "avg_score": round(row.avg_score or 0, 1),
                "attempts_count": row.attempts_count,
            }
            for row in rows
        ],
        "days": days,
    }
