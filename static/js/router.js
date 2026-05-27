/**
 * router.js — hash-based SPA router
 *
 * Route format: #/path or #/path/:param
 * Each screen module must export:
 *   export default async function render(root, params) { ... }
 */

import { isMobile, onBreakpointChange } from './utils/device.js';
import { setState } from './state.js';

/**
 * Cache-bust version: injected by the server as window.__APP_VERSION__ (stable
 * within a deploy / server session). Falls back to Date.now() only when the
 * server hasn't set it (e.g. opening index.html directly from disk).
 */
const _V = window.__APP_VERSION__ || Date.now();

// Preload icons with a versioned URL so any module that calls icon() via
// window.__iconsFresh gets the latest PATHS, bypassing the static-import cache.
import(`./icons.js?v=${_V}`).then(m => { window.__iconsFresh = m; });

/**
 * Escape HTML special characters to prevent XSS in innerHTML.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @type {Array<(route: { path: string, params: Record<string, string> }) => void>} */
const _listeners = [];

/** Incremented on every navigation; screens compare against their captured value to abort stale renders. */
let _routeToken = 0;

/** @type {{ path: string, params: Record<string,string> }} */
let _current = { path: '', params: {} };

/** @type {HTMLElement|null} */
let _root = null;

/**
 * Route table: path pattern → { desktop, mobile } or single module path.
 * Use ':param' for dynamic segments.
 */
const ROUTES = [
  {
    pattern: '/auth/login',
    module: () => import(`./screens/auth/login.js?v=${_V}`),
  },
  {
    pattern: '/auth/register',
    module: () => import(`./screens/auth/register.js?v=${_V}`),
  },
  {
    pattern: '/home',
    module: () => isMobile()
      ? import(`./screens/mobile/home.js?v=${_V}`)
      : import(`./screens/desktop/home.js?v=${_V}`),
  },
  {
    pattern: '/tests',
    module: () => isMobile()
      ? import(`./screens/mobile/home.js?v=${_V}`)
      : import(`./screens/desktop/home.js?v=${_V}`),
  },
  {
    pattern: '/stats',
    module: () => isMobile()
      ? import(`./screens/mobile/stats.js?v=${_V}`)
      : import(`./screens/desktop/stats.js?v=${_V}`),
  },
  {
    pattern: '/test/:id',
    module: () => isMobile()
      ? import(`./screens/mobile/tests.js?v=${_V}`)
      : import(`./screens/desktop/test-detail.js?v=${_V}`),
  },
  {
    pattern: '/test/:id/take',
    module: () => isMobile()
      ? import(`./screens/mobile/taking.js?v=${_V}`)
      : import(`./screens/desktop/taking.js?v=${_V}`),
  },
  {
    pattern: '/test/:id/results/:attemptId',
    module: () => isMobile()
      ? import(`./screens/mobile/results.js?v=${_V}`)
      : import(`./screens/desktop/results.js?v=${_V}`),
  },
  {
    pattern: '/profile',
    module: () => isMobile()
      ? import(`./screens/mobile/profile.js?v=${_V}`)
      : import(`./screens/desktop/profile.js?v=${_V}`),
  },
  {
    pattern: '/settings',
    module: () => isMobile()
      ? import(`./screens/mobile/settings.js?v=${_V}`)
      : import(`./screens/desktop/settings.js?v=${_V}`),
  },
  {
    pattern: '/notifications',
    module: () => isMobile()
      ? import(`./screens/mobile/notifications.js?v=${_V}`)
      : import(`./screens/desktop/notifications.js?v=${_V}`),
  },
  {
    pattern: '/import',
    module: () => isMobile()
      ? import(`./screens/mobile/import.js?v=${_V}`)
      : import(`./screens/desktop/import.js?v=${_V}`),
  },
  {
    pattern: '/collection/:id',
    module: () => isMobile()
      ? import(`./screens/mobile/collection.js?v=${_V}`)
      : import(`./screens/desktop/home.js?v=${_V}`),
  },
  {
    pattern: '/change-requests/:testId',
    module: () => isMobile()
      ? import(`./screens/mobile/change-requests.js?v=${_V}`)
      : import(`./screens/desktop/change-requests.js?v=${_V}`),
  },
];

/**
 * Match a path against a pattern, returning extracted params or null.
 * @param {string} pattern — e.g. '/test/:id/results/:attemptId'
 * @param {string} path    — e.g. '/test/abc-123/results/42'
 * @returns {Record<string, string>|null}
 */
