# UI/UX Redesign — TestMasterBSU
**Date:** 2026-05-25  
**Status:** Approved for implementation

## Context

The project currently uses a Tailwind CDN + emerald-green custom CSS design system. A new "warm paper + sketchy handwritten" design system has been prototyped in `design-plans/` (HTML prototypes + JSX components). The goal is to fully migrate all 8 screens to the new design, adapt missing parts in the same style, and extend the statistics screen from 2 tabs to 3 with a new heatmap visualization backed by a new API endpoint.

---

## Design System Transformation

### CSS Variables

Replace all `--primary`, `--surface-1`, `--text`, `--border`, etc. with the new `--wf-*` system:

| Old | New |
|-----|-----|
| `--primary: #059669` | `--wf-accent: #4f9b6a` |
| `--bg: #f5f5f5` | `--wf-paper: #f9f6ef` |
| `--surface-1: #ffffff` | `--wf-paper` (same base) |
| `--text: #171717` | `--wf-ink: #1c1a18` |
| `--text-muted: #525252` | `--wf-ink-fade: rgba(28,26,24,0.55)` |
| `--border: #e5e5e5` | `--wf-ink-soft: rgba(28,26,24,0.06)` |

**New variables added:**
```css
--wf-ink-mute:   rgba(28,26,24,0.35)   /* secondary text */
--wf-accent-soft: rgba(79,155,106,0.14) /* tinted backgrounds */
--wf-shadow:     3px 3px 0 0 var(--wf-ink) /* offset shadow */
--wf-border:     2px solid var(--wf-ink)
--wf-radius:     6px
--wf-pad:        16px  /* compact=12, roomy=24 */
```

**Dark mode** (`[data-theme="dark"]`):
```css
--wf-paper: #1a1714
--wf-ink:   #f3ece0
--wf-ink-mute:  rgba(243,236,224,0.30)
--wf-ink-soft:  rgba(243,236,224,0.08)
--wf-ink-fade:  rgba(243,236,224,0.55)
```

**5 accent color options** (user-selectable via settings panel later):
- Green: `#4f9b6a` (default)
- Coral: `#e07a5f`
- Yellow: `#e6b54a`
- Blue: `#4a78c4`
- Mono: `#3a3530`

### Typography

**Google Fonts** added to `index.html` (preconnect + stylesheet):
- `Caveat` — headings, logo, labels, button text (handwritten style)
- `Inter` — body text, form inputs, data

```css
/* Base font stack */
body { font-family: 'Inter', system-ui, sans-serif; }
h1, h2, h3, h4, h5, h6, .hdr-logo, .btn { font-family: 'Caveat', cursive; }
```

### Component Classes (kept, redefined)

All existing HTML class names are preserved. Only CSS definitions change:

| Class | New Style |
|-------|-----------|
| `.btn--primary` | accent bg, ink text, `var(--wf-shadow)`, 2px ink border |
| `.btn--ghost` | transparent bg, 2px ink border |
| `.btn--danger` | accent=coral variant |
| `.card` | `border: var(--wf-border)`, no box-shadow → `var(--wf-shadow)` optional |
| `.chip` | `border-radius: 999px`, `1.5px border` |
| `.pill-tabs .tab.active` | accent bg, ink border |
| `.underline-tabs .tab.active` | 2px accent underline |
| `.input`, `.textarea` | `border: var(--wf-border)`, `border-radius: var(--wf-radius)` |
| `.kpi` | ink border, Caveat value font |

---

## CSS File Changes

| File | Action |
|------|--------|
| `static/css/theme.css` | Full rewrite — new `--wf-*` variables, dark mode |
| `static/css/base.css` | Rewrite — Google Fonts @import, body typography, reset |
| `static/css/design-system.css` | Full rewrite — all component classes in new style |
| `static/css/layout.css` | Update — header height (56px→56px, same), management 3-pane, testing layout |
| `static/css/components.css` | Update — test card, kpi-strip, modals in new style |
| `static/css/editor.css` | Update — editor forms/inputs in new style |

---

## HTML Changes (index.html)

1. Add Google Fonts `<link>` tags in `<head>`
2. Remove Tailwind CDN `<script>` tag (utility classes replaced by custom CSS)
3. Add `data-theme="light"` on `<html>` (was on `<body>`)
4. Header: wrap logo in `<span class="hdr-logo">` with Caveat font styling
5. Minor structural cleanup where Tailwind utility classes were used inline

---

## Screen Changes

### Auth Screen (`#screen-auth`)
- `.auth-card` → wf-border + wf-shadow
- Heading in Caveat font
- Tabs redesigned as pill-tabs with accent active state
- Input fields with new border style

### Management Screen (`#screen-management`)
- Left sidebar: filter chips (pill style) + test list
- Right panel: KPI strip + trend chart + action buttons
- Active test card: accent-soft bg + left accent border (2px)
- No structural JS changes needed

### Testing Screen (`#screen-testing`)
- Minimal chrome during test: no header visible (existing behavior kept)
- Question navigator grid: 5 columns, accent = current, accent-soft = answered
- Pre-test modal: wf-box style
- Progress bar: accent fill

### Profile Screen (`#screen-profile`)
- Two-column layout remains, both panels get wf-border style
- Avatar container: 2px ink border circle
- Form inputs: new style

### Editor Screen (`#screen-editor`)
- Editor list items: ink border bottom separator
- Form fields: wf-border inputs
- Dropzone: dashed wf-border

