/**
 * components/mobile-atoms.js — building blocks for the mobile screens.
 *
 * Port of the prototype's mobile-shell.jsx atoms (PhoneFrame +
 * StatusBar dropped — real phones supply chrome). React + inline JSX
 * styles → vanilla `document.createElement` factories that return
 * `HTMLElement`. Same visual language: paper/ink palette, 1.5px
 * borders, JetBrains Mono for numeric, accent-green default.
 *
 * Each factory takes an options object so callers can compose without
 * threading dozens of positional arguments. All elements are returned
 * unmounted; the screen module appends them to its own root.
 *
 * Reuses existing app primitives where possible:
 *   - `iconEl(name, size)` from `../icons.js`
 *   - `navigate(path)` from `../router.js`
 *   - `confirm(...)` from `./confirm-dialog.js` (avoid duplicating
 *     dialog logic — MConfirmDialog from the proto is wrapped instead)
 *   - `toast(...)` from `./toast.js`
 */
import { iconEl } from '../icons.js';
import { navigate } from '../router.js';
import { escHtml as esc } from '../utils/escape.js';

// ── helpers ─────────────────────────────────────────────────────────────

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'class' || k === 'className') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else node.setAttribute(k, v);
    // NOTE: deliberately no `innerHTML` shortcut. Everything that
    // produces user-visible markup must go through `textContent` or
    // dedicated element factories to avoid XSS.
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
  return node;
}

// ── Caps text helper ────────────────────────────────────────────────────

export function caps(text, style = {}) {
  return el('div', {
    style: {
      fontSize: '10px',
      fontWeight: '600',
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--ink-mute)',
      ...style,
    },
  }, text);
}

// ── Mobile topbar ───────────────────────────────────────────────────────
//
//   topBar({ title, back, backHref, right, search })
//
// Single-line bar: page title + optional right-slot action.
//
// `back`:
//   - `'auto'` (default) → chevron auto-shown when the current route is
//     NOT covered by the bottom nav. Pages reachable from the tab bar
//     (home/stats/import/notifications/profile) hide the back button.
//   - `true` → always shown.
//   - `false` → never shown.
//   - `function` → custom click handler; chevron rendered.
//
// `large`/`subtitle` from the old API are accepted but ignored — the
// topbar is intentionally minimal now (just title + optional right).

const BOTTOM_NAV_ROUTES = new Set(['home', 'stats', 'import', 'notif', 'me']);

