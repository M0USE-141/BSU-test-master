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
import { getTestShares, addShare, removeShare, updateTestAccess } from '../../api/access.js';
import { listAccessRequests, decideAccessRequest } from '../../api/access-requests.js';
import { listAttempts, getOwnerAnalytics } from '../../api/statistics.js';
import { navigate } from '../../router.js';
import { mountAppShell } from '../../components/app-shell.js';
import { buildMailLayout, buildListRow } from '../../components/mail-layout.js';
import { confirm as confirmDialog } from '../../components/confirm-dialog.js';
import { toast } from '../../components/toast.js';
import { iconEl } from '../../icons.js';
import { getState } from '../../state.js';
import { t } from '../../utils/locale.js';

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

  const PAGE_SIZE = 30;
  const initialFilter = ['my', 'shared', 'public'].includes(params.filter)
    ? params.filter : 'my';
  let myTests = [];
  let myTotal = 0;
  let tests = [];
  let total = 0;
  try {
    const reqs = [
      listTests({ filter: 'my', with_stats: true, limit: PAGE_SIZE, offset: 0 }),
    ];
    if (initialFilter !== 'my') {
      reqs.push(listTests({
        filter: initialFilter, with_stats: true,
        limit: PAGE_SIZE, offset: 0,
        ...(initialFilter === 'public' ? { sort: 'popular' } : {}),
      }));
    }
    const results = await Promise.allSettled(reqs);
    if (results[0].status === 'fulfilled') {
      const resp = results[0].value;
      myTests = Array.isArray(resp) ? resp : (resp.items || resp.tests || []);
      myTotal = (resp && resp.total != null) ? resp.total : myTests.length;
    } else {
      throw results[0].reason;
    }
    if (initialFilter === 'my') {
      tests = myTests; total = myTotal;
    } else if (results[1] && results[1].status === 'fulfilled') {
      const resp = results[1].value;
      tests = Array.isArray(resp) ? resp : (resp.items || resp.tests || []);
      total = (resp && resp.total != null) ? resp.total : tests.length;
    }
  } catch (e) {
    main.innerHTML = '';
    main.appendChild(emptyState('Не удалось загрузить список тестов', (e && e.message) || 'Проверьте подключение'));
    return;
  }
  if (stale()) return;

  main.innerHTML = '';

  // Brand-new user with zero own tests → first-run onboarding (only when
  // the user didn't explicitly land on /home?filter=public from elsewhere).
  if (myTotal === 0 && initialFilter === 'my') {
    renderFirstRun(main);
    return;
  }

  // Decide which filter the sidebar should show. Explicit ?filter= wins;
  // otherwise fall back to 'my' (or 'public' if user has no own tests).
  const effectiveFilter = (params.filter && initialFilter !== 'my')
    ? initialFilter
    : (myTotal === 0 ? 'public' : 'my');

  const state = {
    filter: effectiveFilter,
    search: '',
    selectedId: params.id || (tests[0] && tests[0].id) || null,
    tab: 'Обзор',
    detail: null,
    attempts: [],
    tests: tests.slice(),
    offset: tests.length,
    pageSize: PAGE_SIZE,
    exhausted: tests.length < PAGE_SIZE || tests.length >= total,
    loading: false,
  };

  const built = buildMailLayout(main);
  const sidebar = built.sidebar;
  const detail = built.detail;
  renderSidebar(sidebar, state);
  if (state.selectedId) loadDetail(detail, state);
  // Fallback: empty-state for an owner with 0 own tests AND no explicit
  // filter — sidebar auto-loads public.
  if (effectiveFilter === 'public' && tests.length === 0) {
    state.tests = [];
    state.offset = 0;
    state.exhausted = false;
    renderSidebar(sidebar, state);
  }
}

// ─── Sidebar ─────────────────────────────────────────────────

