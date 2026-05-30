# Statistics Visualization + Per-Question K/D — Design

**Date:** 2026-05-30
**Status:** Design (approved for spec review)

## Context

The statistics screens (`stats.js` desktop/mobile, owner-analytics) currently render
hand-rolled flat KPIs, CSS bar columns, and a heatmap. There is no charting library and
no per-question "ownership" signal for the learner. Two goals:

1. **Beautify stats** with reusable SVG charts: donut KPIs, a score-distribution
   histogram, and a smooth trend area-chart.
2. **Per-question K/D** (shooter-style): K = correct answers, D = incorrect answers on a
   question. Personal scope, lifetime accumulation. When D = 0, show **K×2** instead of ∞.

**Key enabler:** `question_performance(test_id, user_id, question_id, correct_count,
total_count, total_duration_ms, last_seen_at)` already accumulates K and D per user per
question (UPSERTed in `attempt_service.upsert_question_performance`). **No schema change,
no migration, no backfill.** K = `correct_count`, D = `total_count − correct_count`.

## Decisions

- **K/D scope:** personal (per `user_id`).
- **Accumulation:** lifetime (uses existing `question_performance` as-is).
- **Rendering:** own SVG helpers in a new `static/js/utils/charts.js` — no third-party lib
  (matches the "vanilla ES-module SPA, no build step" invariant; theme + i18n keep working).
- **Phase:** everything in one pass (charts + backend + all placements + screen upgrades).

## K/D Semantics (single source of truth = backend)

```
K = correct_count
D = total_count - correct_count
ratio = (K * 2) if D == 0 else (K / D)     # D=0 → K×2 rule
rank  = "none"   if (K == 0 and D == 0)    # never answered → show "—"
        "bronze" if ratio < 1              # red
        "silver" if 1 <= ratio < 2         # yellow
        "gold"   if ratio >= 2             # green
```

The backend computes `ratio` and `rank`; the frontend only formats/colors. This keeps the
thresholds in one place so frontend and backend never diverge. `ratio` is rounded to 1
decimal for display; the badge shows `K/D` (e.g. `7/2`) plus the ratio.

## Components

### Backend

- **`api/services/stats_service.py`** — add `get_my_question_kd(db, test_id, user_id) ->
  list[dict]`. Enumerates **every** question of the test (from the `questions` table)
  LEFT JOIN `question_performance` filtered by `user_id`, so never-answered questions appear
  with `k=0, d=0, totalCount=0, rank="none"` — this is what powers the "untaken" practice
  source. Returns per question:
  `{questionId, k, d, ratio, rank, totalCount, avgDurationMs}`. Define the rank thresholds
  as a module constant + a small pure helper `compute_kd(correct, total) -> (ratio, rank)`
  so it is unit-testable and reusable.
- **`api/routes/statistics.py`** — add `GET /api/tests/{test_id}/my-question-stats`
  (auth via `get_current_user`, visibility via `access_service.can_view_test`). Returns
  `{questions: [...]}`. Placed beside the existing `weak-questions` route.
- **`static/js/api/statistics.js`** — add `getMyQuestionStats(testId)`.

### Charts utility (`static/js/utils/charts.js`) — new

Pure functions, no API/state knowledge. Each returns an SVG string (or element) styled via
CSS custom properties / `currentColor` so themes and accent color apply automatically.

- `donut(value, max, opts)` — ring KPI with animated stroke fill. Used for avg %, accuracy,
  pass-rate.
- `barChart(data, opts)` — vertical histogram with hover tooltip. Used for score distribution.
- `areaLine(points, opts)` — smoothed line with gradient fill + marker dots. Used for the
  daily/weekly trend (replaces the current bar columns).
- `kdBadge(k, d, ratio, rank)` — compact K/D pill, colored by `rank`.

A shared CSS block (`static/css/components/charts.css` or an existing components file)
defines `.chart-donut`, `.chart-bar`, `.chart-area`, `.kd-badge--{bronze,silver,gold,none}`.

### Placements

