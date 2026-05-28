/**
 * components/mail-layout.js — three-pane mail-client layout primitive.
 *
 * The dominant pattern across Home, Stats, Notifications, CR, Profile per
 * the prototype: rail (from AppShell) + sidebar list + detail pane.
 *
 *   import { mountAppShell } from './app-shell.js';
 *   import { buildMailLayout } from './mail-layout.js';
 *   const main = mountAppShell(rootEl);
 *   const { sidebar, detail } = buildMailLayout(main);
 *   // … fill `sidebar` with list rows; fill `detail` with the active item
 */

/**
 * Build and append a mail layout into `parent`. Caller fills the two slots.
 * @param {HTMLElement} parent
 * @param {object} [opts]
 * @param {number} [opts.sidebarWidth=320]
 * @returns {{ root: HTMLElement, sidebar: HTMLElement, detail: HTMLElement }}
 */
export function buildMailLayout(parent, opts = {}) {
  const { sidebarWidth = 320 } = opts;

  const root = document.createElement('div');
  root.className = 'mail-layout';
  root.style.setProperty('--ml-sidebar-w', sidebarWidth + 'px');

  const sidebar = document.createElement('aside');
  sidebar.className = 'mail-layout__sidebar';

  const detail = document.createElement('section');
  detail.className = 'mail-layout__detail';

  root.appendChild(sidebar);
  root.appendChild(detail);
  parent.appendChild(root);

  return { root, sidebar, detail };
}

/**
 * Convenience: build a single list row used inside the sidebar.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.sub]
 * @param {boolean} [opts.active]
 * @param {boolean} [opts.unread]
 * @param {string} [opts.right]    optional right-side meta (time / count)
 * @param {() => void} [opts.onClick]
 * @returns {HTMLElement}
 */
export function buildListRow({ title, sub, active, unread, right, onClick }) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'mail-row' + (active ? ' is-active' : '') + (unread ? ' is-unread' : '');

  const main = document.createElement('div');
  main.className = 'mail-row__main';
  const titleEl = document.createElement('div');
  titleEl.className = 'mail-row__title';
  titleEl.textContent = title;
  main.appendChild(titleEl);
  if (sub) {
    const subEl = document.createElement('div');
    subEl.className = 'mail-row__sub';
    subEl.textContent = sub;
    main.appendChild(subEl);
  }
  row.appendChild(main);

  if (right) {
    const rEl = document.createElement('div');
    rEl.className = 'mail-row__right mono';
    rEl.textContent = right;
    row.appendChild(rEl);
  }

  if (onClick) row.addEventListener('click', onClick);
  return row;
}

// ─── Inject styles once ──────────────────────────────────────────
(function injectStyles() {
  if (document.getElementById('__mail_layout_styles')) return;
  const style = document.createElement('style');
  style.id = '__mail_layout_styles';
  style.textContent = `
    .mail-layout {
      display: grid;
      grid-template-columns: var(--ml-sidebar-w, 320px) 1fr;
      height: 100%;
      min-height: 0;
      flex: 1;
      background: var(--paper);
      overflow: hidden;
    }
    .mail-layout__sidebar {
      border-right: var(--border);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .mail-layout__detail {
      overflow-y: auto;
      min-height: 0;
      min-width: 0;
    }

    /* Sidebar header / filter chips area */
    .mail-layout__sidebar-head {
      padding: var(--sp-3) var(--sp-4);
      border-bottom: 1px solid var(--ink-soft);
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      flex-shrink: 0;
    }
    .mail-layout__sidebar-title {
      font-size: var(--fs-md);
      font-weight: var(--fw-semibold);
    }
    .mail-layout__sidebar-list { padding: var(--sp-2) 0; }
    .mail-layout__sidebar-section {
      padding: var(--sp-3) var(--sp-4) var(--sp-1);
      font-size: var(--fs-xs);
      font-weight: var(--fw-semibold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-tertiary);
    }

    /* List rows */
    .mail-row {
      display: flex;
      gap: var(--sp-3);
      align-items: flex-start;
      width: 100%;
      padding: 10px var(--sp-4);
      background: none;
      border: none;
      border-left: 3px solid transparent;
      color: inherit;
      cursor: pointer;
      text-align: left;
      transition: background var(--transition-fast);
    }
    .mail-row:hover { background: var(--ink-soft); }
    .mail-row.is-active {
      background: var(--accent-soft);
      border-left-color: var(--accent);
    }
    .mail-row.is-unread .mail-row__title {
      font-weight: var(--fw-semibold);
    }
    .mail-row__main { flex: 1; min-width: 0; }
    .mail-row__title {
      font-size: var(--fs-sm);
      font-weight: var(--fw-medium);
      color: var(--ink);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mail-row__sub {
      font-size: var(--fs-xs);
      color: var(--ink-tertiary);
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mail-row__right {
      font-size: var(--fs-xs);
      color: var(--ink-tertiary);
      flex-shrink: 0;
      align-self: center;
    }

    /* Detail pane container conventions */
    .mail-detail__head {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      padding: var(--sp-4) var(--sp-5);
      border-bottom: 1px solid var(--ink-soft);
    }
    .mail-detail__title {
      font-size: var(--fs-lg);
      font-weight: var(--fw-bold);
      letter-spacing: -0.01em;
    }
    .mail-detail__body {
      padding: var(--sp-5);
      max-width: var(--w-grid, 1080px);
    }
    .mail-detail__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sp-2);
      padding: var(--sp-7);
      color: var(--ink-tertiary);
      text-align: center;
      height: 100%;
    }

    /* Collapse to single pane on narrow widths */
    @media (max-width: 880px) {
      .mail-layout {
        grid-template-columns: 1fr;
      }
      .mail-layout__sidebar {
        border-right: none;
        border-bottom: 1px solid var(--ink-soft);
        max-height: 40dvh;
      }
    }
  `;
  document.head.appendChild(style);
})();
