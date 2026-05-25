/**
 * Statistics Screen — 3-tab redesign (StatsA / StatsB / StatsC)
 *
 * Tab A — "Мой прогресс": KPI strip, sparkline, activity heatmap, weak questions
 * Tab B — "По тесту":    attempt history list, attempt detail, question difficulty
 * Tab C — "Аналитика владельца": owner KPIs, score distribution, difficulty, weekly activity
 */

import {
  apiFetch,
  fetchAttemptStats,
  fetchActivityHeatmap,
  fetchMyAggregate,
} from "../api.js";
import { setActiveScreen } from "../rendering.js";
import { dom, state } from "../state.js";
import { getClientId } from "../telemetry.js";
import { t } from "../i18n.js";

let _tabsInitialized = false;

// ---------------------------------------------------------------------------
// Chart.js lazy-loader (used only for owner distribution bar chart)
// ---------------------------------------------------------------------------

async function ensureChartJs() {
  if (window.Chart) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmtPct(v) {
  if (v == null) return "—";
  return `${Math.round(v)}%`;
}

function fmtMs(ms) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}${t("timeSeconds")}`;
  return `${Math.round(s / 60)}${t("timeMinutes")}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

// ---------------------------------------------------------------------------
// KPI card helper
// ---------------------------------------------------------------------------

function renderKpiCards(container, kpis) {
  if (!container) return;
  container.innerHTML = "";
  kpis.forEach(({ label, value }) => {
    const card = document.createElement("div");
    card.className = "kpi";
    const lbl = document.createElement("div");
    lbl.className = "kpi__label";
    lbl.textContent = label;
    const val = document.createElement("div");
    val.className = "kpi__value";
    val.textContent = String(value ?? "—");
    card.append(lbl, val);
    container.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// SVG Sparkline (inline, no Chart.js)
// ---------------------------------------------------------------------------

function renderSparkline(container, values) {
  if (!container) return;
  container.innerHTML = "";

  if (!values || values.length === 0) {
    const msg = document.createElement("div");
    msg.style.cssText = "font-size:0.8rem;color:var(--wf-ink-mute);padding:0.5rem 0;";
    msg.textContent = t("noDataYet") || "Нет данных";
    container.appendChild(msg);
    return;
  }

  const W = 600;
  const H = 64;
  const pad = 4;
  const min = 0;
  const max = 100;

  const scaleX = (i) => pad + (i / (values.length - 1 || 1)) * (W - pad * 2);
  const scaleY = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);

  const pts = values.map((v, i) => `${scaleX(i).toFixed(1)},${scaleY(v).toFixed(1)}`).join(" ");
  const areaBot = `${scaleX(values.length - 1).toFixed(1)},${H - pad} ${scaleX(0).toFixed(1)},${H - pad}`;

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("stats-sparkline");
  svg.setAttribute("aria-hidden", "true");

  // Guide lines at 0, 50, 100
  [0, 50, 100].forEach((pct) => {
    const y = scaleY(pct).toFixed(1);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", pad);
    line.setAttribute("y1", y);
    line.setAttribute("x2", W - pad);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "var(--wf-ink-soft)");
    line.setAttribute("stroke-width", "1");
    svg.appendChild(line);
  });

  // Filled area
  const poly = document.createElementNS(ns, "polygon");
  poly.setAttribute("points", `${pts} ${areaBot}`);
  poly.setAttribute("fill", "var(--wf-accent-soft)");
  svg.appendChild(poly);

  // Line
  const pl = document.createElementNS(ns, "polyline");
  pl.setAttribute("points", pts);
  pl.setAttribute("fill", "none");
  pl.setAttribute("stroke", "var(--wf-accent)");
  pl.setAttribute("stroke-width", "2");
  pl.setAttribute("stroke-linecap", "round");
  pl.setAttribute("stroke-linejoin", "round");
  svg.appendChild(pl);

  // Dots
  values.forEach((v, i) => {
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", scaleX(i).toFixed(1));
    circle.setAttribute("cy", scaleY(v).toFixed(1));
    circle.setAttribute("r", "3");
    circle.setAttribute("fill", "var(--wf-accent)");
    svg.appendChild(circle);
  });

  container.appendChild(svg);
}

// ---------------------------------------------------------------------------
// Activity heatmap (12×7 CSS grid)
// ---------------------------------------------------------------------------

function renderHeatmap(container, heatmapData) {
  if (!container) return;
  container.innerHTML = "";

  if (!heatmapData || !heatmapData.days || heatmapData.days.length === 0) {
    const msg = document.createElement("div");
    msg.style.cssText = "font-size:0.8rem;color:var(--wf-ink-mute);";
    msg.textContent = t("noDataYet") || "Нет данных";
    container.appendChild(msg);
    return;
  }

  const weeks = heatmapData.weeks || 12;
  const days = heatmapData.days;

  // Grid: weeks columns × 7 rows (Mon–Sun)
  const grid = document.createElement("div");
  grid.className = "stats-heatmap-grid";
  grid.style.gridTemplateColumns = `repeat(${weeks}, 1fr)`;

  // Split days into week columns
  for (let w = 0; w < weeks; w++) {
    const weekCol = document.createElement("div");
    weekCol.className = "stats-heatmap-week";
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      const dayData = days[idx] || { count: 0 };
      const count = dayData.count || 0;
      const cell = document.createElement("div");
      cell.className = "stats-heatmap-cell";
      const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
      if (level > 0) cell.setAttribute("data-level", level);
      cell.title = dayData.date ? `${dayData.date}: ${count}` : String(count);
      weekCol.appendChild(cell);
    }
    grid.appendChild(weekCol);
  }

  container.appendChild(grid);

  // Legend
  const legend = document.createElement("div");
  legend.className = "stats-heatmap-legend";
  const lessLabel = document.createElement("span");
  lessLabel.textContent = t("heatmapLess") || "Меньше";
  legend.appendChild(lessLabel);
  [0, 1, 2, 3].forEach((level) => {
    const c = document.createElement("div");
    c.className = "stats-heatmap-legend__cell stats-heatmap-cell";
    if (level > 0) c.setAttribute("data-level", level);
    legend.appendChild(c);
  });
  const moreLabel = document.createElement("span");
  moreLabel.textContent = t("heatmapMore") || "Больше";
  legend.appendChild(moreLabel);
  container.appendChild(legend);
}

