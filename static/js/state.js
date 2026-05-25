export const dom = {
  themeToggle: document.getElementById("theme-toggle"),
  langSelect: document.getElementById("lang-select"),
  // Auth elements
  screenAuth: document.getElementById("screen-auth"),
  authLoginTab: document.getElementById("auth-login-tab"),
  authRegisterTab: document.getElementById("auth-register-tab"),
  authStatus: document.getElementById("auth-status"),
  authLoginForm: document.getElementById("auth-login-form"),
  authRegisterForm: document.getElementById("auth-register-form"),
  authLoginUsername: document.getElementById("auth-login-username"),
  authLoginPassword: document.getElementById("auth-login-password"),
  authLoginButton: document.getElementById("auth-login-button"),
  authRegisterUsername: document.getElementById("auth-register-username"),
  authRegisterEmail: document.getElementById("auth-register-email"),
  authRegisterPassword: document.getElementById("auth-register-password"),
  authRegisterConfirmPassword: document.getElementById("auth-register-confirm-password"),
  authRegisterButton: document.getElementById("auth-register-button"),
  userChip: document.getElementById("user-chip"),
  userDisplay: document.getElementById("user-display"),
  userAvatarImage: document.getElementById("user-avatar-image"),
  userAvatarInitials: document.getElementById("user-avatar-initials"),
  profileButton: document.getElementById("profile-button"),
  logoutButton: document.getElementById("logout-button"),

  // Header dropdown and nav links
  avatarDropdown: document.getElementById("avatar-dropdown"),
  avatarDropdownLangRu: document.getElementById("dropdown-lang-ru"),
  avatarDropdownLangEn: document.getElementById("dropdown-lang-en"),
  avatarDropdownLangUz: document.getElementById("dropdown-lang-uz"),
  dropdownProfileLink: document.getElementById("dropdown-profile-link"),
  dropdownLogoutLink: document.getElementById("dropdown-logout-link"),
  dropdownUserName: document.getElementById("dropdown-user-name"),
  dropdownUserEmail: document.getElementById("dropdown-user-email"),
  navTestsLink: document.getElementById("nav-tests-link"),
  navStatsLink: document.getElementById("nav-stats-link"),
  mobileNav: document.getElementById("mobile-nav"),
  mobileNavBackdrop: document.getElementById("mobile-nav-backdrop"),
  mobileNavToggleBtn: document.getElementById("mobile-nav-toggle"),
  // Management two-panel detail
  testDetailPanel: document.getElementById("test-detail-panel"),
  testDetailTitle: document.getElementById("test-detail-title"),
  testDetailKpis: document.getElementById("test-detail-kpis"),
  testDetailTrend: document.getElementById("test-detail-trend"),
  testDetailStartBtn: document.getElementById("test-detail-start"),
  testDetailEditBtn: document.getElementById("test-detail-edit"),
  testDetailStatsBtn: document.getElementById("test-detail-stats"),
  // Pre-test modal
  pretestModal: document.getElementById("pretest-modal"),
  pretestModalTitle: document.getElementById("pretest-modal-title"),
  pretestQuestionCount: document.getElementById("pretest-question-count"),
  pretestQuestionCountMinus: document.getElementById("pretest-count-minus"),
  pretestQuestionCountPlus: document.getElementById("pretest-count-plus"),
  pretestRandomQuestions: document.getElementById("pretest-random-questions"),
  pretestRandomOptions: document.getElementById("pretest-random-options"),
  pretestOnlyUnanswered: document.getElementById("pretest-only-unanswered"),
  pretestShowAnswers: document.getElementById("pretest-show-answers"),
  pretestStartBtn: document.getElementById("pretest-start-btn"),
  pretestCancelBtn: document.getElementById("pretest-cancel-btn"),
  // Testing sidebar
  testSidebar: document.getElementById("test-sidebar"),
  sidebarTestTitle: document.getElementById("sidebar-test-title"),
  sidebarQuestionLabel: document.getElementById("sidebar-question-label"),
  sidebarProgressBar: document.getElementById("sidebar-progress-bar"),
  sidebarQuestionGrid: document.getElementById("sidebar-question-grid"),
  sidebarSettingsBtn: document.getElementById("sidebar-settings-btn"),
  sidebarFinishBtn: document.getElementById("sidebar-finish-btn"),
  // Mobile testing controls
  mobileTopBar: document.getElementById("mobile-top-bar"),
  mobileStopBtn: document.getElementById("mobile-stop-btn"),
  mobileProgressLabel: document.getElementById("mobile-progress-label"),
  mobileProgressBar: document.getElementById("mobile-progress-bar"),
  mobileBottomStrip: document.getElementById("mobile-bottom-strip"),
  mobileStripGrid: document.getElementById("mobile-strip-grid"),
  mobileStripChevron: document.getElementById("mobile-strip-chevron"),
  mobileBottomSheet: document.getElementById("mobile-bottom-sheet"),
  mobileSheetGrid: document.getElementById("mobile-sheet-grid"),
  mobileSheetFinishBtn: document.getElementById("mobile-sheet-finish"),
  mobileSheetBackdrop: document.getElementById("mobile-sheet-backdrop"),
  testingQuestionArea: document.getElementById("testing-question-area"),
  // Statistics redesign
  statsTestSidebar: document.getElementById("stats-test-sidebar"),
  statsTestSidebarList: document.getElementById("stats-test-sidebar-list"),
  statsTestSelect: document.getElementById("stats-test-select"),
  statsProgressTab: document.getElementById("stats-tab-progress"),
  statsByTestTab: document.getElementById("stats-tab-bytest"),
  statsOwnerTab: document.getElementById("stats-tab-owner"),
  statsProgressPanel: document.getElementById("stats-panel-progress"),
  statsByTestPanel: document.getElementById("stats-panel-bytest"),
  statsOwnerPanel: document.getElementById("stats-panel-owner"),
  statsProgressKpis: document.getElementById("stats-progress-kpis"),
  statsProgressSparkline: document.getElementById("stats-progress-sparkline"),
  statsProgressHeatmap: document.getElementById("stats-progress-heatmap"),
  statsWeakCard: document.getElementById("stats-weak-card"),
  statsWeakQuestions: document.getElementById("stats-weak-questions"),
  statsByTestAttempts: document.getElementById("stats-bytest-attempts"),
  statsByTestDetail: document.getElementById("stats-bytest-detail"),
  statsByTestDetailContent: document.getElementById("stats-bytest-detail-content"),
  statsByTestDifficulty: document.getElementById("stats-bytest-difficulty"),
  statsOwnerKpis: document.getElementById("stats-owner-kpis"),
  statsOwnerDifficultyChart: document.getElementById("stats-owner-difficulty"),
  statsOwnerDistChart: document.getElementById("stats-owner-distribution"),
  statsOwnerActivity: document.getElementById("stats-owner-activity"),
  statsProgressChart: null,
  testCardsContainer: document.getElementById("test-cards"),
  testTabs: document.getElementById("test-tabs"),
  questionList: document.getElementById("question-nav"),
  questionContainer: document.getElementById("question-container"),
  optionsContainer: document.getElementById("options-container"),
  uploadForm: document.getElementById("upload-form"),
  uploadFileInput: document.getElementById("upload-file"),
  uploadDropzone: document.getElementById("upload-dropzone"),
  uploadFileName: document.getElementById("upload-file-name"),
  uploadFileNameValue: document.querySelector(".upload-file-name__value"),
  uploadClearButton: document.getElementById("upload-clear-file"),
  uploadSymbolInput: document.getElementById("upload-symbol"),
  uploadLogSmallTablesInput: document.getElementById(
    "upload-log-small-tables"
  ),
  uploadLogs: document.getElementById("upload-logs"),
  questionProgress: document.getElementById("question-progress"),
  questionStatus: document.getElementById("question-status"),
  prevQuestionButton: document.getElementById("prev-question"),
  nextQuestionButton: document.getElementById("next-question"),
  finishTestButton: document.getElementById("finish-test"),
  answerFeedback: document.getElementById("answer-feedback"),
  startTestButton: document.getElementById("start-test"),
  exitTestButton: document.getElementById("exit-test"),
  settingsPanel: document.getElementById("panel-settings"),
  resultsPanel: document.getElementById("panel-results"),
  questionsPanel: document.getElementById("panel-questions"),
  settingsPanelToggle: document.getElementById("panel-settings-toggle"),
  resultsPanelToggle: document.getElementById("panel-results-toggle"),
  questionsPanelToggle: document.getElementById("panel-questions-toggle"),
  questionCountLabel: document.getElementById("question-count"),
  resultSummary: document.getElementById("result-summary"),
  resultDetails: document.getElementById("result-details"),
  progressHint: document.getElementById("progress-hint"),
  editorModal: document.getElementById("editor-modal"),
  closeEditorButton: document.getElementById("close-editor"),
  editorAccessSettingsButton: document.getElementById("editor-access-settings"),
  editorTestStatsButton: document.getElementById("editor-test-stats"),
  editorRenameTestButton: document.getElementById("editor-rename-test"),
  editorDeleteTestButton: document.getElementById("editor-delete-test"),
  importModal: document.getElementById("import-modal"),
  closeImportButton: document.getElementById("close-import"),
  createTestModal: document.getElementById("create-test-modal"),
  closeCreateTestButton: document.getElementById("close-create-test"),
  cancelCreateTestButton: document.getElementById("cancel-create-test"),
  createTestForm: document.getElementById("create-test-form"),
  createTestTitleInput: document.getElementById("create-test-title"),
  createTestAccessSelect: document.getElementById("create-test-access"),
  createTestStatus: document.getElementById("create-test-status"),
  editorQuestionList: document.getElementById("editor-question-list"),
  editorForm: document.getElementById("editor-form"),
  editorFormTitle: document.getElementById("editor-form-title"),
  editorQuestionText: document.getElementById("editor-question-text"),
  editorOptionsList: document.getElementById("editor-options-list"),
  editorObjectsList: document.getElementById("editor-objects"),
  editorAddOption: document.getElementById("add-option"),
  editorResetButton: document.getElementById("reset-editor"),
  editorStatus: document.getElementById("editor-status"),
  editorPanel: document.getElementById("editor-panel"),
  editorPanelHome: document.querySelector(".editor-screen-form"),
  editorObjectType: document.getElementById("editor-object-type"),
  editorObjectId: document.getElementById("editor-object-id"),
  editorObjectImageFields: document.getElementById(
    "editor-object-image-fields"
  ),
  editorObjectImageFile: document.getElementById(
    "editor-object-image-file"
  ),
  editorObjectFormulaFields: document.getElementById(
    "editor-object-formula-fields"
  ),
  editorObjectFormulaText: document.getElementById(
    "editor-object-formula-text"
  ),
  editorObjectFormulaFile: document.getElementById(
    "editor-object-formula-file"
  ),
  editorObjectImageDropzone: document.querySelector(
    'label[for="editor-object-image-file"]'
  ),
  editorObjectFormulaDropzone: document.querySelector(
    'label[for="editor-object-formula-file"]'
  ),
  editorAddObjectButton: document.getElementById("editor-add-object"),
  editorObjectStatus: document.getElementById("editor-object-status"),
  editorObjectsToggle: document.getElementById("toggle-editor-objects"),
  editorObjectUploadToggle: document.getElementById(
    "toggle-editor-object-upload"
  ),
  editorObjectUploadSection: document.getElementById(
    "editor-object-upload-section"
  ),
  editorObjectListSection: document.getElementById(
    "editor-object-list-section"
  ),
  screenManagement: document.getElementById("screen-management"),
  screenTesting: document.getElementById("screen-testing"),
  screenStats: document.getElementById("screen-stats"),
  screenProfile: document.getElementById("screen-profile"),
  screenEditor: document.getElementById("screen-editor"),
  screenImport: document.getElementById("screen-import"),
  screenChangeRequests: document.getElementById("screen-change-requests"),
  // Profile elements
  profileBackButton: document.getElementById("profile-back"),
  profileAvatarImage: document.getElementById("profile-avatar-image"),
  profileAvatarPlaceholder: document.getElementById("profile-avatar-placeholder"),
  profileAvatarInitials: document.getElementById("profile-avatar-initials"),
  profileAvatarInput: document.getElementById("profile-avatar-input"),
  profileAvatarDelete: document.getElementById("profile-avatar-delete"),
  profileDisplayName: document.getElementById("profile-display-name"),
  profileDisplayNameSave: document.getElementById("profile-display-name-save"),
  profileUsername: document.getElementById("profile-username"),
  profileEmail: document.getElementById("profile-email"),
  profileCreatedAt: document.getElementById("profile-created-at"),
  profileStatus: document.getElementById("profile-status"),
  profileLogout: document.getElementById("profile-logout"),
  statsBackButton: document.getElementById("stats-back"),
  statsRefreshButton: document.getElementById("stats-refresh"),
  statsFilterTestSelect: document.getElementById("stats-filter-test"),
  statsFilterStartDate: document.getElementById("stats-filter-start-date"),
  statsFilterEndDate: document.getElementById("stats-filter-end-date"),
  statsFilterResetButton: document.getElementById("stats-filter-reset"),
  statsViewSingleTab: document.getElementById("stats-view-single"),
  statsViewAggregateTab: document.getElementById("stats-view-aggregate"),
  statsSingleControls: document.getElementById("stats-single-controls"),
  statsAttemptSelect: document.getElementById("stats-attempt-select"),
  statsAttemptList: document.getElementById("stats-attempt-list"),
  statsKpiGrid: document.getElementById("stats-kpi-grid"),
  statsChartAttempts: document.getElementById("stats-chart-attempts"),
  statsChartTime: document.getElementById("stats-chart-time"),
  statsQuestionStream: document.getElementById("stats-question-stream"),
  statsQuestionPreview: document.getElementById("stats-question-preview"),
  statsPreviewTitle: document.getElementById("stats-preview-title"),
  statsPreviewContent: document.getElementById("stats-preview-content"),
  statsPreviewClose: document.getElementById("stats-preview-close"),
  statsEmptyState: document.getElementById("stats-empty"),
  statsStartTestButton: document.getElementById("stats-start-test"),
  // Access settings modal
  accessSettingsModal: document.getElementById("access-settings-modal"),
  closeAccessSettingsButton: document.getElementById("close-access-settings"),
  accessSettingsTestName: document.getElementById("access-settings-test-name"),
  accessLevelSelect: document.getElementById("access-level-select"),
  accessLevelStatus: document.getElementById("access-level-status"),
  sharesSection: document.getElementById("shares-section"),
  shareUsernameInput: document.getElementById("share-username-input"),
  addShareButton: document.getElementById("add-share-button"),
  shareStatus: document.getElementById("share-status"),
  sharesList: document.getElementById("shares-list"),
  // Change requests modal
  changeRequestsModal: document.getElementById("change-requests-modal"),
  closeChangeRequestsButton: document.getElementById("close-change-requests"),
  changeRequestsRefreshButton: document.getElementById("change-requests-refresh"),
  changeRequestsTestName: document.getElementById("change-requests-test-name"),
  changeRequestsStats: document.getElementById("change-requests-stats"),
  changeRequestsStatus: document.getElementById("change-requests-status"),
  changeRequestsList: document.getElementById("change-requests-list"),
  // Editor change requests button
  editorChangeRequestsButton: document.getElementById("editor-change-requests"),
  // Test statistics modal (owner only)
  testStatsModal: document.getElementById("test-stats-modal"),
  // Settings
  settingQuestionCount: document.getElementById("setting-question-count"),
  settingRandomQuestions: document.getElementById(
    "setting-random-questions"
  ),
  settingRandomOptions: document.getElementById("setting-random-options"),
  settingOnlyUnanswered: document.getElementById(
    "setting-only-unanswered"
  ),
  settingShowAnswers: document.getElementById("setting-show-answers"),
  settingMaxOptions: document.getElementById("setting-max-options"),
};