### Import Screen (`#screen-import`)
- Dropzone: dashed wf-border, hover → accent-soft bg

### Change Requests Screen (`#screen-change-requests`)
- Pending items: left 3px accent border
- Approved/rejected: muted styling

---

## Statistics Screen — 3 Tabs

The statistics screen (`#screen-stats`) is fully rebuilt with 3 tabs.

### Tab 1: Мой прогресс (StatsA)
Uses: `GET /api/stats/aggregate`, `GET /api/stats/heatmap`, `GET /api/tests/{id}/weak-questions`

- **KPI strip** (4 cards): Попытки / Точность / Среднее время / Стрик
- **Sparkline** — SVG-based score history (last N attempts), no Chart.js dependency
- **Activity heatmap** — 12×7 CSS grid, 4 intensity levels based on daily count:
  - 0: `var(--wf-ink-soft)`
  - 1: `var(--wf-accent-soft)`  
  - 2: `rgba(79,155,106,0.35)`
  - 3+: `var(--wf-accent)`
- **Weak questions** list (≤10 items, <60% accuracy, auth-only)

### Tab 2: По тесту (StatsB)
Uses: `GET /api/stats/attempts?test_id=`, `GET /api/stats/attempts/{id}`

- Test selector (reuse existing left sidebar)
- Per-attempt history list
- Question difficulty bars (horizontal flex bars, proportional to correct rate)
- Selected attempt detail panel

### Tab 3: Аналитика владельца (StatsC)
Uses: `GET /api/tests/{id}/owner-analytics` (existing endpoint)

- Shown only if `currentUser.id === test.ownerId`
- **KPI strip**: Всего попыток / Уникальные студенты / Средний балл / % сдавших
- **Score distribution** — horizontal bar chart (10 buckets)
- **Question difficulty** — top 10 hardest questions with accuracy bars
- **Weekly activity** — simple bar chart (4 weeks)

---

## Backend: New Endpoint

### `GET /api/stats/heatmap`

**File:** `api/routes/statistics.py`  
**Service:** `api/services/stats_service.py`  
**Auth:** Required (`Depends(get_current_user)`)

**Query params:**
- `weeks: int = 12` (1–52)

**Response:**
```json
{
  "days": [
    { "date": "2026-03-03", "count": 2 },
    { "date": "2026-03-04", "count": 0 },
    ...
  ],
  "weeks": 12
}
```

**SQL logic (stats_service.py → `get_activity_heatmap`):**
```python
# Group completed attempts by date for current user
SELECT DATE(finished_at) as day, COUNT(*) as cnt
FROM attempts
WHERE user_id = :user_id
  AND status = 'completed'
  AND finished_at >= :start_date
GROUP BY DATE(finished_at)
```
Returns sparse rows; service fills in zero-count days for full 12×7 grid.

**Frontend API wrapper** (`static/js/api.js`):
```js
async function fetchActivityHeatmap(weeks = 12) { ... }
```

---

## Migration Order (Послойная)

1. **Layer 1 — CSS Foundation** (zero JS changes)
   - Rewrite all 6 CSS files
   - Add Google Fonts to index.html
   - Test: all screens render, dark mode works, no broken layouts

2. **Layer 2 — HTML Cleanup**
   - Remove Tailwind CDN
   - Clean up inline Tailwind utility classes replaced by custom CSS
   - Minor header HTML adjustments

3. **Layer 3 — Screens** (HTML + minor JS where needed)
   - Auth → Management → Testing → Profile → Editor → Import → Change Requests
   - Each screen: adjust HTML structure where component shapes changed

4. **Layer 4 — Statistics**
   - Backend: `get_activity_heatmap()` in stats_service.py + route in statistics.py
   - Frontend: rewrite `statistics.js` — 3 tabs, SVG sparkline, heatmap renderer

---

## Verification

1. `uvicorn api:app --reload` — server starts without errors
2. Smoke test per `scripts/attempts_smoke.md`
3. Check each screen visually in light + dark mode
4. Register new user → check auth screen
5. Create test → management screen
6. Take test → testing screen
7. View statistics → all 3 tabs render; heatmap shows data
8. Check `GET /api/stats/heatmap` returns correct shape
9. Check profile, editor, import, change-requests screens
10. Responsive: resize to mobile width, check bottom nav adapts

---

## Files NOT Changed

- `static/js/app.js` — screen routing unchanged
- `static/js/state.js` — no state shape changes (add `activeStatsTab` to `state.stats`)
- `static/js/rendering.js` — class names preserved; check `renderQuestionNav` for grid columns
- `static/js/i18n.js` — no new keys needed initially
- `api/models/db/` — no schema changes
- `alembic/` — no migrations needed (heatmap is a query, no new table)
- `static/js/screens/` — only `statistics.js` changes (except minor HTML adjustments in others)

## Risks & Pre-checks

1. **`static/js/utils/theme.js`** — may call `document.documentElement.style.setProperty('--primary', ...)` or similar. Must be updated to set `--wf-accent` / `--wf-paper` etc. instead.
2. **Tailwind CDN removal** — before removing the CDN script tag, audit inline Tailwind utility classes in `index.html` and JS-generated HTML (e.g., in `rendering.js`, screen files). Replace each with equivalent custom CSS class or inline style. Do this audit as the first step of Layer 2.