// ---------------------------------------------------------------------------
// Streak loader
// ---------------------------------------------------------------------------

async function loadStreak() {
  try {
    const data = await apiFetch("/api/stats/streak");
    state.stats.streak = data.streak ?? 0;
  } catch {
    state.stats.streak = 0;
  }
}

// ---------------------------------------------------------------------------
// Tab A: «Мой прогресс» (StatsA)
// ---------------------------------------------------------------------------

async function loadTabA() {
  try {
    // Load streak and aggregate in parallel
    const [agg] = await Promise.all([
      state.currentUser
        ? fetchMyAggregate().catch(() => null)
        : Promise.resolve(null),
      state.currentUser ? loadStreak() : Promise.resolve(),
    ]);

    const attemptCount = agg?.attemptCount ?? 0;
    const avgPct = agg?.avgPercentCorrect ?? null;
    const avgMs = agg?.avgTimePerQuestion ?? null;
    const streak = state.stats.streak ?? 0;

    renderKpiCards(dom.statsProgressKpis, [
      { label: t("kpiAttempts"), value: attemptCount },
      { label: t("kpiAccuracy"), value: fmtPct(avgPct) },
      { label: t("kpiAvgTime"), value: fmtMs(avgMs) },
      { label: t("kpiStreak"), value: `${streak} ${t("daysSuffix")}` },
    ]);

    // Load attempt history for sparkline (uses clientId)
    const clientId = getClientId();
    let attemptValues = [];
    try {
      const res = await fetchAttemptStats(clientId, { limit: 20 });
      const attempts = (res.attempts || []).slice().reverse();
      attemptValues = attempts.map((a) => a.percentCorrect ?? 0);
      state.stats.attempts = attempts;
    } catch {
      // ok — guest or no data
    }
    renderSparkline(dom.statsProgressSparkline, attemptValues);

    // Load heatmap (auth only)
    if (state.currentUser) {
      try {
        const heatmapData = await fetchActivityHeatmap(12);
        state.stats.heatmapData = heatmapData;
        renderHeatmap(dom.statsProgressHeatmap, heatmapData);
      } catch {
        renderHeatmap(dom.statsProgressHeatmap, null);
      }

      // Weak questions for selected test
      if (state.stats.selectedTestId) {
        dom.statsWeakCard?.classList.remove("is-hidden");
        await loadWeakQuestions(state.stats.selectedTestId);
      }
    }
  } catch (err) {
    console.warn("[stats] loadTabA error:", err);
  }
}