export const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".wmf",
  ".emf",
];

export const INLINE_MARKER_REGEX = /{{\s*(image|formula)\s*:\s*([^}]+)\s*}}/g;

const TESTS_CACHE_KEY = "tests-cache";
const TESTS_CACHE_VERSION = "v1";
const TESTS_CACHE_TTL_MS = 10 * 60 * 1000;
const LAST_RESULT_KEY_PREFIX = "test-last-result:";
const ERROR_COUNTS_KEY_PREFIX = "test-error-counts:";

export const state = {
  currentTest: null,
  testsCache: [],
  session: null,
  currentUser: null,
  editorState: {
    mode: "create",
    questionId: null,
    objects: [],
  },
  uiState: {
    activeScreen: "auth",
    locale: "ru",
    activeTestingPanel: "settings",
    activeTestFilter: null,
  },
  stats: {
    attempts: [],
    selectedAttemptId: null,
    attemptDetails: null,
    filterTestId: null,
    filterStartDate: null,
    filterEndDate: null,
    total: 0,
    viewMode: "single",
    selectedTestId: null,
    activeTab: "progress",
    activeStatsTab: "progress",
    weakQuestions: [],
    ownerAnalytics: null,
    streak: 0,
    heatmapData: null,
  },
  activeEditorCard: null,
  activeEditorCardKey: null,
};

