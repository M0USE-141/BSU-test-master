/**
 * Testing Screen - Test taking functionality
 */

import { t, formatNumber } from "../i18n.js";
import {
  renderQuestion,
  renderQuestionNav,
  renderResultSummary,
  setActiveScreen,
} from "../rendering.js";
import {
  clearErrorCounts,
  dom,
  getErrorCount,
  getSettings,
  loadErrorCounts,
  loadProgress,
  saveLastResult,
  state,
} from "../state.js";
import {
  buildAttemptSummary,
  createAttemptId,
  finalizeActiveQuestionTiming,
  flushQueues,
  getClientId,
  trackAttemptAbandoned,
  trackAttemptFinished,
  trackAttemptStarted,
  trackQuestionSkipped,
  updateQuestionTiming,
} from "../telemetry.js";

const TESTING_PANELS = ["settings", "results", "questions"];

// Media query for responsive layout switching
const mobileMediaQuery = window.matchMedia("(max-width: 767px)");

// Guard against re-running one-time initializations
let _testingEventsInitialized = false;

/**
 * Update question count label
 */
export function updateQuestionCountLabel() {
  if (!dom.questionCountLabel) {
    return;
  }
  const count = state.currentTest?.questions?.length ?? 0;
  dom.questionCountLabel.textContent = t("testCount", {
    count: formatNumber(count),
  });
}

/**
 * Set active testing panel (settings/results/questions)
 */
export function setActiveTestingPanel(panelKey) {
  if (!TESTING_PANELS.includes(panelKey)) {
    return;
  }
  state.uiState.activeTestingPanel = panelKey;

  const panelMap = {
    settings: dom.settingsPanel,
    results: dom.resultsPanel,
    questions: dom.questionsPanel,
  };
  const toggleMap = {
    settings: dom.settingsPanelToggle,
    results: dom.resultsPanelToggle,
    questions: dom.questionsPanelToggle,
  };

  TESTING_PANELS.forEach((key) => {
    const panel = panelMap[key];
    const toggle = toggleMap[key];
    if (panel) {
      panel.classList.toggle("is-open", key === panelKey);
    }
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(key === panelKey));
    }
  });
}

/**
 * Update testing panels status (show/hide buttons based on test state)
 */
export function updateTestingPanelsStatus() {
  const isTesting = Boolean(state.session && !state.session.finished);

  if (dom.finishTestButton) {
    dom.finishTestButton.classList.toggle("is-hidden", !isTesting);
    dom.finishTestButton.disabled = !isTesting;
  }

  if (dom.exitTestButton) {
    dom.exitTestButton.classList.toggle("is-hidden", isTesting);
    dom.exitTestButton.disabled = isTesting;
  }

  updateQuestionCountLabel();
}

/**
 * Build test session from test and settings
 */
export function buildSession(test, settings) {
  const progress = loadProgress(test.id);
  const errorCounts = loadErrorCounts(test.id);

  let questions = test.questions.map((question, index) => ({
    question,
    questionId: question.id ?? index + 1,
    originalIndex: index,
  }));

  if (settings.onlyUnanswered) {
    questions = questions.filter(
      (entry) => getErrorCount(errorCounts, entry.questionId) >= 0
    );
  }

  if (settings.randomQuestions) {
    questions = shuffle(questions);
  }

  if (settings.questionCount > 0) {
    questions = questions.slice(0, settings.questionCount);
  }

  return {
    testId: test.id,
    questions,
    currentIndex: 0,
    answers: new Map(),
    answerStatus: new Map(),
    optionOrders: new Map(),
    finished: false,
    settings,
    attemptId: createAttemptId(),
    clientId: getClientId(),
    startedAt: Date.now(),
    activeQuestionId: null,
    activeQuestionStartedAt: null,
    questionShownAt: null,
    lastRenderedQuestionId: null,
    questionTimings: new Map(),
  };
}

/**
 * Shuffle array (Fisher-Yates algorithm)
 */
export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Open pretest modal for the given test
 */
export function openPretestModal(test) {
  state.currentTest = test;
  if (!dom.pretestModal) return;

  if (dom.pretestModalTitle) dom.pretestModalTitle.textContent = test.title || test.id;

  const maxQ = test.questions?.length ?? 20;
  if (dom.pretestQuestionCount) {
    dom.pretestQuestionCount.textContent = String(maxQ);
    dom.pretestQuestionCount.dataset.max = String(maxQ);
  }

  dom.pretestModal.classList.remove("is-hidden");
}