export function topBar({
  title = '',
  back = 'auto',
  backHref = '#/home',
  right = null,
  search = null,
  /* large, subtitle — accepted but ignored for back-compat */
} = {}) {
  const bar = el('div', {
    class: 'mob-topbar',
    style: {
      padding: '8px 12px',
      borderBottom: '1px solid var(--ink-soft)',
      background: 'var(--paper)',
      flexShrink: '0',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      minHeight: '44px',
    },
  });

  const showBack = back === true
    || typeof back === 'function'
    || (back === 'auto' && !BOTTOM_NAV_ROUTES.has(detectActiveNav()));
  if (showBack) {
    const handler = typeof back === 'function'
      ? back
      : () => {
          // If we have history, go back. Otherwise fall back to home so
          // we don't dead-end the user.
          if (window.history.length > 1) window.history.back();
          else navigate(backHref.replace(/^#/, ''));
        };
    bar.appendChild(el('button', {
      type: 'button',
      'aria-label': 'Back',
      onclick: handler,
      style: {
        width: '32px', height: '32px', borderRadius: '999px',
        border: '1.5px solid var(--ink)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--ink)', background: 'var(--paper)', cursor: 'pointer',
        flexShrink: '0',
      },
    }, iconEl('chevL', 14)));
  }

  if (search) {
    bar.appendChild(el('div', {
      style: {
        flex: '1', display: 'flex', alignItems: 'center', gap: '6px',
        padding: '7px 10px', border: '1.5px solid var(--ink)',
        borderRadius: 'var(--radius-sm)', fontSize: '13px',
        color: 'var(--ink-mute)',
      },
    }, iconEl('search', 12), search));
  } else {
    bar.appendChild(el('div', {
      style: {
        flex: '1', fontSize: '15px', fontWeight: '600',
        letterSpacing: '-.01em', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      },
    }, title));
  }

  if (right) {
    bar.appendChild(right instanceof Node ? right : el('div', {}, String(right)));
  }
  return bar;
}

// ── Bottom navigation ───────────────────────────────────────────────────
//
// Five-slot tab bar — Tests / Stats / Import / Notifications / Profile.
// `active` overrides auto-detect from the URL hash. `badges` is a map
// of `{notif: number}` etc. for the dot indicator.

const NAV_ITEMS = [
  { id: 'home',   labelKey: 'nav.home',     labelDefault: 'Тесты',   icon: 'home',   href: '#/home' },
  { id: 'stats',  labelKey: 'nav.stats',    labelDefault: 'Стат.',   icon: 'chart',  href: '#/stats' },
  { id: 'import', labelKey: 'nav.import',   labelDefault: 'Импорт',  icon: 'upload', href: '#/import' },
  { id: 'notif',  labelKey: 'nav.notif',    labelDefault: 'Уведом.', icon: 'bell',   href: '#/notifications' },
  { id: 'me',     labelKey: 'nav.profile',  labelDefault: 'Профиль', icon: 'user',   href: '#/profile' },
];

function detectActiveNav() {
  const h = location.hash;
  if (h.startsWith('#/stats'))                                          return 'stats';
  if (h.startsWith('#/import'))                                          return 'import';
  if (h.startsWith('#/notifications') || h.startsWith('#/change'))       return 'notif';
  if (h.startsWith('#/profile') || h.startsWith('#/settings'))           return 'me';
  // /home, /test/:id, /tests, /collection/:id, /
  return 'home';
}

export function bottomNav({ active, badges = {}, t } = {}) {
  const cur = active || detectActiveNav();
  const xlate = (key, fallback) => (typeof t === 'function' ? (t(key) || fallback) : fallback);

  const nav = el('div', {
    style: {
      borderTop: '1.5px solid var(--ink)',
      background: 'var(--paper)',
      flexShrink: '0',
      padding: '4px 0 calc(4px + env(safe-area-inset-bottom, 0px))',
      display: 'flex',
    },
  });

  for (const item of NAV_ITEMS) {
    const isActive = cur === item.id;
    const btn = el('button', {
      type: 'button',
      onclick: () => navigate(item.href.replace(/^#/, '')),
      style: {
        flex: '1', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '3px',
        color: isActive ? 'var(--accent)' : 'var(--ink-mute)',
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '6px 0', position: 'relative',
      },
    });
    btn.appendChild(iconEl(item.icon, 20));
    btn.appendChild(el('span', {
      style: {
        fontSize: '9.5px',
        fontWeight: isActive ? '700' : '500',
        letterSpacing: '.02em',
      },
    }, xlate(item.labelKey, item.labelDefault)));

    const badge = badges[item.id] || 0;
    if (badge > 0) {
      btn.appendChild(el('span', {
        style: {
          position: 'absolute', top: '4px', right: 'calc(50% - 17px)',
          minWidth: '14px', height: '14px', padding: '0 4px',
          borderRadius: '999px',
          background: 'var(--accent)', color: '#fff',
          fontSize: '9px', fontWeight: '700',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid var(--paper)',
        },
      }, badge > 9 ? '9+' : String(badge)));
    }
    nav.appendChild(btn);
  }
  return nav;
}

// ── MShell: topbar + scrolling body + optional sticky + optional nav ────

export function mShell(opts = {}) {
  const {
    root, // host element to clear and append into
    topbar = null,
    body = null,
    sticky = null,
    hideNav = false,
    navActive = null,
    badges = {},
    t,
  } = opts;

  // Layout container — fixed-height viewport so the inner `scroll` div
  // (flex:1 + overflow:auto) actually scrolls instead of growing past
  // the viewport. Was `minHeight: 100dvh` — that let layout grow with
  // content, making the inner scroller unconstrained.
  const layout = el('div', {
    style: {
      height: '100dvh',
      maxHeight: '100dvh',
      display: 'flex', flexDirection: 'column',
      background: 'var(--paper)',
      overflow: 'hidden',
    },
  });

  if (topbar) layout.appendChild(topbar);

  const scroll = el('div', {
    style: {
      flex: '1', overflow: 'auto', minHeight: '0',
      background: 'var(--paper)', position: 'relative',
    },
  });
  if (body) scroll.appendChild(body);
  layout.appendChild(scroll);

  if (sticky) layout.appendChild(sticky);
  if (!hideNav) layout.appendChild(bottomNav({ active: navActive, badges, t }));

  if (root) {
    root.replaceChildren(layout);
  }
  return { root: layout, scroll, body };
}

// ── List section ───────────────────────────────────────────────────────
//
//   mList({ title, sub, action }, ...rows)
//
// Wraps a labelled stack of rows. `action` is an HTMLElement rendered
// on the right of the section header.

export function mList({ title, sub, action } = {}, ...rows) {
  const wrap = el('div', { style: { padding: '12px 16px' } });
  if (title) {
    const head = el('div', {
      style: {
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: '8px',
      },
    });
    const left = el('div');
    left.appendChild(caps(title));
    if (sub) left.appendChild(el('div', {
      style: { fontSize: '11px', color: 'var(--ink-mute)', marginTop: '2px' },
    }, sub));
    head.appendChild(left);
    if (action) head.appendChild(action);
    wrap.appendChild(head);
  }
  for (const r of rows.flat()) if (r) wrap.appendChild(r);
  return wrap;
}

// ── Row ─────────────────────────────────────────────────────────────────

export function mRow({ title, sub, right, onClick, danger, icon } = {}) {
  const row = el('div', {
    onclick: onClick,
    style: {
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '13px 0',
      borderBottom: '1px solid var(--ink-soft)',
      cursor: onClick ? 'pointer' : 'default',
    },
  });
  if (icon) {
    row.appendChild(el('span', {
      style: {
        color: danger ? 'var(--error)' : 'var(--ink-fade)',
        display: 'flex',
      },
    }, icon));
  }
  const mid = el('div', { style: { flex: '1', minWidth: '0' } });
  mid.appendChild(el('div', {
    style: {
      fontSize: '14px', fontWeight: '500',
      color: danger ? 'var(--error)' : 'var(--ink)',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
  }, title));
  if (sub) mid.appendChild(el('div', {
    style: {
      fontSize: '11px', color: 'var(--ink-mute)', marginTop: '2px',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
  }, sub));
  row.appendChild(mid);

  if (right) {
    row.appendChild(right instanceof Node ? right : el('span', {}, String(right)));
  } else if (onClick) {
    row.appendChild(el('span', {
      style: { color: 'var(--ink-mute)', display: 'flex' },
    }, iconEl('chevR', 14)));
  }
  return row;
}

// ── Card ───────────────────────────────────────────────────────────────

export function mCard({ title, action, danger, style = {} } = {}, ...children) {
  const card = el('div', {
    style: {
      border: '1.5px solid',
      borderColor: danger ? 'var(--error)' : 'var(--ink)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--paper)',
      boxShadow: 'var(--shadow-sm)',
      marginBottom: '10px',
      ...style,
    },
  });
  if (title) {
    const head = el('div', {
      style: {
        padding: '10px 14px 8px',
        borderBottom: '1px solid var(--ink-soft)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      },
    });
    head.appendChild(el('div', {
      style: { fontSize: '12px', fontWeight: '600' },
    }, title));
    if (action) head.appendChild(action);
    card.appendChild(head);
  }
  const body = el('div', { style: { padding: '12px 14px' } });
  for (const c of children.flat()) if (c) body.appendChild(c);
  card.appendChild(body);
  return card;
}

// ── Segmented control ──────────────────────────────────────────────────
//
//   mSeg({ items, value, onChange, sm })
//
// `items` is a list of strings or `{ key, label }` objects. Calls
// `onChange(key)` when the user taps a segment.

export function mSeg({ items = [], value, onChange, sm = false } = {}) {
  const wrap = el('div', {
    style: {
      display: 'flex', background: 'var(--ink-soft)',
      borderRadius: '999px', padding: '3px',
      fontSize: sm ? '11px' : '12px',
    },
  });
  // Track active key locally so taps restyle without a parent re-render.
  // Without this, the initial isActive was frozen and the "selected" pill
  // never moved visually when the user picked a different segment.
  let activeKey = value;
  const buttons = [];

  function applyStyles() {
    for (const { key, btn } of buttons) {
      const isActive = activeKey === key;
      Object.assign(btn.style, {
        background: isActive ? 'var(--paper)' : 'transparent',
        color: isActive ? 'var(--ink)' : 'var(--ink-fade)',
        font: `${isActive ? '600' : '500'} ${sm ? 11 : 12}px Inter, sans-serif`,
        boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
      });
    }
  }

  for (const raw of items) {
    const key = typeof raw === 'string' ? raw : raw.key;
    const label = typeof raw === 'string' ? raw : raw.label;
    const btn = el('button', {
      type: 'button',
      onclick: () => {
        if (activeKey === key) return;
        activeKey = key;
        applyStyles();
        onChange && onChange(key);
      },
      style: {
        flex: '1', padding: sm ? '5px 6px' : '7px 8px',
        border: 'none',
        borderRadius: '999px',
        cursor: 'pointer', whiteSpace: 'nowrap',
      },
    }, label);
    buttons.push({ key, btn });
    wrap.appendChild(btn);
  }
  applyStyles();
  // Imperative setter so callers (e.g. exam-mode auto-lock) can sync.
  wrap.__setValue = (v) => { activeKey = v; applyStyles(); };
  return wrap;
}

// ── Field (input/textarea) ─────────────────────────────────────────────
//
// Returns the wrapper element; expose the underlying `<input>` /
// `<textarea>` via `.input` for read-back.

export function mField({
  label, value = '', placeholder = '', type = 'text',
  hint, error, multiline = false, onInput, autocomplete,
} = {}) {
  const wrap = el('div', { style: { marginBottom: '12px' } });
  if (label) wrap.appendChild(caps(label, { marginBottom: '6px' }));

  const baseStyle = {
    width: '100%',
    border: error ? '1.5px solid var(--error)' : '1.5px solid var(--ink)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 12px', fontSize: '14px',
    background: 'var(--paper)', color: 'var(--ink)', outline: 'none',
    fontFamily: 'Inter, sans-serif',
  };

  let input;
  if (multiline) {
    input = el('textarea', {
      placeholder,
      style: {
        ...baseStyle,
        minHeight: '80px', resize: 'vertical', lineHeight: '1.5',
      },
    });
  } else {
    input = el('input', { type, placeholder, autocomplete, style: baseStyle });
  }
  input.value = value || '';
  if (typeof onInput === 'function') {
    input.addEventListener('input', (e) => onInput(e.target.value));
  }
  wrap.appendChild(input);

  if (hint || error) {
    wrap.appendChild(el('div', {
      style: {
        fontSize: '11px',
        color: error ? 'var(--error)' : 'var(--ink-mute)',
        marginTop: '4px',
      },
    }, error || hint));
  }
  wrap.input = input;
  return wrap;
}

// ── Bottom sheet ───────────────────────────────────────────────────────
//
//   const sheet = mSheet({ title }, ...content);
//   sheet.open(); sheet.close();
//
// Mounted into `document.body` so it sits above any phone-frame chrome
// the host module added.

export function mSheet({ title, onClose } = {}, ...content) {
  const grip = el('div', {
    style: {
      display: 'flex', justifyContent: 'center', padding: '8px 0 4px',
    },
  }, el('div', {
    style: {
      width: '36px', height: '4px',
      background: 'var(--ink-mute)', borderRadius: '999px',
    },
  }));

  const head = title ? el('div', {
    style: {
      padding: '4px 16px 10px', display: 'flex', alignItems: 'center',
      borderBottom: '1px solid var(--ink-soft)',
    },
  },
    el('div', { style: { fontSize: '14px', fontWeight: '700' } }, title),
    el('button', {
      type: 'button',
      onclick: () => instance.close(),
      style: {
        marginLeft: 'auto', padding: '4px', color: 'var(--ink-mute)',
        background: 'none', border: 'none', cursor: 'pointer',
      },
    }, iconEl('x', 16)),
  ) : null;

  const body = el('div', { style: { flex: '1', overflow: 'auto' } });
  for (const c of content.flat()) if (c) body.appendChild(c);

  const panel = el('div', {
    style: {
      width: '100%', background: 'var(--paper)',
      borderTopLeftRadius: '18px', borderTopRightRadius: '18px',
      border: '1.5px solid var(--ink)', borderBottom: 'none',
      maxHeight: '85%', display: 'flex', flexDirection: 'column',
      animation: 'mob-sheet-up .22s both',
    },
    onclick: (e) => e.stopPropagation(),
  }, grip, head, body);

  const backdrop = el('div', {
    style: {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,.4)',
      zIndex: '200', display: 'flex', alignItems: 'flex-end',
      animation: 'mob-sheet-fade .15s both',
    },
    onclick: () => instance.close(),
  }, panel);

  // Inject CSS keyframes once.
  if (!document.getElementById('mob-sheet-anim-css')) {
    const style = document.createElement('style');
    style.id = 'mob-sheet-anim-css';
    style.textContent = '@keyframes mob-sheet-fade{from{opacity:0}to{opacity:1}}'
      + '@keyframes mob-sheet-up{from{transform:translateY(40px)}to{transform:none}}';
    document.head.appendChild(style);
  }

  const instance = {
    el: backdrop,
    body,
    open() { document.body.appendChild(backdrop); },
    close() {
      backdrop.remove();
      if (typeof onClose === 'function') onClose();
    },
  };
  return instance;
}

// ── Sticky bottom action bar ───────────────────────────────────────────

export function mSticky(...children) {
  return el('div', {
    style: {
      padding: '10px 14px',
      borderTop: '1.5px solid var(--ink)',
      background: 'var(--paper)',
      display: 'flex', gap: '8px', flexShrink: '0',
    },
  }, ...children);
}

// ── Plain inline button (matches proto's <Btn>) ────────────────────────
//
// We keep it here for screens that don't want the global `.btn` class
// (e.g. inside sticky bars where padding differs).

export function mBtn({
  primary = false, ghost = false, danger = false,
  sm = false, full = false, icon = null, onClick, style = {},
} = {}, ...children) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: '6px', padding: sm ? '5px 10px' : '8px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: sm ? '12px' : '13px', fontWeight: '500', lineHeight: '1',
    border: '1.5px solid var(--ink)',
    background: 'var(--paper)', color: 'var(--ink)',
    whiteSpace: 'nowrap', width: full ? '100%' : 'auto',
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    ...style,
  };
  if (primary) Object.assign(base, {
    background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)',
  });
  if (ghost) Object.assign(base, {
    background: 'transparent', borderColor: 'transparent',
  });
  if (danger) Object.assign(base, {
    borderColor: 'var(--error)', color: 'var(--error)',
  });
  const btn = el('button', { type: 'button', onclick: onClick, style: base });
  if (icon) btn.appendChild(icon);
  for (const c of children.flat()) {
    if (c == null) continue;
    btn.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return btn;
}

// ── Chip ───────────────────────────────────────────────────────────────

export function mChip({ active = false, sm = false, onClick } = {}, ...children) {
  return el('span', {
    onclick: onClick,
    style: {
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: sm ? '2px 8px' : '4px 10px',
      borderRadius: 'var(--radius-pill)',
      fontSize: sm ? '11px' : '12px', fontWeight: '500',
      border: '1.5px solid',
      borderColor: active ? 'var(--accent)' : 'var(--ink)',
      background: active ? 'var(--accent)' : 'var(--paper)',
      color: active ? '#fff' : 'var(--ink)',
      whiteSpace: 'nowrap',
      cursor: onClick ? 'pointer' : 'default',
    },
  }, ...children);
}

// ── Re-exports ─────────────────────────────────────────────────────────

export { iconEl, navigate, esc };
