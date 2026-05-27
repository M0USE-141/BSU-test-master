/**
 * screens/desktop/notifications.js — Notifications mail-client (Phase 5c).
 *
 * Layout: AppShell + MailLayout.
 *   Sidebar (300px):
 *     - Header: "Уведомления · N новых" caps + "Прочесть всё" button.
 *     - Filter chips: Все / Не прочитано / CR / Доступ / Система.
 *     - List of notifications with avatar + who + sub + time + unread dot.
 *   Detail:
 *     - Selected notification: avatar + who + sub + time.
 *     - For 'access_requested' (incoming, owner-side): "Открыть тест"
 *       button + helpful copy (the Approve/Reject buttons live on the
 *       Collection-Detail/Доступ tab where the request is authoritative).
 *     - For 'access_approved' / 'access_rejected': "Открыть тест" button.
 *     - For 'share': "Открыть тест" + author name.
 *     - For 'system': generic info card.
 *
 * Backend: GET /api/notifications (existing), POST /:id/read, POST /read-all
 * — all Phase 1 wrappers in api/notifications.js.
 *
 * Selecting a notification marks it read automatically.
 */
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../../api/notifications.js';
import { navigate } from '../../router.js';
import { mountAppShell, refreshBadges } from '../../components/app-shell.js';
import { buildMailLayout, buildListRow } from '../../components/mail-layout.js';
import { toast } from '../../components/toast.js';
import { iconEl } from '../../icons.js';
import { t } from '../../utils/locale.js';

let _renderToken = 0;

export default async function render(root, params) {
  params = params || {};
  const token = ++_renderToken;
  const stale = function () { return _renderToken !== token; };

  const main = mountAppShell(root);
  main.innerHTML = '';

  // Skeleton.
  const skel = document.createElement('div');
  skel.className = 'skeleton';
  skel.style.height = '70%';
  skel.style.minHeight = '300px';
  skel.style.margin = '24px';
  skel.style.borderRadius = 'var(--radius-md)';
  main.appendChild(skel);

  let items = [];
  try {
    const resp = await listNotifications({ limit: 100 });
    items = (resp && resp.items) || (Array.isArray(resp) ? resp : []);
  } catch (e) {
    main.innerHTML = '';
    main.appendChild(emptyState('Не удалось загрузить уведомления', (e && e.message) || ''));
    return;
  }
  if (stale()) return;

  main.innerHTML = '';

  const state = {
    filter: params.filter || 'all',  // 'all' | 'unread' | 'cr' | 'access' | 'system'
    selectedId: params.id ? Number(params.id) : (items[0] && items[0].id) || null,
    items: items,
  };

  const built = buildMailLayout(main, { sidebarWidth: 320 });
  renderSidebar(built.sidebar, built.detail, state);
  renderDetail(built.detail, state);
}

// ─── Sidebar ─────────────────────────────────────────────────

