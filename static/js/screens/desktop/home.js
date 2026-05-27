/**
 * screens/desktop/home.js — Mail-client home (Phase 3b).
 *
 * Layout: AppShell topbar + rail + MailLayout (sidebar test list +
 * detail pane with CollectionDetail tabs). Replaces the previous
 * 3-column layout.
 *
 * Tabs:
 *   - Обзор       — description, KPIs, recent attempts (fully wired)
 *   - Активность  — full attempts list
 *   - Вопросы     — basic question list (full editor lands in phase 5)
 *   - Статистика  — placeholder until owner-analytics is wired up
 *   - Доступ      — access level + shares + pending access requests
 */
import { listTests, getTest, deleteTest } from '../../api/tests.js';
import { getTestShares } from '../../api/access.js';
import { listAccessRequests, decideAccessRequest } from '../../api/access-requests.js';
import { listAttempts } from '../../api/statistics.js';
import { navigate } from '../../router.js';
import { mountAppShell } from '../../components/app-shell.js';
import { buildMailLayout, buildListRow } from '../../components/mail-layout.js';
import { confirm as confirmDialog } from '../../components/confirm-dialog.js';
import { toast } from '../../components/toast.js';
import { iconEl } from '../../icons.js';
import { getClientId } from '../../utils/client-id.js';
import { getState } from '../../state.js';

// Module-scope cancellation token (stale async chains abort).
let _renderToken = 0;

export default async function render(root, params) {
  params = params || {};
  const token = ++_renderToken;
  const stale = function () { return _renderToken !== token; };

  const main = mountAppShell(root);
  main.innerHTML = '';

  // Loading skeleton.
  const skel = document.createElement('div');
  skel.className = 'skeleton';
  skel.style.height = '100%';
  skel.style.minHeight = '200px';
  main.appendChild(skel);

  let tests = [];
  try {
    const resp = await listTests({ limit: 100 });
    tests = Array.isArray(resp) ? resp : (resp.items || resp.tests || []);
  } catch (e) {
    main.innerHTML = '';
    main.appendChild(emptyState('Не удалось загрузить список тестов', (e && e.message) || 'Проверьте подключение'));
    return;
  }
  if (stale()) return;

  main.innerHTML = '';

  if (tests.length === 0) {
    renderFirstRun(main);
    return;
  }

  const state = {
    filter: 'all',
    search: '',
    selectedId: params.id || tests[0].id,
    tab: 'Обзор',
    detail: null,
    attempts: [],
  };

  const built = buildMailLayout(main);
  const sidebar = built.sidebar;
  const detail = built.detail;
  renderSidebar(sidebar, tests, state);
  loadDetail(detail, state);
}

// ─── Sidebar ─────────────────────────────────────────────────

