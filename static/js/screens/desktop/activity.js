/**
 * screens/desktop/activity.js — global activity timeline (Phase 5 final).
 *
 * Route: /activity
 *
 * Layout: AppShell + MailLayout.
 *   Sidebar: caps "Активность" + filter chips
 *     Все события / Тесты / Попытки / CR / Доступ.
 *   Detail: vertical timeline grouped by day (Сегодня / Вчера / DD MMM).
 *     Each row: actor avatar + human-readable verb sentence + relative
 *     time chip; clicking a row jumps to the target (test/results).
 *
 * Backed by GET /api/activity (Phase 5 final, paginated). Events are
 * append-only; no read state.
 */
import { listActivity } from '../../api/activity.js';
import { navigate } from '../../router.js';
import { mountAppShell } from '../../components/app-shell.js';
import { buildMailLayout } from '../../components/mail-layout.js';
import { iconEl } from '../../icons.js';
import { t } from '../../utils/locale.js';

let _renderToken = 0;

export default async function render(root, params) {
  params = params || {};
  const token = ++_renderToken;
  const stale = function () { return _renderToken !== token; };

  const main = mountAppShell(root);
  main.innerHTML = '';

  const state = {
    filter: params.filter || 'all',  // all | test | attempt | cr | access
    events: [],
  };

  const built = buildMailLayout(main, { sidebarWidth: 240 });
  renderSidebar(built.sidebar, built.detail, state);
  await loadEvents(state);
  if (stale()) return;
  renderDetail(built.detail, state);
}

// ─── Filter map: sidebar key → eventType filter values ───────

const FILTER_TO_TYPES = {
  all:     null,
  test:    ['test_created', 'test_shared'],
  attempt: ['attempt_completed'],
  cr:      ['cr_proposed', 'cr_approved', 'cr_rejected'],
  access:  ['access_requested', 'access_granted'],
};

async function loadEvents(state) {
  try {
    const resp = await listActivity({ limit: 200 });
    state.events = (resp && resp.events) || [];
  } catch (e) {
    state.events = [];
    state.error = (e && e.message) || 'Не удалось загрузить ленту';
  }
}

// ─── Sidebar ─────────────────────────────────────────────────

function renderSidebar(sidebar, detail, state) {
  sidebar.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'mail-layout__sidebar-head';
  const caps = document.createElement('div');
  caps.className = 'caps';
  caps.textContent = t('app.rail.activity') || 'Активность';
  head.appendChild(caps);
  sidebar.appendChild(head);

  const filters = [
    ['all',     t('activity.filter.all')     || 'Все события', 'chart'],
    ['test',    t('activity.filter.test')    || 'Тесты',       'doc'],
    ['attempt', t('activity.filter.attempt') || 'Попытки',     'play'],
    ['cr',      t('activity.filter.cr')      || 'CR',          'edit'],
    ['access',  t('activity.filter.access')  || 'Доступ',      'share'],
  ];

  const list = document.createElement('div');
  list.style.flex = '1';
  list.style.overflowY = 'auto';
  list.style.padding = '6px 0';

  filters.forEach(function (entry) {
    const key = entry[0], label = entry[1], iconKind = entry[2];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mail-row' + (state.filter === key ? ' is-active' : '');
    const mainCol = document.createElement('div');
    mainCol.className = 'mail-row__main';
    mainCol.style.display = 'flex';
    mainCol.style.alignItems = 'center';
    mainCol.style.gap = '8px';
    const ic = document.createElement('span');
    ic.style.lineHeight = '0';
    ic.style.color = 'var(--ink-tertiary)';
    ic.appendChild(iconEl(iconKind, 14));
    mainCol.appendChild(ic);
    const titleEl = document.createElement('div');
    titleEl.className = 'mail-row__title';
    titleEl.textContent = label;
    mainCol.appendChild(titleEl);
    btn.appendChild(mainCol);
    btn.addEventListener('click', function () {
      state.filter = key;
      renderSidebar(sidebar, detail, state);
      renderDetail(detail, state);
      history.replaceState({}, '', '#/activity?filter=' + key);
    });
    list.appendChild(btn);
  });
  sidebar.appendChild(list);
}

// ─── Detail (timeline) ───────────────────────────────────────