function renderSidebar(sidebar, state) {
  while (sidebar.firstChild) sidebar.removeChild(sidebar.firstChild);

  const head = document.createElement('div');
  head.className = 'mail-layout__sidebar-head';

  const headRow = document.createElement('div');
  headRow.style.display = 'flex';
  headRow.style.alignItems = 'center';
  headRow.style.justifyContent = 'space-between';
  const caps = document.createElement('div');
  caps.className = 'caps';
  function currentFilterLabel() {
    return state.filter === 'my' ? 'Мои тесты'
         : state.filter === 'shared' ? 'Shared со мной'
         : 'Public каталог';
  }
  caps.textContent = currentFilterLabel() + ' · ' + state.tests.length;
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

  // Filter chips — backend-driven, no 'all'.
  const filterRow = document.createElement('div');
  filterRow.style.display = 'flex';
  filterRow.style.gap = '4px';
  filterRow.style.flexWrap = 'wrap';
  const filters = [
    ['my', 'Свои'],
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
    chip.addEventListener('click', async function () {
      if (state.filter === key) return;
      state.filter = key;
      state.tests = [];
      state.offset = 0;
      state.exhausted = false;
      Object.keys(filterChips).forEach(function (k) {
        filterChips[k].classList.toggle('chip--active', k === key);
      });
      renderList();
      await loadMore();
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

  async function loadMore() {
    if (state.loading || state.exhausted) return;
    state.loading = true;
    try {
      const resp = await listTests({
        filter: state.filter,
        with_stats: true,
        limit: state.pageSize,
        offset: state.offset,
        ...(state.filter === 'public' ? { sort: 'popular' } : {}),
      });
      const items = Array.isArray(resp) ? resp : (resp.items || resp.tests || []);
      state.tests = state.tests.concat(items);
      state.offset += items.length;
      if (items.length < state.pageSize
          || (resp && resp.total != null && state.offset >= resp.total)) {
        state.exhausted = true;
      }
    } catch { state.exhausted = true; }
    finally {
      state.loading = false;
      renderList();
    }
  }

  let scrollObserver = null;

  function renderList() {
    while (listWrap.firstChild) listWrap.removeChild(listWrap.firstChild);
    caps.textContent = currentFilterLabel() + ' · ' + state.tests.length;

    const filtered = state.search
      ? state.tests.filter(function (t) {
          const title = (t.title || t.t || '').toLowerCase();
          return title.indexOf(state.search.toLowerCase()) >= 0;
        })
      : state.tests;

    if (filtered.length === 0 && !state.loading && state.exhausted) {
      const empty = document.createElement('div');
      empty.style.padding = '24px 14px';
      empty.style.textAlign = 'center';
      empty.style.fontSize = '12px';
      empty.style.color = 'var(--ink-tertiary)';
      empty.textContent = state.search ? 'Ничего по поиску'
        : state.filter === 'my' ? 'У вас пока нет своих тестов'
        : state.filter === 'shared' ? 'Никто пока не поделился с вами'
        : 'Публичных тестов нет';
      listWrap.appendChild(empty);
    }

    filtered.forEach(function (testItem) {
      const id = testItem.id;
      const access = testItem.access_level || testItem.tag || 'private';
      const subParts = [];
      const qc = testItem.questionCount || testItem.question_count;
      if (qc) subParts.push(qc + ' вопросов');
      if (state.filter !== 'my' && testItem.owner_username) {
        subParts.push('@' + testItem.owner_username);
      }
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

    if (state.loading) {
      const sk = document.createElement('div');
      sk.className = 'skeleton';
      sk.style.height = '52px';
      sk.style.margin = '6px 10px';
      sk.style.borderRadius = '6px';
      listWrap.appendChild(sk);
    }

    if (!state.exhausted) {
      const sentinel = document.createElement('div');
      sentinel.style.height = '1px';
      listWrap.appendChild(sentinel);
      if (scrollObserver) scrollObserver.disconnect();
      scrollObserver = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) loadMore();
      }, { root: listWrap, rootMargin: '200px' });
      scrollObserver.observe(sentinel);
    } else if (scrollObserver) {
      scrollObserver.disconnect();
    }
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
  if (state.tab === 'Статистика') return renderStatsTab(body, state, isOwner);
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

  // KPI grid — prototype order: Средний · Лучший · Время · Попыток
  const kpiGrid = document.createElement('div');
  kpiGrid.style.display = 'grid';
  kpiGrid.style.gridTemplateColumns = '1fr 1fr';
  kpiGrid.style.gap = '8px';
  kpiGrid.appendChild(buildKpi('Средний', '—'));
  kpiGrid.appendChild(buildKpi('Лучший', '—'));
  kpiGrid.appendChild(buildKpi('Время', '—'));
  kpiGrid.appendChild(buildKpi('Попыток', '—'));
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
    const resp = await listAttempts({ testId: test.id, limit: 50 });
    const items = Array.isArray(resp) ? resp : (resp.items || resp.attempts || []);
    state.attempts = items;
    const completed = items.filter(function (a) { return a.status === 'completed'; });
    const total = completed.length;
    const scores = completed.map(function (a) { return a.percentCorrect; }).filter(Number.isFinite);
    const avg = scores.length ? Math.round(scores.reduce(function (s, x) { return s + x; }, 0) / scores.length) : null;
    const best = scores.length ? Math.max.apply(Math, scores) : null;
    const durs = completed.map(function (a) { return a.totalDurationMs || 0; }).filter(function (d) { return d > 0; });
    const avgDurSec = durs.length ? Math.round(durs.reduce(function (s, x) { return s + x; }, 0) / durs.length / 1000) : null;
    function fmtDur(s) {
      if (s == null) return '—';
      if (s < 60) return s + 'с';
      const m = Math.floor(s / 60);
      const r = s % 60;
      return r ? m + 'м ' + r + 'с' : m + 'м';
    }
    // Order: Средний · Лучший · Время · Попыток
    kpiGrid.children[0].querySelector('.kpi__value').textContent = avg !== null ? avg + '%' : '—';
    kpiGrid.children[1].querySelector('.kpi__value').textContent = best !== null ? best + '%' : '—';
    kpiGrid.children[2].querySelector('.kpi__value').textContent = fmtDur(avgDurSec);
    kpiGrid.children[3].querySelector('.kpi__value').textContent = String(total);
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
    const resp = await listAttempts({ testId: state.detail.id, limit: 200 });
    const items = Array.isArray(resp) ? resp : (resp.items || resp.attempts || []);
    card.head.querySelector('.card__title').textContent = 'Все попытки · ' + items.length;
    fillAttemptsTable(slot, items, state.detail.id);
  } catch (e) {
    slot.appendChild(emptyHint('Не удалось загрузить попытки'));
  }
}

// ─── Tab: Вопросы (master-detail editor) ─────────────────────

function renderQuestionsTab(body, state, isOwner) {
  const test = state.detail;
  // Even when there are zero questions we still mount the editor so the
  // owner sees the "+ Добавить вопрос" button in the sidebar. The
  // detail pane stays empty in that case (the editor handles the empty
  // state) — viewers without questions see a read-only empty hint.
  const hint = document.createElement('div');
  hint.style.fontSize = '12px';
  hint.style.color = 'var(--ink-tertiary)';
  hint.style.marginBottom = '10px';
  hint.textContent = isOwner
    ? 'Редактируйте вопросы напрямую. Используйте кнопки «Картинка» и «Формула» для вставки изображений и LaTeX/MathML формул.'
    : 'Вы не владелец теста. Любые правки уйдут владельцу как предложение (CR).';
  body.appendChild(hint);

  if (!(test.questions || []).length && !isOwner) {
    body.appendChild(emptyHint('Вопросов пока нет'));
    return;
  }

  const host = document.createElement('div');
  body.appendChild(host);

  import('../../components/question-editor.js').then(function (mod) {
    function remount(currentTest) {
      mod.mountQuestionEditor({
        host: host,
        test: currentTest,
        canEdit: isOwner,
        onChange: async function () {
          try {
            const fresh = await getTest(currentTest.id);
            state.detail = fresh;
            remount(fresh);
          } catch (_) { /* best-effort */ }
        },
      });
    }
    remount(test);
  }).catch(function (e) {
    host.appendChild(emptyHint('Не удалось загрузить редактор: ' + (e && e.message || '')));
  });
}

// ─── Tab: Статистика ─────────────────────────────────────────

async function renderStatsTab(body, state, isOwner) {
  const test = state.detail;

  if (!isOwner) {
    const card = buildCard('Статистика по тесту');
    const hint = document.createElement('div');
    hint.style.fontSize = '13px';
    hint.style.color = 'var(--ink-secondary)';
    hint.textContent = 'Полная аналитика доступна только владельцу теста.';
    card.body.appendChild(hint);
    body.appendChild(card.el);
    return;
  }

  // Loading skeleton.
  const skel = document.createElement('div');
  skel.className = 'skeleton';
  skel.style.height = '320px';
  skel.style.borderRadius = 'var(--radius-md)';
  body.appendChild(skel);

  let analytics;
  try {
    analytics = await getOwnerAnalytics(test.id);
  } catch (e) {
    body.innerHTML = '';
    body.appendChild(emptyHint('Не удалось загрузить аналитику'));
    return;
  }
  body.innerHTML = '';

  const kpis = analytics.kpis || {};
  const diff = analytics.questionDifficulty || [];
  const dist = analytics.scoreDistribution || [];

  // Header row with CSV export.
  const headerRow = document.createElement('div');
  headerRow.style.display = 'flex';
  headerRow.style.justifyContent = 'space-between';
  headerRow.style.alignItems = 'center';
  headerRow.style.marginBottom = '12px';
  const heading = document.createElement('div');
  heading.style.fontSize = '13px';
  heading.style.fontWeight = 'var(--fw-semibold)';
  heading.textContent = 'Статистика по тесту';
  headerRow.appendChild(heading);
  const csvBtn = document.createElement('a');
  csvBtn.className = 'btn btn--ghost btn--small';
  csvBtn.href = '/api/stats/attempts.csv?testId=' + encodeURIComponent(test.id);
  csvBtn.setAttribute('download', '');
  csvBtn.appendChild(iconEl('upload', 13));
  const csvLbl = document.createElement('span');
  csvLbl.textContent = ' Экспорт CSV';
  csvBtn.appendChild(csvLbl);
  headerRow.appendChild(csvBtn);
  body.appendChild(headerRow);

  // KPI grid (4 tiles).
  const kpiGrid = document.createElement('div');
  kpiGrid.style.display = 'grid';
  kpiGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
  kpiGrid.style.gap = '8px';
  kpiGrid.style.marginBottom = '14px';
  kpiGrid.appendChild(buildKpi('Попыток',  String(kpis.totalAttempts || 0)));
  kpiGrid.appendChild(buildKpi('Уник. студ.', String(kpis.uniqueStudents || 0)));
  kpiGrid.appendChild(buildKpi('Средний', (kpis.avgScore != null ? kpis.avgScore : 0) + '%'));
  kpiGrid.appendChild(buildKpi('Прошли',  (kpis.passRate != null ? kpis.passRate : 0) + '%'));
  body.appendChild(kpiGrid);

  // Per-question accuracy heatmap (16 columns).
  const diffCard = buildCard('Точность по вопросам');
  const diffBody = diffCard.body;
  if (!diff.length) {
    diffBody.appendChild(emptyHint('Попыток ещё нет'));
  } else {
    // Legend.
    const legend = document.createElement('div');
    legend.style.display = 'flex';
    legend.style.gap = '12px';
    legend.style.fontSize = '11px';
    legend.style.color = 'var(--ink-tertiary)';
    legend.style.marginBottom = '8px';
    [['<60%', 'var(--error)'], ['60-80%', 'var(--warning)'], ['≥80%', 'var(--success)']].forEach(function (pair) {
      const item = document.createElement('span');
      item.style.display = 'inline-flex';
      item.style.alignItems = 'center';
      item.style.gap = '4px';
      const sw = document.createElement('span');
      sw.style.width = '10px';
      sw.style.height = '10px';
      sw.style.borderRadius = '2px';
      sw.style.background = pair[1];
      item.appendChild(sw);
      const lb = document.createElement('span');
      lb.textContent = pair[0];
      item.appendChild(lb);
      legend.appendChild(item);
    });
    diffBody.appendChild(legend);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(16, 1fr)';
    grid.style.gap = '4px';
    diff.forEach(function (q, i) {
      const cell = document.createElement('div');
      cell.style.aspectRatio = '1 / 1';
      cell.style.borderRadius = '3px';
      cell.style.fontSize = '10px';
      cell.style.display = 'flex';
      cell.style.alignItems = 'center';
      cell.style.justifyContent = 'center';
      cell.style.color = 'var(--paper)';
      cell.style.fontWeight = 'var(--fw-semibold)';
      const rate = q.correctRate || 0;
      cell.style.background = rate < 60 ? 'var(--error)'
                            : rate < 80 ? 'var(--warning)'
                            : 'var(--success)';
      cell.textContent = String(i + 1);
      cell.title = 'Q' + (i + 1) + ' · ' + rate + '% · n=' + q.totalAttempts;
      grid.appendChild(cell);
    });
    diffBody.appendChild(grid);
  }
  body.appendChild(diffCard.el);

  // Score distribution + Activity bars (two-up row).
  const twoUp = document.createElement('div');
  twoUp.style.display = 'grid';
  twoUp.style.gridTemplateColumns = '1fr 1fr';
  twoUp.style.gap = '12px';
  twoUp.style.marginTop = '14px';

  const distCard = buildCard('Распределение оценок');
  const distBody = distCard.body;
  if (!dist.length || dist.every(function (b) { return b.count === 0; })) {
    distBody.appendChild(emptyHint('Нет данных'));
  } else {
    const maxC = Math.max.apply(Math, dist.map(function (b) { return b.count; }));
    const bars = document.createElement('div');
    bars.style.display = 'flex';
    bars.style.alignItems = 'flex-end';
    bars.style.gap = '4px';
    bars.style.height = '120px';
    dist.forEach(function (b) {
      const col = document.createElement('div');
      col.style.flex = '1';
      col.style.display = 'flex';
      col.style.flexDirection = 'column';
      col.style.alignItems = 'center';
      col.style.gap = '4px';
      col.title = b.bucket + ' · ' + b.count + ' поп.';
      const bar = document.createElement('div');
      bar.style.width = '100%';
      bar.style.minHeight = '3px';
      const h = maxC > 0 ? Math.round(b.count / maxC * 96) : 3;
      bar.style.height = Math.max(3, h) + 'px';
      bar.style.background = 'var(--accent)';
      bar.style.borderRadius = '3px';
      col.appendChild(bar);
      const lbl = document.createElement('div');
      lbl.style.fontSize = '9px';
      lbl.style.color = 'var(--ink-tertiary)';
      lbl.textContent = b.bucket.replace('%', '');
      col.appendChild(lbl);
      bars.appendChild(col);
    });
    distBody.appendChild(bars);
  }
  twoUp.appendChild(distCard.el);

  const actCard = buildCard('Активность по неделям');
  const actBody = actCard.body;
  const activity = analytics.activityByWeek || [];
  if (!activity.length) {
    actBody.appendChild(emptyHint('Нет данных'));
  } else {
    const maxA = Math.max.apply(Math, activity.map(function (a) { return a.count; })) || 1;
    const bars = document.createElement('div');
    bars.style.display = 'flex';
    bars.style.alignItems = 'flex-end';
    bars.style.gap = '6px';
    bars.style.height = '120px';
    activity.forEach(function (a) {
      const col = document.createElement('div');
      col.style.flex = '1';
      col.style.display = 'flex';
      col.style.flexDirection = 'column';
      col.style.alignItems = 'center';
      col.style.gap = '4px';
      col.title = a.week + ' · ' + a.count + ' поп.';
      const bar = document.createElement('div');
      bar.style.width = '100%';
      const h = Math.max(3, Math.round(a.count / maxA * 96));
      bar.style.height = h + 'px';
      bar.style.background = 'var(--accent)';
      bar.style.borderRadius = '3px';
      col.appendChild(bar);
      const lbl = document.createElement('div');
      lbl.style.fontSize = '10px';
      lbl.style.color = 'var(--ink-tertiary)';
      lbl.textContent = a.week.split('-W').pop();
      col.appendChild(lbl);
      bars.appendChild(col);
    });
    actBody.appendChild(bars);
  }
  twoUp.appendChild(actCard.el);
  body.appendChild(twoUp);
}

// ─── Tab: Доступ ─────────────────────────────────────────────

async function renderAccessTab(body, state, isOwner) {
  const test = state.detail;

  const levelCard = buildCard('Уровень доступа');
  const levelRow = document.createElement('div');
  levelRow.style.display = 'flex';
  levelRow.style.gap = '8px';
  levelRow.style.flexWrap = 'wrap';
  const levelHint = document.createElement('div');
  levelHint.style.fontSize = '12px';
  levelHint.style.color = 'var(--ink-tertiary)';
  levelHint.style.marginTop = '8px';
  const LEVEL_DESC = {
    private: 'Только владелец видит и проходит тест.',
    shared:  'Доступ по списку приглашённых пользователей.',
    public:  'Тест виден в каталоге, доступен всем.',
  };
  function paintLevel() {
    Array.from(levelRow.children).forEach(function (c) {
      c.classList.toggle('chip--active', c.dataset.lvl === test.access_level);
    });
    levelHint.textContent = LEVEL_DESC[test.access_level] || '';
  }
  ['private', 'shared', 'public'].forEach(function (lvl) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.lvl = lvl;
    chip.textContent = lvl;
    if (isOwner) {
      chip.addEventListener('click', async function () {
        if (test.access_level === lvl) return;
        const prev = test.access_level;
        test.access_level = lvl;
        paintLevel();
        try {
          await updateTestAccess(test.id, lvl);
          toast('Уровень доступа обновлён', { tone: 'success' });
        } catch (e) {
          test.access_level = prev;
          paintLevel();
          toast('Не удалось изменить', { tone: 'error' });
        }
      });
    } else {
      chip.disabled = true;
      chip.style.cursor = 'default';
    }
    levelRow.appendChild(chip);
  });
  paintLevel();
  levelCard.body.appendChild(levelRow);
  levelCard.body.appendChild(levelHint);
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

  // Invite-by-username.
  const inviteCard = buildCard('Пригласить пользователя');
  inviteCard.el.style.marginTop = '14px';
  const inviteRow = document.createElement('div');
  inviteRow.style.display = 'flex';
  inviteRow.style.gap = '8px';
  const inviteInput = document.createElement('input');
  inviteInput.type = 'text';
  inviteInput.className = 'input';
  inviteInput.placeholder = '@username';
  inviteInput.style.flex = '1';
  const inviteBtn = document.createElement('button');
  inviteBtn.type = 'button';
  inviteBtn.className = 'btn btn--primary btn--small';
  inviteBtn.textContent = 'Пригласить';
  inviteRow.appendChild(inviteInput);
  inviteRow.appendChild(inviteBtn);
  inviteCard.body.appendChild(inviteRow);
  body.appendChild(inviteCard.el);

  // Shares.
  const sharesCard = buildCard('Поделено с');
  sharesCard.el.style.marginTop = '14px';
  const sharesSlot = document.createElement('div');
  sharesCard.body.appendChild(sharesSlot);
  body.appendChild(sharesCard.el);

  async function reloadShares() {
    sharesSlot.innerHTML = '';
    try {
      const shares = await getTestShares(test.id);
      if (!shares || shares.length === 0) {
        sharesSlot.appendChild(emptyHint('Тест пока никому не открыт'));
        return;
      }
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
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn btn--small btn--ghost';
        rm.textContent = '×';
        rm.title = 'Убрать доступ';
        rm.style.fontSize = '16px';
        rm.style.lineHeight = '1';
        rm.addEventListener('click', async function () {
          li.style.opacity = '0.5';
          try {
            await removeShare(test.id, s.user_id);
            toast('Доступ убран', { tone: 'success' });
            reloadShares();
          } catch (_) {
            li.style.opacity = '1';
            toast('Не удалось убрать доступ', { tone: 'error' });
          }
        });
        li.appendChild(rm);
        list.appendChild(li);
      });
      sharesSlot.appendChild(list);
    } catch (e) {
      sharesSlot.appendChild(emptyHint('Не удалось загрузить список'));
    }
  }

  inviteBtn.addEventListener('click', async function () {
    const username = (inviteInput.value || '').trim().replace(/^@/, '');
    if (!username) return;
    inviteBtn.disabled = true;
    try {
      await addShare(test.id, username);
      toast('Пользователь приглашён', { tone: 'success' });
      inviteInput.value = '';
      reloadShares();
    } catch (e) {
      toast((e && e.message) || 'Не удалось пригласить', { tone: 'error' });
    } finally {
      inviteBtn.disabled = false;
    }
  });
  inviteInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') inviteBtn.click();
  });

  reloadShares();

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