function renderSidebar(sidebar, tests, state) {
  sidebar.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'mail-layout__sidebar-head';

  const headRow = document.createElement('div');
  headRow.style.display = 'flex';
  headRow.style.alignItems = 'center';
  headRow.style.justifyContent = 'space-between';
  const caps = document.createElement('div');
  caps.className = 'caps';
  caps.textContent = 'Мои тесты · ' + tests.length;
  headRow.appendChild(caps);

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'btn--icon';
  importBtn.setAttribute('aria-label', 'Импорт');
  importBtn.appendChild(iconEl('plus', 14));
  importBtn.addEventListener('click', function () { navigate('/import'); });
  headRow.appendChild(importBtn);
  head.appendChild(headRow);

  // Search box.
  const searchWrap = document.createElement('div');
  searchWrap.style.display = 'flex';
  searchWrap.style.alignItems = 'center';
  searchWrap.style.gap = '6px';
  searchWrap.style.padding = '6px 10px';
  searchWrap.style.border = '1.5px solid var(--ink)';
  searchWrap.style.borderRadius = 'var(--radius-sm)';
  searchWrap.style.fontSize = '13px';
  const searchIcon = document.createElement('span');
  searchIcon.style.lineHeight = '0';
  searchIcon.style.color = 'var(--ink-tertiary)';
  searchIcon.appendChild(iconEl('search', 13));
  searchWrap.appendChild(searchIcon);
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Поиск тестов';
  searchInput.style.flex = '1';
  searchInput.style.border = 'none';
  searchInput.style.background = 'transparent';
  searchInput.style.outline = 'none';
  searchInput.style.color = 'var(--ink)';
  searchInput.style.font = '13px Inter';
  searchInput.value = state.search;
  searchInput.addEventListener('input', function () {
    state.search = searchInput.value.trim();
    renderList();
  });
  searchWrap.appendChild(searchInput);
  head.appendChild(searchWrap);

  // Filter chips.
  const filterRow = document.createElement('div');
  filterRow.style.display = 'flex';
  filterRow.style.gap = '4px';
  filterRow.style.flexWrap = 'wrap';
  const filters = [
    ['all', 'Все'],
    ['private', 'Свои'],
    ['shared', 'Shared'],
    ['public', 'Public'],
  ];
  const filterChips = {};
  filters.forEach(function (f) {
    const key = f[0];
    const label = f[1];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip--small' + (state.filter === key ? ' chip--active' : '');
    chip.textContent = label;
    chip.addEventListener('click', function () {
      state.filter = key;
      Object.keys(filterChips).forEach(function (k) {
        filterChips[k].classList.toggle('chip--active', k === key);
      });
      renderList();
    });
    filterChips[key] = chip;
    filterRow.appendChild(chip);
  });
  head.appendChild(filterRow);
  sidebar.appendChild(head);

  const listWrap = document.createElement('div');
  listWrap.className = 'mail-layout__sidebar-list';
  listWrap.style.flex = '1';
  listWrap.style.overflowY = 'auto';
  sidebar.appendChild(listWrap);

  function renderList() {
    listWrap.innerHTML = '';
    const filtered = tests.filter(function (t) {
      if (state.filter !== 'all' && (t.access_level || t.tag) !== state.filter) return false;
      if (state.search) {
        const title = (t.title || t.t || '').toLowerCase();
        if (title.indexOf(state.search.toLowerCase()) < 0) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '24px 14px';
      empty.style.textAlign = 'center';
      empty.style.fontSize = '12px';
      empty.style.color = 'var(--ink-tertiary)';
      empty.textContent = 'Ничего по фильтру';
      listWrap.appendChild(empty);
      return;
    }

    filtered.forEach(function (testItem) {
      const id = testItem.id;
      const access = testItem.access_level || testItem.tag || 'private';
      const subParts = [];
      const qc = testItem.questionCount || testItem.question_count;
      if (qc) subParts.push(qc + ' вопросов');
      const row = buildListRow({
        title: testItem.title || testItem.t || id,
        sub: subParts.join(' · '),
        active: id === state.selectedId,
        onClick: function () {
          state.selectedId = id;
          listWrap.querySelectorAll('.mail-row').forEach(function (r) {
            r.classList.toggle('is-active', r.dataset.id === id);
          });
          const det = sidebar.parentElement.querySelector('.mail-layout__detail');
          state.tab = 'Обзор';
          state.detail = null;
          loadDetail(det, state);
          history.replaceState({}, '', '#/home?id=' + encodeURIComponent(id));
        },
      });
      row.dataset.id = id;
      const tag = document.createElement('span');
      tag.className = 'tag tag--' + (access === 'public' ? 'info' : access === 'shared' ? 'success' : '');
      tag.style.alignSelf = 'center';
      tag.style.marginRight = '4px';
      tag.style.fontSize = '9px';
      tag.textContent = access;
      const mainCol = row.querySelector('.mail-row__main');
      row.insertBefore(tag, mainCol ? mainCol.nextSibling : null);
      listWrap.appendChild(row);
    });
  }
  renderList();
}

// ─── Detail pane ─────────────────────────────────────────────

async function loadDetail(detail, state) {
  detail.innerHTML = '';
  const skel = document.createElement('div');
  skel.className = 'skeleton';
  skel.style.width = '80%';
  skel.style.height = '32px';
  skel.style.margin = '24px';
  skel.style.borderRadius = '8px';
  detail.appendChild(skel);

  try {
    state.detail = await getTest(state.selectedId);
  } catch (e) {
    detail.innerHTML = '';
    detail.appendChild(emptyState('Не удалось загрузить тест', (e && e.message) || ''));
    return;
  }
  renderDetail(detail, state);
}

function renderDetail(detail, state) {
  detail.innerHTML = '';
  const test = state.detail;
  if (!test) return;

  const me = getState().user;
  const meId = me ? me.id : null;
  const isOwner = !!(test.is_owner || (meId && test.owner_id === meId));
  const accessLevel = test.access_level || 'private';

  // ── Header ──
  const headWrap = document.createElement('div');
  headWrap.style.padding = '18px 22px 0';
  detail.appendChild(headWrap);

  const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.gap = '18px';
  topRow.style.alignItems = 'flex-start';
  topRow.style.marginBottom = '18px';
  headWrap.appendChild(topRow);

  const titleCol = document.createElement('div');
  titleCol.style.flex = '1';
  titleCol.style.minWidth = '0';
  const caps = document.createElement('div');
  caps.className = 'caps';
  caps.style.marginBottom = '6px';
  caps.textContent = 'Коллекция · ' + (accessLevel === 'private' ? 'приватная' : accessLevel);
  titleCol.appendChild(caps);

  const titleEl = document.createElement('h1');
  titleEl.style.fontSize = '24px';
  titleEl.style.letterSpacing = '-0.01em';
  titleEl.style.margin = '0 0 8px';
  titleEl.style.fontWeight = 'var(--fw-bold)';
  titleEl.textContent = test.title || test.id;
  titleCol.appendChild(titleEl);

  const chipsRow = document.createElement('div');
  chipsRow.style.display = 'flex';
  chipsRow.style.gap = '6px';
  chipsRow.style.flexWrap = 'wrap';
  const qCount = (test.questions && test.questions.length) || test.questionCount || 0;
  chipsRow.appendChild(buildSmallChip(qCount + ' вопросов'));
  if (test.owner_username && !isOwner) chipsRow.appendChild(buildSmallChip('@' + test.owner_username));
  titleCol.appendChild(chipsRow);
  topRow.appendChild(titleCol);

  // Actions.
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '6px';
  actions.style.flexShrink = '0';
  actions.style.flexWrap = 'wrap';

  if (isOwner) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn';
    editBtn.appendChild(iconEl('cog', 14));
    const editLabel = document.createElement('span');
    editLabel.textContent = ' Настройки';
    editBtn.appendChild(editLabel);
    editBtn.addEventListener('click', function () {
      navigate('/test/' + encodeURIComponent(test.id) + '/edit');
    });
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn--danger';
    delBtn.appendChild(iconEl('trash', 14));
    delBtn.setAttribute('aria-label', 'Удалить');
    delBtn.addEventListener('click', async function () {
      const ok = await confirmDialog({
        title: 'Удалить тест «' + (test.title || test.id) + '»?',
        message: qCount + ' вопросов и все попытки будут удалены безвозвратно.',
        danger: true,
        typeToConfirm: test.title || test.id,
        confirmLabel: 'Удалить навсегда',
      });
      if (!ok) return;
      try {
        await deleteTest(test.id);
        toast('Тест удалён', { tone: 'success' });
        navigate('/home');
      } catch (e) {
        toast('Не удалось удалить тест', { tone: 'error' });
      }
    });
    actions.appendChild(delBtn);
  }

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn btn--primary';
  startBtn.appendChild(iconEl('play', 14));
  const startLabel = document.createElement('span');
  startLabel.textContent = ' Начать тест';
  startBtn.appendChild(startLabel);
  startBtn.addEventListener('click', function () {
    navigate('/test/' + encodeURIComponent(test.id) + '/start');
  });
  actions.appendChild(startBtn);
  topRow.appendChild(actions);

  // ── Tabs ──
  const tabs = document.createElement('div');
  tabs.className = 'tabs tabs--line';
  const tabKeys = ['Обзор', 'Активность', 'Вопросы', 'Статистика', 'Доступ'];
  tabKeys.forEach(function (name) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tabs__item' + (state.tab === name ? ' is-active' : '');
    tab.textContent = name;
    tab.addEventListener('click', function () {
      state.tab = name;
      tabs.querySelectorAll('.tabs__item').forEach(function (t) {
        t.classList.toggle('is-active', t.textContent === name);
      });
      renderTabBody(detail, state, isOwner);
    });
    tabs.appendChild(tab);
  });
  headWrap.appendChild(tabs);

  // Tab body container.
  const body = document.createElement('div');
  body.className = 'cd-tab-body';
  body.style.padding = '16px 22px 22px';
  detail.appendChild(body);

  renderTabBody(detail, state, isOwner);
}

