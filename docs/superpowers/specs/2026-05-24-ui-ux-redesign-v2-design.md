# UI Redesign v2 — Design Spec

**Date:** 2026-05-24  
**Status:** Approved by user  
**Scope:** Full UI redesign of all screens + data model additions for advanced statistics

---

## Context

The current UI uses a flat, emoji-heavy design with several UX problems: profile/logout are separate disconnected buttons, the statistics screen has no way to view owner-level analytics, the test settings panel is an always-visible accordion that competes for space with the question area, and the management screen is a card grid that doesn't surface enough context before starting a test.

This spec defines the redesigned layout for all five screens, the navigation model between them, the data model additions needed for the new statistics features, and one security fix (`isCorrect` hiding when `show_answers` is off).

---

## 1. Global — Header

**Layout:** fixed 52px bar, full width.

- **Left:** logo icon (emerald square) + `TestMaster` wordmark + underline nav links
  - `Тесты` — active: emerald text + 2px bottom border; inactive: muted gray
  - `Статистика` — same toggle behavior
- **Right:** theme toggle button (sun/moon SVG) + avatar chip
  - Avatar chip: `[avatar circle][username][chevron-down]`, background subtle, border 1px

**Avatar dropdown** (appears on chip click):
- User name + email (read-only header row)
- Language switcher: inline segmented `RU | EN | UZ` buttons, active = emerald fill
- Divider
- `Профиль` row with user-circle icon
- Divider
- `Выйти` row with arrow-right-on-rectangle icon, red text

All icons: Heroicons v2 outline SVG, `stroke="currentColor"`, size 15×15 in dropdown / 16×16 in header.  
No emoji anywhere in the UI.

---

## 2. Screen — «Тесты» (Management)

**Layout:** filter bar on top, two-panel split below.

### Filter bar
Pill-tab group: `Все | Мои | Доступные | Публичные` — active tab has emerald background.  
`+ Создать` button (emerald, with plus icon) pinned to the right.

### Left panel — test list
Compact rows. Each row:
- Access icon (globe = public, lock = private, users = shared) in matching tint circle
- Test title (truncated), question count below in muted text
- Last accuracy % on the right (emerald if exists, dash if no attempts)
- Active row: left border 2px emerald, light green background

### Right panel — detail
Shown when a test is selected. Contents:

1. **Title + access badge + question count + owner** (if not own test)
2. **4 KPI cards** in a row: `Точность %` · `Попытки` · `Ср. время` · `Слабых вопр.` (count where personal correct rate < 60%)
3. **Mini trend bar** — 5 narrow bars showing accuracy of last 5 attempts, color-coded emerald with opacity scale
4. **Action row:**
   - `▶ Начать` — primary emerald button (full width minus icons)
   - Edit icon button — pencil-square icon, ghost border (owners: opens editor; non-owners: propose changes)
   - Stats icon button — bar-chart icon, indigo tint background → navigates to Statistics screen with this test pre-selected

---

## 3. Screen — «Статистика» (Statistics)

**Layout:** two-panel. Left = test sidebar, right = tabbed content.

### Left sidebar — test list
Same visual language as management list but secondary info shows `N попыток · XX% ср.` instead of access badge.  
Tests with zero attempts shown at 40% opacity.

### Right — tab: «Мой прогресс»

**4 KPI:** Точность · Попытки · Ср. время · Стрик (fire-icon + «N дней подряд» — computed from `DATE(started_at)` grouping; fire SVG icon, not emoji)

**Progress chart:** Chart.js line chart, accuracy % per completed attempt (x = attempt index, y = percent_correct). Lazy-loaded.

**Weak questions panel:** top questions by lowest personal accuracy across all attempts for this test. Shows question index + accuracy bar (red gradient). Sourced from new `question_performance` table.

**Time & freeze panel:** questions where `avg_duration_ms` is high AND `correct_count / total_count` is low — sorted by combined score. Shows question index, avg time, correct rate.

### Right — tab: «Аналитика теста» *(visible only to test owner)*

**4 KPI:** Всего попыток · Уникальных студентов · Средний балл · Процент сдачи (>= 60%)

**Question difficulty chart:** horizontal bar per question, color red→yellow→green by % correct across ALL users. Sourced from `question_performance` grouped across all user_ids. Shows top-5 hardest and top-5 easiest; expandable to full list.

**Score distribution histogram:** Chart.js bar chart. X = score buckets (0-10%, 10-20% … 90-100%), Y = student count. Computed from `percent_correct` across all attempts.

**Common wrong answers:** for questions with correct rate < 50%, show which distractor is most often selected. Aggregated from raw attempt answers (`canonical_answer_index`) server-side — data is always collected regardless of `show_answers` setting. Displayed as: question label + «правильный: вариант X» + «YY% берут вариант Z» + distractor text.

**Activity chart:** bar chart of attempt count per week, last 4 weeks. KPI chips: new students this week, total attempts this week.

### Navigation between screens
- Header nav `Тесты ⇄ Статистика` switches screens instantly
- Indigo stats icon in management detail panel → opens Statistics with that test pre-selected in sidebar

---

## 4. Screen — Testing

