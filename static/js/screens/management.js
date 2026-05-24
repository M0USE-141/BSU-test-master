/**
 * Management Screen - Test collection management
 */

import {
  addQuestion,
  createChangeRequest,
  createEmptyTest,
  deleteQuestion as deleteQuestionApi,
  deleteTest as deleteTestApi,
  fetchTest,
  fetchTests,
  renameTest as renameTestApi,
  updateQuestion,
} from "../api.js";
import {
  addOptionRow,
  buildInlineRegistry,
  clearEditorValidation,
  collectEditorOptionPayloads,
  findEditorQuestion,
  formatMissingMarkers,
  handleAddObject,
  isLegacyDocFile,
  isSupportedImageFile,
  isXmlFile,
  parseTextToBlocks,
  renderEditorObjects,
  renderEditorQuestionList,
  resetEditorForm,
  setEditorObjectSection,
  setEditorObjectStatus,
  setEditorState,
  setFieldError,
  syncEditorFormFromQuestion,
  syncEditorObjectFields,
  syncEditorPanelLocation,
} from "../editor.js";
import {
  renderDetailKpis,
  renderManagementScreen,
  renderQuestionNav,
  renderResultSummary,
  renderTestListItem,
  renderUploadLogs,
  setActiveScreen,
  updateEditorTestActions,
  updateProgressHint,
} from "../rendering.js";
import { t, formatNumber } from "../i18n.js";
import { clearTestsCache, dom, editorMobileQuery, loadLastResult, state } from "../state.js";
import {
  closeCreateTestModal,
  closeEditorModal,
  closeImportModal,
  openCreateTestModal,
  openEditorModal,
  openImportModal,
  setCreateTestStatus,
} from "../components/modals.js";
import {
  initializeAccessModalEvents,
  openAccessSettingsModal,
} from "../components/access-modal.js";
import {
  initializeChangeRequestsModalEvents,
  openChangeRequestsModal,
} from "../components/change-requests-modal.js";
import {
  initializeTestStatsModalEvents,
  openTestStatsModal,
} from "../components/test-stats-modal.js";
import { setupDropzone } from "../utils/file-upload.js";
import { getAuthHeaders } from "../api/auth.js";

/**
 * Show the info view (KPIs + action row) in the detail panel.
 */
function showDetailInfoView() {
  document.getElementById("test-detail-settings")?.classList.add("is-hidden");
  document.getElementById("test-detail-action-row")?.classList.remove("is-hidden");
}

/**
 * Show the inline settings view in the detail panel.
 */
function showDetailSettingsView(test) {
  // Populate title
  const titleEl = document.getElementById("test-settings-title");
  if (titleEl) titleEl.textContent = test.title || test.id;

  // Update stepper max and reset to max
  const qCount = dom.pretestQuestionCount;
  const maxQ = test.questions?.length ?? 20;
  if (qCount) {
    qCount.textContent = String(maxQ);
    qCount.dataset.max = String(maxQ);
  }

  // Show settings, hide action row
  document.getElementById("test-detail-action-row")?.classList.add("is-hidden");
  document.getElementById("test-detail-settings")?.classList.remove("is-hidden");
}

/**
 * Render test cards with event handlers.
 * Uses the compact two-panel list view (renderTestList) only.
 * The old renderTestCards call has been removed to prevent double-rendering
 * to the same #test-cards container (Fix #3).
 */
export function renderTestCardsWithHandlers(tests, selectedId) {
  renderTestList(tests, selectedId);
}

/**
 * Render the compact left-panel test list.
 * Replaces the grid-card layout with compact rows.
 */
export function renderTestList(tests, activeTestId = null) {
  // Fix #2: Reset right panel to empty state when re-rendering the list
  document.getElementById("test-detail-panel")?.classList.add("is-hidden");
  document.getElementById("test-detail-empty")?.style.removeProperty("display");

  const container = dom.testCardsContainer;
  if (!container) return;
  container.innerHTML = "";
  if (!tests || tests.length === 0) {
    container.innerHTML = '<p class="muted" style="padding:1rem;font-size:0.875rem;">Нет тестов</p>';
    return;
  }
  tests.forEach((test) => {
    const item = renderTestListItem(test, test.id === activeTestId);
    item.addEventListener("click", () => showTestDetail(test, tests));
    container.appendChild(item);
  });
}