function renderTabBody(detail, state, isOwner) {
  const body = detail.querySelector('.cd-tab-body');
  if (!body || !state.detail) return;
  body.innerHTML = '';

  if (state.tab === 'Обзор')      return renderOverviewTab(body, state, isOwner);
  if (state.tab === 'Активность') return renderActivityTab(body, state);
  if (state.tab === 'Вопросы')    return renderQuestionsTab(body, state, isOwner);
  if (state.tab === 'Статистика') return renderStatsTab(body);
  if (state.tab === 'Доступ')     return renderAccessTab(body, state, isOwner);
}

// ─── Tab: Обзор ──────────────────────────────────────────────

async function renderOverviewTab(body, state, isOwner) {
  const test = state.detail;
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1.4fr 1fr';
  grid.style.gap = '14px';
  grid.style.marginBottom = '14px';

  // Description card.
  const descCard = buildCard('Описание');
  const descBody = document.createElement('div');
  descBody.style.fontSize = '13px';
  descBody.style.color = 'var(--ink-secondary)';
  descBody.style.lineHeight = '1.6';
  if (test.description) {
    descBody.textContent = test.description;
  } else {
    const i = document.createElement('i');
    i.textContent = 'Описание не задано.' + (isOwner ? ' Добавьте его в настройках коллекции.' : '');
    descBody.appendChild(i);
  }
  descCard.body.appendChild(descBody);
  grid.appendChild(descCard.el);

  // KPI grid.
  const kpiGrid = document.createElement('div');
  kpiGrid.style.display = 'grid';
  kpiGrid.style.gridTemplateColumns = '1fr 1fr';
  kpiGrid.style.gap = '8px';
  kpiGrid.appendChild(buildKpi('Вопросы', String((test.questions && test.questions.length) || 0)));
  kpiGrid.appendChild(buildKpi('Попыток', '—'));
  kpiGrid.appendChild(buildKpi('Средний', '—'));
  kpiGrid.appendChild(buildKpi('Лучший', '—'));
  grid.appendChild(kpiGrid);
  body.appendChild(grid);

  // Recent attempts.
  const attemptsCard = buildCard('Последние попытки');
  const goAll = document.createElement('button');
  goAll.type = 'button';
  goAll.className = 'btn btn--ghost btn--small';
  goAll.textContent = 'Все →';
  goAll.addEventListener('click', function () {
    state.tab = 'Активность';
    document.querySelectorAll('.tabs--line .tabs__item').forEach(function (tEl) {
      tEl.classList.toggle('is-active', tEl.textContent === 'Активность');
    });
    const det = body.closest('.mail-layout__detail');
    renderTabBody(det, state, isOwner);
  });
  attemptsCard.head.appendChild(goAll);

  const tableSlot = document.createElement('div');
  attemptsCard.body.appendChild(tableSlot);
  body.appendChild(attemptsCard.el);

  try {
    const resp = await listAttempts({ test_id: test.id, client_id: getClientId(), limit: 50 });
    const items = Array.isArray(resp) ? resp : (resp.items || resp.attempts || []);
    state.attempts = items;
    const completed = items.filter(function (a) { return a.status === 'completed' || a.percentCorrect !== undefined; });
    const total = completed.length;
    const scores = completed.map(function (a) { return a.percentCorrect; }).filter(Number.isFinite);
    const avg = scores.length ? Math.round(scores.reduce(function (s, x) { return s + x; }, 0) / scores.length) : null;
    const best = scores.length ? Math.max.apply(Math, scores) : null;
    kpiGrid.children[1].querySelector('.kpi__value').textContent = String(total);
    kpiGrid.children[2].querySelector('.kpi__value').textContent = avg !== null ? avg + '%' : '—';
    kpiGrid.children[3].querySelector('.kpi__value').textContent = best !== null ? best + '%' : '—';
    fillAttemptsTable(tableSlot, items.slice(0, 5), test.id);
  } catch (e) {
    tableSlot.appendChild(emptyHint('Попыток ещё нет — пройдите тест, чтобы увидеть результаты'));
  }
}