export const editorMobileQuery = window.matchMedia("(max-width: 720px)");

export function readTestsCache() {
  const raw = localStorage.getItem(TESTS_CACHE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const payload = JSON.parse(raw);
    if (payload?.version !== TESTS_CACHE_VERSION) {
      localStorage.removeItem(TESTS_CACHE_KEY);
      return [];
    }
    if (typeof payload?.savedAt !== "number") {
      localStorage.removeItem(TESTS_CACHE_KEY);
      return [];
    }
    const age = Date.now() - payload.savedAt;
    if (age < 0 || age > TESTS_CACHE_TTL_MS) {
      localStorage.removeItem(TESTS_CACHE_KEY);
      return [];
    }
    if (!Array.isArray(payload?.data)) {
      localStorage.removeItem(TESTS_CACHE_KEY);
      return [];
    }
    return payload.data;
  } catch (error) {
    return [];
  }
}

export function writeTestsCache(tests) {
  state.testsCache = tests;
  const payload = {
    version: TESTS_CACHE_VERSION,
    savedAt: Date.now(),
    data: tests,
  };
  localStorage.setItem(TESTS_CACHE_KEY, JSON.stringify(payload));
}

export function clearTestsCache() {
  state.testsCache = [];
  localStorage.removeItem(TESTS_CACHE_KEY);
}

