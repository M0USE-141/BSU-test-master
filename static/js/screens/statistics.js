/**
 * Statistics Screen — two-panel redesign
 *
 * Left panel: test sidebar
 * Right panel: tabbed (progress | owner analytics)
 */

import { apiFetch, fetchAttemptStats } from "../api.js";
import { setActiveScreen } from "../rendering.js";
import { dom, state } from "../state.js";
import { getClientId } from "../telemetry.js";
import { t } from "../i18n.js";

// ---------------------------------------------------------------------------
// Chart.js lazy-loader
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
// KPI card helper (no innerHTML)
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
    card.appendChild(lbl);
    card.appendChild(val);
    container.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmtPct(value) {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}%`;
}

function fmtMs(ms) {
  if (ms === null || ms === undefined || ms === 0) return "—";
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}${t("timeSeconds")}`;
  return `${Math.round(secs / 60)}${t("timeMinutes")}`;
}

// ---------------------------------------------------------------------------
// Streak loader (fire-and-forget)
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
// Sidebar rendering
// ---------------------------------------------------------------------------

export function renderStatsTestSidebar(tests) {
  // Populate the header test-select dropdown
  const sel = document.getElementById("stats-test-select");
  if (sel) {
    const placeholder = sel.querySelector("option[value='']");
    sel.innerHTML = "";
    const firstOpt = document.createElement("option");
    firstOpt.value = "";
    firstOpt.textContent = placeholder?.textContent || "Выберите тест...";
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

  if (!tests || tests.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "padding:1rem;color:var(--muted);font-size:0.85rem;";
    empty.textContent = t("noTestsAvailable");
    list.appendChild(empty);
    return;
  }

  tests.forEach((test) => {
    const attemptCount = test.attempt_count ?? 0;
    const avgAccuracy = test.avg_accuracy ?? null;
    const isActive = test.id === state.stats.selectedTestId;

    const row = document.createElement("div");
    row.style.cssText = [
      "padding:0.65rem 0.75rem;cursor:pointer;border-radius:8px;",
      "border-left:2px solid transparent;transition:background 0.15s;",
      isActive
        ? "border-left-color:var(--primary,#059669);background:var(--primary-soft,#d1fae5);"
        : "background:transparent;",
      attemptCount === 0 ? "opacity:0.4;" : "",
    ].join("");

    const title = document.createElement("div");
    title.style.cssText =
      "font-size:0.85rem;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    title.textContent = test.title || `Test ${test.id}`;

    const meta = document.createElement("div");
    meta.style.cssText = "font-size:0.72rem;color:var(--muted);margin-top:0.2rem;";
    const pctStr = avgAccuracy !== null ? ` · ${fmtPct(avgAccuracy)} avg` : "";
    meta.textContent = `${attemptCount} ${t("kpiAttempts").toLowerCase()}${pctStr}`;

    row.appendChild(title);
    row.appendChild(meta);

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

  // Show/hide owner tab depending on ownership
  if (dom.statsOwnerTab) {
    if (isOwner) {
      dom.statsOwnerTab.classList.remove("is-hidden");
    } else {
      dom.statsOwnerTab.classList.add("is-hidden");
      // If currently on owner tab, switch to progress
      if (state.stats.activeTab === "owner") {
        state.stats.activeTab = "progress";
        _switchToProgressTab();
      }
    }
  }

  // Always load progress tab
  await loadProgressTab(testId);

  // Load owner tab if visible and on owner tab, or if owner tab is active
  if (isOwner && state.stats.activeTab === "owner") {
    await loadOwnerTab(testId);
  }
}

// ---------------------------------------------------------------------------
// Tab switching helpers
// ---------------------------------------------------------------------------

function _switchToProgressTab() {
  dom.statsProgressTab?.classList.add("is-active");
  dom.statsOwnerTab?.classList.remove("is-active");
  dom.statsProgressPanel?.classList.remove("is-hidden");
  dom.statsOwnerPanel?.classList.add("is-hidden");
}

function _switchToOwnerTab() {
  dom.statsOwnerTab?.classList.add("is-active");
  dom.statsProgressTab?.classList.remove("is-active");
  dom.statsOwnerPanel?.classList.remove("is-hidden");
  dom.statsProgressPanel?.classList.add("is-hidden");
}

// ---------------------------------------------------------------------------
// Tab initialization
// ---------------------------------------------------------------------------

export function initStatsTabs() {
  dom.statsProgressTab?.addEventListener("click", () => {
    state.stats.activeTab = "progress";
    _switchToProgressTab();
  });

  dom.statsOwnerTab?.addEventListener("click", async () => {
    state.stats.activeTab = "owner";
    _switchToOwnerTab();
    if (state.stats.selectedTestId) {
      await loadOwnerTab(state.stats.selectedTestId);
    }
  });

  // Wire header test-select dropdown
  document.getElementById("stats-test-select")?.addEventListener("change", (e) => {
    if (e.target.value) selectStatsTest(e.target.value);
  });
}

// ---------------------------------------------------------------------------
// Progress tab
// ---------------------------------------------------------------------------

async function loadProgressTab(testId) {
  if (!testId) return;

  try {
    const clientId = getClientId();
    const response = await fetchAttemptStats(clientId, { testId });
    const attempts = response.attempts || response || [];
    state.stats.attempts = attempts;
    state.stats.total = response.total ?? attempts.length;

    // Compute KPIs
    const count = attempts.length;
    const avgPct =
      count > 0
        ? Math.round(
            attempts.reduce((s, a) => s + (a.percentCorrect ?? 0), 0) / count
          )
        : null;
    const avgMs =
      count > 0
        ? Math.round(
            attempts.reduce((s, a) => s + (a.totalDurationMs ?? 0), 0) / count
          )
        : null;

    const kpis = [
      { label: t("kpiAttempts"), value: count },
      { label: t("kpiAccuracy"), value: fmtPct(avgPct) },
      { label: t("kpiAvgTime"), value: fmtMs(avgMs) },
      { label: t("kpiStreak"), value: `${state.stats.streak} ${t("daysSuffix")}` },
    ];
    renderKpiCards(dom.statsProgressKpis, kpis);

    // Chart — attempts sorted oldest → newest
    await renderProgressChart(attempts);

    // Weak questions (requires auth)
    if (state.currentUser) {
      await loadWeakQuestions(testId);
    }
  } catch (err) {
    console.warn("[stats] loadProgressTab error:", err);
  }
}

async function renderProgressChart(attempts) {
  const canvas = dom.statsProgressChart;
  if (!canvas) return;

  await ensureChartJs();

  if (canvas._chartInstance) {
    canvas._chartInstance.destroy();
    canvas._chartInstance = null;
  }

  // Reverse for chronological order (oldest left)
  const sorted = [...attempts].reverse();
  const labels = sorted.map((_, i) => `#${i + 1}`);
  const data = sorted.map((a) => a.percentCorrect ?? 0);

  const ctx = canvas.getContext("2d");
  canvas._chartInstance = new window.Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: t("progressChartTitle"),
          data,
          borderColor: "var(--primary,#059669)",
          backgroundColor: "rgba(5,150,105,0.1)",
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: t("progressChartTitle"),
          color: "var(--text)",
          font: { size: 13, weight: "600" },
        },
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { color: "var(--muted)" },
          grid: { color: "var(--border,#e5e7eb)" },
        },
        x: {
          ticks: { color: "var(--muted)" },
          grid: { display: false },
        },
      },
    },
  });
}