// ─── Tab: Активность ─────────────────────────────────────────

async function renderActivityTab(body, state) {
  const card = buildCard('Все попытки');
  body.appendChild(card.el);
  const slot = document.createElement('div');
  card.body.appendChild(slot);
  try {
    const resp = await listAttempts({ test_id: state.detail.id, client_id: getClientId(), limit: 200 });
    const items = Array.isArray(resp) ? resp : (resp.items || resp.attempts || []);
    card.head.querySelector('.card__title').textContent = 'Все попытки · ' + items.length;
    fillAttemptsTable(slot, items, state.detail.id);
  } catch (e) {
    slot.appendChild(emptyHint('Не удалось загрузить попытки'));
  }
}

// ─── Tab: Вопросы (basic list; full editor in phase 5) ───────

function renderQuestionsTab(body, state, isOwner) {
  const test = state.detail;
  const card = buildCard('Вопросы · ' + ((test.questions && test.questions.length) || 0));
  if (isOwner) {
    const note = document.createElement('div');
    note.style.fontSize = '13px';
    note.style.color = 'var(--ink-secondary)';
    note.style.marginBottom = '10px';
    note.textContent = 'Полноценный редактор вопросов появится в следующем обновлении.';
    card.body.appendChild(note);
  }
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '8px';
  list.style.maxHeight = '60vh';
  list.style.overflow = 'auto';
  (test.questions || []).slice(0, 60).forEach(function (q, idx) {
    const row = document.createElement('div');
    row.style.border = '1.5px solid var(--ink)';
    row.style.borderRadius = 'var(--radius-sm)';
    row.style.padding = '10px 12px';
    row.style.background = 'var(--paper)';
    const head = document.createElement('div');
    head.className = 'caps';
    head.style.marginBottom = '4px';
    head.textContent = 'Q' + (idx + 1);
    const text = document.createElement('div');
    text.style.fontSize = '13px';
    text.style.lineHeight = '1.5';
    text.style.color = 'var(--ink)';
    text.textContent = extractPlainText(q.question) || '(пустой вопрос)';
    row.appendChild(head);
    row.appendChild(text);
    list.appendChild(row);
  });
  if ((test.questions || []).length === 0) {
    list.appendChild(emptyHint('Вопросов пока нет'));
  }
  card.body.appendChild(list);
  body.appendChild(card.el);
}

