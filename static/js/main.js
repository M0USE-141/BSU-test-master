/**
 * main.js — SPA entry point
 * Loaded as <script type="module"> from index.html
 */
import { initTheme, setTheme, setAccent } from './utils/theme.js';
import { initI18n, setLocale } from './i18n.js';
import { initRouter } from './router.js';
import { initSearchPalette } from './search-palette.js';
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