/**
 * First-run onboarding — three-card grid (Phase 5 final).
 *
 * Matches design-bundle-v2.1/proto-screens-main.jsx::FirstRun.
 * Centred container with a greeting caps + h1 + paragraph, then a
 * three-equal-column grid:
 *   1. Перетащить .docx — dashed accent border, opens file picker,
 *      passes the chosen file to /import via sessionStorage so the
 *      import wizard can pre-fill step 1.
 *   2. Из шаблона       — navigates to /import?template=mcq.
 *   3. Public-каталог    — navigates to /home with the Public chip selected.
 * Plus a ghost "Skip" link that toasts and continues (mostly a no-op
 * for now — once we have a `first_run_dismissed` flag in user prefs
 * this will persist the dismissal).
 */
function renderFirstRun(main) {
  const me = getState().user;
  const greeting = me && (me.display_name || me.username)
    ? (t('firstrun.caps') || 'Привет! Спасибо, что зарегистрировались.')
    : (t('firstrun.caps') || 'Привет! Спасибо, что зарегистрировались.');

  const wrap = document.createElement('div');
  wrap.style.flex = '1';
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = 'center';
  wrap.style.justifyContent = 'center';
  wrap.style.padding = 'var(--sp-5)';
  wrap.style.textAlign = 'center';
  wrap.style.gap = '14px';

  const caps = document.createElement('div');
  caps.className = 'caps';
  caps.textContent = greeting;
  wrap.appendChild(caps);

  const titleEl = document.createElement('h1');
  titleEl.style.fontSize = '30px';
  titleEl.style.letterSpacing = '-0.02em';
  titleEl.style.margin = '0';
  titleEl.style.maxWidth = '520px';
  titleEl.style.fontWeight = 'var(--fw-bold)';
  titleEl.textContent = t('firstrun.title') || 'Начнём с импорта вашего первого теста';
  wrap.appendChild(titleEl);

  const desc = document.createElement('p');
  desc.style.fontSize = 'var(--fs-sm)';
  desc.style.color = 'var(--ink-secondary)';
  desc.style.maxWidth = '520px';
  desc.style.margin = '0';
  desc.textContent = t('firstrun.desc')
    || 'Перетащите файл .docx — мы сами найдём вопросы, варианты ответов и правильные.';
  wrap.appendChild(desc);

  // Three-card grid.
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr 1fr';
  grid.style.gap = '12px';
  grid.style.width = '100%';
  grid.style.maxWidth = '680px';
  grid.style.marginTop = '14px';

  // Hidden file input — owned by the .docx card.
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', function () {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    // Stash a hint for the import screen — actual file blob can't survive
    // a navigation, so we just record the intent and let import.js pick up.
    try {
      sessionStorage.setItem('firstrun:wanted_upload', '1');
    } catch (_) { /* private mode */ }
    navigate('/import');
  });
  wrap.appendChild(fileInput);

  grid.appendChild(buildFirstRunCard({
    accent: true,
    iconKind: 'upload',
    title: t('firstrun.card.docx.title') || 'Перетащить .docx',
    hint:  t('firstrun.card.docx.hint')  || 'или нажмите для выбора',
    onClick: function () { fileInput.click(); },
  }));
  grid.appendChild(buildFirstRunCard({
    iconKind: 'doc',
    title: t('firstrun.card.template.title') || 'Из шаблона',
    hint:  t('firstrun.card.template.hint')  || 'multiple-choice, true/false',
    onClick: function () { navigate('/import?template=mcq'); },
  }));
  grid.appendChild(buildFirstRunCard({
    iconKind: 'globe',
    title: t('firstrun.card.discover.title') || 'Public-каталог',
    hint:  t('firstrun.card.discover.hint')  || 'пройти готовый',
    onClick: function () { navigate('/home?filter=public'); },
  }));
  wrap.appendChild(grid);

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'btn btn--ghost btn--small';
  skip.style.marginTop = '6px';
  skip.style.color = 'var(--ink-tertiary)';
  skip.textContent = t('firstrun.skip') || 'Пропустить — посмотрю позже';
  skip.addEventListener('click', function () {
    // No persistence yet — next reload will show the screen again
    // until the user has at least one test. Keep the affordance so the
    // empty home screen isn't a dead end.
    navigate('/home?filter=public');
  });
  wrap.appendChild(skip);

  main.appendChild(wrap);
}

