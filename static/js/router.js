/**
 * router.js — hash-based SPA router
 *
 * Route format: #/path or #/path/:param
 * Each screen module must export:
 *   export default async function render(root, params) { ... }
 */

import { isMobile } from './utils/device.js';
import { setState } from './state.js';

/** @type {Array<(route: { path: string, params: Record<string, string> }) => void>} */
const _listeners = [];

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
    module: () => import('./screens/auth/login.js'),
  },
  {
    pattern: '/auth/register',
    module: () => import('./screens/auth/register.js'),
  },
  {
    pattern: '/home',
    module: () => isMobile()
      ? import('./screens/mobile/home.js')
      : import('./screens/desktop/home.js'),
  },
  {
    pattern: '/stats',
    module: () => import('./screens/desktop/stats.js'),
  },
  {
    pattern: '/test/:id',
    module: () => import('./screens/desktop/home.js'),
  },
  {
    pattern: '/test/:id/take',
    module: () => import('./screens/desktop/taking.js'),
  },
  {
    pattern: '/test/:id/results/:attemptId',
    module: () => import('./screens/desktop/results.js'),
  },
  {
    pattern: '/profile',
    module: () => import('./screens/desktop/profile.js'),
  },
  {
    pattern: '/settings',
    module: () => import('./screens/desktop/settings.js'),
  },
  {
    pattern: '/notifications',
    module: () => import('./screens/desktop/notifications.js'),
  },
  {
    pattern: '/import',
    module: () => import('./screens/desktop/import.js'),
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
 * Parse the current location.hash into a path string.
 * @returns {string}
 */
function getHashPath() {
  const hash = location.hash;
  if (!hash || hash === '#' || hash === '#/') return '/home';
  return hash.startsWith('#') ? hash.slice(1) : hash;
}

/**
 * Render a route by loading its module and calling render().
 * @param {string} path
 */
async function handleRoute(path) {
  if (!_root) return;

  // Handle redirect for empty/root paths
  const effectivePath = (!path || path === '/' || path === '') ? '/home' : path;

  // Find matching route
  let matchedModule = null;
  let params = {};

  for (const route of ROUTES) {
    const match = matchPattern(route.pattern, effectivePath);
    if (match !== null) {
      matchedModule = route.module;
      params = match;
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
        <p style="color:var(--ink-mute)">Page not found: ${effectivePath}</p>
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
    const renderFn = mod.default;
    if (typeof renderFn !== 'function') {
      throw new Error(`Screen module for "${effectivePath}" must export a default function`);
    }
    await renderFn(_root, params);
  } catch (e) {
    console.error('[router] render error:', e);
    _root.innerHTML = `
      <div class="screen" style="align-items:center;justify-content:center;gap:8px;padding:var(--pad);">
        <p style="font-weight:600;color:#d9534f;">Render error</p>
        <p style="font-size:13px;color:var(--ink-mute)">${e.message}</p>
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
