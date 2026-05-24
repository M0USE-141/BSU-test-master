/**
 * Mobile navigation drawer.
 * Handles slide-out drawer toggled by #mobile-nav-toggle.
 */
import { dom } from "../state.js";
import { setActiveScreen } from "../rendering.js";

let isOpen = false;

function open() {
  if (!dom.mobileNav || !dom.mobileNavBackdrop) return;
  isOpen = true;
  dom.mobileNav.classList.add("is-open");
  dom.mobileNav.setAttribute("aria-hidden", "false");
  dom.mobileNavBackdrop.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function close() {
  if (!dom.mobileNav || !dom.mobileNavBackdrop) return;
  isOpen = false;
  dom.mobileNav.classList.remove("is-open");
  dom.mobileNav.setAttribute("aria-hidden", "true");
  dom.mobileNavBackdrop.classList.remove("is-open");
  document.body.style.overflow = "";
}

/**
 * Initialize the mobile nav drawer. Call once at app startup.
 */
export function initMobileNav() {
  // Toggle button (hamburger)
  dom.mobileNavToggleBtn?.addEventListener("click", () => {
    if (isOpen) close(); else open();
  });

  // Close button inside drawer
  document.getElementById("mobile-nav-close")?.addEventListener("click", close);

  // Backdrop click closes
  dom.mobileNavBackdrop?.addEventListener("click", close);

  // ESC key closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) close();
  });

  // Nav items — navigate and close
  document.getElementById("mobile-nav-tests")?.addEventListener("click", () => {
    close();
    setActiveScreen("management");
  });
  document.getElementById("mobile-nav-stats")?.addEventListener("click", () => {
    close();
    setActiveScreen("stats");
  });
}

/**
 * Update the active state of mobile nav items.
 */
export function updateMobileNavLinks(activeScreen) {
  const testsBtn = document.getElementById("mobile-nav-tests");
  const statsBtn = document.getElementById("mobile-nav-stats");
  if (testsBtn) testsBtn.classList.toggle("is-active", activeScreen === "management");
  if (statsBtn) statsBtn.classList.toggle("is-active", activeScreen === "stats");
}