/**
 * Close pretest modal
 */
export function closePretestModal() {
  dom.pretestModal?.classList.add("is-hidden");
}

/**
 * Open mobile bottom sheet
 */
function openMobileSheet() {
  dom.mobileBottomSheet?.classList.remove("is-hidden");
  dom.mobileSheetBackdrop?.classList.remove("is-hidden");
}

/**
 * Close mobile bottom sheet
 */
function closeMobileSheet() {
  dom.mobileBottomSheet?.classList.add("is-hidden");
  dom.mobileSheetBackdrop?.classList.add("is-hidden");
}

/**
 * Navigate to a specific question by index
 */
function navigateToQuestion(idx) {
  if (!state.session) return;
  closeMobileSheet();
  updateQuestionTiming(state.session, state.session.questions[idx]?.questionId ?? null);
  state.session.currentIndex = Math.max(0, Math.min(idx, state.session.questions.length - 1));
  renderQuestion();
  renderSidebarGrids();
}

/**
 * Render question grid in sidebar and mobile strip/sheet
 */
function renderSidebarGrids() {
  if (!state.session) return;

  const { questions, currentIndex, answers, answerStatus } = state.session;
  const total = questions.length;

  // Update sidebar test title
  if (dom.sidebarTestTitle) {
    dom.sidebarTestTitle.textContent = state.currentTest?.title || "";
  }

  // Update question label
  const qLabel = t("questionProgress", {
    current: String(currentIndex + 1),
    total: String(total),
  });
  if (dom.sidebarQuestionLabel) dom.sidebarQuestionLabel.textContent = qLabel;
  if (dom.mobileProgressLabel) dom.mobileProgressLabel.textContent = `${currentIndex + 1} / ${total}`;

  // Update progress bars
  const pct = total ? ((currentIndex + 1) / total) * 100 : 0;
  if (dom.sidebarProgressBar) dom.sidebarProgressBar.style.width = `${pct}%`;
  if (dom.mobileProgressBar) dom.mobileProgressBar.style.width = `${pct}%`;

  // Build question squares — answerStatus stores "correct", "incorrect", "unanswered" strings
  function makeSquare(entry, idx) {
    const isCurrent = idx === currentIndex;
    const answerIdx = answers.get(entry.questionId);
    const answered = answerIdx !== undefined && answerIdx !== -1;
    const status = answerStatus.get(entry.questionId); // "correct" / "incorrect" / "unanswered" / undefined

    const sq = document.createElement("button");
    sq.type = "button";
    sq.className = "qgrid-sq";

    if (isCurrent) {
      sq.classList.add("qgrid-sq--current");
    } else if (answered && status === "correct") {
      sq.classList.add("qgrid-sq--correct");
    } else if (answered && status === "incorrect") {
      sq.classList.add("qgrid-sq--wrong");
    } else if (answered) {
      sq.classList.add("qgrid-sq--answered");
    }

    sq.textContent = String(idx + 1);
    sq.setAttribute("aria-label", `Вопрос ${idx + 1}`);
    const capturedIdx = idx;
    sq.addEventListener("click", () => navigateToQuestion(capturedIdx));
    return sq;
  }

  // Sidebar grid (all questions)
  if (dom.sidebarQuestionGrid) {
    dom.sidebarQuestionGrid.innerHTML = "";
    questions.forEach((q, idx) => dom.sidebarQuestionGrid.appendChild(makeSquare(q, idx)));
  }

  // Mobile strip (first 8)
  if (dom.mobileStripGrid) {
    dom.mobileStripGrid.innerHTML = "";
    questions.slice(0, 8).forEach((q, idx) => {
      const sq = makeSquare(q, idx);
      sq.style.width = "22px";
      sq.style.height = "22px";
      sq.style.minWidth = "22px";
      dom.mobileStripGrid.appendChild(sq);
    });
  }

  // Mobile sheet grid (all)
  if (dom.mobileSheetGrid) {
    dom.mobileSheetGrid.innerHTML = "";
    questions.forEach((q, idx) => dom.mobileSheetGrid.appendChild(makeSquare(q, idx)));
  }
}

/**
 * Apply responsive layout: show sidebar on desktop, mobile controls on mobile
 */
function applyMobileLayout() {
  const isMobile = mobileMediaQuery.matches;

  if (dom.testSidebar) {
    dom.testSidebar.style.display = isMobile ? "none" : "flex";
  }
  if (dom.mobileTopBar) {
    dom.mobileTopBar.style.display = isMobile ? "flex" : "none";
  }
  if (dom.mobileBottomStrip) {
    dom.mobileBottomStrip.style.display = isMobile ? "" : "none";
  }
}

