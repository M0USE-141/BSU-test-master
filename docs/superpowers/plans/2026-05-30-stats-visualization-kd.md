# Statistics Visualization + Per-Question K/D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable SVG charts (donut KPIs, score histogram, trend area-chart) and a personal per-question K/D metric, surfaced in results review, the collection question list, a new per-collection stats section, and the practice "weak"/"untaken" start modes.

**Architecture:** K/D is derived from the existing `question_performance` table (K=`correct_count`, D=`total_count−correct_count`), so no schema change. A single backend endpoint `GET /api/tests/{id}/my-question-stats` enumerates every question (LEFT JOIN performance) and returns `{questionId,k,d,ratio,rank,totalCount,avgDurationMs}`; the rank thresholds live only in the backend. The frontend gets a dependency-free `utils/charts.js` (pure SVG functions) and consumes the endpoint for badges, the per-collection stats screen, and the pre-test weak/untaken sources.

**Tech Stack:** Python 3.13, SQLAlchemy 2.0, FastAPI, vanilla ES-module SPA (no build step), inline SVG. Verification via standalone `scripts/verify_*.py` (project has no pytest; `scripts/test_*.py` is gitignored).

---

## Conventions for this plan

- **No pytest.** "Write the failing test" = add/extend a standalone `scripts/verify_kd.py` that `assert`s and prints `OK`, run with `uv run python scripts/verify_kd.py`. It must be named `verify_*` (not `test_*`) so it is not gitignored.
- **Run the dev server** with `uv run uvicorn main:app --reload` and the light DB if needed: `$env:STORAGE_BACKEND="local"; $env:DATABASE_URL="sqlite:///./data/testmaster.db"`.
- **Commit after each task** (frequent commits). Branch note: this feature is independent of the in-flight materials work — see Task 0.

---

## File Structure

**Create:**
- `static/js/utils/charts.js` — pure SVG chart helpers: `donut`, `barChart`, `areaLine`, `kdBadge`. No API/state knowledge.
- `static/css/components/charts.css` — `.chart-*` and `.kd-badge--{bronze,silver,gold,none}` styles (theme-aware via CSS vars).
- `static/js/screens/desktop/collection-stats.js` + `static/js/screens/mobile/collection-stats.js` — per-collection personal stats screen.
- `scripts/verify_kd.py` — standalone checks for `compute_kd`.

**Modify:**
- `api/services/stats_service.py` — add `KD_GOLD`/`KD_SILVER` thresholds, `compute_kd()`, `get_my_question_kd()`.
- `api/routes/statistics.py` — add `GET /tests/{test_id}/my-question-stats`.
- `static/js/api/statistics.js` — add `getMyQuestionStats`.
- `static/js/router.js` — register the collection-stats route.
- `static/js/screens/desktop/per-question.js` + mobile counterpart — K/D badge per reviewed question.
- `static/js/screens/desktop/edit-collection.js` (and/or `question.js`) + mobile — K/D badge per question row.
- `static/js/screens/desktop/stats.js` + `static/js/screens/mobile/stats.js` — donut KPIs, area trend, score histogram.
- `static/js/screens/desktop/home.js` (+ mobile home) — entry point to collection-stats.
- `static/js/screens/desktop/pre-test.js` (+ mobile pre-test) — weak/untaken sources via K/D.
- `static/index.html` — `<link>` the new charts.css.

---

## Task 0: Branch isolation

**Files:** none (git only)

- [ ] **Step 1: Stash-free branch off the current tree**

The materials changes in the working tree are unrelated. Create a feature branch from `main` for this work WITHOUT carrying the materials diff. If the materials work is already committed on `feat/materials-unification`, branch from `main`:

```powershell
git stash push -u -m "wip-materials"   # only if materials changes are uncommitted and you want them parked
git checkout main
git checkout -b feat/stats-visualization-kd
```

If the user prefers to keep building on the materials branch instead, skip this task and continue on `feat/materials-unification`. Confirm with the user before discarding/parking any uncommitted work.

- [ ] **Step 2: Confirm clean start**

Run: `git status`
Expected: on `feat/stats-visualization-kd`, no stats files yet.

---

## Task 1: Backend — `compute_kd` helper

**Files:**
- Modify: `api/services/stats_service.py`
- Test: `scripts/verify_kd.py`