// ─── Tab: Статистика (placeholder) ───────────────────────────

function renderStatsTab(body) {
  const card = buildCard('Статистика по тесту');
  const hint = document.createElement('div');
  hint.style.fontSize = '13px';
  hint.style.color = 'var(--ink-secondary)';
  hint.textContent = 'Детальная аналитика появится в Phase 5. Сейчас доступны общие KPI на вкладке «Обзор».';
  card.body.appendChild(hint);
  body.appendChild(card.el);
}

// ─── Tab: Доступ ─────────────────────────────────────────────

async function renderAccessTab(body, state, isOwner) {
  const test = state.detail;

  const levelCard = buildCard('Уровень доступа');
  const levelRow = document.createElement('div');
  levelRow.style.display = 'flex';
  levelRow.style.gap = '8px';
  levelRow.style.flexWrap = 'wrap';
  ['private', 'shared', 'public'].forEach(function (lvl) {
    const chip = document.createElement('span');
    chip.className = 'chip' + (test.access_level === lvl ? ' chip--active' : '');
    chip.style.cursor = 'default';
    chip.textContent = lvl;
    levelRow.appendChild(chip);
  });
  levelCard.body.appendChild(levelRow);
  body.appendChild(levelCard.el);

  if (!isOwner) {
    const hint = document.createElement('div');
    hint.style.fontSize = '13px';
    hint.style.color = 'var(--ink-secondary)';
    hint.style.marginTop = '14px';
    hint.textContent = 'Только владелец может управлять доступом.';
    body.appendChild(hint);
    return;
  }

  // Shares.
  const sharesCard = buildCard('Поделено с');
  sharesCard.el.style.marginTop = '14px';
  const sharesSlot = document.createElement('div');
  sharesCard.body.appendChild(sharesSlot);
  body.appendChild(sharesCard.el);

  try {
    const shares = await getTestShares(test.id);
    if (!shares || shares.length === 0) {
      sharesSlot.appendChild(emptyHint('Тест пока никому не открыт'));
    } else {
      const list = document.createElement('ul');
      list.style.listStyle = 'none';
      list.style.padding = '0';
      list.style.margin = '0';
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '6px';
      shares.forEach(function (s) {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '10px';
        li.style.padding = '8px';
        li.style.border = '1px solid var(--ink-soft)';
        li.style.borderRadius = 'var(--radius-sm)';
        const av = document.createElement('span');
        av.className = 'avatar avatar--sm';
        av.textContent = (s.username || s.email || '?').slice(0, 2).toUpperCase();
        const name = document.createElement('span');
        name.style.flex = '1';
        name.style.fontSize = '13px';
        name.textContent = s.username || s.email || ('user#' + s.user_id);
        li.appendChild(av);
        li.appendChild(name);
        list.appendChild(li);
      });
      sharesSlot.appendChild(list);
    }
  } catch (e) {
    sharesSlot.appendChild(emptyHint('Не удалось загрузить список'));
  }

  // Pending access requests.
  const reqCard = buildCard('Запросы доступа');
  reqCard.el.style.marginTop = '14px';
  const reqSlot = document.createElement('div');
  reqCard.body.appendChild(reqSlot);
  body.appendChild(reqCard.el);

  try {
    const resp = await listAccessRequests(test.id, { status: 'pending' });
    const requests = resp.requests || [];
    if (requests.length === 0) {
      reqSlot.appendChild(emptyHint('Открытых запросов нет'));
    } else {
      const list = document.createElement('ul');
      list.style.listStyle = 'none';
      list.style.padding = '0';
      list.style.margin = '0';
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '8px';
      requests.forEach(function (r) {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '10px';
        li.style.padding = '10px';
        li.style.border = '1.5px solid var(--ink)';
        li.style.borderRadius = 'var(--radius-sm)';
        const av = document.createElement('span');
        av.className = 'avatar avatar--sm';
        av.textContent = '?';
        const text = document.createElement('div');
        text.style.flex = '1';
        text.style.fontSize = '13px';
        const who = document.createElement('div');
        who.style.fontWeight = 'var(--fw-semibold)';
        who.textContent = 'Пользователь #' + r.requesterId;
        text.appendChild(who);
        if (r.message) {
          const msg = document.createElement('div');
          msg.style.fontSize = '12px';
          msg.style.color = 'var(--ink-secondary)';
          msg.style.marginTop = '2px';
          msg.textContent = r.message;
          text.appendChild(msg);
        }
        const approve = document.createElement('button');
        approve.type = 'button';
        approve.className = 'btn btn--small btn--primary';
        approve.textContent = 'Принять';
        approve.addEventListener('click', function () { decideRequest(test.id, r.id, 'approve', li); });
        const reject = document.createElement('button');
        reject.type = 'button';
        reject.className = 'btn btn--small btn--danger';
        reject.textContent = 'Отклонить';
        reject.addEventListener('click', function () { decideRequest(test.id, r.id, 'reject', li); });
        li.appendChild(av);
        li.appendChild(text);
        li.appendChild(approve);
        li.appendChild(reject);
        list.appendChild(li);
      });
      reqSlot.appendChild(list);
    }
  } catch (e) {
    reqSlot.appendChild(emptyHint('Не удалось загрузить запросы'));
  }
}

