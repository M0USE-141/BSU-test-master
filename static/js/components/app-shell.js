/**
 * components/app-shell.js — top-bar + rail wrapper.
 *
 * The router invokes this for shell-able routes and passes the inner
 * <main> slot to the screen as its render root. Auth, taking, and error
 * screens bypass the shell.
 *
 *   import { mountAppShell } from './components/app-shell.js';
 *   const main = mountAppShell(rootEl);
 *   // … screen renders into `main`
 *
 * The shell is idempotent: subsequent calls with the same root reuse
 * the existing chrome and just clear the main slot.
 */
import { iconEl } from '../icons.js';
import { t } from '../utils/locale.js';
import { navigate, getCurrentRoute } from '../router.js';
import { openSearchPalette } from '../search-palette.js';
import { listNotifications } from '../api/notifications.js';
import { getState } from '../state.js';

const SHELL_ATTR = 'data-app-shell';
const RAIL_KEYS = ['tests', 'stats', 'cr', 'notif', 'activity', 'import', 'profile'];

const RAIL_CONFIG = [
  { key: 'tests',    icon: 'home',    labelKey: 'app.rail.tests',    path: '/home',            match: p => p === '/home' || p === '/tests' || p.startsWith('/collection/') || p.startsWith('/test/') && !p.endsWith('/take') },
  { key: 'stats',    icon: 'chart',   labelKey: 'app.rail.stats',    path: '/stats',           match: p => p === '/stats' },
  { key: 'cr',       icon: 'edit',    labelKey: 'app.rail.cr',       path: '/change-requests', match: p => p.startsWith('/change-requests') },
  { key: 'notif',    icon: 'bell',    labelKey: 'app.rail.notif',    path: '/notifications',   match: p => p === '/notifications' },
  { key: 'activity', icon: 'clock',   labelKey: 'app.rail.activity', path: '/activity',        match: p => p === '/activity' },
  { key: 'import',   icon: 'upload',  labelKey: 'app.rail.import',   path: '/import',          match: p => p === '/import' },
  { key: 'profile',  icon: 'user',    labelKey: 'app.rail.profile',  path: '/profile',         match: p => p === '/profile' || p === '/settings' },
];

let _unreadCount = 0;
let _pendingCRCount = 0;
let _badgeRefreshTimer = null;

/**
 * Build the chrome (topbar + rail) once and return the inner main slot.
 * Idempotent — preserves shell across navigations.
 * @param {HTMLElement} root — typically #app
 * @returns {HTMLElement} the <main> element the screen should render into
 */
export function mountAppShell(root) {
  let shell = root.querySelector(`[${SHELL_ATTR}]`);
  let main;
  if (shell) {
    main = shell.querySelector('.app-shell__main');
    main.innerHTML = '';
    refreshActive(shell);
    refreshBadges();
    return main;
  }

  // Build from scratch
  shell = document.createElement('div');
  shell.setAttribute(SHELL_ATTR, '');
  shell.className = 'app-shell';

  shell.appendChild(buildTopbar());
  const body = document.createElement('div');
  body.className = 'app-shell__body';

  body.appendChild(buildRail());

  main = document.createElement('main');
  main.className = 'app-shell__main';
  body.appendChild(main);

  shell.appendChild(body);

  root.innerHTML = '';
  root.appendChild(shell);

  refreshActive(shell);
  startBadgeRefresh();

  return main;
}

/**
 * Tear down the shell (used when routing to a non-shelled screen like
 * auth/login, auth/register, or test/{id}/take).
 */
export function unmountAppShell(root) {
  const shell = root.querySelector(`[${SHELL_ATTR}]`);
  if (shell) shell.remove();
  stopBadgeRefresh();
}

/**
 * Force a re-read of badge counts (call after marking notifications read, etc).
 */
export async function refreshBadges() {
  try {
    const list = await listNotifications({ unread: true, limit: 1 });
    // Backend may return {items, total} or array
    _unreadCount = Array.isArray(list) ? list.length : (list.total ?? list.unread_count ?? 0);
  } catch { /* swallow — keep stale count */ }
  // TODO(phase 3): pendingCR count once that endpoint exists
  applyBadge('notif', _unreadCount);
  applyBadge('cr', _pendingCRCount);
}

function startBadgeRefresh() {
  refreshBadges();
  stopBadgeRefresh();
  _badgeRefreshTimer = setInterval(refreshBadges, 60_000);
}
function stopBadgeRefresh() {
  if (_badgeRefreshTimer) { clearInterval(_badgeRefreshTimer); _badgeRefreshTimer = null; }
}