- [ ] **Step 1: Write the failing check**

Create `scripts/verify_kd.py`:

```python
"""Standalone checks for stats_service.compute_kd (no pytest in this project)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.services.stats_service import compute_kd


def main() -> int:
    cases = [
        # (correct, total) -> (ratio, rank)
        ((0, 0), (0.0, "none")),    # never answered
        ((0, 3), (0.0, "bronze")),  # all wrong
        ((1, 2), (1.0, "silver")),  # K=1 D=1 -> 1.0
        ((2, 3), (2.0, "gold")),    # K=2 D=1 -> 2.0
        ((3, 3), (6.0, "gold")),    # D=0 -> K*2 = 6
        ((1, 4), (round(1/3, 1), "bronze")),  # K=1 D=3 -> 0.3
    ]
    errors = []
    for (correct, total), expected in cases:
        got = compute_kd(correct, total)
        if got != expected:
            errors.append(f"compute_kd({correct},{total}) = {got}, expected {expected}")
    for e in errors:
        print(f"[FAIL] {e}")
    if errors:
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run to verify it fails**

Run: `uv run python scripts/verify_kd.py`
Expected: ImportError (`cannot import name 'compute_kd'`).

- [ ] **Step 3: Implement `compute_kd`**

In `api/services/stats_service.py`, add near the top (after imports):

```python
# K/D rank thresholds (single source of truth — frontend only colors by rank).
KD_GOLD = 2.0     # ratio >= 2.0  -> gold (green)
KD_SILVER = 1.0   # 1.0 <= ratio < 2.0 -> silver (yellow); below -> bronze (red)


def compute_kd(correct: int, total: int) -> tuple[float, str]:
    """Return (ratio, rank) for a personal per-question K/D.

    K = correct, D = total - correct. When D == 0 (no wrong answers) the
    ratio is K*2 instead of infinity. Never-answered (K==0 and D==0) is
    rank "none".
    """
    k = correct
    d = total - correct
    if k == 0 and d == 0:
        return 0.0, "none"
    ratio = round((k * 2) if d == 0 else (k / d), 1)
    if ratio >= KD_GOLD:
        rank = "gold"
    elif ratio >= KD_SILVER:
        rank = "silver"
    else:
        rank = "bronze"
    return ratio, rank