async function decideRequest(testId, requestId, decision, rowEl) {
  rowEl.style.opacity = '0.5';
  rowEl.style.pointerEvents = 'none';
  try {
    await decideAccessRequest(testId, requestId, decision);
    toast(decision === 'approve' ? 'Доступ предоставлен' : 'Запрос отклонён', { tone: 'success' });
    rowEl.remove();
  } catch (e) {
    rowEl.style.opacity = '1';
    rowEl.style.pointerEvents = '';
    toast('Не удалось обработать запрос', { tone: 'error' });
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function buildSmallChip(text) {
  const chip = document.createElement('span');
  chip.className = 'chip chip--small';
  chip.style.cursor = 'default';
  chip.textContent = text;
  return chip;
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
  body.style.padding = '12px 14px';
  el.appendChild(body);
  return { el: el, head: head, body: body };
}

function buildKpi(label, value) {
  const k = document.createElement('div');
  k.className = 'kpi';
  const l = document.createElement('div');
  l.className = 'kpi__label';
  l.textContent = label;
  const v = document.createElement('div');
  v.className = 'kpi__value';
  v.textContent = value;
  k.appendChild(l);
  k.appendChild(v);
  return k;
}

function emptyHint(text) {
  const el = document.createElement('div');
  el.style.padding = '24px 0';
  el.style.textAlign = 'center';
  el.style.color = 'var(--ink-tertiary)';
  el.style.fontSize = '13px';
  el.textContent = text;
  return el;
}

function emptyState(title, desc) {
  const el = document.createElement('div');
  el.className = 'empty';
  el.style.flex = '1';
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

function fillAttemptsTable(slot, attempts, testId) {
  slot.innerHTML = '';
  if (!attempts.length) {
    slot.appendChild(emptyHint('Попыток ещё нет — пройдите тест, чтобы увидеть результаты'));
    return;
  }
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.fontSize = '12px';

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  trh.style.textAlign = 'left';
  trh.style.color = 'var(--ink-tertiary)';
  trh.style.fontSize = '10px';
  trh.style.textTransform = 'uppercase';
  trh.style.letterSpacing = '.06em';
  ['Когда', 'Балл', 'Время', 'Режим', ''].forEach(function (h) {
    const th = document.createElement('th');
    th.style.padding = '4px 0';
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  attempts.forEach(function (a) {
    const tr = document.createElement('tr');
    tr.style.borderTop = '1px solid var(--ink-soft)';
    tr.style.cursor = 'pointer';

    const score = (typeof a.percentCorrect === 'number') ? a.percentCorrect : (a.score || 0);
    const tone     = score >= 80 ? 'var(--success)'      : score >= 60 ? 'var(--warning)'      : 'var(--error)';
    const toneSoft = score >= 80 ? 'var(--success-soft)' : score >= 60 ? 'var(--warning-soft)' : 'var(--error-soft)';
    const when = a.finishedAt || a.finished_at || a.startedAt || a.started_at;
    const time = a.totalDurationMs ? formatDuration(a.totalDurationMs) : '—';
    const mode = (a.settings && a.settings.mode) || 'тренировка';

    const tdWhen = document.createElement('td');
    tdWhen.style.padding = '7px 0';
    tdWhen.textContent = formatWhen(when);
    tr.appendChild(tdWhen);

    const tdScore = document.createElement('td');
    const span = document.createElement('span');
    span.className = 'mono';
    span.style.background = toneSoft;
    span.style.color = tone;
    span.style.padding = '1px 6px';
    span.style.borderRadius = '999px';
    span.textContent = Math.round(score) + '%';
    tdScore.appendChild(span);
    tr.appendChild(tdScore);

    const tdTime = document.createElement('td');
    const tSpan = document.createElement('span');
    tSpan.className = 'mono';
    tSpan.style.color = 'var(--ink-secondary)';
    tSpan.textContent = time;
    tdTime.appendChild(tSpan);
    tr.appendChild(tdTime);

    const tdMode = document.createElement('td');
    tdMode.style.color = 'var(--ink-secondary)';
    tdMode.textContent = String(mode);
    tr.appendChild(tdMode);

    const tdChev = document.createElement('td');
    tdChev.style.textAlign = 'right';
    tdChev.style.color = 'var(--ink-tertiary)';
    tdChev.textContent = '›';
    tr.appendChild(tdChev);

    tr.addEventListener('click', function () {
      const aid = a.id || a.attemptId;
      navigate('/test/' + encodeURIComponent(testId) + '/results/' + encodeURIComponent(aid));
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  slot.appendChild(table);
}

function renderFirstRun(main) {
  const wrap = document.createElement('div');
  wrap.style.flex = '1';
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.justifyContent = 'center';
  wrap.style.padding = 'var(--sp-5)';

  const card = document.createElement('div');
  card.className = 'empty';
  card.style.maxWidth = '480px';
  card.style.border = 'var(--border)';
  card.style.borderRadius = 'var(--radius-lg)';
  card.style.padding = 'var(--sp-6)';

  const icon = document.createElement('div');
  icon.className = 'empty__icon';
  icon.appendChild(iconEl('upload', 24));
  card.appendChild(icon);

  const title = document.createElement('div');
  title.className = 'empty__title';
  title.textContent = 'Начнём с импорта первого теста';
  card.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'empty__desc';
  desc.textContent = 'Перетащите .docx или используйте public-каталог.';
  card.appendChild(desc);

  const cta = document.createElement('button');
  cta.type = 'button';
  cta.className = 'btn btn--primary';
  cta.style.marginTop = 'var(--sp-3)';
  cta.textContent = 'Импортировать .docx';
  cta.addEventListener('click', function () { navigate('/import'); });
  card.appendChild(cta);

  wrap.appendChild(card);
  main.appendChild(wrap);
}

function extractPlainText(blocks) {
  if (!blocks) return '';
  if (typeof blocks === 'string') return blocks;
  if (blocks.blocks) blocks = blocks.blocks;
  if (!Array.isArray(blocks)) return '';
  const out = [];
  blocks.forEach(function (block) {
    if (block.type === 'paragraph' && Array.isArray(block.inlines)) {
      block.inlines.forEach(function (inl) {
        if (inl.type === 'text' && inl.text) out.push(inl.text);
      });
    }
  });
  return out.join(' ').trim();
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return 'Сегодня ' + time;
    const dayMs = 86400000;
    const yesterday = new Date(now.getTime() - dayMs).toDateString() === d.toDateString();
    if (yesterday) return 'Вчера ' + time;
    return d.toLocaleDateString('ru', { day: '2-digit', month: 'short' });
  } catch (e) {
    return '—';
  }
}
