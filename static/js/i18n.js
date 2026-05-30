/**
 * i18n.js — internationalization
 * Loads /static/locales/{locale}.json, exposes t(key, vars?) for translations.
 */

let _locale = 'ru';
let _messages = {};
let _fallback = {};

/**
 * Detect locale from localStorage or navigator.language.
 * @returns {string} locale code (e.g. 'ru', 'en', 'uz')
 */
function detectLocale() {
  const stored = localStorage.getItem('locale');
  if (stored && ['ru', 'en', 'uz'].includes(stored)) return stored;
  const nav = (navigator.language || 'ru').split('-')[0].toLowerCase();
  return ['ru', 'en', 'uz'].includes(nav) ? nav : 'ru';
}

/**
 * Load a locale JSON file.
 * @param {string} locale
 * @returns {Promise<Record<string, string>>}
 */
async function loadLocale(locale) {
  // Cache-bust via APP_VERSION instead of `no-store` so repeat visits within
  // the same deploy hit the browser cache. Saves a network roundtrip on
  // every page load.
  const v = window.__APP_VERSION__ || 'dev';
  try {
    const res = await fetch(`/static/locales/${locale}.json?v=${v}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`[i18n] failed to load locale "${locale}":`, e);
    return {};
  }
}

/**
 * Initialize i18n. Must be called before t() is used.
 * @returns {Promise<void>}
 */
export async function initI18n() {
  _locale = detectLocale();
  _messages = await loadLocale(_locale);
  // Load Russian as fallback if primary is not Russian
  if (_locale !== 'ru') {
    _fallback = await loadLocale('ru');
  } else {
    _fallback = _messages;
  }
}

/**
 * Translate a key, interpolating {{var}} placeholders.
 *
 * Resolution order:
 *   1. Current locale (`_messages[key]`).
 *   2. Russian fallback (`_fallback[key]`).
 *   3. Empty string — lets the common `t('foo') || 'Default'` pattern
 *      surface the inline default. Returning the dotted key here (the
 *      pre-Phase 8 behavior) would make the `||` short-circuit useless
 *      because the key string is truthy, so the UI would render the
 *      literal "foo.bar".
 *
 * In dev (`localStorage.i18nDebug === '1'`) we log a single warning per
 * unresolved key to make missing entries discoverable without spamming.
 *
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
const _missingLogged = new Set();
export function t(key, vars) {
  let msg = _messages[key];
  if (msg === undefined || msg === null) msg = _fallback[key];
  if (msg === undefined || msg === null) {
    if (localStorage.getItem('i18nDebug') === '1' && !_missingLogged.has(key)) {
      _missingLogged.add(key);
      console.warn(`[i18n] missing key: ${key}`);
    }
    msg = '';
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return msg;
}

/**
 * Change the active locale and reload messages.
 * @param {string} locale
 * @returns {Promise<void>}
 */
export async function setLocale(locale) {
  if (!['ru', 'en', 'uz'].includes(locale)) {
    console.warn(`[i18n] unsupported locale: "${locale}"`);
    return;
  }
  localStorage.setItem('locale', locale);
  _locale = locale;
  _messages = await loadLocale(locale);
  if (locale !== 'ru') {
    _fallback = await loadLocale('ru');
  } else {
    _fallback = _messages;
  }
  // Notify the app so it can re-render
  window.dispatchEvent(new CustomEvent('localechange', { detail: { locale } }));
}

/**
 * Get the current locale.
 * @returns {string}
 */
export function getLocale() {
  return _locale;
}
