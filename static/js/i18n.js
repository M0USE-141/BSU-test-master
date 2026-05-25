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
  try {
    const res = await fetch(`/static/locales/${locale}.json`);
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
 * Falls back to Russian, then to the key itself.
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
export function t(key, vars) {
  let msg = _messages[key] ?? _fallback[key] ?? key;
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