/**
 * Show the right detail panel for a selected test.
 */
export async function showTestDetail(test, allTests = []) {
  // Update active row highlight
  document.querySelectorAll(".test-list-item").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.testId === test.id);
  });

  // Ensure info view is shown (reset from any previously-open settings view)
  showDetailInfoView();

  // Show panel, hide empty placeholder
  const detailPanel = dom.testDetailPanel;
  const emptyEl = document.getElementById("test-detail-empty");
  if (detailPanel) detailPanel.classList.remove("is-hidden");
  if (emptyEl) emptyEl.style.display = "none";

  // Title + badge + meta
  if (dom.testDetailTitle) dom.testDetailTitle.textContent = test.title || test.id;

  const badge = document.getElementById("test-detail-badge");
  if (badge) {
    badge.textContent = test.access_level || "";
    badge.className = `badge badge--${test.access_level || "private"}`;
  }

  const meta = document.getElementById("test-detail-meta");
  if (meta) {
    const count = test.questions?.length ?? 0;
    const parts = [`${count} ${t("metaQuestionsCount")}`];
    if (test.owner_username && state.currentUser && test.owner_username !== state.currentUser.username) {
      parts.push(t("metaAuthor", { name: test.owner_username }));
    }
    meta.textContent = parts.join(" · ");
  }

  // Wire action buttons (Fix #1: re-query fresh DOM nodes each call so
  // cloneNode always has a valid parentNode and replaceChild never silently no-ops)
  const startBtn = document.getElementById("test-detail-start");
  const editBtn = document.getElementById("test-detail-edit");
  const statsBtn = document.getElementById("test-detail-stats");

  if (startBtn) {
    const newStart = startBtn.cloneNode(true);
    startBtn.parentNode?.replaceChild(newStart, startBtn);
    newStart.addEventListener("click", () => showDetailSettingsView(test));
  }

  // Wire the "Поехали" (start) button in the inline settings view
  const settingsStartBtn = document.getElementById("test-settings-start");
  if (settingsStartBtn) {
    const newSettingsStart = settingsStartBtn.cloneNode(true);
    settingsStartBtn.parentNode?.replaceChild(newSettingsStart, settingsStartBtn);
    newSettingsStart.addEventListener("click", async () => {
      showDetailInfoView();
      try {
        await selectTest(test.id);
        const { startTest } = await import("./testing.js");
        setActiveScreen("testing");
        startTest();
      } catch (err) {
        console.error("[management] failed to start test:", err);
      }
    });
  }
  if (editBtn) {
    const newEdit = editBtn.cloneNode(true);
    editBtn.parentNode?.replaceChild(newEdit, editBtn);
    newEdit.addEventListener("click", () => {
      selectTest(test.id)
        .then(() => {
          openEditorModal();
          renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
          resetEditorForm();
        })
        .catch((err) => console.error("[management] selectTest (edit) failed:", err));
    });
  }
  if (statsBtn) {
    const newStats = statsBtn.cloneNode(true);
    statsBtn.parentNode?.replaceChild(newStats, statsBtn);
    newStats.addEventListener("click", async () => {
      const { openStatsScreen } = await import("./statistics.js");
      await openStatsScreen(test.id);
    });
  }

  // KPIs (placeholder values; will be enriched by stats API in a future task)
  if (dom.testDetailKpis) {
    renderDetailKpis(dom.testDetailKpis, {
      accuracy: null,
      attempts: 0,
      avgTime: null,
      weakCount: 0,
    });
  }
}

/**
 * Refresh current test data
 */
export async function refreshCurrentTest(testId = state.currentTest?.id) {
  if (!testId) {
    return;
  }

  const { updateTestingPanelsStatus, setActiveTestingPanel } = await import("./testing.js");

  state.currentTest = await fetchTest(testId);
  const { tests } = await fetchTests();
  state.testsCache = tests;
  renderTestCardsWithHandlers(state.testsCache, state.currentTest.id);
  state.session = null;
  updateProgressHint();
  updateTestingPanelsStatus();
  setActiveTestingPanel("settings");
  dom.questionContainer.textContent = t("startTestingHint");
  dom.optionsContainer.textContent = "";
  dom.questionProgress.textContent = t("questionProgress", {
    current: formatNumber(0),
    total: formatNumber(0),
  });
  renderQuestionNav();
}

/**
 * Select a test (or null to deselect)
 */