async function loadWeakQuestions(testId) {
  const container = dom.statsWeakQuestions;
  if (!container) return;

  try {
    const data = await apiFetch(`/api/tests/${testId}/weak-questions`);
    const questions = data.questions || [];
    state.stats.weakQuestions = questions;

    container.innerHTML = "";

    const heading = document.createElement("div");
    heading.style.cssText =
      "font-size:0.8rem;font-weight:700;color:var(--text);margin-bottom:0.5rem;";
    heading.textContent = t("weakQuestionsTitle");
    container.appendChild(heading);

    if (questions.length === 0) {
      const msg = document.createElement("div");
      msg.style.cssText = "font-size:0.8rem;color:var(--muted);";
      msg.textContent = t("noWeakQuestions");
      container.appendChild(msg);
      return;
    }

    questions.forEach((q, idx) => {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem;";

      const label = document.createElement("div");
      label.style.cssText = "font-size:0.78rem;color:var(--text);flex:1;";
      label.textContent = `Q${idx + 1} (ID ${q.questionId})`;

      const pct = q.totalCount > 0
        ? Math.round((q.correctCount / q.totalCount) * 100)
        : 0;

      const bar = document.createElement("div");
      bar.style.cssText =
        "height:6px;border-radius:3px;background:var(--border,#e5e7eb);width:80px;flex-shrink:0;";
      const fill = document.createElement("div");
      const fillColor =
        pct < 40
          ? "var(--danger,#ef4444)"
          : pct < 70
          ? "var(--warning,#f59e0b)"
          : "var(--primary,#059669)";
      fill.style.cssText = `height:100%;border-radius:3px;width:${pct}%;background:${fillColor};`;
      bar.appendChild(fill);

      const pctLabel = document.createElement("div");
      pctLabel.style.cssText =
        "font-size:0.72rem;color:var(--muted);width:32px;text-align:right;";
      pctLabel.textContent = `${pct}%`;

      row.appendChild(label);
      row.appendChild(bar);
      row.appendChild(pctLabel);
      container.appendChild(row);
    });
  } catch (err) {
    // Silently ignore (e.g. 401 if not authenticated)
    console.warn("[stats] loadWeakQuestions error:", err);
  }
}

