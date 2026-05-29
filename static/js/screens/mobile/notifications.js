/**
 * mobile/notifications.js — Mobile notifications (M5 redesign).
 *
 * Backend is fully wired (Phase 6 of the migration shipped notif
 * delivery + audit). This screen renders the inbox with:
 *   - filter chips (All / Unread / CR / Share)
 *   - one row per notification, unread row tinted accent-soft + dot
 *   - tap to mark-read and (if the notif carries a `cr_id`) navigate
 *     to the CR detail
 *   - "Mark all" pill button in the topbar right slot
 */
import {
  listNotifications, markNotificationRead, markAllNotificationsRead,
} from '../../api/notifications.js';
import { t } from '../../utils/locale.js';
import { navigate } from '../../router.js';
import {
  topBar, mShell, mChip,
} from '../../components/mobile-atoms.js';
import { fmtDate } from './_shell.js';

let _renderToken = 0;

function avatarBubble(initials, accent = true) {
  const av = document.createElement('div');
  Object.assign(av.style, {
    width: '36px', height: '36px', borderRadius: '50%',
    border: '1.5px solid var(--ink)',
    background: accent ? 'var(--accent-soft)' : 'var(--ink-soft)',
    color: accent ? 'var(--accent)' : 'var(--ink-fade)',
    fontWeight: '600', fontSize: '13px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: '0',
  });
  av.textContent = (initials || '?').slice(0, 2).toUpperCase();
  return av;
}

function describe(notif) {
  const kind = notif.kind || notif.event || '';
  const payload = notif.payload || {};
  const who = payload.actor_username || payload.proposer_username
    || payload.reviewer_username || payload.sharer_username
    || payload.username || '—';
  switch (kind) {
    case 'cr_received':
      return { who, sub: t('notif.cr_received') || 'предложил изменения', kind: 'cr' };
    case 'cr_approved':
      return { who, sub: t('notif.cr_approved') || 'одобрил ваш CR', kind: 'cr' };
    case 'cr_rejected':
      return { who, sub: t('notif.cr_rejected') || 'отклонил ваш CR', kind: 'cr' };
    case 'share_received':
      return { who, sub: t('notif.share_received') || 'поделился тестом', kind: 'share' };
    case 'access_requested':
      return { who, sub: t('notif.access_requested') || 'запросил доступ', kind: 'access' };
    case 'access_approved':
      return { who, sub: t('notif.access_approved') || 'открыл вам доступ', kind: 'access' };
    case 'access_rejected':
      return { who, sub: t('notif.access_rejected') || 'отклонил запрос на доступ', kind: 'access' };
    default:
      return { who, sub: kind, kind: 'other' };
  }
}