function renderSidebar(sidebar, detail, state) {
  sidebar.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'mail-layout__sidebar-head';

  const headRow = document.createElement('div');
  headRow.style.display = 'flex';
  headRow.style.alignItems = 'center';
  headRow.style.justifyContent = 'space-between';

  const caps = document.createElement('div');
  caps.className = 'caps';
  const unread = state.items.filter(function (n) { return !n.read_at; }).length;
  caps.textContent = 'Уведомления · ' + unread + ' новых';
  headRow.appendChild(caps);

  const markAll = document.createElement('button');
  markAll.type = 'button';
  markAll.className = 'btn btn--ghost btn--small';
  markAll.textContent = 'Прочесть всё';
  markAll.disabled = unread === 0;
  markAll.addEventListener('click', async function () {
    markAll.disabled = true;
    try {
      await markAllNotificationsRead();
      state.items = state.items.map(function (n) {
        return Object.assign({}, n, { read_at: n.read_at || new Date().toISOString() });
      });
      renderSidebar(sidebar, detail, state);
      renderDetail(detail, state);
      refreshBadges();
      toast('Все отмечены прочитанными', { tone: 'success' });
    } catch (_) {
      markAll.disabled = false;
      toast('Не удалось обновить', { tone: 'error' });
    }
  });
  headRow.appendChild(markAll);
  head.appendChild(headRow);

  // Filter chips.
  const filterRow = document.createElement('div');
  filterRow.style.display = 'flex';
  filterRow.style.gap = '4px';
  filterRow.style.marginTop = '8px';
  filterRow.style.flexWrap = 'wrap';
  const filters = [
    ['all',    'Все'],
    ['unread', 'Не прочитано'],
    ['cr',     'CR'],
    ['access', 'Доступ'],
    ['system', 'Система'],
  ];
  const filterChips = {};
  filters.forEach(function (f) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip--small' + (state.filter === f[0] ? ' chip--active' : '');
    chip.textContent = f[1];
    chip.addEventListener('click', function () {
      state.filter = f[0];
      Object.keys(filterChips).forEach(function (k) {
        filterChips[k].classList.toggle('chip--active', k === f[0]);
      });
      renderList();
    });
    filterChips[f[0]] = chip;
    filterRow.appendChild(chip);
  });
  head.appendChild(filterRow);
  sidebar.appendChild(head);

  // List.
  const listWrap = document.createElement('div');
  listWrap.style.flex = '1';
  listWrap.style.overflowY = 'auto';
  sidebar.appendChild(listWrap);

  function applyFilter(n) {
    if (state.filter === 'all')    return true;
    if (state.filter === 'unread') return !n.read_at;
    if (state.filter === 'cr')     return /change|cr/i.test(n.kind);
    if (state.filter === 'access') return /access|share/i.test(n.kind);
    if (state.filter === 'system') return n.kind === 'system' || n.kind === 'import_done' || n.kind === 'record';
    return true;
  }

  function renderList() {
    listWrap.innerHTML = '';
    const filtered = state.items.filter(applyFilter);
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '48px 16px';
      empty.style.textAlign = 'center';
      empty.style.fontSize = '13px';
      empty.style.color = 'var(--ink-tertiary)';
      empty.textContent = 'Здесь чисто 🎉';
      listWrap.appendChild(empty);
      return;
    }

    filtered.forEach(function (n) {
      const initials = avatarFor(n);
      const row = buildListRow({
        title: notifTitle(n),
        sub: notifSub(n),
        right: relative(n.created_at),
        active: n.id === state.selectedId,
        unread: !n.read_at,
        onClick: function () {
          state.selectedId = n.id;
          // Mark read locally + on server.
          if (!n.read_at) {
            n.read_at = new Date().toISOString();
            markNotificationRead(n.id).then(refreshBadges).catch(function () {});
          }
          // Re-render to update active styling + unread count.
          renderSidebar(sidebar, detail, state);
          renderDetail(detail, state);
        },
      });
      row.dataset.id = n.id;
      // Add avatar to the left of the row.
      const av = document.createElement('span');
      av.className = 'avatar avatar--sm';
      av.style.marginRight = '4px';
      av.style.alignSelf = 'center';
      av.textContent = initials;
      row.insertBefore(av, row.firstChild);
      listWrap.appendChild(row);
    });
  }
  renderList();
}

// ─── Detail ──────────────────────────────────────────────────