/**
 * Wire pretest modal toggle switches, stepper, cancel, and start buttons.
 * Called once from initializeTestingScreenEvents().
 */
function initPretestModal() {
  function wireToggle(btn) {
    if (!btn) return;
    btn.addEventListener("click", () => {
      const isOn = btn.dataset.checked === "true";
      btn.dataset.checked = String(!isOn);
      btn.classList.toggle("is-on", !isOn);
      btn.setAttribute("aria-pressed", String(!isOn));
    });
  }
  wireToggle(dom.pretestRandomQuestions);
  wireToggle(dom.pretestRandomOptions);
  wireToggle(dom.pretestOnlyUnanswered);
  wireToggle(dom.pretestShowAnswers);

  // Stepper — decrement
  dom.pretestQuestionCountMinus?.addEventListener("click", () => {
    const el = dom.pretestQuestionCount;
    if (!el) return;
    const v = Number.parseInt(el.textContent, 10);
    if (v > 1) el.textContent = String(v - 1);
  });

  // Stepper — increment
  dom.pretestQuestionCountPlus?.addEventListener("click", () => {
    const el = dom.pretestQuestionCount;
    if (!el) return;
    const v = Number.parseInt(el.textContent, 10);
    const max = Number.parseInt(el.dataset.max || "999", 10);
    if (v < max) el.textContent = String(v + 1);
  });

  // Cancel
  dom.pretestCancelBtn?.addEventListener("click", () => {
    closePretestModal();
    state.currentTest = null;
  });

  // Start — trigger existing startTest flow
  dom.pretestStartBtn?.addEventListener("click", () => {
    closePretestModal();
    import("../rendering.js").then(({ setActiveScreen }) => {
      setActiveScreen("testing");
      startTest();
    }).catch((err) => console.error("[testing] start failed:", err));
  });
}

/**
 * Wire mobile sheet interactions (chevron, backdrop, swipe-down, finish, stop)
 */
function initMobileControls() {
  // Chevron tap opens sheet
  dom.mobileStripChevron?.addEventListener("click", openMobileSheet);

  // Backdrop tap closes sheet
  dom.mobileSheetBackdrop?.addEventListener("click", closeMobileSheet);

  // Swipe down on sheet to close
  let touchStartY = 0;
  dom.mobileBottomSheet?.addEventListener("touchstart", (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  dom.mobileBottomSheet?.addEventListener("touchend", (e) => {
    if (e.changedTouches[0].clientY - touchStartY > 60) closeMobileSheet();
  });

  // Sheet finish button
  dom.mobileSheetFinishBtn?.addEventListener("click", () => {
    closeMobileSheet();
    finishTest();
  });

  // Stop button (mobile top bar) — abandon and return to management
  dom.mobileStopBtn?.addEventListener("click", () => {
    if (state.session && !state.session.finished) {
      finalizeActiveQuestionTiming(state.session);
      trackAttemptAbandoned(state.session);
    }
    import("../rendering.js").then(({ setActiveScreen }) => setActiveScreen("management"));
  });
}

/**
 * Wire left/right swipe on question card for question navigation
 */
function initSwipeNavigation() {
  const card = document.querySelector(".question-card");
  if (!card) return;

  let startX = 0;
  let startY = 0;

  card.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  card.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    // Only trigger if horizontal motion clearly dominates
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) {
      dom.nextQuestionButton?.click();
    } else {
      dom.prevQuestionButton?.click();
    }
  });
}

/**
 * Wire sidebar finish and settings buttons
 */
function initializeSidebarControls() {
  dom.sidebarFinishBtn?.addEventListener("click", () => finishTest());

  dom.sidebarSettingsBtn?.addEventListener("click", () => {
    if (state.currentTest) openPretestModal(state.currentTest);
  });
}

/**
 * Finish test and calculate results
 */
