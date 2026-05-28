/**
 * theme.js — theme and accent management
 * Reads/writes data-theme and data-accent on <html>.
 * Persists to localStorage.
 */

const THEMES  = ['light', 'dark', 'system'];
const ACCENTS = ['green', 'coral', 'yellow', 'blue', 'mono'];

/**
 * Resolve 'system' to 'light' or 'dark' based on OS preference.
 * @returns {'light'|'dark'}
 */
function resolveSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Apply a resolved (non-'system') theme to the document.
 * @param {'light'|'dark'} resolved
 */
function applyTheme(resolved) {
  document.documentElement.setAttribute('data-theme', resolved);
}

/**
 * Apply an accent color to the document.
 * @param {string} accent
 */
function applyAccent(accent) {
  document.documentElement.setAttribute('data-accent', accent);
}

/**
 * Read saved theme preference from localStorage.
 * @returns {string}
 */
function savedTheme() {
  return localStorage.getItem('theme') || 'system';
}

/**
 * Read saved accent from localStorage.
 * @returns {string}
 */
function savedAccent() {
  return localStorage.getItem('accent') || 'green';
}

/**
 * Initialize theme and accent on page load.
 * Should be called synchronously before rendering to avoid flash.
 */
export function initTheme() {
  const theme = savedTheme();
  const accent = savedAccent();
  const resolved = theme === 'system' ? resolveSystemTheme() : theme;
  applyTheme(resolved);
  applyAccent(accent);

  // Watch for OS preference changes when theme is 'system'
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem('theme') === 'system') {
      applyTheme(resolveSystemTheme());
    }
  });
}

/**
 * Set theme preference.
 * @param {'light'|'dark'|'system'} theme
 */
export function setTheme(theme) {
  if (!THEMES.includes(theme)) {
    console.warn(`[theme] unknown theme: "${theme}"`);
    return;
  }
  localStorage.setItem('theme', theme);
  const resolved = theme === 'system' ? resolveSystemTheme() : theme;
  applyTheme(resolved);
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme, resolved } }));
}

/**
 * Set accent color.
 * @param {string} accent
 */
export function setAccent(accent) {
  if (!ACCENTS.includes(accent)) {
    console.warn(`[theme] unknown accent: "${accent}"`);
    return;
  }
  localStorage.setItem('accent', accent);
  applyAccent(accent);
  window.dispatchEvent(new CustomEvent('accentchange', { detail: { accent } }));
}

/**
 * Get the current theme preference ('light', 'dark', or 'system').
 * @returns {string}
 */
export function getTheme() {
  return savedTheme();
}

/**
 * Get the currently applied (resolved) theme — never 'system'.
 * @returns {'light'|'dark'}
 */
export function getResolvedTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

/**
 * Get the current accent.
 * @returns {string}
 */
export function getAccent() {
  return savedAccent();
}
