/**
 * mobile/_shell.js — shared bottom nav + topbar helpers
 */
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';

/** Returns the active nav tab id based on current hash. */
export function activeNav() {
  const h = location.hash;
  if (h.startsWith('#/stats'))                                     return 'stats';
  if (h.startsWith('#/profile') || h.startsWith('#/settings'))     return 'me';
  if (h.startsWith('#/test') || h.startsWith('#/collection') || h.startsWith('#/tests')) return 'tests';
  return 'home';
}

/**
 * Build bottom nav element.
 * @param {string} [active] — overrides auto-detect
 */
export function buildBottomNav(active) {
  const cur = active || activeNav();
  const items = [
    { id: 'home',  label: t('nav.home')  || 'Home',  icon: 'home',  href: '#/home' },
    { id: 'tests', label: t('nav.tests') || 'Tests', icon: 'doc',   href: '#/tests' },
    { id: 'stats', label: t('nav.stats') || 'Stats', icon: 'chart', href: '#/stats' },
    { id: 'me',    label: t('nav.profile') || 'Me',  icon: 'user',  href: '#/profile' },
  ];

  const nav = document.createElement('nav');
  nav.className = 'mob-nav';

  for (const item of items) {
    const a = document.createElement('a');
    a.href = item.href;
    a.className = 'mob-nav__item' + (cur === item.id ? ' mob-nav__item--active' : '');
    a.appendChild(iconEl(item.icon, 20));
    const lbl = document.createElement('span');
    lbl.className = 'mob-nav__label';
    lbl.textContent = item.label;
    a.appendChild(lbl);
    nav.appendChild(a);
  }

  return nav;
}

/**
 * Build a standard mobile topbar.
 * @param {{ title: string, back?: boolean, backHref?: string, actions?: HTMLElement[] }} opts
 */
export function buildTopBar({ title, back = false, backHref = '#/home', actions = [] }) {
  const bar = document.createElement('div');
  bar.className = 'mob-topbar';

  if (back) {
    const backBtn = document.createElement('button');
    backBtn.className = 'mob-topbar__back';
    backBtn.setAttribute('aria-label', t('common.back') || 'Back');
    backBtn.appendChild(iconEl('chevL', 16));
    backBtn.addEventListener('click', () => { location.hash = backHref; });
    bar.appendChild(backBtn);
  }

  const titleEl = document.createElement('span');
  titleEl.className = 'mob-topbar__title';
  titleEl.textContent = title;
  bar.appendChild(titleEl);

  for (const action of actions) {
    bar.appendChild(action);
  }
  return bar;
}

/** Escape HTML to prevent XSS. Delegates to shared utils/escape.js. */
export { escHtml as esc } from '../../utils/escape.js';

/** Format ISO date to short string. */
export function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return '—'; }
}

/** Get persistent client id. */
export function getClientId() {
  let id = localStorage.getItem('client_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('client_id', id); }
  return id;
}