function renderDetail(detail, state) {
  detail.innerHTML = '';
  const sel = state.items.find(function (n) { return n.id === state.selectedId; });
  if (!sel) {
    const empty = document.createElement('div');
    empty.className = 'mail-detail__empty';
    empty.textContent = 'Выберите уведомление';
    detail.appendChild(empty);
    return;
  }

  const wrap = document.createElement('div');
  wrap.style.padding = '24px 28px';
  wrap.style.maxWidth = '720px';
  detail.appendChild(wrap);

  // Header row.
  const headRow = document.createElement('div');
  headRow.style.display = 'flex';
  headRow.style.gap = '14px';
  headRow.style.alignItems = 'flex-start';
  headRow.style.marginBottom = '18px';

  const av = document.createElement('span');
  av.className = 'avatar avatar--lg';
  av.textContent = avatarFor(sel);
  headRow.appendChild(av);

  const headText = document.createElement('div');
  headText.style.flex = '1';
  const whoEl = document.createElement('div');
  whoEl.style.fontSize = '15px';
  whoEl.style.fontWeight = 'var(--fw-semibold)';
  whoEl.textContent = notifTitle(sel);
  headText.appendChild(whoEl);

  const subEl = document.createElement('div');
  subEl.style.fontSize = '13px';
  subEl.style.color = 'var(--ink-secondary)';
  subEl.style.marginTop = '2px';
  subEl.textContent = notifSub(sel);
  headText.appendChild(subEl);
  headRow.appendChild(headText);

  const timeEl = document.createElement('div');
  timeEl.style.fontSize = '11px';
  timeEl.style.color = 'var(--ink-tertiary)';
  timeEl.textContent = relative(sel.created_at);
  headRow.appendChild(timeEl);
  wrap.appendChild(headRow);

  // Kind-specific body.
  const payload = sel.payload || {};

  if (sel.kind === 'access_requested') {
    // Owner side — someone asked for access to my test.
    const card = buildCard('Запрос доступа');
    const msg = document.createElement('div');
    msg.style.fontSize = '13px';
    msg.style.color = 'var(--ink-secondary)';
    msg.style.lineHeight = '1.6';
    const reqUser = payload.requesterUsername || payload.requesterDisplayName || ('user#' + (payload.requesterId || '?'));
    msg.textContent = '@' + reqUser + ' просит открыть доступ к тесту. ';
    if (payload.message) {
      const quote = document.createElement('div');
      quote.style.cssText = 'background:var(--ink-soft);border-left:3px solid var(--ink-tertiary);padding:10px 14px;border-radius:0 8px 8px 0;margin-top:8px;font-size:13px;line-height:1.5;color:var(--ink);';
      quote.textContent = payload.message;
      msg.appendChild(quote);
    }
    card.body.appendChild(msg);

    if (payload.testId) {
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'btn btn--primary';
      cta.style.marginTop = '14px';
      cta.textContent = 'Открыть тест';
      cta.addEventListener('click', function () {
        navigate('/home?id=' + encodeURIComponent(payload.testId));
      });
      card.body.appendChild(cta);
    }
    wrap.appendChild(card.el);
    return;
  }

  if (sel.kind === 'access_approved' || sel.kind === 'access_rejected') {
    const approved = sel.kind === 'access_approved';
    const card = buildCard(approved ? 'Доступ предоставлен' : 'Доступ отклонён');
    const msg = document.createElement('div');
    msg.style.fontSize = '13px';
    msg.style.color = 'var(--ink-secondary)';
    msg.style.lineHeight = '1.6';
    const by = payload.decidedBy ? ('@' + payload.decidedBy) : 'автор';
    msg.textContent = approved
      ? (by + ' открыл вам доступ к тесту. Можно проходить.')
      : (by + ' отклонил ваш запрос. Можно попробовать связаться напрямую.');
    card.body.appendChild(msg);

    if (approved && payload.testId) {
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'btn btn--primary';
      cta.style.marginTop = '14px';
      cta.textContent = 'Открыть тест';
      cta.addEventListener('click', function () {
        navigate('/test/' + encodeURIComponent(payload.testId) + '/start');
      });
      card.body.appendChild(cta);
    }
    wrap.appendChild(card.el);
    return;
  }

  if (sel.kind === 'share') {
    const card = buildCard('Доступ к тесту');
    const msg = document.createElement('div');
    msg.style.fontSize = '13px';
    msg.style.color = 'var(--ink-secondary)';
    msg.style.lineHeight = '1.6';
    const by = payload.sharedBy ? ('@' + payload.sharedBy) : 'кто-то';
    msg.textContent = by + ' открыл вам доступ к тесту «' + (payload.testTitle || payload.testId || '') + '». ';
    card.body.appendChild(msg);

    if (payload.testId) {
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'btn btn--primary';
      cta.style.marginTop = '14px';
      cta.textContent = 'Открыть тест';
      cta.addEventListener('click', function () {
        navigate('/home?id=' + encodeURIComponent(payload.testId));
      });
      card.body.appendChild(cta);
    }
    wrap.appendChild(card.el);
    return;
  }

  if (/^cr_|change_request/.test(sel.kind || '')) {
    // CR-typed notification. Defer the full diff to the CR screen, but
    // expose qBefore/qAfter inline when they're already in the payload
    // (matches prototype/2.1 plan).
    const card = buildCard(payload.title || 'Предложение изменения');
    if (payload.qBefore || payload.qAfter) {
      if (payload.qBefore) {
        card.body.appendChild(captionedBlock('Было', payload.qBefore, 'error'));
      }
      if (payload.qAfter) {
        card.body.appendChild(captionedBlock('Стало', payload.qAfter, 'success'));
      }
    } else {
      const msg = document.createElement('div');
      msg.style.fontSize = '13px';
      msg.style.color = 'var(--ink-secondary)';
      msg.textContent = payload.message || 'Откройте CR-инбокс, чтобы увидеть предложенные изменения.';
      card.body.appendChild(msg);
    }

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.marginTop = '14px';

    if (payload.testId) {
      const openCR = document.createElement('button');
      openCR.type = 'button';
      openCR.className = 'btn btn--primary';
      openCR.textContent = 'Открыть в CR-инбоксе';
      openCR.addEventListener('click', function () {
        navigate('/change-requests/' + encodeURIComponent(payload.testId));
      });
      row.appendChild(openCR);
    }
    card.body.appendChild(row);
    wrap.appendChild(card.el);
    return;
  }

  // Default: system / unknown kind.
  const card = buildCard(payload.title || 'Системное уведомление');
  const msg = document.createElement('div');
  msg.style.fontSize = '13px';
  msg.style.color = 'var(--ink-secondary)';
  msg.style.lineHeight = '1.6';
  msg.textContent = payload.message || 'Никаких действий не требуется.';
  card.body.appendChild(msg);
  wrap.appendChild(card.el);
}