export function loadProgress(testId) {
  if (!testId) {
    return new Set();
  }
  const raw = localStorage.getItem(`test-progress:${testId}`);
  if (!raw) {
    return new Set();
  }
  try {
    const data = JSON.parse(raw);
    return new Set(Array.isArray(data) ? data : []);
  } catch (error) {
    return new Set();
  }
}

export function saveProgress(testId, answeredIds) {
  if (!testId) {
    return;
  }
  const payload = Array.from(answeredIds);
  localStorage.setItem(`test-progress:${testId}`, JSON.stringify(payload));
}

export function loadErrorCounts(testId) {
  if (!testId) {
    return {};
  }
  const raw = localStorage.getItem(`${ERROR_COUNTS_KEY_PREFIX}${testId}`);
  if (!raw) {
    return {};
  }
  try {
    const payload = JSON.parse(raw);
    return typeof payload === "object" && payload !== null ? payload : {};
  } catch (error) {
    return {};
  }
}

export function saveErrorCounts(testId, counts) {
  if (!testId) {
    return;
  }
  localStorage.setItem(
    `${ERROR_COUNTS_KEY_PREFIX}${testId}`,
    JSON.stringify(counts ?? {})
  );
}

export function clearErrorCounts(testId) {
  if (!testId) {
    return;
  }
  localStorage.removeItem(`${ERROR_COUNTS_KEY_PREFIX}${testId}`);
}

