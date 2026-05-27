/**
 * utils/escape.js — HTML escape helper (single shared copy)
 *
 * Use escHtml() in all screen modules instead of defining a local esc/escHtml.
 * Mobile screens can also import esc from './_shell.js' (re-exports this).
 */

/**
 * Escape HTML special characters to prevent XSS.
 * @param {any} s
 * @returns {string}
 */
export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