// ---------------------------------------------------------------------------
// Owner analytics tab
// ---------------------------------------------------------------------------

async function loadOwnerTab(testId) {
  if (!testId) return;

  try {
    const data = await apiFetch(`/api/tests/${testId}/owner-analytics`);
    state.stats.ownerAnalytics = data;

    const kpis = data.kpis || {};
    renderKpiCards(dom.statsOwnerKpis, [
      { label: "Всего попыток", value: kpis.totalAttempts ?? 0 },
      { label: "Уник. студентов", value: kpis.uniqueStudents ?? 0 },
      { label: t("kpiAccuracy"), value: fmtPct(kpis.avgScore) },
      { label: "Сдали (≥60%)", value: fmtPct(kpis.passRate) },
    ]);

    renderDifficultyBars(data.questionDifficulty || []);
    await renderOwnerDistributionChart(data.scoreDistribution || []);
    renderActivityRows(data.activityByWeek || []);
  } catch (err) {
    if (err.message && err.message.includes("403")) {
      // Not owner — hide tab silently
      dom.statsOwnerTab?.classList.add("is-hidden");
      if (state.stats.activeTab === "owner") {
        state.stats.activeTab = "progress";
        _switchToProgressTab();
      }
    } else {
      console.warn("[stats] loadOwnerTab error:", err);
    }
  }
}

function renderDifficultyBars(questionDifficulty) {
  const container = dom.statsOwnerDifficultyChart;
  if (!container) return;
  container.innerHTML = "";

  const heading = document.createElement("div");
  heading.style.cssText =
    "font-size:0.8rem;font-weight:700;color:var(--text);margin-bottom:0.5rem;";
  heading.textContent = t("difficultyChartTitle");
  container.appendChild(heading);

  if (!questionDifficulty.length) {
    const msg = document.createElement("div");
    msg.style.cssText = "font-size:0.8rem;color:var(--muted);";
    msg.textContent = "—";
    container.appendChild(msg);
    return;
  }

  questionDifficulty.forEach((q, idx) => {
    const pct =
      q.totalAttempts > 0 ? Math.round(q.correctRate) : 0;

    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem;";

    const label = document.createElement("div");
    label.style.cssText = "font-size:0.78rem;color:var(--text);flex:1;";
    label.textContent = `Q${idx + 1}`;

    const bar = document.createElement("div");
    bar.style.cssText =
      "height:6px;border-radius:3px;background:var(--border,#e5e7eb);width:100px;flex-shrink:0;";
    const fill = document.createElement("div");
    const fillColor =
      pct < 40
        ? "var(--danger,#ef4444)"
        : pct < 70
        ? "var(--warning,#f59e0b)"
        : "var(--primary,#059669)";
    fill.style.cssText = `height:100%;border-radius:3px;width:${pct}%;background:${fillColor};`;
    bar.appendChild(fill);

    const pctLabel = document.createElement("div");
    pctLabel.style.cssText =
      "font-size:0.72rem;color:var(--muted);width:32px;text-align:right;";
    pctLabel.textContent = `${pct}%`;

    row.appendChild(label);
    row.appendChild(bar);
    row.appendChild(pctLabel);
    container.appendChild(row);
  });
}