async function loadWeakQuestions(testId) {
  const container = dom.statsWeakQuestions;
  if (!container) return;
  container.innerHTML = "";

  try {
    const data = await apiFetch(`/api/tests/${testId}/weak-questions`);
    const questions = data.questions || [];
    state.stats.weakQuestions = questions;

    if (questions.length === 0) {
      const msg = document.createElement("div");
      msg.style.cssText = "font-size:0.8rem;color:var(--wf-ink-mute);";
      msg.textContent = t("noWeakQuestions");
      container.appendChild(msg);
      return;
    }

    questions.forEach((q, idx) => {
      const pct = q.totalCount > 0 ? Math.round((q.correctCount / q.totalCount) * 100) : 0;
      const row = document.createElement("div");
      row.className = "stats-diff-row";
      const lbl = document.createElement("div");
      lbl.className = "stats-diff-row__label";
      lbl.textContent = `Q${idx + 1} (ID ${q.questionId})`;
      const bar = document.createElement("div");
      bar.className = "stats-diff-row__bar";
      const fill = document.createElement("div");
      fill.className = `stats-diff-row__fill ${pct < 40 ? "stats-diff-row__fill--low" : pct < 70 ? "stats-diff-row__fill--mid" : "stats-diff-row__fill--high"}`;
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      const pctLbl = document.createElement("div");
      pctLbl.className = "stats-diff-row__pct";
      pctLbl.textContent = `${pct}%`;
      row.append(lbl, bar, pctLbl);
      container.appendChild(row);
    });
  } catch {
    // Silently ignore (e.g. 401)
  }
}

// ---------------------------------------------------------------------------
// Tab B: «По тесту» (StatsB)
// ---------------------------------------------------------------------------

async function loadTabB(testId) {
  if (!testId) {
    _showTabBEmpty();
    return;
  }

  const clientId = getClientId();
  try {
    const res = await fetchAttemptStats(clientId, { testId });
    const attempts = (res.attempts || []).slice().reverse();
    renderAttemptList(attempts);
  } catch (err) {
    console.warn("[stats] loadTabB error:", err);
  }
}

function _showTabBEmpty() {
  if (dom.statsByTestAttempts) {
    dom.statsByTestAttempts.innerHTML = `<div style="font-size:0.85rem;color:var(--wf-ink-mute);padding:0.5rem 0;">${t("statsSelectTestPrompt") || "Выберите тест"}</div>`;
  }
}

function renderAttemptList(attempts) {
  const container = dom.statsByTestAttempts;
  if (!container) return;
  container.innerHTML = "";

  if (!attempts.length) {
    const msg = document.createElement("div");
    msg.style.cssText = "font-size:0.85rem;color:var(--wf-ink-mute);padding:0.5rem 0;";
    msg.textContent = t("noAttemptsYet") || "Нет попыток";
    container.appendChild(msg);
    return;
  }

  attempts.forEach((attempt, idx) => {
    const pct = attempt.percentCorrect ?? 0;
    const row = document.createElement("div");
    row.className = "stats-attempt-row";
    row.dataset.attemptId = attempt.attemptId;

    const num = document.createElement("div");
    num.className = "stats-attempt-row__num";
    num.textContent = `#${idx + 1}`;

    const score = document.createElement("div");
    score.className = "stats-attempt-row__score";
    score.textContent = fmtPct(pct);

    const date = document.createElement("div");
    date.className = "stats-attempt-row__date";
    date.textContent = fmtDate(attempt.finishedAt || attempt.startedAt);

    const barWrap = document.createElement("div");
    barWrap.className = "stats-attempt-row__bar";
    const fill = document.createElement("div");
    fill.className = "stats-attempt-row__bar-fill";
    fill.style.width = `${pct}%`;
    barWrap.appendChild(fill);

    row.append(num, score, date, barWrap);
    row.addEventListener("click", () => showAttemptDetail(attempt, idx));
    container.appendChild(row);
  });
}

