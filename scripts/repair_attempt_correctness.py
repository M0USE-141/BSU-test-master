"""One-time repair for attempts whose correctness was lost.

Background
----------
Answer correctness used to depend solely on the per-attempt snapshot
`attempt_answers.correct_option_index`, written by `POST /start`. When an
`/answer` write won the race against `/start` (or `/start` never ran), that
column stayed NULL, so `is_correct` was None and the answer was silently
counted wrong — producing 0% results and every question flagged "weak" via
`question_performance`. `finish_attempt` now backfills it authoritatively,
but already-finished attempts and the accumulated `question_performance`
keep the bad numbers. This script repairs them in place.

What it does (idempotent):
  1. Backfill `correct_option_index` + recompute `is_correct` for every
     answered row that is missing the snapshot, using the authoritative
     `questions` table (payload.options[].isCorrect).
  2. Recompute `attempts.answered_count` / `correct_count` from the rows.
  3. Rebuild `question_performance` from scratch by aggregating the answers
     of all COMPLETED attempts.

Usage:
    uv run python scripts/repair_attempt_correctness.py            # apply
    DRY_RUN=1 uv run python scripts/repair_attempt_correctness.py  # preview
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env BEFORE importing api.* so the engine binds to the configured DB
# (e.g. Postgres) instead of the config default. Mirrors main.py.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
load_dotenv()

from sqlalchemy import select  # noqa: E402

from api.database import SessionLocal  # noqa: E402
from api.models.db.attempt import Attempt, AttemptAnswer, AttemptStatus  # noqa: E402
from api.models.db.question_performance import QuestionPerformance  # noqa: E402
from api.services.questions_service import get_correct_option_index  # noqa: E402

DRY_RUN = os.environ.get("DRY_RUN") in {"1", "true", "True"}


def main() -> int:
    db = SessionLocal()
    try:
        print(f"DB dialect: {db.bind.dialect.name}  DRY_RUN={DRY_RUN}")

        attempts = {a.id: a for a in db.execute(select(Attempt)).scalars().all()}
        answers = list(db.execute(select(AttemptAnswer)).scalars().all())
        print(f"Loaded {len(attempts)} attempts, {len(answers)} answer rows.")

        # ── Step 1: backfill correct_option_index + is_correct ──────────────
        backfilled = 0
        unresolved = 0
        # Cache canonical correct index per (test_id, question_id).
        cache: dict[tuple[str, int], int | None] = {}
        for ans in answers:
            if ans.is_skipped or ans.answer_index is None:
                continue
            if ans.correct_option_index is not None:
                continue
            att = attempts.get(ans.attempt_id)
            if att is None:
                continue
            key = (att.test_id, ans.question_id)
            if key not in cache:
                cache[key] = get_correct_option_index(db, att.test_id, ans.question_id)
            canonical = cache[key]
            if canonical is None:
                unresolved += 1
                continue
            ans.correct_option_index = canonical
            ans.is_correct = ans.answer_index == canonical
            backfilled += 1
        print(f"Step 1: backfilled {backfilled} answers; {unresolved} unresolved "
              f"(question/test deleted).")

        # ── Step 2: recompute per-attempt tallies ───────────────────────────
        answers_by_attempt: dict[str, list[AttemptAnswer]] = {}
        for ans in answers:
            answers_by_attempt.setdefault(ans.attempt_id, []).append(ans)

        attempts_changed = 0
        for att in attempts.values():
            rows = answers_by_attempt.get(att.id, [])
            answered = sum(1 for a in rows if not a.is_skipped and a.answer_index is not None)
            correct = sum(1 for a in rows
                          if not a.is_skipped and a.answer_index is not None and a.is_correct)
            if att.answered_count != answered or att.correct_count != correct:
                att.answered_count = answered
                att.correct_count = correct
                attempts_changed += 1
        print(f"Step 2: recomputed tallies for {attempts_changed} attempts.")

        # ── Step 3: rebuild question_performance from completed attempts ─────
        agg: dict[tuple[str, int, int], dict] = {}
        for att in attempts.values():
            if att.status != AttemptStatus.COMPLETED.value or att.user_id is None:
                continue
            for a in answers_by_attempt.get(att.id, []):
                if a.is_skipped or a.answer_index is None:
                    continue
                key = (att.test_id, att.user_id, a.question_id)
                rec = agg.setdefault(key, {"correct": 0, "total": 0, "dur": 0, "last": None})
                rec["total"] += 1
                if a.is_correct:
                    rec["correct"] += 1
                rec["dur"] += a.duration_ms or 0
                if a.answered_at and (rec["last"] is None or a.answered_at > rec["last"]):
                    rec["last"] = a.answered_at

        existing = db.execute(select(QuestionPerformance)).scalars().all()
        print(f"Step 3: question_performance — {len(existing)} existing rows "
              f"-> {len(agg)} rebuilt rows.")
        if not DRY_RUN:
            for row in existing:
                db.delete(row)
            db.flush()
            for (test_id, user_id, qid), rec in agg.items():
                db.add(QuestionPerformance(
                    test_id=test_id,
                    user_id=user_id,
                    question_id=qid,
                    correct_count=rec["correct"],
                    total_count=rec["total"],
                    total_duration_ms=rec["dur"],
                    last_seen_at=rec["last"],
                ))

        if DRY_RUN:
            db.rollback()
            print("DRY_RUN: rolled back, no changes written.")
        else:
            db.commit()
            print("Committed.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