async function renderOwnerDistributionChart(scoreDistribution) {
  const canvas = dom.statsOwnerDistChart;
  if (!canvas) return;

  await ensureChartJs();

  if (canvas._chartInstance) {
    canvas._chartInstance.destroy();
    canvas._chartInstance = null;
  }

  const labels = scoreDistribution.map((d) => d.bucket);
  const data = scoreDistribution.map((d) => d.count);

  const ctx = canvas.getContext("2d");
  canvas._chartInstance = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: t("scoreDistTitle"),
          data,
          backgroundColor: "rgba(5,150,105,0.7)",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: t("scoreDistTitle"),
          color: "var(--text)",
          font: { size: 13, weight: "600" },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: "var(--muted)", stepSize: 1 },
          grid: { color: "var(--border,#e5e7eb)" },
        },
        x: {
          ticks: { color: "var(--muted)" },
          grid: { display: false },
        },
      },
    },
  });
}

function renderActivityRows(activityByWeek) {
  const container = dom.statsOwnerActivity;
  if (!container) return;
  container.innerHTML = "";

  const heading = document.createElement("div");
  heading.style.cssText =
    "font-size:0.8rem;font-weight:700;color:var(--text);margin-bottom:0.5rem;";
  heading.textContent = t("activityTitle");
  container.appendChild(heading);

  if (!activityByWeek.length) {
    const msg = document.createElement("div");
    msg.style.cssText = "font-size:0.8rem;color:var(--muted);";
    msg.textContent = "—";
    container.appendChild(msg);
    return;
  }

  const maxCount = Math.max(...activityByWeek.map((w) => w.count), 1);

  activityByWeek.forEach((week) => {
    const pct = Math.round((week.count / maxCount) * 100);

    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem;";

    const label = document.createElement("div");
    label.style.cssText =
      "font-size:0.78rem;color:var(--text);width:80px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    label.textContent = week.week || "—";

    const bar = document.createElement("div");
    bar.style.cssText =
      "height:8px;border-radius:4px;background:var(--border,#e5e7eb);flex:1;";
    const fill = document.createElement("div");
    fill.style.cssText = `height:100%;border-radius:4px;width:${pct}%;background:var(--primary,#059669);`;
    bar.appendChild(fill);

    const countLabel = document.createElement("div");
    countLabel.style.cssText =
      "font-size:0.72rem;color:var(--muted);width:24px;text-align:right;flex-shrink:0;";
    countLabel.textContent = String(week.count);

    row.appendChild(label);
    row.appendChild(bar);
    row.appendChild(countLabel);
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export async function openStatsScreen(testId = null) {
  setActiveScreen("stats");
  renderStatsTestSidebar(state.testsCache);

  if (testId) {
    state.stats.selectedTestId = testId;
  }

  if (state.currentUser) {
    loadStreak(); // fire-and-forget
  }

  const targetId =
    state.stats.selectedTestId || state.testsCache[0]?.id || null;
  if (targetId) {
    await selectStatsTest(targetId);
  }
}

export async function loadStatsData({ preserveSelection = true } = {}) {
  renderStatsTestSidebar(state.testsCache);
  const targetId =
    state.stats.selectedTestId ||
    state.stats.filterTestId ||
    state.testsCache[0]?.id ||
    null;
  if (targetId) {
    await selectStatsTest(targetId);
  }
}

// ---------------------------------------------------------------------------
// Legacy compat stubs
// ---------------------------------------------------------------------------

export async function loadAttemptDetails(attemptId) {
  // no-op in new design — kept for backward compat
}

export function populateTestFilter() {
  // no-op in new design — kept for backward compat
}

// ---------------------------------------------------------------------------
// Event initialization
// ---------------------------------------------------------------------------

export function initializeStatsScreenEvents() {
  initStatsTabs();

  // Back button → management
  dom.statsBackButton?.addEventListener("click", () => {
    setActiveScreen("management");
  });

  // Refresh button — reload current test data
  dom.statsRefreshButton?.addEventListener("click", () => {
    if (state.stats.selectedTestId) {
      selectStatsTest(state.stats.selectedTestId);
    }
  });
}