function matchPattern(pattern, path) {
  const patternParts = pattern.split('/');
  const pathParts    = path.split('/');
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (pp !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Parse the current location.hash into { path, query }.
 * e.g. "#/test/abc/take?review=true&startIdx=2"
 *   → { path: "/test/abc/take", query: { review: "true", startIdx: "2" } }
 * @returns {{ path: string, query: Record<string, string> }}
 */
function getHashPath() {
  const hash = location.hash;
  if (!hash || hash === '#' || hash === '#/') return { path: '/home', query: {} };
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const qIdx = raw.indexOf('?');
  if (qIdx === -1) return { path: raw, query: {} };
  const path = raw.slice(0, qIdx);
  const query = {};
  for (const [k, v] of new URLSearchParams(raw.slice(qIdx + 1))) query[k] = v;
  return { path: path || '/home', query };
}

/**
 * Render a route by loading its module and calling render().
 * Accepts either a string path or a { path, query } object from getHashPath().
 * @param {string | { path: string, query: Record<string,string> }} pathOrObj
 */
async function handleRoute(pathOrObj) {
  if (!_root) return;

  const myToken = ++_routeToken;
  const stale = () => _routeToken !== myToken;

  const rawPath = typeof pathOrObj === 'string' ? pathOrObj : (pathOrObj?.path ?? '');
  const queryParams = typeof pathOrObj === 'object' ? (pathOrObj?.query ?? {}) : {};

  // Handle redirect for empty/root paths
  const effectivePath = (!rawPath || rawPath === '/' || rawPath === '') ? '/home' : rawPath;

  // Auth guard — redirect unauthenticated users to login
  const publicRoutes = ['/auth/login', '/auth/register'];
  if (!publicRoutes.includes(effectivePath) && !localStorage.getItem('access_token')) {
    navigate('/auth/login');
    return;
  }

  // Find matching route
  let matchedModule = null;
  let params = {};

  for (const route of ROUTES) {
    const match = matchPattern(route.pattern, effectivePath);
    if (match !== null) {
      matchedModule = route.module;
      // Merge path params + query params (path params take precedence)
      params = { ...queryParams, ...match };
      break;
    }
  }

  // Update state
  _current = { path: effectivePath, params };
  setState({ route: effectivePath, routeParams: params });

  // Notify listeners
  for (const cb of _listeners) {
    try { cb({ path: effectivePath, params }); }
    catch (e) { console.error('[router] listener error:', e); }
  }

  if (!matchedModule) {
    _root.innerHTML = `
      <div class="screen" style="align-items:center;justify-content:center;gap:12px;">
        <p style="font-size:18px;font-weight:600;">404</p>
        <p style="color:var(--ink-mute)">Page not found: ${escapeHtml(effectivePath)}</p>
        <a href="#/home" class="btn btn--primary">Go home</a>
      </div>
    `;
    return;
  }

  // Show loading state briefly
  _root.innerHTML = `
    <div class="screen" style="align-items:center;justify-content:center;">
      <div class="skeleton" style="width:120px;height:16px;border-radius:8px;"></div>
    </div>
  `;

  try {
    const mod = await matchedModule();
    if (stale()) return;
    const renderFn = mod.default;
    if (typeof renderFn !== 'function') {
      throw new Error(`Screen module for "${effectivePath}" must export a default function`);
    }
    await renderFn(_root, params);
  } catch (e) {
    if (stale()) return;
    console.error('[router] render error:', e);
    _root.innerHTML = `
      <div class="screen" style="align-items:center;justify-content:center;gap:8px;padding:var(--pad);">
        <p style="font-weight:600;color:#d9534f;">Render error</p>
        <p style="font-size:13px;color:var(--ink-mute)">${escapeHtml(e.message)}</p>
        <a href="#/home" class="btn btn--ghost btn--small">Go home</a>
      </div>
    `;
  }
}

/**
 * Initialize the router with a root DOM element.
 * @param {HTMLElement} root
 */
export function initRouter(root) {
  _root = root;

  // Handle hash changes
  window.addEventListener('hashchange', () => {
    handleRoute(getHashPath());
  });

  // Re-render current route when mobile/desktop breakpoint changes
  onBreakpointChange(() => {
    if (_current) handleRoute(_current.path);
  });

  // Re-render current route when locale changes
  window.addEventListener('localechange', () => {
    if (_current) handleRoute(_current.path);
  });

  // Initial route
  handleRoute(getHashPath());
}

/**
 * Programmatically navigate to a path.
 * @param {string} path — e.g. '/home', '/test/abc-123/take'
 */
export function navigate(path) {
  location.hash = '#' + path;
}

/**
 * Register a route change listener.
 * @param {(route: { path: string, params: Record<string, string> }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onRouteChange(cb) {
  _listeners.push(cb);
  return () => {
    const i = _listeners.indexOf(cb);
    if (i !== -1) _listeners.splice(i, 1);
  };
}

/**
 * Get the current route.
 * @returns {{ path: string, params: Record<string, string> }}
 */
export function getCurrentRoute() {
  return { ..._current };
}