function applyBadge(key, count) {
  const el = document.querySelector(`.app-rail__item[data-key="${key}"] .app-rail__badge`);
  if (!el) return;
  if (count > 0) {
    el.textContent = count > 99 ? '99+' : String(count);
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

function refreshActive(shell) {
  const path = getCurrentRoute().path;
  shell.querySelectorAll('.app-rail__item').forEach(item => {
    const key = item.dataset.key;
    const cfg = RAIL_CONFIG.find(c => c.key === key);
    item.classList.toggle('is-active', !!cfg && cfg.match(path));
  });
}

function buildTopbar() {
  const bar = document.createElement('header');
  bar.className = 'app-bar';

  const brand = document.createElement('button');
  brand.type = 'button';
  brand.className = 'app-bar__brand';
  brand.textContent = 'TestMaster';
  brand.addEventListener('click', () => navigate('/home'));
  bar.appendChild(brand);

  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'app-bar__search';
  const searchIcon = document.createElement('span');
  searchIcon.style.lineHeight = '0';
  searchIcon.style.color = 'var(--ink-tertiary)';
  searchIcon.appendChild(iconEl('search', 13));
  const searchText = document.createElement('span');
  searchText.textContent = t('app.search_placeholder');
  searchText.style.flex = '1';
  searchText.style.overflow = 'hidden';
  searchText.style.textOverflow = 'ellipsis';
  searchText.style.whiteSpace = 'nowrap';
  const searchKbd = document.createElement('span');
  searchKbd.className = 'app-bar__kbd mono';
  searchKbd.textContent = /Mac/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
  searchBtn.appendChild(searchIcon);
  searchBtn.appendChild(searchText);
  searchBtn.appendChild(searchKbd);
  searchBtn.addEventListener('click', () => openSearchPalette());
  bar.appendChild(searchBtn);

  const actions = document.createElement('div');
  actions.className = 'app-bar__actions';

  const bellBtn = topbarIconBtn('bell', () => navigate('/notifications'));
  bellBtn.dataset.role = 'notif';
  bar.appendChild(actions);
  actions.appendChild(bellBtn);

  actions.appendChild(topbarIconBtn('cog', () => navigate('/settings')));

  const avatarBtn = document.createElement('button');
  avatarBtn.type = 'button';
  avatarBtn.className = 'btn--icon';
  avatarBtn.setAttribute('aria-label', t('app.rail.profile'));
  const av = document.createElement('span');
  av.className = 'avatar avatar--sm';
  const user = getState().user;
  av.textContent = userInitials(user);
  avatarBtn.appendChild(av);
  avatarBtn.addEventListener('click', () => navigate('/profile'));
  actions.appendChild(avatarBtn);

  return bar;
}

function topbarIconBtn(iconKind, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn--icon app-bar__btn';
  btn.style.position = 'relative';
  btn.appendChild(iconEl(iconKind, 16));
  const badge = document.createElement('span');
  badge.className = 'badge badge--float app-bar__badge';
  badge.style.display = 'none';
  btn.appendChild(badge);
  btn.addEventListener('click', onClick);
  return btn;
}

function buildRail() {
  const rail = document.createElement('nav');
  rail.className = 'app-rail';
  rail.setAttribute('aria-label', 'Primary');

  RAIL_CONFIG.forEach(cfg => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'app-rail__item';
    item.dataset.key = cfg.key;

    const iconWrap = document.createElement('span');
    iconWrap.className = 'app-rail__icon';
    iconWrap.appendChild(iconEl(cfg.icon, 18));

    const label = document.createElement('span');
    label.className = 'app-rail__label';
    label.textContent = t(cfg.labelKey);

    const badge = document.createElement('span');
    badge.className = 'badge app-rail__badge';
    badge.style.display = 'none';

    item.appendChild(iconWrap);
    item.appendChild(label);
    item.appendChild(badge);
    item.addEventListener('click', () => navigate(cfg.path));
    rail.appendChild(item);
  });

  return rail;
}

function userInitials(user) {
  if (!user) return '?';
  const src = user.display_name || user.username || user.email || '';
  const parts = src.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ─── Inject component styles once ─────────────────────────────
(function injectStyles() {
  if (document.getElementById('__app_shell_styles')) return;
  const style = document.createElement('style');
  style.id = '__app_shell_styles';
  style.textContent = `
    .app-shell {
      display: flex;
      flex-direction: column;
      height: 100dvh;
      overflow: hidden;
      background: var(--paper);
    }
    .app-shell__body {
      flex: 1;
      display: flex;
      overflow: hidden;
      min-height: 0;
    }
    .app-shell__main {
      flex: 1;
      overflow: auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .app-rail {
      width: 76px;
      flex-shrink: 0;
      border-right: var(--border);
      padding: var(--sp-2) 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      background: var(--paper);
      overflow-y: auto;
    }
    .app-rail__item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 9px 4px;
      background: none;
      border: none;
      color: var(--ink-secondary);
      cursor: pointer;
      border-radius: var(--radius-sm);
      margin: 1px var(--sp-2);
      position: relative;
      transition: background var(--transition-fast), color var(--transition-fast);
    }
    .app-rail__item:hover { background: var(--ink-soft); color: var(--ink); }
    .app-rail__item.is-active {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .app-rail__icon { line-height: 0; }
    .app-rail__label {
      font-size: 10px;
      font-weight: var(--fw-medium);
      letter-spacing: 0.01em;
    }
    .app-rail__badge {
      position: absolute;
      top: 4px;
      right: 12px;
      border: 1.5px solid var(--paper);
    }
    [data-app-shell] .app-bar__btn { width: 36px; height: 36px; }
    [data-app-shell] .app-bar__badge {
      position: absolute;
      top: 2px;
      right: 2px;
    }

    /* Compact rail (settings.compactRail = true) */
    [data-rail="compact"] .app-rail { width: 44px; }
    [data-rail="compact"] .app-rail__label { display: none; }
    [data-rail="compact"] .app-rail__item { padding: 10px 4px; }

    /* Mobile — hide rail; mobile screens use _shell.js bottom nav */
    @media (max-width: 720px) {
      .app-rail { display: none; }
    }
  `;
  document.head.appendChild(style);
})();