### Pre-test settings modal
Triggered by `▶ Начать` in management detail panel.  
Modal overlay (backdrop blur), centered card:
- Test title + subtitle
- **Вопросов:** stepper `[−] N [+]` (min 1, max = total questions)
- Toggle switches (not checkboxes) for: Перемешать вопросы · Перемешать варианты · Только непройденные · Показывать ответы
- `▶ Начать тест` button (full width, emerald)

### During test — desktop layout
Two-panel: left sidebar (fixed width ~220px) + right question area.

**Left sidebar:**
- Test title (truncated) + `Вопрос N из M`
- Progress bar (emerald fill)
- Question grid: colored squares — emerald = correct, red = wrong, dark highlight = current, gray = unanswered. Tap/click jumps to that question.
- Legend: ● верно ● неверно
- Bottom: `Настройки` ghost button (reopens settings modal mid-test) + `Завершить` danger button

**Right question area:**
- Question text (full width, generous padding)
- Answer options as radio cards: full-width pill rows, selected state = emerald border + light green background
- Navigation: `← Назад` ghost + `Далее →` emerald buttons

### During test — mobile layout
Applies at viewport width < 768px. **No left sidebar.** Replaced by bottom sheet.

- **Top bar:** back arrow + `Q N/M` + progress bar + `Стоп` button
- **Question area:** takes full screen width
- **Bottom strip (collapsed):** mini row of colored squares (first ~8 questions) + chevron-up tap target
- **Bottom sheet (expanded):** slides up, dims question, shows full question grid + `Завершить` button. Swipe down or tap backdrop to dismiss.

### Question navigation — three methods simultaneously
1. `← / →` buttons always visible below answer options
2. Swipe left/right on question card (mobile touch gesture)
3. Tap question number in sidebar grid (desktop) or bottom sheet (mobile)

---

## 5. Data Model Changes

### 5a. `canonical_answer_index` on attempt answers

**Problem:** when `random_options` is enabled, `answer_index` stores the display-position which varies across attempts, making cross-attempt aggregation meaningless.

**Fix:** store an additional `canonical_answer_index: int | null` alongside `answer_index`. This is the index in the original unshuffled options array.

- Frontend computes and sends `canonical_answer_index` alongside `display_answer_index`
- Backend stores both; uses `canonical_answer_index` for analytics
- `canonical_answer_index` is **never returned** in API responses to the submitting user (only aggregated in owner analytics)
- When `random_options` is off: `canonical_answer_index == display_answer_index`

### 5b. `question_performance` aggregate table

New table updated after every attempt finalization:

```sql
CREATE TABLE question_performance (
  id            INTEGER PRIMARY KEY,
  test_id       TEXT NOT NULL,
  user_id       INTEGER,          -- NULL = anonymous
  question_id   INTEGER NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_count   INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  last_seen_at  DATETIME,
  UNIQUE (test_id, user_id, question_id)
);
```

- Upserted on attempt `finish` via `INSERT OR REPLACE` / `ON CONFLICT DO UPDATE`
- Personal weak questions query: `WHERE test_id=X AND user_id=Y ORDER BY correct_count/total_count ASC`
- Owner difficulty query: `WHERE test_id=X GROUP BY question_id` (aggregate across all users)
- Alembic migration required

### 5c. Security fix — `isCorrect` hiding

When `settings.show_answers == false`, the `record_attempt_answer` endpoint must **not** return `isCorrect` in the response body (return `null`). Correct/incorrect is revealed only after `POST /attempts/{id}/finish`.

Currently `isCorrect` is always returned immediately, enabling a "probe all options" cheat.

---

## 6. Screens not redesigned in this spec

- **Profile screen** — layout unchanged; visual polish (Tailwind classes) only
- **Auth screen** — already redesigned in v1; no changes
- **Modals** (editor, import, access, change-requests) — Tailwind polish only, no structural changes

---

## 7. Verification

| What | How |
|---|---|
| Header dropdown | Open app → click avatar chip → dropdown appears with language switcher, profile, logout; theme button in header still works |
| Language in dropdown | Switch RU→EN in dropdown → UI language changes without reload |
| Management two-panel | Click test in list → right panel shows 4 KPI + trend + action buttons |
| Stats button navigation | Click indigo stats icon → Statistics screen opens with correct test pre-selected |
| Stats owner tab | Log in as test owner → Statistics → «Аналитика теста» tab visible and shows difficulty bars |
| Stats student tab | Log in as non-owner → «Аналитика теста» tab not visible |
| Weak questions | Complete 3+ attempts → management panel and stats screen show questions with lowest accuracy |
| Pre-test modal | Click «Начать» → modal appears with toggles and stepper; cancel returns to management |
| question_performance | After finishing an attempt: `SELECT * FROM question_performance WHERE test_id=X` → rows upserted |
| canonical_answer_index | With random_options on: submit answer → `canonical_answer_index` stored in DB, not returned in API response |
| isCorrect hiding | With show_answers=false: submit answer → response has `isCorrect: null`; finalize attempt → `isCorrect` visible in detail |
| Mobile bottom sheet | Resize browser to 375px → sidebar gone, bottom strip appears; tap chevron → sheet expands with full grid |
| Three-way navigation | Desktop: ←/→ buttons + grid click work; Mobile: swipe + buttons + sheet grid click all navigate |
| No emoji | grep for emoji codepoints in index.html → zero results |
