/**
 * components/toast.js — unified toast notifications with undo support.
 *
 * Usage:
 *   import { toast } from './components/toast.js';
 *   toast('Saved');
 *   toast('Deleted', { tone: 'success', action: { label: 'Undo', onClick: undo } });
 *   toast('Network error', { tone: 'error', timeout: 6000 });
 *
 * Tones: 'default' | 'success' | 'error' | 'warning' | 'info'
 */
import { iconEl } from '../icons.js';

const CONTAINER_ID = '__toast_container';
const DEFAULT_TIMEOUT = 4500;

function ensureContainer() {
  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    host.className = 'toast-container';
    document.body.appendChild(host);
  }
  return host;
}

/**
 * Show a toast.
 * @param {string} message
 * @param {object} [opts]
 * @param {'default'|'success'|'error'|'warning'|'info'} [opts.tone]
 * @param {{ label: string, onClick: () => void }} [opts.action]
 * @param {number} [opts.timeout]   ms; 0 or persistent=true → manual close only
 * @param {boolean} [opts.persistent]
 * @param {boolean} [opts.dismissible]  show × button (default: true if action set)
 * @returns {() => void} dismiss function
 */
export function toast(message, opts = {}) {
  const {
    tone = 'default',
    action = null,
    timeout = DEFAULT_TIMEOUT,
    persistent = false,
    dismissible = !!action
  } = opts;

  const host = ensureContainer();
  const el = document.createElement('div');
  el.className = 'toast' + (tone !== 'default' ? ` toast--${tone}` : '');
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');

  const msg = document.createElement('span');
  msg.className = 'toast__msg';
  msg.textContent = message;
  el.appendChild(msg);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.style.animation = 'toast-in .18s reverse both';
    setTimeout(() => el.remove(), 180);
  };

  if (action && typeof action.onClick === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast__action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      try { action.onClick(); } finally { dismiss(); }
    });
    el.appendChild(btn);
  }

  if (dismissible) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast__close';
    close.setAttribute('aria-label', 'Dismiss');
    close.appendChild(iconEl('x', 14));
    close.addEventListener('click', dismiss);
    el.appendChild(close);
  }

  host.appendChild(el);

  if (!persistent && timeout > 0) {
    setTimeout(dismiss, timeout);
  }

  return dismiss;
}