1. **Per-collection personal stats section (entry from home/main menu)** — a stats view
   scoped to one collection: donut KPIs at the top, the per-question list with `kdBadge`,
   and a personal trend `areaLine`. New route + entry point from the home screen.
2. **Results review** (`screens/desktop/per-question.js` + `screens/mobile/...`) — `kdBadge`
   next to each reviewed question (reflects lifetime K/D, just updated by this attempt).
3. **Collection question list** (`screens/desktop/edit-collection.js` / `question.js` and the
   mobile counterparts) — `kdBadge` per question as a topic-ownership indicator.
4. **General stats screens** (`screens/desktop/stats.js`, `screens/mobile/stats.js`) —
   swap flat KPI tiles for `donut`, the trend bars for `areaLine`, and render the score
   distribution as `barChart`. `owner-analytics` already returns `scoreDistribution`; the
   personal histogram is derived from the attempts list / aggregate.

### Practice question selection (weak / untaken via K/D)

The pre-test screen (`screens/desktop/pre-test.js` + mobile counterpart) already has a
source selector `all | weak | flagged | untaken` that builds a `filterIds` array consumed by
`taking.js`. Two sources are (re)wired to the new K/D data — both read the single
`getMyQuestionStats(testId)` response, no extra endpoints:

- **Weak** — sort all questions by `ratio` **ascending** (never-answered, `rank:"none"`,
  sort as the weakest), take the lowest `count` ids → `filterIds`. Replaces the old
  `correct_rate < 60%` weak source for the *practice* flow. ("Including zero" per request —
  zeros and never-answered are the weakest.)
- **Untaken** — currently a UI-only stub; implement as `totalCount === 0` → `filterIds`.

**Ordering:** subset selection and presentation order are independent. After the weak/untaken
subset is chosen, the existing `order` chip (`random | sequential`) applies as it does for the
other sources — no per-mode ordering override.

This is pure frontend wiring on top of `my-question-stats`; `taking.js` already filters
`allQuestions` by `filterIds` and locks the snapshot at start. The stats "weak themes"
*display* (which aggregates across owned tests via `/weak-questions`) is unchanged this phase.

## Data flow

```
question_performance (DB)
  → stats_service.get_my_question_kd (compute_kd → ratio, rank)
  → GET /api/tests/{id}/my-question-stats
  → statistics.js getMyQuestionStats
  → screen modules (per-collection stats, results review, collection list)
  → charts.js kdBadge / donut / areaLine / barChart  (pure render)
```

Charts utility is fully isolated: screens fetch + shape data, then pass plain
numbers/arrays into `charts.js`. K/D math lives only in the backend; the badge just colors
by `rank`.

## Error handling

- Question with no performance row → `rank: "none"`, badge renders `—` (not 0/0).
- `getMyQuestionStats` 403/empty → screens render the list without badges (graceful).
- MathJax/charts: SVG helpers never throw on empty data — they return an empty-state SVG.

## Testing / verification

- Backend: `compute_kd` covered by a standalone `scripts/test_*.py` (project convention) —
  cases: D=0 (K×2), K=0/D>0 (ratio 0, bronze), boundary ratios (1.0 silver, 2.0 gold),
  empty (none).
- API: hit `GET /api/tests/{id}/my-question-stats` after finishing an attempt; confirm K/D
  matches `question_performance` rows.
- Frontend: open the per-collection stats section, results review, and collection list;
  confirm badges color correctly and charts render in all three themes (light/dark/system)
  and locales (ru/en/uz). Verify trend area-chart and score histogram on the main stats
  screens.
- Practice selection: on the pre-test screen pick "Слабые" → confirm the attempt contains the
  lowest-K/D questions (worst included, capped at `count`); pick "Не пройдённые" → confirm
  only never-answered (`totalCount === 0`) questions are included. Confirm the `order` chip
  still controls presentation order in both.

## Out of scope (YAGNI)

- Global/owner K/D aggregate (personal only this phase).
- Third-party charting library.
- Per-attempt K/D reset (lifetime only).
- Schema changes / migrations.
