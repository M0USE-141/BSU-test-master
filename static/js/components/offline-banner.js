/**
 * components/offline-banner.js — sticky banner that surfaces network loss.
 *
 * Usage (called once from main.js after initRouter):
 *   import { installOfflineBanner } from './components/offline-banner.js';
 *   installOfflineBanner();
 *
 * Behaviour:
 *   - Listens to `window.online` / `window.offline`.
 *   - When offline, inserts a single sticky banner ABOVE the AppShell
 *     so the user sees it without scrolling. When back online, slides
 *     the banner away after a brief "Снова в сети" confirmation.
 *   - State is idempotent — calling install twice is safe; only one
 *     banner ever lives in the DOM.
 *
 * Persistence note: taking.js already records the active attempt to
 * sessionStorage (att:<id>:client / :testId / :result), so an offline
 * burst doesn't lose progress as long as the user stays on the tab.
 * This banner is purely the user-facing surface for that fact.
 */
import { iconEl } from '../icons.js';
import { t } from '../utils/locale.js';

const BANNER_ID = '__offline_banner';
const STYLE_ID  = '__offline_banner_styles';

let _installed = false;
let _onlineFlashTimer = null;

export function installOfflineBanner() {
  if (_installed) return;
  _installed = true;
  injectStyles();

  // Apply current state on install — covers the case where the page
  // loaded while the user was already offline.
  if (!navigator.onLine) showOfflineBanner();

  window.addEventListener('offline', showOfflineBanner);
  window.addEventListener('online',  showOnlineFlash);
}

function showOfflineBanner() {
  if (_onlineFlashTimer) { clearTimeout(_onlineFlashTimer); _onlineFlashTimer = null; }
  let el = document.getElementById(BANNER_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = BANNER_ID;
    el.className = 'offline-banner';
    // Body insertion order: above #app, so the banner sits at the top
    // and pushes the rest down. Layout shifts are intentional — users
    // need to know.
    document.body.insertBefore(el, document.body.firstChild);
  }
  el.classList.remove('offline-banner--online');
  el.innerHTML = '';
  const ic = document.createElement('span');
  ic.style.lineHeight = '0';
  ic.appendChild(iconEl('bell', 14));
  el.appendChild(ic);
  const text = document.createElement('span');
  text.textContent = t('offline.message')
    || 'Оффлайн. Изменения сохраняются локально и синхронизируются при подключении.';
  el.appendChild(text);
}

function showOnlineFlash() {
  const el = document.getElementById(BANNER_ID);
  if (!el) return; // nothing to clear — never went offline this session
  el.classList.add('offline-banner--online');
  el.innerHTML = '';
  const ic = document.createElement('span');
  ic.style.lineHeight = '0';
  ic.appendChild(iconEl('check', 14));
  el.appendChild(ic);
  const text = document.createElement('span');
  text.textContent = t('offline.back_online') || 'Снова в сети';
  el.appendChild(text);
  // Auto-dismiss after 2s.
  _onlineFlashTimer = setTimeout(function () {
    el.remove();
    _onlineFlashTimer = null;
  }, 2000);
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .offline-banner {
      position: sticky;
      top: 0;
      z-index: 90;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--sp-2);
      padding: 8px 14px;
      font-size: var(--fs-sm);
      font-weight: var(--fw-medium);
      background: var(--warning);
      color: var(--ink);
      border-bottom: 1px solid var(--ink-soft);
      animation: offline-slide-in 180ms ease both;
    }
    .offline-banner--online {
      background: var(--success);
      color: #fff;
    }
    @keyframes offline-slide-in {
      from { transform: translateY(-100%); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}
