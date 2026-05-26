/**
 * screens/desktop/notifications.js — Notifications screen (Phase 6)
 * Empty state — backend notifications endpoint planned for Phase 8.
 */
import { t } from '../../utils/locale.js';
import { icon, iconEl } from '../../icons.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TABS = ['all', 'change_requests', 'results'];

let _tab = 'all';

export default async function render(root) {
  _mount(root);
}

function _mount(root) {
  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;';

  // ── Header ──────────────────────────────────────────────────
  const header = document.createElement('div');
  header.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;
    padding:12px var(--pad);border-bottom:var(--border);flex-shrink:0;`;
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <a href="#/home" class="btn btn--ghost btn--small" style="display:inline-flex;align-items:center;gap:5px;">
        ${icon('chevL', 14)} ${t('common.back') || 'Back'}
      </a>
      <span style="font:700 20px/1 Inter,sans-serif;color:var(--ink);">${t('nav.notifications') || 'Notifications'}</span>
    </div>
    <button class="btn btn--ghost btn--small" id="notif-mark-all">
      ${t('common.all') || 'Mark all read'}
    </button>`;

  // ── Tabs ─────────────────────────────────────────────────────
  const tabBar = document.createElement('div');
  tabBar.style.cssText = `
    display:flex;gap:0;padding:0 var(--pad);border-bottom:var(--border);flex-shrink:0;
    overflow-x:auto;`;
  const TAB_LABELS = {
    all:             t('common.all')            || 'All',
    change_requests: t('test.change_requests')  || 'Change requests',
    results:         t('stats.overall')         || 'Results',
  };
  TABS.forEach(tabId => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'notif-tab' + (_tab === tabId ? ' notif-tab--active' : '');
    btn.style.marginRight = '16px';
    btn.textContent = TAB_LABELS[tabId] || tabId;
    btn.addEventListener('click', () => { _tab = tabId; _mount(root); });
    tabBar.appendChild(btn);
  });

  // ── Content ───────────────────────────────────────────────────
  const content = document.createElement('div');
  content.style.cssText = 'flex:1;overflow-y:auto;display:flex;align-items:center;justify-content:center;';

  // Backend not yet implemented — always show empty state
  content.innerHTML = `
    <div style="text-align:center;padding:48px 24px;color:var(--ink-mute);">
      <div style="margin-bottom:16px;opacity:.3;">${icon('bell', 48)}</div>
      <div style="font:600 16px/1 Inter,sans-serif;color:var(--ink);margin-bottom:8px;">
        ${esc(t('common.empty') || 'Nothing here')}
      </div>
      <div style="font:400 13px/1.5 Inter,sans-serif;max-width:300px;">
        Notifications will appear here when you receive them.
        <br><span style="color:var(--ink-soft);">(Backend: Phase 8)</span>
      </div>
    </div>`;

  screen.append(header, tabBar, content);

  root.innerHTML = '';
  root.appendChild(screen);
}