// ─── Helpers ─────────────────────────────────────────────────

function avatarFor(n) {
  const payload = n.payload || {};
  if (n.kind === 'system') return 'TM';
  if (n.kind === 'share' && payload.sharedBy) return payload.sharedBy.slice(0, 2).toUpperCase();
  if (n.kind === 'access_requested' && payload.requesterUsername) return payload.requesterUsername.slice(0, 2).toUpperCase();
  if ((n.kind === 'access_approved' || n.kind === 'access_rejected') && payload.decidedBy) return payload.decidedBy.slice(0, 2).toUpperCase();
  return '·';
}

function notifTitle(n) {
  const payload = n.payload || {};
  switch (n.kind) {
    case 'access_requested':
      return (payload.requesterUsername || 'user') + ' просит доступ';
    case 'access_approved':
      return 'Доступ предоставлен';
    case 'access_rejected':
      return 'Доступ отклонён';
    case 'share':
      return 'Открыли доступ к тесту';
    case 'system':
      return payload.title || 'TestMaster';
    default:
      return payload.title || n.kind || 'Уведомление';
  }
}

function notifSub(n) {
  const payload = n.payload || {};
  switch (n.kind) {
    case 'access_requested':
      return payload.message ? '«' + truncate(payload.message, 80) + '»' : 'к одному из ваших тестов';
    case 'access_approved':
    case 'access_rejected':
      return payload.testTitle || payload.testId || '';
    case 'share':
      return payload.testTitle || payload.testId || '';
    case 'system':
      return payload.message || '';
    default:
      return payload.message || '';
  }
}

function captionedBlock(label, text, tone) {
  const wrap = document.createElement('div');
  wrap.style.marginBottom = '10px';
  const cap = document.createElement('div');
  cap.className = 'caps';
  cap.style.marginBottom = '6px';
  cap.textContent = label;
  const block = document.createElement('div');
  block.style.padding = '8px 10px';
  block.style.borderRadius = '6px';
  block.style.fontSize = '13px';
  block.style.lineHeight = '1.5';
  if (tone === 'error') {
    block.style.background = 'var(--error-soft)';
    block.style.border = '1px solid var(--error)';
  } else {
    block.style.background = 'var(--success-soft)';
    block.style.border = '1px solid var(--success)';
  }
  block.textContent = text;
  wrap.appendChild(cap);
  wrap.appendChild(block);
  return wrap;
}

function buildCard(title) {
  const el = document.createElement('div');
  el.className = 'card';
  el.style.padding = '0';
  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  head.style.justifyContent = 'space-between';
  head.style.padding = '12px 14px';
  head.style.borderBottom = '1px solid var(--ink-soft)';
  const titleEl = document.createElement('div');
  titleEl.className = 'card__title';
  titleEl.style.fontSize = '13px';
  titleEl.style.fontWeight = 'var(--fw-semibold)';
  titleEl.textContent = title;
  head.appendChild(titleEl);
  el.appendChild(head);
  const body = document.createElement('div');
  body.style.padding = '14px';
  el.appendChild(body);
  return { el: el, head: head, body: body };
}

function emptyState(title, desc) {
  const el = document.createElement('div');
  el.className = 'empty';
  const t = document.createElement('div');
  t.className = 'empty__title';
  t.textContent = title;
  el.appendChild(t);
  if (desc) {
    const d = document.createElement('div');
    d.className = 'empty__desc';
    d.textContent = desc;
    el.appendChild(d);
  }
  return el;
}

function relative(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diff = Math.max(0, Date.now() - d.getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1)  return 'только что';
    if (min < 60) return min + ' мин';
    const h = Math.floor(min / 60);
    if (h < 24)   return h + ' ч';
    const dDays = Math.floor(h / 24);
    if (dDays < 30) return dDays + ' дн';
    return d.toLocaleDateString('ru', { day: '2-digit', month: 'short' });
  } catch (_) { return ''; }
}

function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