async function showAttemptDetail(attempt, idx) {
  // Mark selected row
  dom.statsByTestAttempts?.querySelectorAll(".stats-attempt-row").forEach((r) =>
    r.classList.toggle("is-active", r.dataset.attemptId === attempt.attemptId)
  );

  const panel = dom.statsByTestDetail;
  const content = dom.statsByTestDetailContent;
  if (!panel || !content) return;
  panel.classList.remove("is-hidden");
  content.innerHTML = "";

  const pct = attempt.percentCorrect ?? 0;
  const header = document.createElement("div");
  header.className = "stats-detail-header";
  const scoreEl = document.createElement("div");
  scoreEl.className = "stats-detail-score";
  scoreEl.textContent = fmtPct(pct);
  const metaEl = document.createElement("div");
  metaEl.className = "stats-detail-meta";
  metaEl.textContent = [
    `${attempt.correctCount ?? 0}/${attempt.questionCount ?? 0} верно`,
    fmtMs(attempt.totalDurationMs),
    fmtDate(attempt.finishedAt),
  ].filter(Boolean).join(" · ");
  header.append(scoreEl, metaEl);
  content.appendChild(header);

  // Per-question difficulty bars (from attempt data)
  if (state.stats.selectedTestId) {
    const diffEl = dom.statsByTestDifficulty;
    if (diffEl) {
      diffEl.innerHTML = "";
      const heading = document.createElement("h3");
      heading.className = "stats-section-title";
      heading.textContent = t("difficultyChartTitle") || "Сложность вопросов";
      diffEl.appendChild(heading);
      // Load difficulty from QuestionPerformance via owner-analytics or just show attempt answers
      try {
        const data = await apiFetch(`/api/tests/${state.stats.selectedTestId}/owner-analytics`);
        renderDiffBars(diffEl, data.questionDifficulty || []);
      } catch {
        // 403 if not owner — skip
      }
    }
  }
}

function renderDiffBars(container, items) {
  if (!items.length) {
    const msg = document.createElement("div");
    msg.style.cssText = "font-size:0.8rem;color:var(--wf-ink-mute);";
    msg.textContent = "—";
    container.appendChild(msg);
    return;
  }
  items.forEach((q, idx) => {
    const pct = Math.round(q.correctRate ?? 0);
    const row = document.createElement("div");
    row.className = "stats-diff-row";
    const lbl = document.createElement("div");
    lbl.className = "stats-diff-row__label";
    lbl.textContent = `Q${idx + 1}`;
    const bar = document.createElement("div");
    bar.className = "stats-diff-row__bar";
    const fill = document.createElement("div");
    fill.className = `stats-diff-row__fill ${pct < 40 ? "stats-diff-row__fill--low" : pct < 70 ? "stats-diff-row__fill--mid" : "stats-diff-row__fill--high"}`;
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    const pctLbl = document.createElement("div");
    pctLbl.className = "stats-diff-row__pct";
    pctLbl.textContent = `${pct}%`;
    row.append(lbl, bar, pctLbl);
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Tab C: «Аналитика владельца» (StatsC)
// ---------------------------------------------------------------------------

async function loadTabC(testId) {
  if (!testId) return;

  try {
    const data = await apiFetch(`/api/tests/${testId}/owner-analytics`);
    state.stats.ownerAnalytics = data;

    const kpis = data.kpis || {};
    renderKpiCards(dom.statsOwnerKpis, [
      { label: t("totalAttempts"), value: kpis.totalAttempts ?? 0 },
      { label: t("totalUsers"), value: kpis.uniqueStudents ?? 0 },
      { label: t("kpiAccuracy"), value: fmtPct(kpis.avgScore) },
      { label: "Сдали (≥60%)", value: fmtPct(kpis.passRate) },
    ]);

    renderOwnerDiffBars(data.questionDifficulty || []);
    await renderOwnerDistChart(data.scoreDistribution || []);
    renderOwnerActivity(data.activityByWeek || []);
  } catch (err) {
    if (err.message?.includes("403")) {
      dom.statsOwnerTab?.classList.add("is-hidden");
      if (state.stats.activeStatsTab === "owner") {
        _switchTab("progress");
      }
    } else {
      console.warn("[stats] loadTabC error:", err);
    }
  }
}

function renderOwnerDiffBars(items) {
  const container = dom.statsOwnerDifficultyChart;
  if (!container) return;
  container.innerHTML = "";
  if (!items.length) {
    container.innerHTML = `<div style="font-size:0.8rem;color:var(--wf-ink-mute);">—</div>`;
    return;
  }
  renderDiffBars(container, items);
}

async function renderOwnerDistChart(scoreDistribution) {
  const canvas = dom.statsOwnerDistChart;
  if (!canvas) return;
  await ensureChartJs();
  if (canvas._chartInstance) {
    canvas._chartInstance.destroy();
    canvas._chartInstance = null;
  }
  const ctx = canvas.getContext("2d");
  canvas._chartInstance = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels: scoreDistribution.map((d) => d.bucket),
      datasets: [{
        label: t("scoreDistTitle"),
        data: scoreDistribution.map((d) => d.count),
        backgroundColor: "rgba(79,155,106,0.7)",
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { color: "var(--wf-ink-mute)", stepSize: 1 } },
        x: { ticks: { color: "var(--wf-ink-mute)" }, grid: { display: false } },
      },
    },
  });
}

