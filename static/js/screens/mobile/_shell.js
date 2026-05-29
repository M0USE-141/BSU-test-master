/**
 * mobile/_shell.js — shared layout helpers for mobile screens.
 *
 * Re-exports the new atom library at
 * `static/js/components/mobile-atoms.js`. The legacy
 * `buildBottomNav(activeId)` / `buildTopBar({...})` callers from the
 * pre-redesign screens are kept as thin shims so M2-M7 can replace
 * them incrementally without bisecting the build.
 */
import {
  topBar, bottomNav, mShell,
  mList, mRow, mCard, mSeg, mField, mSheet, mSticky,
  mBtn, mChip, caps,
} from '../../components/mobile-atoms.js';
import { t } from '../../utils/locale.js';

// ── Legacy API ──────────────────────────────────────────────────────────

/** Active nav id based on current hash. Exported for legacy callers. */
export function activeNav() {
  const h = location.hash;
  if (h.startsWith('#/stats'))                                          return 'stats';
  if (h.startsWith('#/import'))                                          return 'import';
  if (h.startsWith('#/notifications') || h.startsWith('#/change'))       return 'notif';
  if (h.startsWith('#/profile') || h.startsWith('#/settings'))           return 'me';
  return 'home';
}

/**
 * Legacy four-item bottom nav. Newer screens should call `bottomNav()`
 * from `components/mobile-atoms.js` directly — it supports the full
 * five-slot layout, badges and locale-aware labels.
 */
export function buildBottomNav(active) {
  return bottomNav({ active: active || activeNav(), t });
}

/**
 * Legacy topbar. Newer screens should call `topBar({...})` directly to
 * access the `back`, `large`, `subtitle`, `search` and `right` slots.
 */
export function buildTopBar({ title, back = false, backHref = '#/home', actions = [] } = {}) {
  // The old contract accepted an actions ARRAY; the new helper takes a
  // single `right` element. Wrap in a flex row for parity.
  const rightEl = actions.length
    ? (function () {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.gap = '6px';
        for (const a of actions) wrap.appendChild(a);
        return wrap;
      })()
    : null;
  return topBar({ title, back, backHref, right: rightEl });
}

// ── Pass-through atom exports for new screens ──────────────────────────

export {
  topBar, bottomNav, mShell,
  mList, mRow, mCard, mSeg, mField, mSheet, mSticky,
  mBtn, mChip, caps,
};

// ── Misc utilities (unchanged) ─────────────────────────────────────────

export { escHtml as esc } from '../../utils/escape.js';

/** Format ISO date to a short, locale-respecting string. */
export function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric',
    });
  } catch { return '—'; }
}

// `getClientId` was removed alongside anonymous attempts (Phase C).
// Screens that need a fresh UUID should import `newUuid` directly from
// `utils/client-id.js`. Identity is fully driven by the bearer token.
