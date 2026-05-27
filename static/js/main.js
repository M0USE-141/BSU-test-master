/**
 * main.js — SPA entry point
 * Loaded as <script type="module"> from index.html
 */
import { initTheme, setTheme, setAccent } from './utils/theme.js';
import { initI18n, setLocale } from './i18n.js';
import { initRouter, navigate } from './router.js';
import { initSearchPalette } from './search-palette.js';
import { toggleCheatsheet, closeCheatsheet } from './components/cheatsheet.js';
import { getMe } from './api/auth.js';
import { getMyProfile } from './api/users.js';
import { getState, setState } from './state.js';

// Apply theme synchronously before render to avoid flash
initTheme();

// Initialize i18n, then start the router
await initI18n();

// Re-hydrate user state from stored token (survives page reloads)
if (localStorage.getItem('access_token')) {
  try {
    const user = await getMe();
    if (user?.id) {
      setState({ user });
      // Hydrate theme/language/accent preferences from server profile
      // (server is source of truth; localStorage is cache)
      try {
        const profile = await getMyProfile();
        if (profile) {
          // Apply server prefs only when they differ from cached values
          if (profile.theme    && profile.theme    !== localStorage.getItem('theme'))
            setTheme(profile.theme);
          if (profile.accent   && profile.accent   !== localStorage.getItem('accent'))
            setAccent(profile.accent);
          if (profile.language && profile.language !== localStorage.getItem('locale'))
            await setLocale(profile.language);   // reloads messages; router not started yet
          setState({ user: { ...getState().user, ...profile } });
        }
      } catch { /* preferences hydration is best-effort */ }
    }
  } catch { /* token expired or invalid — router will redirect to login */ }
}

initRouter(document.getElementById('app'));

// Global cmd-K search palette
initSearchPalette();

// Global hotkeys:
//   '?'      → toggle keyboard cheatsheet
//   'Esc'    → close overlays
//   'G H'    → /home    (gmail-style chord)
//   'G S'    → /stats
//   'G N'    → /notifications
//   'G I'    → /import
//   'G P'    → /profile
//   'G T'    → /settings
const CHORD_TIMEOUT_MS = 1200;
let _chordPending = false;
let _chordTimer = null;

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function clearChord() {
  _chordPending = false;
  if (_chordTimer) { clearTimeout(_chordTimer); _chordTimer = null; }
}

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return; // chord/single-key hotkeys only
  if (isTypingTarget(e.target)) return;

  // '?' (Shift+/ or single ?) — toggle cheatsheet
  if (e.key === '?') {
    e.preventDefault();
    toggleCheatsheet();
    return;
  }

  if (e.key === 'Escape') {
    closeCheatsheet();
    clearChord();
    return;
  }

  // Two-key chords starting with 'g'
  if (_chordPending) {
    const dest = {
      h: '/home',
      s: '/stats',
      n: '/notifications',
      i: '/import',
      p: '/profile',
      t: '/settings',
    }[e.key.toLowerCase()];
    clearChord();
    if (dest) {
      e.preventDefault();
      navigate(dest);
    }
    return;
  }
  if (e.key === 'g' || e.key === 'G') {
    e.preventDefault();
    _chordPending = true;
    _chordTimer = setTimeout(clearChord, CHORD_TIMEOUT_MS);
  }
});