export function finishTest() {
  if (!state.session || state.session.finished) {
    return;
  }

  state.session.finished = true;
  finalizeActiveQuestionTiming(state.session);

  let correct = 0;
  let answered = 0;

  state.session.questions.forEach((entry) => {
    const selected = state.session.answers.get(entry.questionId);
    if (selected === undefined || selected === -1) {
      return;
    }
    answered += 1;

    const options =
      state.session.optionOrders.get(entry.questionId) ??
      entry.question.options;
    if (options[selected]?.isCorrect) {
      correct += 1;
    }
  });

  const total = state.session.questions.length;
  const percent = total ? (correct / total) * 100 : 0;

  saveLastResult(state.session.testId, {
    correct,
    total,
    answered,
    percent,
    completedAt: new Date().toISOString(),
  });

  const summary = buildAttemptSummary(state.session);
  trackAttemptFinished(state.session, summary);
  flushQueues();

  import("./management.js").then(({ renderTestCardsWithHandlers }) => {
    renderTestCardsWithHandlers(state.testsCache, state.session.testId);
  });

  renderResultSummary({ correct, total, answered, percent });
  renderQuestion();
  renderSidebarGrids();
  updateTestingPanelsStatus();
  setActiveTestingPanel("results");
}

/**
 * Start test with current settings
 */
export function startTest() {
  if (!state.currentTest) {
    dom.questionContainer.textContent = t("noTestSelected");
    return;
  }

  const settings = getSettings();
  state.session = buildSession(state.currentTest, settings);
  trackAttemptStarted(state.session);
  renderResultSummary(null);
  updateTestingPanelsStatus();
  setActiveTestingPanel("questions");

  if (dom.sidebarTestTitle) {
    dom.sidebarTestTitle.textContent = state.currentTest?.title || "";
  }

  if (!state.session.questions.length) {
    dom.questionContainer.textContent = t("noQuestionsForTesting");
    dom.optionsContainer.textContent = "";
    dom.optionsContainer.classList.add("is-hidden");
    dom.questionProgress.textContent = t("questionProgress", {
      current: formatNumber(0),
      total: formatNumber(0),
    });
    return;
  }

  renderQuestion();
  renderSidebarGrids();
  applyMobileLayout();
}

/**
 * Initialize testing screen event listeners
 */
export function initializeTestingScreenEvents() {
  dom.settingsPanelToggle?.addEventListener("click", () => {
    setActiveTestingPanel("settings");
  });

  dom.resultsPanelToggle?.addEventListener("click", () => {
    setActiveTestingPanel("results");
  });

  dom.questionsPanelToggle?.addEventListener("click", () => {
    setActiveTestingPanel("questions");
  });

  dom.prevQuestionButton?.addEventListener("click", () => {
    if (!state.session) {
      return;
    }
    updateQuestionTiming(
      state.session,
      state.session.questions[Math.max(0, state.session.currentIndex - 1)]
        ?.questionId ?? null
    );
    state.session.currentIndex = Math.max(0, state.session.currentIndex - 1);
    renderQuestion();
    renderSidebarGrids();
  });

  dom.nextQuestionButton?.addEventListener("click", () => {
    if (!state.session) {
      return;
    }

    const currentEntry = state.session.questions[state.session.currentIndex];
    if (currentEntry) {
      const selected = state.session.answers.get(currentEntry.questionId);
      if (selected === undefined || selected === -1) {
        const durationMs =
          typeof state.session.questionShownAt === "number"
            ? Math.max(0, Date.now() - state.session.questionShownAt)
            : typeof state.session.activeQuestionStartedAt === "number"
              ? Math.max(0, Date.now() - state.session.activeQuestionStartedAt)
              : 0;
        trackQuestionSkipped(
          state.session,
          currentEntry,
          state.session.currentIndex,
          durationMs
        );
      }
    }

    updateQuestionTiming(
      state.session,
      state.session.questions[
        Math.min(
          state.session.questions.length - 1,
          state.session.currentIndex + 1
        )
      ]?.questionId ?? null
    );
    state.session.currentIndex = Math.min(
      state.session.questions.length - 1,
      state.session.currentIndex + 1
    );
    renderQuestion();
    renderSidebarGrids();
  });

  dom.finishTestButton?.addEventListener("click", () => {
    finishTest();
  });

  dom.startTestButton?.addEventListener("click", () => {
    startTest();
  });

  dom.exitTestButton?.addEventListener("click", () => {
    if (state.session && !state.session.finished) {
      finalizeActiveQuestionTiming(state.session);
      trackAttemptAbandoned(state.session);
    }
    setActiveScreen("management");
    dom.optionsContainer.classList.add("is-hidden");
  });

  // One-time inits (guarded so re-entry doesn't stack listeners)
  if (!_testingEventsInitialized) {
    _testingEventsInitialized = true;
    initPretestModal();
    initMobileControls();
    initSwipeNavigation();
    initializeSidebarControls();
    mobileMediaQuery.addEventListener("change", applyMobileLayout);
  }
}