function renderDetail(detail, state) {
  detail.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.style.padding = '20px 28px';
  wrap.style.maxWidth = '760px';
  detail.appendChild(wrap);

  const h = document.createElement('h2');
  h.style.fontSize = '22px';
  h.style.margin = '0 0 18px';
  h.style.letterSpacing = '-0.01em';
  h.style.fontWeight = 'var(--fw-bold)';
  const filterLabels = {
    all:     'Все события',
    test:    'Тесты',
    attempt: 'Попытки',
    cr:      'Изменения',
    access:  'Доступ',
  };
  h.textContent = filterLabels[state.filter] || 'Активность';
  wrap.appendChild(h);

  if (state.error) {
    const err = document.createElement('div');
    err.className = 'empty';
    const errTitle = document.createElement('div');
    errTitle.className = 'empty__title';
    errTitle.textContent = state.error;
    err.appendChild(errTitle);
    wrap.appendChild(err);
    return;
  }

  const allowed = FILTER_TO_TYPES[state.filter];
  const filtered = state.events.filter(function (ev) {
    if (!allowed) return true;
    return allowed.indexOf(ev.eventType) >= 0;
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const eTitle = document.createElement('div');
    eTitle.className = 'empty__title';
    eTitle.textContent = 'Здесь пусто';
    empty.appendChild(eTitle);
    const eDesc = document.createElement('div');
    eDesc.className = 'empty__desc';
    eDesc.textContent = 'Когда что-то произойдёт — событие появится здесь.';
    empty.appendChild(eDesc);
    wrap.appendChild(empty);
    return;
  }

  // Group by day.
  const groups = groupByDay(filtered);
  groups.forEach(function (g) {
    const dayHead = document.createElement('div');
    dayHead.className = 'caps';
    dayHead.style.marginBottom = '8px';
    dayHead.style.marginTop = '14px';
    dayHead.textContent = g.label;
    wrap.appendChild(dayHead);

    g.events.forEach(function (ev) { wrap.appendChild(buildRow(ev)); });
  });
}

function buildRow(ev) {
  const row = document.createElement('button');
  row.type = 'button';
  row.style.display = 'flex';
  row.style.alignItems = 'flex-start';
  row.style.gap = '12px';
  row.style.padding = '10px 12px';
  row.style.width = '100%';
  row.style.background = 'var(--paper)';
  row.style.border = 'none';
  row.style.borderTop = '1px solid var(--ink-soft)';
  row.style.cursor = 'pointer';
  row.style.textAlign = 'left';
  row.style.font = 'inherit';

  const av = document.createElement('span');
  av.className = 'avatar avatar--sm';
  av.style.flexShrink = '0';
  av.style.marginTop = '2px';
  av.textContent = eventGlyph(ev);
  row.appendChild(av);

  const mid = document.createElement('div');
  mid.style.flex = '1';

  const desc = document.createElement('div');
  desc.style.fontSize = '13px';
  desc.style.lineHeight = '1.45';
  desc.style.color = 'var(--ink)';
  desc.textContent = eventSentence(ev);
  mid.appendChild(desc);

  if (ev.payload && Object.keys(ev.payload).length) {
    const extra = eventSubText(ev);
    if (extra) {
      const sub = document.createElement('div');
      sub.style.fontSize = 'var(--fs-xs)';
      sub.style.color = 'var(--ink-tertiary)';
      sub.style.marginTop = '3px';
      sub.textContent = extra;
      mid.appendChild(sub);
    }
  }

  row.appendChild(mid);

  const time = document.createElement('div');
  time.className = 'mono';
  time.style.fontSize = 'var(--fs-xs)';
  time.style.color = 'var(--ink-tertiary)';
  time.style.flexShrink = '0';
  time.style.alignSelf = 'center';
  time.textContent = relativeTime(ev.createdAt);
  row.appendChild(time);

  row.addEventListener('click', function () {
    const target = eventTarget(ev);
    if (target) navigate(target);
  });
  return row;
}

// ─── Day grouping ────────────────────────────────────────────

function groupByDay(events) {
  const out = [];
  const byKey = {};
  events.forEach(function (ev) {
    const d = ev.createdAt ? new Date(ev.createdAt) : null;
    const key = d ? d.toDateString() : 'unknown';
    if (!byKey[key]) {
      byKey[key] = { label: dayLabel(d), events: [] };
      out.push(byKey[key]);
    }
    byKey[key].events.push(ev);
  });
  return out;
}

function dayLabel(d) {
  if (!d) return '—';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru', { day: '2-digit', month: 'long' });
}

// ─── Event copy / target ────────────────────────────────────

function eventGlyph(ev) {
  switch (ev.eventType) {
    case 'attempt_completed': return '✓';
    case 'test_created':      return '+';
    case 'test_shared':       return '↗';
    case 'cr_proposed':       return '✎';
    case 'cr_approved':       return '✓';
    case 'cr_rejected':       return '✗';
    case 'access_requested':  return '?';
    case 'access_granted':    return '◯';
    default:                  return '·';
  }
}

function eventSentence(ev) {
  const p = ev.payload || {};
  switch (ev.eventType) {
    case 'attempt_completed':
      return 'Завершена попытка' + (p.percent != null ? (' с результатом ' + p.percent + '%') : '');
    case 'test_created':
      return 'Создан тест «' + (p.title || ev.testId || '') + '»';
    case 'test_shared':
      return 'Открыт доступ к тесту пользователю';
    case 'cr_proposed':
      return 'Предложено изменение в тесте';
    case 'cr_approved':
      return 'Принят CR';
    case 'cr_rejected':
      return 'Отклонён CR';
    case 'access_requested':
      return 'Запрошен доступ к тесту';
    case 'access_granted':
      return 'Предоставлен доступ к тесту';
    default:
      return ev.eventType;
  }
}

function eventSubText(ev) {
  const p = ev.payload || {};
  switch (ev.eventType) {
    case 'attempt_completed':
      return p.correct != null && p.total != null ? (p.correct + ' из ' + p.total) : '';
    case 'cr_proposed':
      return p.requestType ? humanRequestType(p.requestType) : '';
    default:
      return '';
  }
}

function humanRequestType(rt) {
  switch (rt) {
    case 'add_question':    return 'Новый вопрос';
    case 'edit_question':   return 'Правка вопроса';
    case 'delete_question': return 'Удаление вопроса';
    case 'edit_settings':   return 'Изменение настроек';
    default:                return rt;
  }
}

function eventTarget(ev) {
  if (ev.eventType === 'attempt_completed' && ev.testId && ev.attemptId) {
    return '/test/' + encodeURIComponent(ev.testId) + '/results/' + encodeURIComponent(ev.attemptId);
  }
  if (ev.testId) return '/home?id=' + encodeURIComponent(ev.testId);
  return null;
}

function relativeTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diff = Math.max(0, Date.now() - d.getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1)  return 'только что';
    if (min < 60) return min + ' мин';
    const h = Math.floor(min / 60);
    if (h < 24)   return h + ' ч';
    return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return ''; }
}
