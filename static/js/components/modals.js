/**
 * Modal management
 */

import { dom, state } from "../state.js";
import { updateEditorTestActions, setActiveScreen } from "../rendering.js";
import { renderEditorObjects } from "../editor.js";

/**
 * Open editor (now a full-screen section)
 */
export function openEditorModal() {
  updateEditorTestActions();
  renderEditorObjects();
  // Update editor header title
  const titleEl = document.getElementById("editor-screen-test-title");
  if (titleEl) titleEl.textContent = state.currentTest?.title || state.currentTest?.id || "";
  setActiveScreen("editor");
}

/**
 * Close editor and return to management
 */
export function closeEditorModal() {
  setActiveScreen("management");
}

/**
 * Open import screen (full-page)
 */
export function openImportModal() {
  setActiveScreen("import");
}

/**
 * Close import screen and return to management
 */
export function closeImportModal() {
  setActiveScreen("management");
}

// Wire import screen back button
document.getElementById("import-screen-back")?.addEventListener("click", closeImportModal);

/**
 * Set create test status message
 */
export function setCreateTestStatus(message = "", isError = false) {
  if (!dom.createTestStatus) {
    return;
  }
  dom.createTestStatus.textContent = message;
  dom.createTestStatus.classList.toggle("is-error", isError);
}

/**
 * Open create test modal
 */
export function openCreateTestModal() {
  if (!dom.createTestModal) {
    return;
  }
  setCreateTestStatus("");
  if (dom.createTestTitleInput) {
    dom.createTestTitleInput.value = "";
    dom.createTestTitleInput.focus();
  }
  dom.createTestModal.classList.add("is-open");
  dom.createTestModal.setAttribute("aria-hidden", "false");
}

/**
 * Close create test modal
 */
export function closeCreateTestModal() {
  if (!dom.createTestModal) {
    return;
  }
  dom.createTestModal.classList.remove("is-open");
  dom.createTestModal.setAttribute("aria-hidden", "true");
}