function renderOwnerActivity(activityByWeek) {
  const container = dom.statsOwnerActivity;
  if (!container) return;
  container.innerHTML = "";
  if (!activityByWeek.length) {
    container.innerHTML = `<div style="font-size:0.8rem;color:var(--wf-ink-mute);">—</div>`;
    return;
  }
  const maxCount = Math.max(...activityByWeek.map((w) => w.count), 1);
  activityByWeek.forEach((week) => {
    const pct = Math.round((week.count / maxCount) * 100);
    const row = document.createElement("div");
    row.className = "stats-diff-row";
    const lbl = document.createElement("div");
    lbl.className = "stats-diff-row__label";
    lbl.style.width = "80px";
    lbl.textContent = week.week || "—";
    const bar = document.createElement("div");
    bar.className = "stats-diff-row__bar";
    bar.style.width = "auto";
    bar.style.flex = "1";
    const fill = document.createElement("div");
    fill.className = "stats-diff-row__fill stats-diff-row__fill--high";
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    const cnt = document.createElement("div");
    cnt.className = "stats-diff-row__pct";
    cnt.textContent = String(week.count);
    row.append(lbl, bar, cnt);
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Sidebar rendering
// ---------------------------------------------------------------------------

export function renderStatsTestSidebar(tests) {
  const sel = document.getElementById("stats-test-select");
  if (sel) {
    sel.innerHTML = "";
    const firstOpt = document.createElement("option");
    firstOpt.value = "";
    firstOpt.textContent = t("selectTestPlaceholder");
    sel.appendChild(firstOpt);
    (tests || []).forEach((test) => {
      const opt = document.createElement("option");
      opt.value = test.id;
      opt.textContent = test.title || test.id;
      if (test.id === state.stats.selectedTestId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  const list = dom.statsTestSidebarList;
  if (!list) return;
  list.innerHTML = "";
  (tests || []).forEach((test) => {
    const isActive = test.id === state.stats.selectedTestId;
    const row = document.createElement("div");
    row.style.cssText = [
      "padding:0.65rem 0.75rem;cursor:pointer;border-radius:var(--wf-radius);",
      "border-left:2px solid transparent;transition:background 0.15s;",
      isActive ? "border-left-color:var(--wf-accent);background:var(--wf-accent-soft);" : "",
    ].join("");
    const title = document.createElement("div");
    title.style.cssText = "font-size:0.85rem;font-weight:600;color:var(--wf-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    title.textContent = test.title || `Test ${test.id}`;
    row.appendChild(title);
    row.addEventListener("click", () => selectStatsTest(test.id));
    list.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Test selection
// ---------------------------------------------------------------------------

export async function selectStatsTest(testId) {
  state.stats.selectedTestId = testId;
  renderStatsTestSidebar(state.testsCache);

  const test = state.testsCache.find((t) => t.id === testId);
  const isOwner = test && state.currentUser && test.owner_id === state.currentUser.id;

  if (dom.statsOwnerTab) {
    if (isOwner) {
      dom.statsOwnerTab.classList.remove("is-hidden");
    } else {
      dom.statsOwnerTab.classList.add("is-hidden");
      if (state.stats.activeStatsTab === "owner") _switchTab("progress");
    }
  }

  // Reload the active tab
  const tab = state.stats.activeStatsTab;
  if (tab === "progress") await loadTabA();
  else if (tab === "bytest") await loadTabB(testId);
  else if (tab === "owner" && isOwner) await loadTabC(testId);
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

function _switchTab(name) {
  state.stats.activeStatsTab = name;
  state.stats.activeTab = name; // keep legacy compat

  const tabs = {
    progress: { tab: dom.statsProgressTab, panel: dom.statsProgressPanel },
    bytest:   { tab: dom.statsByTestTab,   panel: dom.statsByTestPanel },
    owner:    { tab: dom.statsOwnerTab,    panel: dom.statsOwnerPanel },
  };

  Object.entries(tabs).forEach(([key, { tab, panel }]) => {
    const active = key === name;
    tab?.classList.toggle("is-active", active);
    panel?.classList.toggle("is-hidden", !active);
  });
}

// ---------------------------------------------------------------------------
// Tab initialization
// ---------------------------------------------------------------------------

export function initStatsTabs() {
  if (_tabsInitialized) return;
  _tabsInitialized = true;

  dom.statsProgressTab?.addEventListener("click", async () => {
    _switchTab("progress");
    await loadTabA();
  });

  dom.statsByTestTab?.addEventListener("click", async () => {
    _switchTab("bytest");
    await loadTabB(state.stats.selectedTestId);
  });

  dom.statsOwnerTab?.addEventListener("click", async () => {
    _switchTab("owner");
    await loadTabC(state.stats.selectedTestId);
  });

  document.getElementById("stats-test-select")?.addEventListener("change", (e) => {
    if (e.target.value) selectStatsTest(e.target.value);
  });
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export async function openStatsScreen(testId = null) {
  setActiveScreen("stats");
  renderStatsTestSidebar(state.testsCache);

  if (testId) state.stats.selectedTestId = testId;

  _switchTab(state.stats.activeStatsTab || "progress");

  const targetId = state.stats.selectedTestId || state.testsCache[0]?.id || null;
  if (targetId && targetId !== state.stats.selectedTestId) {
    state.stats.selectedTestId = targetId;
    renderStatsTestSidebar(state.testsCache);
  }

  await loadTabA();
}

export async function loadStatsData({ preserveSelection = true } = {}) {
  renderStatsTestSidebar(state.testsCache);
  const targetId =
    state.stats.selectedTestId || state.stats.filterTestId || state.testsCache[0]?.id || null;
  if (targetId && !state.stats.selectedTestId) {
    state.stats.selectedTestId = targetId;
    renderStatsTestSidebar(state.testsCache);
  }
  await loadTabA();
}

// ---------------------------------------------------------------------------
// Legacy compat stubs
// ---------------------------------------------------------------------------

export async function loadAttemptDetails() {}
export function populateTestFilter() {}

// ---------------------------------------------------------------------------
// Event initialization
// ---------------------------------------------------------------------------

export function initializeStatsScreenEvents() {
  initStatsTabs();

  dom.statsBackButton?.addEventListener("click", () => {
    setActiveScreen("management");
  });

  dom.statsRefreshButton?.addEventListener("click", () => {
    const tab = state.stats.activeStatsTab || "progress";
    if (tab === "progress") loadTabA();
    else if (tab === "bytest") loadTabB(state.stats.selectedTestId);
    else if (tab === "owner") loadTabC(state.stats.selectedTestId);
  });
}