export function getErrorCount(counts, questionId) {
  if (!counts || (typeof counts !== "object" && typeof counts !== "function")) {
    return 0;
  }
  const key = String(questionId ?? "");
  const raw = counts[key];
  if (typeof raw === "number" && !Number.isNaN(raw)) {
    return Math.trunc(raw);
  }
  return 0;
}

export function loadLastResult(testId) {
  if (!testId) {
    return null;
  }
  const raw = localStorage.getItem(`${LAST_RESULT_KEY_PREFIX}${testId}`);
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (typeof data?.percent !== "number") {
      return null;
    }
    return data;
  } catch (error) {
    return null;
  }
}

export function saveLastResult(testId, stats) {
  if (!testId || !stats) {
    return;
  }
  localStorage.setItem(
    `${LAST_RESULT_KEY_PREFIX}${testId}`,
    JSON.stringify(stats)
  );
}

export function clearLastResult(testId) {
  if (!testId) {
    return;
  }
  localStorage.removeItem(`${LAST_RESULT_KEY_PREFIX}${testId}`);
}

export function getSettings() {
  // Read from pretest modal toggles (new UI), fall back to old panel inputs
  const togVal = (el) => el ? el.dataset.checked === "true" : false;

  const qCount = dom.pretestQuestionCount
    ? Number.parseInt(dom.pretestQuestionCount.textContent || "0", 10) || 0
    : Number.parseInt(dom.settingQuestionCount?.value || "0", 10) || 0;

  return {
    questionCount: qCount,
    randomQuestions: dom.pretestRandomQuestions
      ? togVal(dom.pretestRandomQuestions)
      : (dom.settingRandomQuestions?.checked ?? false),
    randomOptions: dom.pretestRandomOptions
      ? togVal(dom.pretestRandomOptions)
      : (dom.settingRandomOptions?.checked ?? false),
    onlyUnanswered: dom.pretestOnlyUnanswered
      ? togVal(dom.pretestOnlyUnanswered)
      : (dom.settingOnlyUnanswered?.checked ?? false),
    showAnswersImmediately: dom.pretestShowAnswers
      ? togVal(dom.pretestShowAnswers)
      : (dom.settingShowAnswers?.checked ?? true),
    maxOptions: Math.max(
      1,
      Number.parseInt(dom.settingMaxOptions?.value || "4", 10) || 4
    ),
  };
}