export default async function render(root) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  let filter = 'all';        // 'all' | 'unread' | 'cr' | 'share'
  let items = [];

  // Skeleton — full-width rows so the look matches the final list.
  const skeleton = document.createElement('div');
  for (let i = 0; i < 4; i++) {
    const r = document.createElement('div');
    r.className = 'skeleton';
    Object.assign(r.style, {
      height: '64px', margin: '0 16px 8px',
      borderRadius: 'var(--radius-md)',
    });
    skeleton.appendChild(r);
  }
  mShell({
    root,
    topbar: topBar({
      large: true,
      title: t('notif.title') || 'Уведомления',
      subtitle: t('notif.loading') || 'Загружаем…',
    }),
    body: skeleton,
    navActive: 'notif',
  });

  try {
    const data = await listNotifications({ limit: 100 });
    if (stale()) return;
    // API may return `{items: [...]}` or a bare array.
    items = Array.isArray(data) ? data : (data?.items || data?.notifications || []);
  } catch {
    items = [];
  }
  if (stale()) return;

  const unreadCount = items.filter(n => !n.read_at && !n.readAt).length;

  // Topbar with "mark all read" pill.
  const markAllBtn = document.createElement('button');
  markAllBtn.type = 'button';
  Object.assign(markAllBtn.style, {
    font: "500 12px Inter, sans-serif",
    color: 'var(--accent)',
    padding: '6px 10px', background: 'none', border: 'none',
    cursor: unreadCount > 0 ? 'pointer' : 'default',
    opacity: unreadCount > 0 ? '1' : '0.4',
  });
  markAllBtn.textContent = t('notif.mark_all') || 'Все';
  markAllBtn.addEventListener('click', async () => {
    if (unreadCount === 0) return;
    try {
      await markAllNotificationsRead();
      items = items.map(n => ({ ...n, read_at: new Date().toISOString() }));
      rerender();
    } catch { /* silent */ }
  });

  // Body — filter row + scrolling list.
  const body = document.createElement('div');

  const filterRow = document.createElement('div');
  Object.assign(filterRow.style, {
    padding: '8px 16px 8px',
    display: 'flex', gap: '5px',
    overflowX: 'auto',
    borderBottom: '1px solid var(--ink-soft)',
    paddingBottom: '8px',
  });
  body.appendChild(filterRow);

  const list = document.createElement('div');
  body.appendChild(list);

  function countFor(f) {
    if (f === 'all')    return items.length;
    if (f === 'unread') return items.filter(n => !n.read_at && !n.readAt).length;
    if (f === 'cr')     return items.filter(n => /^cr_/.test(n.kind || n.event || '')).length;
    if (f === 'share')  return items.filter(n => /share/.test(n.kind || n.event || '')).length;
    if (f === 'access') return items.filter(n => /^access_/.test(n.kind || n.event || '')).length;
    return 0;
  }

  function rebuildFilters() {
    filterRow.replaceChildren();
    const defs = [
      { id: 'all',    label: t('notif.filter.all')    || 'Все' },
      { id: 'unread', label: t('notif.filter.unread') || 'Не проч.' },
      { id: 'cr',     label: 'CR' },
      { id: 'share',  label: t('notif.filter.share')  || 'Шаринг' },
      { id: 'access', label: t('notif.filter.access') || 'Доступ' },
    ];
    for (const def of defs) {
      filterRow.appendChild(mChip({
        sm: true, active: filter === def.id,
        onClick: () => { filter = def.id; rebuildFilters(); rebuildList(); },
      }, `${def.label} · ${countFor(def.id)}`));
    }
  }

  function rebuildList() {
    list.replaceChildren();
    const filtered = items.filter(n => {
      if (filter === 'all') return true;
      if (filter === 'unread') return !n.read_at && !n.readAt;
      if (filter === 'cr')    return /^cr_/.test(n.kind || n.event || '');
      if (filter === 'share') return /share/.test(n.kind || n.event || '');
      if (filter === 'access')return /^access_/.test(n.kind || n.event || '');
      return true;
    });
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      Object.assign(empty.style, {
        padding: '48px 16px', textAlign: 'center',
        color: 'var(--ink-mute)', fontSize: '13px',
      });
      empty.textContent = t('notif.empty') || '📭 Здесь чисто';
      list.appendChild(empty);
      return;
    }
    filtered.forEach((n) => list.appendChild(buildRow(n)));
  }

  function buildRow(n) {
    const isUnread = !n.read_at && !n.readAt;
    const { who, sub, kind } = describe(n);
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', gap: '10px',
      padding: '12px 16px',
      borderBottom: '1px solid var(--ink-soft)',
      background: isUnread ? 'var(--accent-soft)' : 'transparent',
      cursor: 'pointer',
    });
    row.addEventListener('click', () => onRowClick(n));

    row.appendChild(avatarBubble(who, kind !== 'other'));

    const mid = document.createElement('div');
    Object.assign(mid.style, { flex: '1', minWidth: '0' });
    const line = document.createElement('div');
    Object.assign(line.style, { fontSize: '13px', lineHeight: '1.4' });
    const whoEl = document.createElement('b');
    whoEl.style.fontWeight = '600';
    whoEl.textContent = who + ' ';
    line.appendChild(whoEl);
    const subEl = document.createElement('span');
    subEl.style.color = 'var(--ink-fade)';
    subEl.textContent = sub;
    line.appendChild(subEl);
    mid.appendChild(line);
    const metaEl = document.createElement('div');
    Object.assign(metaEl.style, {
      fontSize: '11px', color: 'var(--ink-mute)', marginTop: '3px',
    });
    metaEl.textContent = fmtDate(n.created_at || n.createdAt);
    mid.appendChild(metaEl);
    row.appendChild(mid);

    if (isUnread) {
      const dot = document.createElement('span');
      Object.assign(dot.style, {
        width: '7px', height: '7px', borderRadius: '50%',
        background: 'var(--accent)', marginTop: '8px', flexShrink: '0',
      });
      row.appendChild(dot);
    }

    // Per-row "Open CR" CTA on unread CR rows — quick jump without
    // having to first dismiss the row.
    const payload = n.payload || {};
    if (isUnread && kind === 'cr' && payload.cr_id) {
      const cta = document.createElement('button');
      cta.type = 'button';
      Object.assign(cta.style, {
        padding: '4px 8px', fontSize: '11px',
        border: '1px solid var(--accent)',
        background: 'transparent', color: 'var(--accent)',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        font: '500 11px Inter, sans-serif',
        flexShrink: '0', alignSelf: 'center', marginLeft: '6px',
      });
      cta.textContent = t('notif.open_cr') || 'Открыть CR';
      cta.addEventListener('click', (e) => {
        e.stopPropagation();
        navigate(`/change-requests/${payload.test_id || ''}?cr=${payload.cr_id}`);
      });
      row.appendChild(cta);
    }
    return row;
  }

  async function onRowClick(n) {
    if (!n.read_at && !n.readAt) {
      try { await markNotificationRead(n.id); } catch { /* silent */ }
      const i = items.indexOf(n);
      if (i >= 0) items[i] = { ...n, read_at: new Date().toISOString() };
      rerender();
    }
    const payload = n.payload || {};
    if (payload.cr_id) navigate(`/change-requests/${payload.test_id || ''}?cr=${payload.cr_id}`);
    else if (payload.test_id) navigate(`/test/${payload.test_id}`);
  }

  function rerender() {
    rebuildFilters();
    rebuildList();
  }

  // Final mount with topbar + body.
  const topbar = topBar({
    large: true,
    title: t('notif.title') || 'Уведомления',
    subtitle: `${unreadCount} ${t('notif.unread_word') || 'новых'}`,
    right: markAllBtn,
  });
  rerender();
  mShell({ root, topbar, body, navActive: 'notif' });
}
