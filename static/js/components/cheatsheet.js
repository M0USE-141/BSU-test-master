/**
 * components/cheatsheet.js — keyboard shortcuts overlay (audit 3.4).
 *
 * Opens on '?' from anywhere outside inputs. Closes on Escape or click outside.
 *
 *   import { toggleCheatsheet } from './components/cheatsheet.js';
 *   toggleCheatsheet();
 */
import { t } from '../utils/locale.js';
import { iconEl } from '../icons.js';

const OVERLAY_ID = '__cheatsheet_overlay';

const GROUPS = [
  {
    titleKey: 'cheatsheet.group.global',
    items: [
      { keys: ['Ctrl', 'K'], descKey: 'cheatsheet.global.palette' },
      { keys: ['?'],         descKey: 'cheatsheet.global.cheatsheet' },
      { keys: ['Esc'],       descKey: 'cheatsheet.global.close' },
      { keys: ['G', 'H'],    descKey: 'cheatsheet.global.home' },
      { keys: ['G', 'S'],    descKey: 'cheatsheet.global.stats' },
      { keys: ['G', 'N'],    descKey: 'cheatsheet.global.notif' },
      { keys: ['G', 'I'],    descKey: 'cheatsheet.global.import' },
    ],
  },
  {
    titleKey: 'cheatsheet.group.taking',
    items: [
      { keys: ['J'],   altKeys: ['→'], descKey: 'cheatsheet.taking.next' },
      { keys: ['K'],   altKeys: ['←'], descKey: 'cheatsheet.taking.prev' },
      { keys: ['1'],   altKeys: ['9'], joiner: '–', descKey: 'cheatsheet.taking.select' },
      { keys: ['F'],   descKey: 'cheatsheet.taking.flag' },
      { keys: ['Ctrl', 'Enter'], descKey: 'cheatsheet.taking.submit' },
    ],
  },
  {
    titleKey: 'cheatsheet.group.editor',
    items: [
      { keys: ['Ctrl', 'Enter'],     descKey: 'cheatsheet.editor.save' },
      { keys: ['Ctrl', 'Backspace'], descKey: 'cheatsheet.editor.delete' },
      { keys: ['Ctrl', 'Z'],         descKey: 'cheatsheet.editor.undo' },
    ],
  },
];

function isMac() {
  return /Mac/.test(navigator.platform);
}

function kbd(label) {
  const el = document.createElement('kbd');
  el.className = 'kbd';
  // Localize Ctrl → ⌘ on Mac
  el.textContent = label === 'Ctrl' && isMac() ? '⌘' : label;
  return el;
}

function buildRow(item) {
  const row = document.createElement('div');
  row.className = 'cheatsheet__row';

  const keyGroup = document.createElement('div');
  keyGroup.className = 'cheatsheet__keys';

  item.keys.forEach((k, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'cheatsheet__sep';
      sep.textContent = '+';
      keyGroup.appendChild(sep);
    }
    keyGroup.appendChild(kbd(k));
  });

  if (item.altKeys) {
    const sep = document.createElement('span');
    sep.className = 'cheatsheet__sep';
    sep.textContent = item.joiner || '/';
    keyGroup.appendChild(sep);
    item.altKeys.forEach(k => keyGroup.appendChild(kbd(k)));
  }

  const desc = document.createElement('div');
  desc.className = 'cheatsheet__desc';
  desc.textContent = t(item.descKey);

  row.appendChild(keyGroup);
  row.appendChild(desc);
  return row;
}

function buildGroup(group) {
  const wrap = document.createElement('div');
  wrap.className = 'cheatsheet__group';

  const title = document.createElement('div');
  title.className = 'cheatsheet__group-title caps';
  title.textContent = t(group.titleKey);
  wrap.appendChild(title);

  group.items.forEach(item => wrap.appendChild(buildRow(item)));
  return wrap;
}

/**
 * Show or hide the cheatsheet overlay.
 */
export function toggleCheatsheet() {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    closeCheatsheet();
    return;
  }
  openCheatsheet();
}

export function openCheatsheet() {
  if (document.getElementById(OVERLAY_ID)) return;

  const backdrop = document.createElement('div');
  backdrop.id = OVERLAY_ID;
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal cheatsheet';
  modal.style.maxWidth = '720px';

  const header = document.createElement('div');
  header.className = 'modal__header';
  const title = document.createElement('div');
  title.className = 'modal__title';
  title.textContent = t('cheatsheet.title');
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn--icon modal__close';
  closeBtn.setAttribute('aria-label', t('common.close'));
  closeBtn.appendChild(iconEl('x', 16));
  closeBtn.addEventListener('click', closeCheatsheet);
  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'cheatsheet__body';
  GROUPS.forEach(g => body.appendChild(buildGroup(g)));

  modal.appendChild(header);
  modal.appendChild(body);
  backdrop.appendChild(modal);

  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeCheatsheet();
  });

  document.body.appendChild(backdrop);
}

export function closeCheatsheet() {
  const el = document.getElementById(OVERLAY_ID);
  if (!el) return;
  el.style.animation = 'backdrop-in .15s reverse both';
  setTimeout(() => el.remove(), 150);
}

// Inject component-local styles once
(function injectStyles() {
  if (document.getElementById('__cheatsheet_styles')) return;
  const style = document.createElement('style');
  style.id = '__cheatsheet_styles';
  style.textContent = `
    .cheatsheet__body {
      padding: var(--sp-4) var(--sp-5) var(--sp-5);
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--sp-5) var(--sp-6);
    }
    .cheatsheet__group { display: flex; flex-direction: column; gap: var(--sp-2); }
    .cheatsheet__group-title { margin-bottom: var(--sp-1); }
    .cheatsheet__row {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      font-size: var(--fs-sm);
    }
    .cheatsheet__keys {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-width: 100px;
      flex-shrink: 0;
    }
    .cheatsheet__sep {
      font-size: var(--fs-xs);
      color: var(--ink-tertiary);
      padding: 0 2px;
    }
    .cheatsheet__desc { color: var(--ink-secondary); }
    .kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      border: 1.5px solid var(--ink);
      border-radius: 6px;
      background: var(--paper);
      color: var(--ink);
      font-family: 'JetBrains Mono', monospace;
      font-size: var(--fs-xs);
      font-weight: var(--fw-semibold);
      line-height: 1;
      box-shadow: 0 1.5px 0 var(--ink);
    }
  `;
  document.head.appendChild(style);
})();