export async function selectTest(testId) {
  const { updateTestingPanelsStatus, setActiveTestingPanel } = await import("./testing.js");

  if (!testId) {
    state.currentTest = null;
    state.session = null;
    updateProgressHint();
    updateTestingPanelsStatus();
    setActiveTestingPanel("settings");
    dom.questionContainer.textContent = t("noTestsLoaded");
    dom.optionsContainer.textContent = "";
    dom.optionsContainer.classList.add("is-hidden");
    dom.questionProgress.textContent = t("questionProgress", {
      current: formatNumber(0),
      total: formatNumber(0),
    });
    renderQuestionNav();
    renderResultSummary(null);
    renderTestCardsWithHandlers(state.testsCache, null);
    updateEditorTestActions();
    return;
  }

  const isSameTest = state.currentTest?.id === testId;
  state.currentTest = await fetchTest(testId);
  updateProgressHint();

  if (!isSameTest) {
    state.session = null;
    updateTestingPanelsStatus();
    setActiveTestingPanel("settings");
    dom.questionContainer.textContent = t("startTestingHint");
    dom.optionsContainer.textContent = "";
    dom.optionsContainer.classList.add("is-hidden");
    dom.questionProgress.textContent = t("questionProgress", {
      current: formatNumber(0),
      total: formatNumber(0),
    });
    renderQuestionNav();
    renderResultSummary(loadLastResult(testId));
  }

  renderTestCardsWithHandlers(state.testsCache, testId);
  updateEditorTestActions();
}

/**
 * Handle question deletion from editor
 */
export async function handleDeleteQuestion(questionId) {
  if (!state.currentTest) {
    return;
  }

  const isOwner = state.currentTest.is_owner;

  if (isOwner) {
    // Owner can directly delete
    await deleteQuestionApi(state.currentTest.id, questionId);
    await refreshCurrentTest(state.currentTest.id);
    renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
    resetEditorForm();
  } else {
    // Non-owner creates a change request
    try {
      await createChangeRequest(
        state.currentTest.id,
        "delete_question",
        {},
        questionId
      );
      alert(t("changeProposed"));
    } catch (error) {
      alert(error.message);
    }
  }
}

/**
 * Initialize management screen event listeners
 */