```

- [ ] **Step 4: Run to verify it passes**

Run: `uv run python scripts/verify_kd.py`
Expected: `OK`.

- [ ] **Step 5: Commit**

```powershell
git add api/services/stats_service.py scripts/verify_kd.py
git commit -m "feat(stats): add compute_kd helper (K/D ratio + rank)"
```

---

## Task 2: Backend — `get_my_question_kd` + endpoint

**Files:**
- Modify: `api/services/stats_service.py`, `api/routes/statistics.py`

- [ ] **Step 1: Confirm model imports**

At the top of `api/services/stats_service.py`, ensure these are imported (add what is missing — `QuestionPerformance` is already used by `get_weak_questions`):

```python
from sqlalchemy import and_, select
from api.models.db.question import Question
from api.models.db.question_performance import QuestionPerformance
from api.models.db.test_collection import TestCollection
```

- [ ] **Step 2: Implement `get_my_question_kd`**

Add to `api/services/stats_service.py` (e.g. right after `get_weak_questions`):

```python
def get_my_question_kd(db: DBSession, test_id: str, user_id: int) -> list[dict]:
    """Per-question personal K/D for every question of a test.

    Enumerates ALL questions (LEFT JOIN performance) so never-answered
    questions appear with k=0,d=0,totalCount=0,rank="none" — this powers
    the "untaken" practice source. Ordered by question order_index.
    """
    rows = db.execute(
        select(
            Question.id,
            QuestionPerformance.correct_count,
            QuestionPerformance.total_count,
            QuestionPerformance.total_duration_ms,
        )
        .join(TestCollection, Question.test_collection_id == TestCollection.id)
        .outerjoin(
            QuestionPerformance,
            and_(
                QuestionPerformance.question_id == Question.id,
                QuestionPerformance.user_id == user_id,
                QuestionPerformance.test_id == test_id,
            ),
        )
        .where(TestCollection.test_id == test_id)
        .order_by(Question.order_index)
    ).all()

    result: list[dict] = []
    for qid, correct, total, dur in rows:
        correct = correct or 0
        total = total or 0
        ratio, rank = compute_kd(correct, total)
        result.append({
            "questionId": qid,
            "k": correct,
            "d": total - correct,
            "ratio": ratio,
            "rank": rank,
            "totalCount": total,
            "avgDurationMs": (dur // total) if total else 0,
        })
    return result
```

- [ ] **Step 3: Add the route**

In `api/routes/statistics.py`, import the service function (extend the existing `from api.services.stats_service import (...)` block):

```python
    get_my_question_kd,
```

Then add, right after the `weak-questions` route (around line 250):

```python
@router.get("/tests/{test_id}/my-question-stats")
def list_my_question_stats(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Personal per-question K/D for every question of the test."""
    validate_test_exists(db, test_id)
    return {"questions": get_my_question_kd(db, test_id, current_user.id)}
```

(Match the exact `Session`/`Depends`/`Any` symbols already imported in the file — copy the signature style of `list_weak_questions` directly above.)

- [ ] **Step 4: Smoke the endpoint**

Start the server (`uv run uvicorn main:app --reload`). With a logged-in session that has a finished attempt, GET `/api/tests/<test_id>/my-question-stats`. Expected: `{"questions":[{"questionId":...,"k":..,"d":..,"ratio":..,"rank":"..","totalCount":..,"avgDurationMs":..}, ...]}` with one entry per question (never-answered ones have `rank:"none"`).

- [ ] **Step 5: Commit**

```powershell
git add api/services/stats_service.py api/routes/statistics.py
git commit -m "feat(stats): my-question-stats endpoint (per-question K/D, all questions)"
```

---

## Task 3: Frontend — `getMyQuestionStats` API wrapper

**Files:**
- Modify: `static/js/api/statistics.js`

- [ ] **Step 1: Add the wrapper**

In `static/js/api/statistics.js`, mirror the existing `getWeakQuestions` export:

```javascript
/**
 * Personal per-question K/D for every question of a test.
 * Returns { questions: [{ questionId, k, d, ratio, rank, totalCount, avgDurationMs }] }.
 * rank ∈ "none" | "bronze" | "silver" | "gold".
 * @param {string} testId
 */
export async function getMyQuestionStats(testId) {
  return apiFetch('GET', `/api/tests/${testId}/my-question-stats`);
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check static/js/api/statistics.js`
Expected: no output (valid).

- [ ] **Step 3: Commit**

```powershell
git add static/js/api/statistics.js
git commit -m "feat(stats): getMyQuestionStats api wrapper"
```

---

## Task 4: Frontend — `utils/charts.js` (SVG helpers)

**Files:**
- Create: `static/js/utils/charts.js`, `static/css/components/charts.css`
- Modify: `static/index.html`

- [ ] **Step 1: Create `static/js/utils/charts.js`**

Pure functions returning SVG/HTML strings. Colors come from CSS vars / `currentColor`, so themes apply automatically. KD math is on the backend; `kdBadge` only formats + colors by `rank`.

```javascript
/**
 * charts.js — dependency-free inline-SVG chart helpers.
 *
 * Every function returns an HTML/SVG STRING (caller injects via innerHTML on a
 * trusted container, or wraps with a small element). No API/state knowledge.
 * Styling lives in css/components/charts.css; colors use CSS vars so themes
 * and accent color apply without per-call config.
 *
 * SECURITY: every helper injects via the caller's innerHTML, so ALL string
 * inputs (labels, units, titles) are escaped with escHtml before they reach
 * markup. Numeric inputs are coerced. `rank` is validated against a closed
 * set. Callers must still pass user-controlled text as strings (not pre-built
 * HTML) — the helpers own the escaping.
 */
import { escHtml } from './escape.js';

function _clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function _num(n) { return Number.isFinite(+n) ? +n : 0; }

/**
 * Donut / ring KPI. `value`/`max` drive the arc; `label` is the caption.
 * @param {number} value
 * @param {number} max
 * @param {{label?:string, unit?:string, size?:number}} [opts]
 * @returns {string} SVG markup
 */
export function donut(value, max, opts = {}) {
  value = _num(value); max = _num(max);
  const size = _num(opts.size) || 96;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? _clamp(value / max, 0, 1) : 0;
  const dash = (pct * circ).toFixed(1);
  const display = opts.unit === '%' ? Math.round(pct * 100) + '%' : String(value);
  const label = opts.label ? escHtml(String(opts.label)) : '';
  return `
<div class="chart-donut" role="img" aria-label="${display}${label ? ' ' + label : ''}">
  <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle class="chart-donut__track" cx="${cx}" cy="${cy}" r="${r}" stroke-width="${stroke}" fill="none"/>
    <circle class="chart-donut__arc" cx="${cx}" cy="${cy}" r="${r}" stroke-width="${stroke}" fill="none"
      stroke-dasharray="${dash} ${(circ - dash).toFixed(1)}"
      stroke-dashoffset="${(circ / 4).toFixed(1)}" stroke-linecap="round"/>
    <text class="chart-donut__value" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central">${display}</text>
  </svg>
  ${label ? `<div class="chart-donut__label">${label}</div>` : ''}
</div>`;
}

/**
 * Vertical bar histogram. `data` = [{label, value}], values >= 0.
 * @param {Array<{label:string,value:number}>} data
 * @param {{height?:number}} [opts]
 * @returns {string}
 */
export function barChart(data, opts = {}) {
  const h = opts.height || 120;
  if (!Array.isArray(data) || data.length === 0) {
    return `<div class="chart-bar chart-empty">—</div>`;
  }
  const max = Math.max(1, ...data.map(d => _num(d.value)));
  const bars = data.map(d => {
    const v = _num(d.value);
    const label = escHtml(String(d.label ?? ''));
    const bh = Math.round((v / max) * (h - 18));
    return `
    <div class="chart-bar__col" title="${label}: ${v}">
      <div class="chart-bar__fill" style="height:${bh}px"></div>
      <div class="chart-bar__label">${label}</div>
    </div>`;
  }).join('');
  return `<div class="chart-bar" style="--chart-h:${h}px">${bars}</div>`;
}

/**
 * Smoothed area line. `points` = [{x?,y}] — y values; index used as x.
 * @param {Array<{y:number,label?:string}>} points
 * @param {{width?:number,height?:number}} [opts]
 * @returns {string}
 */
export function areaLine(points, opts = {}) {
  const w = opts.width || 320, h = opts.height || 96, pad = 6;
  if (!Array.isArray(points) || points.length === 0) {
    return `<div class="chart-area chart-empty">—</div>`;
  }
  const ys = points.map(p => _num(p.y));
  const max = Math.max(1, ...ys), min = Math.min(0, ...ys);
  const span = (max - min) || 1;
  const n = points.length;
  const xAt = i => pad + (n === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (n - 1));
  const yAt = v => h - pad - ((v - min) / span) * (h - 2 * pad);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(_num(p.y)).toFixed(1)}`).join(' ');
  const area = `${line} L ${xAt(n - 1).toFixed(1)} ${h - pad} L ${xAt(0).toFixed(1)} ${h - pad} Z`;
  const dots = points.map((p, i) => `<circle class="chart-area__dot" cx="${xAt(i).toFixed(1)}" cy="${yAt(_num(p.y)).toFixed(1)}" r="2.5"><title>${escHtml(String(p.label || ''))} ${_num(p.y)}</title></circle>`).join('');
  return `
<svg class="chart-area" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
  <defs><linearGradient id="chartAreaGrad" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0%" class="chart-area__g0"/><stop offset="100%" class="chart-area__g1"/>
  </linearGradient></defs>
  <path class="chart-area__fill" d="${area}"/>
  <path class="chart-area__line" d="${line}" fill="none"/>
  ${dots}
</svg>`;
}

/**
 * Compact K/D pill. Colors by `rank` (backend-computed). When d === 0 the
 * ratio is already K*2 from the backend; show "K/0" with the K*2 ratio.
 * @param {number} k
 * @param {number} d
 * @param {number} ratio
 * @param {"none"|"bronze"|"silver"|"gold"} rank
 * @returns {string}
 */
export function kdBadge(k, d, ratio, rank) {
  // rank comes from a closed backend set; validate to keep it out of markup injection.
  const safeRank = ['gold', 'silver', 'bronze', 'none'].includes(rank) ? rank : 'none';
  k = _num(k); d = _num(d); ratio = _num(ratio);
  if (safeRank === 'none') {
    return `<span class="kd-badge kd-badge--none" title="K/D">—</span>`;
  }
  return `<span class="kd-badge kd-badge--${safeRank}" title="K/D ${k}/${d}">${k}/${d} · ${ratio}</span>`;
}
```

- [ ] **Step 2: Create `static/css/components/charts.css`**

```css
/* Donut */
.chart-donut { display:inline-flex; flex-direction:column; align-items:center; gap:4px; }
.chart-donut__track { stroke: var(--border, #2a2a2a); opacity:.5; }
.chart-donut__arc { stroke: var(--accent, #4f8cff); transition: stroke-dasharray .6s ease; }
.chart-donut__value { fill: var(--text, #eaeaea); font-size: 18px; font-weight: 700; }
.chart-donut__label { font-size: 12px; color: var(--text-muted, #999); }

/* Bars */
.chart-bar { display:flex; align-items:flex-end; gap:6px; height: var(--chart-h, 120px); }
.chart-bar__col { display:flex; flex-direction:column; align-items:center; gap:4px; flex:1; }
.chart-bar__fill { width:100%; max-width:28px; background: var(--accent, #4f8cff); border-radius:4px 4px 0 0; transition: height .5s ease; }
.chart-bar__label { font-size:10px; color: var(--text-muted, #999); }
.chart-empty { color: var(--text-muted, #999); display:flex; align-items:center; justify-content:center; }

/* Area line */
.chart-area__line { stroke: var(--accent, #4f8cff); stroke-width:2; }
.chart-area__fill { fill: url(#chartAreaGrad); }
.chart-area__g0 { stop-color: var(--accent, #4f8cff); stop-opacity:.35; }
.chart-area__g1 { stop-color: var(--accent, #4f8cff); stop-opacity:0; }
.chart-area__dot { fill: var(--accent, #4f8cff); }

/* K/D badge */
.kd-badge { display:inline-block; padding:1px 7px; border-radius:999px; font-size:12px; font-weight:600; line-height:1.5; }
.kd-badge--gold   { background: color-mix(in srgb, #2fbf71 22%, transparent); color:#2fbf71; }
.kd-badge--silver { background: color-mix(in srgb, #e8b22e 22%, transparent); color:#e8b22e; }
.kd-badge--bronze { background: color-mix(in srgb, #e0573e 22%, transparent); color:#e0573e; }
.kd-badge--none   { background: var(--surface-2, #1e1e1e); color: var(--text-muted, #999); }
```

- [ ] **Step 3: Link the CSS**

In `static/index.html`, add next to the other `css/components/*` links:

```html
<link rel="stylesheet" href="/static/css/components/charts.css">
```

(Match the exact href prefix used by sibling component CSS links in that file.)

- [ ] **Step 4: Syntax check**

Run: `node --check static/js/utils/charts.js`
Expected: no output.

- [ ] **Step 5: Commit**

```powershell
git add static/js/utils/charts.js static/css/components/charts.css static/index.html
git commit -m "feat(charts): dependency-free SVG donut/bar/area/kdBadge helpers"
```

---

## Task 5: K/D badge in results review (per-question)

**Files:**
- Modify: `static/js/screens/desktop/per-question.js`, `static/js/screens/mobile/per-question.js` (mobile filename may differ — confirm under `screens/mobile/`)

- [ ] **Step 1: Import the badge + API**

At the top of `per-question.js`:

```javascript
import { kdBadge } from '../../utils/charts.js';
import { getMyQuestionStats } from '../../api/statistics.js';
```

- [ ] **Step 2: Fetch K/D once and index by questionId**

In the render function, after the test/attempt data is loaded (where `testId` is known), fetch and build a lookup:

```javascript
let kdByQ = {};
try {
  const ks = await getMyQuestionStats(testId);
  for (const q of (ks.questions || [])) kdByQ[String(q.questionId)] = q;
} catch (_) { kdByQ = {}; }   // graceful: no badges if it fails
```

- [ ] **Step 3: Render the badge next to each question**

Where each reviewed question header is built, append the badge (use the question's id — match the existing id field used in this screen, e.g. `q.questionId` or `q.id`):

```javascript
const kd = kdByQ[String(q.id)];
const badgeHtml = kd ? kdBadge(kd.k, kd.d, kd.ratio, kd.rank) : '';
// inject badgeHtml into the question header markup (next to the title/index)
```

- [ ] **Step 4: Verify in browser**

Finish an attempt, open the per-question review. Expected: each question shows a colored K/D pill (or `—` if never answered before this attempt). Confirm colors differ by rank.

- [ ] **Step 5: Commit**

```powershell
git add static/js/screens/desktop/per-question.js static/js/screens/mobile/per-question.js
git commit -m "feat(stats): K/D badge in results review"
```

---

## Task 6: K/D badge in collection question list

**Files:**
- Modify: `static/js/screens/desktop/edit-collection.js` (and/or `question.js`) + mobile counterpart

- [ ] **Step 1: Locate the question-row render**

Find where each question row/card is rendered in the collection editor/list. Confirm the question id field used there.

- [ ] **Step 2: Fetch K/D once for the collection**

Near the top of the screen's render (testId known), reuse the same pattern as Task 5 Step 2 to build `kdByQ`.

- [ ] **Step 3: Append the badge to each row**

```javascript
import { kdBadge } from '../../utils/charts.js';
// per row:
const kd = kdByQ[String(question.id)];
if (kd) row.insertAdjacentHTML('beforeend', kdBadge(kd.k, kd.d, kd.ratio, kd.rank));
```

- [ ] **Step 4: Verify in browser**

Open the collection edit/list screen. Expected: each question row shows its K/D pill.

- [ ] **Step 5: Commit**

```powershell
git add static/js/screens/desktop/edit-collection.js static/js/screens/mobile/edit-collection.js
git commit -m "feat(stats): K/D badge in collection question list"
```

---

## Task 7: Per-collection stats screen + home entry

**Files:**
- Create: `static/js/screens/desktop/collection-stats.js`, `static/js/screens/mobile/collection-stats.js`
- Modify: `static/js/router.js`, `static/js/screens/desktop/home.js` (+ mobile home)

- [ ] **Step 1: Create the desktop screen**

`static/js/screens/desktop/collection-stats.js` — default-export `render(root, params)` (project convention). Fetch aggregate + K/D, render donut KPIs + per-question K/D list + personal trend area-chart:

```javascript
import { getMyAggregate, getMyTrend, getMyQuestionStats } from '../../api/statistics.js';
import { getTest } from '../../api/tests.js';
import { donut, areaLine, kdBadge } from '../../utils/charts.js';
import { escHtml } from '../../utils/escape.js';
import { t } from '../../utils/locale.js';

export default async function render(root, params) {
  const testId = params.id;
  const [agg, trend, ks, test] = await Promise.all([
    getMyAggregate({ testId }).catch(() => ({})),
    getMyTrend(30).catch(() => ({ trend: [] })),
    getMyQuestionStats(testId).catch(() => ({ questions: [] })),
    getTest(testId).catch(() => ({})),
  ]);

  const kpis = `
    <div class="cstats__kpis">
      ${donut(Math.round(agg.avgPercentCorrect || 0), 100, { label: t('stats.avgScore') || 'Средний %', unit: '%' })}
      ${donut(agg.attemptCount || 0, Math.max(1, agg.attemptCount || 0), { label: t('stats.attempts') || 'Попытки' })}
    </div>`;

  const trendPts = (trend.trend || []).map(d => ({ y: Math.round(d.avg_score || 0), label: d.date }));
  const trendHtml = `<div class="cstats__trend">${areaLine(trendPts, { height: 96 })}</div>`;

  const rows = (ks.questions || []).map((q, i) =>
    `<div class="cstats__qrow"><span class="cstats__qidx">${i + 1}</span>${kdBadge(q.k, q.d, q.ratio, q.rank)}</div>`
  ).join('');

  root.innerHTML = `
    <section class="cstats">
      <h1>${escHtml(String(test.title || testId))} · ${escHtml(t('stats.title') || 'Статистика')}</h1>
      ${kpis}
      ${trendHtml}
      <div class="cstats__qlist">${rows}</div>
    </section>`;
}
```

**XSS note for all screen tasks:** `kdBadge`/`donut`/`areaLine`/`barChart` now escape their own string inputs, and `q.k/q.d/q.ratio` are numbers — so injecting their output via `innerHTML`/`insertAdjacentHTML` is safe. Any OTHER user-controlled string a screen builds into markup (test titles, question text) MUST be wrapped in `escHtml` (as above). Question index (`i + 1`) is a number — safe.

(Confirm `getTest` is exported from `api/tests.js`; if the name differs, use the existing test-detail fetcher.)

- [ ] **Step 2: Create the mobile screen**

`static/js/screens/mobile/collection-stats.js` — same data, mobile atoms (`mShell`, `mCard`) per the existing mobile screens. Keep the same `donut`/`areaLine`/`kdBadge` calls.

- [ ] **Step 3: Register the route**

In `static/js/router.js`, add a `ROUTES` entry (match the existing entry shape). Pattern: `#/test/:id/stats`, desktop module `screens/desktop/collection-stats.js`, mobile module `screens/mobile/collection-stats.js`. Auth-required like other stats routes.

- [ ] **Step 4: Add the home entry point**

In `static/js/screens/desktop/home.js` (+ mobile home), on each collection card add a "Статистика" action linking to `#/test/<id>/stats`. Use `icon('chart')` if available, else text. Follow the existing per-card action markup.

- [ ] **Step 5: Verify in browser**

Navigate from home → a collection's "Статистика". Expected: donut KPIs, trend area-chart, and a per-question K/D list render. Check light/dark themes.

- [ ] **Step 6: Commit**

```powershell
git add static/js/screens/desktop/collection-stats.js static/js/screens/mobile/collection-stats.js static/js/router.js static/js/screens/desktop/home.js static/js/screens/mobile/home.js
git commit -m "feat(stats): per-collection stats screen + home entry"
```

---

## Task 8: Upgrade general stats screens (donut + area + histogram)

**Files:**
- Modify: `static/js/screens/desktop/stats.js`, `static/js/screens/mobile/stats.js`

- [ ] **Step 1: Import charts**

```javascript
import { donut, areaLine, barChart } from '../../utils/charts.js';
```

- [ ] **Step 2: Replace flat KPI tiles with donuts**

In the Summary pane, swap the avg-% / accuracy / pass-rate numeric tiles for `donut(value, 100, {unit:'%', label})`. Keep streak/attempts as plain tiles or `donut(value, max, {label})`.

- [ ] **Step 3: Replace trend bars with area line**

Where the "Прогресс по дням" bars are built from `trend`, replace with:

```javascript
const pts = (trend.trend || []).map(d => ({ y: Math.round(d.avg_score || 0), label: d.date }));
container.insertAdjacentHTML('beforeend', areaLine(pts, { height: 110 }));
```

- [ ] **Step 4: Add a score-distribution histogram**

Build buckets from the user's attempts (e.g. count attempts whose `percentCorrect` falls in each 10% bucket, from `listAttempts`), then:

```javascript
const buckets = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}`, value: 0 }));
for (const a of (attempts.attempts || [])) {
  const idx = Math.min(9, Math.floor((a.percentCorrect || 0) / 10));
  buckets[idx].value++;
}
container.insertAdjacentHTML('beforeend', barChart(buckets, { height: 120 }));
```

- [ ] **Step 5: Verify in browser**

Open desktop + mobile stats. Expected: donut KPIs, smooth trend area, score histogram all render and follow the theme.

- [ ] **Step 6: Commit**

```powershell
git add static/js/screens/desktop/stats.js static/js/screens/mobile/stats.js
git commit -m "feat(stats): donut KPIs, area trend, score histogram on stats screens"
```

---

## Task 9: Pre-test weak/untaken sources via K/D

**Files:**
- Modify: `static/js/screens/desktop/pre-test.js`, `static/js/screens/mobile/pre-test.js`

Context: `pre-test.js` already loads weak via `getWeakQuestions` (line 109), builds `weakIds`/`flaggedIds` Sets, shows source chips (`all|weak|flagged|untaken`, lines 395–399; `untaken` count is `null`/stub), and in `handleStart` (line 607) maps `state.source` → `filterIds` (line 608) written into the `pretest:<id>` handoff (line 627). `taking.js` filters `allQuestions` by `filterIds` and then applies the `order` chip.

- [ ] **Step 1: Load K/D stats instead of (or alongside) weak-questions**

Replace the weak-questions fetch with the K/D endpoint and derive both weak and untaken sets. Near line 108–113:

```javascript
import { getMyQuestionStats } from '../../api/statistics.js';
// ...
const kdResp = await getMyQuestionStats(params.id).catch(function () { return { questions: [] }; });
const kdList = kdResp.questions || [];
// Weak = ascending K/D (never-answered = weakest). Keep ids in worst-first order.
const weakOrdered = kdList.slice().sort(function (a, b) {
  // rank "none" (never answered) sorts first; then by ratio asc.
  const ar = a.rank === 'none' ? -1 : a.ratio;
  const br = b.rank === 'none' ? -1 : b.ratio;
  return ar - br;
}).map(function (q) { return q.questionId; });
const untakenIds = kdList.filter(function (q) { return q.totalCount === 0; }).map(function (q) { return q.questionId; });
const weakIds = new Set(weakOrdered);
const untakenSet = new Set(untakenIds);
```

(Keep `flaggedIds` from `listFlagged` as-is. Remove the now-unused `getWeakQuestions` import if nothing else uses it.)

- [ ] **Step 2: Wire counts for both sources**

Update the `counts` object and the chip count for `untaken` (line 399/429):

```javascript
const counts = { total: totalQs, weak: weakIds.size, flagged: flaggedIds.size, untaken: untakenSet.size };
```

In `renderSourceChips`, give `untaken` a real count: `{ key: 'untaken', label: 'Не пройденные', count: counts.untaken }`.

- [ ] **Step 3: Build `filterIds` for weak (capped to count) and untaken**

In `handleStart` (line 607), pass the K/D-derived sets and select ids. Weak takes the lowest-K/D `count` ids; ordering is then applied by `taking.js` via the `order` chip (no override here):

```javascript
function handleStart(testId, state, flaggedIds, weakOrdered, untakenIds) {
  let filterIds;
  if (state.source === 'weak') {
    filterIds = weakOrdered.slice(0, state.count);   // lowest-K/D, capped
  } else if (state.source === 'flagged') {
    filterIds = Array.from(flaggedIds);
  } else if (state.source === 'untaken') {
    filterIds = untakenIds.slice();
  } else {
    filterIds = [];   // 'all'
  }
  // ... existing guard + handoff write (filterIds: filterIds) unchanged ...
}
```

Update the `handleStart(...)` call site (line 221) to pass `weakOrdered` and `untakenIds`.

- [ ] **Step 4: Verify in browser**

On the pre-test screen: pick "Только слабые" → start → confirm the attempt holds the lowest-K/D questions (capped at the count). Pick "Не пройденные" → confirm only never-answered questions (totalCount===0) appear. Toggle order random/sequential → confirm presentation order still follows the chip.

- [ ] **Step 5: Commit**

```powershell
git add static/js/screens/desktop/pre-test.js static/js/screens/mobile/pre-test.js
git commit -m "feat(practice): weak/untaken sources driven by per-question K/D"
```

---

## Self-Review (completed)

- **Spec coverage:** charts.js (Task 4) ✓; backend K/D + endpoint (Tasks 1–2) ✓; getMyQuestionStats (Task 3) ✓; per-collection stats + home entry (Task 7) ✓; results review badge (Task 5) ✓; collection list badge (Task 6) ✓; general stats donut/area/histogram (Task 8) ✓; weak/untaken via K/D (Task 9) ✓; lifetime accumulation = existing table, no migration ✓; rank thresholds backend-only ✓.
- **Type consistency:** endpoint returns `{questionId,k,d,ratio,rank,totalCount,avgDurationMs}`; `kdBadge(k,d,ratio,rank)` used identically in Tasks 5–8; `compute_kd` returns `(ratio,rank)` consumed by `get_my_question_kd`. Consistent.
- **Placeholders:** frontend steps that touch existing screens (Tasks 5–9) intentionally reference "the existing question-row markup / id field" because the exact host markup must be matched in place — each gives the concrete badge/import/fetch code to insert. No code step is left without its code.

## Verification (end-to-end)

1. `uv run python scripts/verify_kd.py` → `OK`.
2. Finish an attempt; GET `/api/tests/<id>/my-question-stats` returns one entry per question, never-answered = `rank:"none"`.
3. Results review + collection list show colored K/D badges.
4. Home → collection "Статистика" shows donut KPIs + trend + per-question K/D list.
5. Stats screens show donut KPIs, area trend, score histogram in all themes/locales.
6. Pre-test "Слабые" = lowest-K/D capped at count; "Не пройденные" = totalCount===0; `order` chip still controls order.
