/**
 * Header avatar dropdown — open/close, language switcher, profile/logout routing.
 */
import { dom, state } from "../state.js";
import { applyLocale } from "../utils/locale.js";

/**
 * Initialize the header dropdown. Call once on app startup.
 */
export function initHeaderDropdown() {
  const chipBtn = document.getElementById("avatar-chip-btn");
  if (!chipBtn) return;

  // Open/close on chip click
  chipBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const dropdown = dom.avatarDropdown;
    if (!dropdown) return;
    const isHidden = dropdown.classList.contains("is-hidden");
    dropdown.classList.toggle("is-hidden", !isHidden);
  });

  // Close on outside click
  document.addEventListener("click", () => {
    dom.avatarDropdown?.classList.add("is-hidden");
  });

  // Language buttons
  [
    { id: "dropdown-lang-ru", locale: "ru" },
    { id: "dropdown-lang-en", locale: "en" },
    { id: "dropdown-lang-uz", locale: "uz" },
  ].forEach(({ id, locale }) => {
    document.getElementById(id)?.addEventListener("click", (e) => {
      e.stopPropagation();
      applyLocale(locale, state, dom);
      updateLangButtons(locale);
      // Mirror to legacy select for backward compat
      if (dom.langSelect) dom.langSelect.value = locale;
    });
  });

  // Profile link
  dom.dropdownProfileLink?.addEventListener("click", () => {
    dom.avatarDropdown?.classList.add("is-hidden");
    dom.profileButton?.click();
  });

  // Logout link — mirrors existing logout button
  dom.dropdownLogoutLink?.addEventListener("click", () => {
    dom.avatarDropdown?.classList.add("is-hidden");
    dom.logoutButton?.click();
  });

  // Nav links — dispatch to screens
  dom.navTestsLink?.addEventListener("click", (e) => {
    e.preventDefault();
    import("../rendering.js").then((m) => m.setActiveScreen("management"));
  });
  dom.navStatsLink?.addEventListener("click", (e) => {
    e.preventDefault();
    import("../rendering.js").then((m) => m.setActiveScreen("stats"));
  });
}

/**
 * Update dropdown user info after login.
 */
export function updateDropdownUser(user) {
  if (!user) return;
  if (dom.dropdownUserName) {
    dom.dropdownUserName.textContent = user.display_name || user.username || "";
  }
  if (dom.dropdownUserEmail) {
    dom.dropdownUserEmail.textContent = user.email || "";
  }
}

/**
 * Highlight the active language button in the dropdown.
 */
export function updateLangButtons(activeLocale) {
  ["ru", "en", "uz"].forEach((loc) => {
    const btn = document.getElementById(`dropdown-lang-${loc}`);
    if (btn) btn.dataset.active = String(loc === activeLocale);
  });
}

/**
 * Highlight the active nav link in the header.
 */
export function updateNavLinks(activeScreen) {
  if (dom.navTestsLink) {
    dom.navTestsLink.dataset.active = String(activeScreen === "management");
  }
  if (dom.navStatsLink) {
    dom.navStatsLink.dataset.active = String(activeScreen === "stats");
  }
}

/**
 * Show the nav links and user chip (called after login).
 */
export function showHeaderNav() {
  document.getElementById("header-nav")?.classList.remove("is-hidden");
}

/**
 * Hide the nav links (called after logout).
 */
export function hideHeaderNav() {
  document.getElementById("header-nav")?.classList.add("is-hidden");
}