export function initializeManagementScreenEvents() {
  import("../utils/file-upload.js").then(({ updateUploadFileState }) => {
    updateUploadFileState(dom.uploadFileInput?.files?.[0], dom.uploadStatus, dom.uploadFilename);
  });

  // "Create test" button in the two-panel filter bar
  document.getElementById("create-test-btn")?.addEventListener("click", () => {
    openCreateTestModal();
  });

  // "Import test" button
  document.getElementById("import-test-btn")?.addEventListener("click", () => {
    openImportModal();
  });

  // Back and cancel buttons for inline settings view
  document.getElementById("test-settings-back")?.addEventListener("click", showDetailInfoView);
  document.getElementById("test-settings-cancel")?.addEventListener("click", showDetailInfoView);

  // Tab switching for test collections
  dom.testTabs?.addEventListener("click", async (event) => {
    const tab = event.target.closest(".pill-tabs__tab");
    if (!tab) return;

    const filter = tab.dataset.filter || null;
    state.uiState.activeTestFilter = filter;

    // Update active tab
    dom.testTabs.querySelectorAll(".pill-tabs__tab").forEach((t) => {
      t.classList.toggle("is-active", t === tab);
    });

    // Reload tests with filter
    try {
      const { tests } = await fetchTests({ force: true, filter });
      state.testsCache = tests;
      renderTestCardsWithHandlers(tests, state.currentTest?.id);
    } catch (error) {
      console.error("Failed to load tests:", error);
    }
  });

  dom.uploadDropzone?.classList.add("is-empty");
  dom.editorObjectImageDropzone?.classList.add("is-empty");
  dom.editorObjectFormulaDropzone?.classList.add("is-empty");

  dom.editorObjectImageFile?.addEventListener("change", () => {
    const file = dom.editorObjectImageFile.files?.[0];
    dom.editorObjectImageDropzone?.classList.toggle("is-empty", !file);
    // Show file name in dropzone
    const titleEl = dom.editorObjectImageDropzone?.querySelector(".editor-object-dropzone__title span");
    if (titleEl) {
      titleEl.textContent = file ? file.name : t("editorObjectImageDropTitle");
    }
  });

  dom.editorObjectFormulaFile?.addEventListener("change", () => {
    const file = dom.editorObjectFormulaFile.files?.[0];
    dom.editorObjectFormulaDropzone?.classList.toggle("is-empty", !file);
    // Show file name in dropzone
    const titleEl = dom.editorObjectFormulaDropzone?.querySelector(".editor-object-dropzone__title span");
    if (titleEl) {
      titleEl.textContent = file ? file.name : t("editorObjectFormulaDropTitle");
    }
  });

  dom.uploadFileInput?.addEventListener("change", () => {
    const file = dom.uploadFileInput.files?.[0] || null;
    dom.uploadDropzone?.classList.toggle("is-empty", !file);
    dom.uploadFileName?.classList.toggle("is-empty", !file);
    if (dom.uploadFileNameValue) {
      dom.uploadFileNameValue.textContent = file ? file.name : t("uploadNoFileSelected");
      dom.uploadFileNameValue.title = file ? file.name : "";
    }
    if (dom.uploadClearButton) {
      dom.uploadClearButton.disabled = !file;
    }
  });

  dom.uploadClearButton?.addEventListener("click", () => {
    if (dom.uploadFileInput) {
      dom.uploadFileInput.value = "";
    }
    dom.uploadDropzone?.classList.add("is-empty");
    dom.uploadFileName?.classList.add("is-empty");
    if (dom.uploadFileNameValue) {
      dom.uploadFileNameValue.textContent = t("uploadNoFileSelected");
      dom.uploadFileNameValue.title = "";
    }
    if (dom.uploadClearButton) {
      dom.uploadClearButton.disabled = true;
    }
  });

  dom.editorObjectFormulaText?.addEventListener("input", () => {
    setEditorObjectStatus("");
  });

  dom.editorObjectId?.addEventListener("input", () => {
    setEditorObjectStatus("");
  });

  editorMobileQuery.addEventListener("change", syncEditorPanelLocation);
  syncEditorObjectFields();
  setEditorObjectSection(null);

  setupDropzone(dom.uploadDropzone, dom.uploadFileInput);
  setupDropzone(dom.editorObjectImageDropzone, dom.editorObjectImageFile, {
    validate: isSupportedImageFile,
    onInvalid: () => {
      setEditorObjectStatus(t("objectImageInvalid"), true);
    },
  });
  setupDropzone(dom.editorObjectFormulaDropzone, dom.editorObjectFormulaFile, {
    validate: isXmlFile,
    onInvalid: () => {
      setEditorObjectStatus(t("objectXmlInvalid"), true);
    },
  });

  // Editor screen: back button → management
  document.getElementById("editor-back-btn")?.addEventListener("click", () => {
    closeEditorModal();
  });

  // Editor screen: kebab menu toggle
  const editorActionsBtn = document.getElementById("editor-actions-btn");
  const editorActionsMenu = document.getElementById("editor-actions-menu");
  editorActionsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    editorActionsMenu?.classList.toggle("is-hidden");
  });
  document.addEventListener("click", () => {
    editorActionsMenu?.classList.add("is-hidden");
  });

  dom.editorAddOption?.addEventListener("click", () => {
    addOptionRow("", false);
  });

  dom.editorObjectsToggle?.addEventListener("click", () => {
    const isVisible = !dom.editorObjectListSection?.classList.contains(
      "is-hidden"
    );
    setEditorObjectSection(isVisible ? null : "list");
  });

  dom.editorObjectUploadToggle?.addEventListener("click", () => {
    const isVisible = !dom.editorObjectUploadSection?.classList.contains(
      "is-hidden"
    );
    setEditorObjectSection(isVisible ? null : "upload");
  });

  dom.editorResetButton?.addEventListener("click", () => {
    resetEditorForm();
  });

  dom.editorObjectType?.addEventListener("change", () => {
    syncEditorObjectFields();
  });

  dom.editorAddObjectButton?.addEventListener("click", () => {
    handleAddObject();
  });

  dom.editorForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentTest) {
      return;
    }
    clearEditorValidation();
    const questionRaw = dom.editorQuestionText.value ?? "";
    if (!questionRaw.trim()) {
      alert(t("alertFillQuestion"));
      return;
    }
    const inlineRegistry = buildInlineRegistry(
      findEditorQuestion() ?? { objects: state.editorState.objects }
    );
    const questionParse = parseTextToBlocks(questionRaw, inlineRegistry);
    const questionField = dom.editorQuestionText?.closest(".editor-field");
    if (questionParse.missing.length && questionField) {
      setFieldError(
        questionField,
        t("missingObjects", {
          objects: formatMissingMarkers(questionParse.missing),
        })
      );
    }

    const optionPayloads = collectEditorOptionPayloads(inlineRegistry);
    if (!optionPayloads.payloads.length) {
      alert(t("alertFillQuestion"));
      return;
    }
    optionPayloads.missingByOption.forEach(({ element, missing }) => {
      setFieldError(
        element,
        t("missingObjects", { objects: formatMissingMarkers(missing) })
      );
    });

    if (questionParse.missing.length || optionPayloads.missingByOption.length) {
      alert(t("alertCheckObjects"));
      return;
    }

    try {
      const payload = {
        question: { blocks: questionParse.blocks },
        options: optionPayloads.payloads,
        objects: state.editorState.objects,
      };
      if (optionPayloads.correctBlocks) {
        payload.correct = { blocks: optionPayloads.correctBlocks };
      }

      const isOwner = state.currentTest.is_owner;

      if (state.editorState.mode === "edit" && state.editorState.questionId) {
        const editedId = state.editorState.questionId;

        if (isOwner) {
          // Owner can directly edit
          await updateQuestion(state.currentTest.id, editedId, payload);
          await refreshCurrentTest(state.currentTest.id);
          renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
          const updatedQuestion = state.currentTest?.questions?.find(
            (question) => question.id === editedId
          );
          if (updatedQuestion) {
            setEditorState("edit", editedId);
            syncEditorFormFromQuestion(updatedQuestion);
            renderEditorObjects(updatedQuestion);
          } else {
            resetEditorForm();
          }
        } else {
          // Non-owner creates a change request
          await createChangeRequest(
            state.currentTest.id,
            "edit_question",
            payload,
            editedId
          );
          alert(t("changeProposed"));
          resetEditorForm();
        }
      } else {
        if (isOwner) {
          // Owner can directly add
          await addQuestion(state.currentTest.id, payload);
          await refreshCurrentTest(state.currentTest.id);
          renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
          resetEditorForm();
        } else {
          // Non-owner creates a change request
          await createChangeRequest(
            state.currentTest.id,
            "add_question",
            payload
          );
          alert(t("changeProposed"));
          resetEditorForm();
        }
      }
    } catch (error) {
      alert(error.message);
    }
  });

  dom.closeEditorButton?.addEventListener("click", () => {
    closeEditorModal();
  });

  dom.closeImportButton?.addEventListener("click", () => {
    closeImportModal();
  });

  dom.closeCreateTestButton?.addEventListener("click", () => {
    closeCreateTestModal();
  });

  dom.cancelCreateTestButton?.addEventListener("click", () => {
    closeCreateTestModal();
  });

  dom.importModal?.addEventListener("click", (event) => {
    if (event.target === dom.importModal) {
      closeImportModal();
    }
  });

  dom.createTestModal?.addEventListener("click", (event) => {
    if (event.target === dom.createTestModal) {
      closeCreateTestModal();
    }
  });

  // Initialize access modal events
  initializeAccessModalEvents();

  // Initialize change requests modal events
  initializeChangeRequestsModalEvents();

  // Initialize test stats modal events
  initializeTestStatsModalEvents();

  dom.editorAccessSettingsButton?.addEventListener("click", () => {
    if (!state.currentTest) {
      return;
    }
    openAccessSettingsModal(state.currentTest.id, state.currentTest.title);
  });

  dom.editorTestStatsButton?.addEventListener("click", () => {
    if (!state.currentTest) {
      return;
    }
    openTestStatsModal(state.currentTest.id, state.currentTest.title);
  });

  dom.editorChangeRequestsButton?.addEventListener("click", () => {
    if (!state.currentTest) {
      return;
    }
    openChangeRequestsModal(state.currentTest.id, state.currentTest.title);
  });

  dom.editorRenameTestButton?.addEventListener("click", async () => {
    if (!state.currentTest) {
      return;
    }
    const newTitle = window.prompt(
      t("promptRenameTest"),
      state.currentTest.title
    );
    if (!newTitle || newTitle.trim() === state.currentTest.title) {
      return;
    }
    try {
      await renameTestApi(state.currentTest.id, newTitle.trim());
      state.currentTest = await fetchTest(state.currentTest.id);
      clearTestsCache();
      const { tests: freshTests } = await fetchTests({ force: true });
      state.testsCache = freshTests;
      renderTestCardsWithHandlers(state.testsCache, state.currentTest.id);
      updateProgressHint();
      updateEditorTestActions();
    } catch (error) {
      window.alert(error.message);
    }
  });

  dom.editorDeleteTestButton?.addEventListener("click", async () => {
    if (!state.currentTest) {
      return;
    }
    const confirmed = window.confirm(t("confirmDeleteTest"));
    if (!confirmed) {
      return;
    }
    try {
      await deleteTestApi(state.currentTest.id);
      clearTestsCache();
      const { tests: remainingTests } = await fetchTests({ force: true });
      state.testsCache = remainingTests;
      if (state.testsCache.length) {
        await selectTest(state.testsCache[0].id);
      } else {
        await selectTest(null);
      }
      closeEditorModal();
    } catch (error) {
      window.alert(error.message);
    }
  });

  // Upload form (import test)
  dom.uploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!dom.uploadFileInput.files?.length) {
      dom.questionContainer.textContent = t("importSelectFileFirst");
      renderUploadLogs(t("importSelectFileFirst"), true);
      return;
    }
    if (isLegacyDocFile(dom.uploadFileInput.files[0].name)) {
      dom.questionContainer.textContent = t("docxOnlyWarning");
      renderUploadLogs(t("docxOnlyWarning"), true);
      return;
    }

    const formData = new FormData();
    formData.append("file", dom.uploadFileInput.files[0]);
    formData.append("symbol", dom.uploadSymbolInput.value.trim());
    formData.append(
      "log_small_tables",
      dom.uploadLogSmallTablesInput.checked ? "true" : "false"
    );

    try {
      const response = await fetch("/api/tests/upload", {
        method: "POST",
        headers: { ...getAuthHeaders() },
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload?.detail || t("importFailed");
        throw new Error(detail);
      }
      const uploadResult = payload ?? {};
      clearTestsCache();
      const { tests: uploadedTests } = await fetchTests({ force: true });
      state.testsCache = uploadedTests;
      const newTestId = uploadResult?.metadata?.id;
      renderUploadLogs(uploadResult?.logs);

      const nextTestId = newTestId || uploadedTests[0]?.id;
      renderTestCardsWithHandlers(uploadedTests, nextTestId);
      await selectTest(nextTestId);

      // Reset form
      dom.uploadFileInput.value = "";
      dom.uploadSymbolInput.value = "";
      dom.uploadLogSmallTablesInput.checked = false;
      dom.uploadDropzone?.classList.add("is-empty");
      dom.uploadFileName?.classList.add("is-empty");
      if (dom.uploadFileNameValue) {
        dom.uploadFileNameValue.textContent = t("uploadNoFileSelected");
      }
      if (dom.uploadClearButton) {
        dom.uploadClearButton.disabled = true;
      }
      closeImportModal();
    } catch (error) {
      dom.questionContainer.textContent = error.message;
      renderUploadLogs(error.message, true);
    }
  });

  // Create test form
  dom.createTestForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!dom.createTestTitleInput) {
      return;
    }
    const title = dom.createTestTitleInput.value.trim();
    if (!title) {
      setCreateTestStatus(t("createTestTitleMissing"), true);
      return;
    }
    const accessLevel = dom.createTestAccessSelect?.value || "private";
    setCreateTestStatus(t("createTestCreating"));
    try {
      const payload = await createEmptyTest(title, accessLevel);
      const newTestId = payload?.metadata?.id || payload?.payload?.id;
      clearTestsCache();
      const { tests: createdTests } = await fetchTests({ force: true });
      state.testsCache = createdTests;
      renderTestCardsWithHandlers(createdTests, newTestId);
      if (newTestId) {
        await selectTest(newTestId);
      }
      dom.createTestTitleInput.value = "";
      if (dom.createTestAccessSelect) {
        dom.createTestAccessSelect.value = "private";
      }
      setCreateTestStatus("");
      closeCreateTestModal();
    } catch (error) {
      setCreateTestStatus(error.message, true);
    }
  });
}