function buildFirstRunCard(opts) {
  const card = document.createElement('button');
  card.type = 'button';
  card.style.padding = '24px 16px';
  card.style.borderRadius = 'var(--radius-md)';
  card.style.textAlign = 'center';
  card.style.cursor = 'pointer';
  card.style.font = 'inherit';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.alignItems = 'center';
  card.style.gap = '8px';
  card.style.transition = 'box-shadow var(--transition-fast), background var(--transition-fast)';

  if (opts.accent) {
    card.style.border = '2px dashed var(--accent)';
    card.style.background = 'var(--accent-soft)';
    card.style.color = 'var(--ink)';
  } else {
    card.style.border = 'var(--border)';
    card.style.background = 'var(--paper)';
    card.style.color = 'var(--ink)';
  }

  const ic = document.createElement('span');
  ic.style.lineHeight = '0';
  ic.appendChild(iconEl(opts.iconKind, 24));
  card.appendChild(ic);

  const titleEl = document.createElement('div');
  titleEl.style.fontWeight = 'var(--fw-semibold)';
  titleEl.style.fontSize = 'var(--fs-md)';
  titleEl.textContent = opts.title;
  card.appendChild(titleEl);

  const hintEl = document.createElement('div');
  hintEl.style.fontSize = 'var(--fs-xs)';
  hintEl.style.color = 'var(--ink-tertiary)';
  hintEl.textContent = opts.hint;
  card.appendChild(hintEl);

  card.addEventListener('click', opts.onClick);
  return card;
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
