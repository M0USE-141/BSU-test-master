/**
 * Main Application Entry Point
 * Refactored into modular structure
 */

import { fetchTests } from "./api.js";
import { defaultLocale } from "./i18n.js";
import { renderAuthScreen, renderManagementScreen } from "./rendering.js";
// rendering.js is on the critical path (renderAuthScreen needed for unauthenticated users);
import { initTelemetry } from "./telemetry.js";
import { dom, state } from "./state.js";

// Import utilities
import { applyLocale, getStoredLocale } from "./utils/locale.js";
import { setupThemeToggle, getStoredTheme, applyThemePreference } from "./utils/theme.js";

// Auth screen is critical path — keep static
import {
  initializeAuthScreenEvents,
  checkAuthOnLoad,
  updateUserDisplay,
} from "./screens/auth.js";

// Header dropdown component
import {
  initHeaderDropdown,
  updateDropdownUser,
  showHeaderNav,
  hideHeaderNav,
} from "./components/header-dropdown.js";

// Mobile nav drawer
import { initMobileNav } from "./components/mobile-nav.js";

/**
 * Load app content after successful auth.
 * All screen modules (management, testing, stats, profile) are lazy-loaded here
 * so unauthenticated users on the auth screen don't pay for them.
 */
async function loadAppContent() {
  // Lazy-load all post-auth screen modules in parallel
  const [
    { initializeManagementScreenEvents, renderTestCardsWithHandlers, selectTest },
    { initializeTestingScreenEvents, setActiveTestingPanel, updateTestingPanelsStatus },
    { initializeStatsScreenEvents },
    { initializeProfileScreenEvents, navigateToProfile },
  ] = await Promise.all([
    import("./screens/management.js"),
    import("./screens/testing.js"),
    import("./screens/statistics.js"),
    import("./screens/profile.js"),
  ]);

  // Wire up profile navigation (was previously in initialize())
  dom.profileButton?.removeEventListener("click", window._profileClickHandler);
  window._profileClickHandler = () => navigateToProfile();
  dom.profileButton?.addEventListener("click", window._profileClickHandler);

  // Initialize screen event listeners
  initializeManagementScreenEvents();
  initializeTestingScreenEvents();
  initializeStatsScreenEvents();
  initializeProfileScreenEvents();

  // Render management screen
  renderManagementScreen();
  updateTestingPanelsStatus();
  setActiveTestingPanel("settings");

  // Load initial tests
  try {
    const { tests } = await fetchTests();
    state.testsCache = tests;
    if (!tests.length) {
      renderTestCardsWithHandlers(tests);
      await selectTest(null);
      return;
    }

    renderTestCardsWithHandlers(tests);
  } catch (error) {
    if (dom.questionContainer) {
      dom.questionContainer.textContent = error.message;
    }
  }
}

/**
 * Initialize application
 */
async function initialize() {
  console.log("[App] Initializing...");
  console.log("[App] DOM elements:", {
    themeToggle: dom.themeToggle,
    langSelect: dom.langSelect,
    authLoginTab: dom.authLoginTab,
    authRegisterTab: dom.authRegisterTab,
  });

  // Apply saved locale
  const storedLocale = getStoredLocale() || defaultLocale;
  applyLocale(storedLocale, state, dom);
  console.log("[App] Locale applied:", storedLocale);

  // Apply saved theme
  const storedTheme = getStoredTheme();
  applyThemePreference(storedTheme);
  setupThemeToggle(dom.themeToggle);
  console.log("[App] Theme applied:", storedTheme);

  // Initialize telemetry
  initTelemetry();

  // Initialize header dropdown (avatar chip, nav links, language switcher)
  initHeaderDropdown();
  initMobileNav();

  // Initialize auth screen events (critical path — always needed)
  console.log("[App] Initializing auth screen events...");
  initializeAuthScreenEvents();
  console.log("[App] Screen events initialized");

  // Listen for profile updates to refresh user display
  window.addEventListener("profileUpdated", (event) => {
    const profile = event.detail;
    if (profile) {
      state.currentUser = {
        ...state.currentUser,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      };
      updateUserDisplay(state.currentUser);
    }
  });

  // Setup language selector
  dom.langSelect?.addEventListener("change", (event) => {
    console.log("[App] Language changed to:", event.target.value);
    applyLocale(event.target.value, state, dom);
  });

  // Hide header nav on logout (proxy the hidden legacy logout button)
  dom.logoutButton?.addEventListener("click", () => {
    hideHeaderNav();
  });

  // Check authentication status
  console.log("[App] Checking auth...");
  try {
    const user = await checkAuthOnLoad();
    console.log("[App] Auth check result:", user);

    if (user) {
      // User is authenticated, load app content
      state.currentUser = user;
      updateUserDisplay(user);
      updateDropdownUser(user);
      showHeaderNav();
      await loadAppContent();
    } else {
      // User is not authenticated, show auth screen
      console.log("[App] Showing auth screen");
      renderAuthScreen();
    }
  } catch (error) {
    console.error("[App] Auth check error:", error);
    renderAuthScreen();
  }

  console.log("[App] Initialization complete");
}

/**
 * Called when user successfully authenticates.
 * Exposed globally for auth screen callback.
 */
window.onAuthSuccess = async function (user) {
  state.currentUser = user;
  updateDropdownUser(user);
  showHeaderNav();
  await loadAppContent();
};

// Start application
initialize();
