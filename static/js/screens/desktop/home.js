/**
 * screens/desktop/home.js — Desktop home screen (Phase 2)
 * 3-column layout: CollectionsSidebar | VerticalRail | Main content
 */
import { listTests, getTest, createTest, updateTest, deleteTest } from '../../api/tests.js';
import { addQuestion, updateQuestion, deleteQuestion } from '../../api/questions.js';
import { getMyAggregate, getHeatmap } from '../../api/statistics.js';
import { getTestAccess, getTestShares, updateTestAccess, removeShare } from '../../api/access.js';
import { navigate } from '../../router.js';
import { getState } from '../../state.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { openSearchPalette } from '../../search-palette.js';
import { getResolvedTheme, setTheme } from '../../utils/theme.js';
import { escHtml } from '../../utils/escape.js';
import { formatSeconds } from '../../utils/format.js';

// ─── Module-level screen state ────────────────────────────────
/** @type {HTMLElement|null} */
let _root = null;
// Cancellation token: incremented on each render() call so that
// stale async continuations (from a previous route) don't overwrite
// the screen after the user has already navigated away.
let _renderToken = 0;
let _tests = [];
let _selectedId = null;
let _railTab = 'info';
let _filter = 'all';
let _query = '';
/** @type {any} */
let _testStats = null;
/** @type {any} */
let _testAccess = null;
/** @type {any} */
let _testShares = null;
/** @type {any[]} */
let _testAttempts = [];
/** @type {any} */
let _heatmap = null;
/** @type {any} */
let _testFull = null;
/** @type {number|string|null} */
let _editQId = null;

// ─── Computed helpers ─────────────────────────────────────────

function getSelected() {
  return _tests.find(t => t.id === _selectedId) || null;
}

function filteredTests() {
  const state = getState();
  const userId = state.user?.id;
  return _tests.filter(test => {
    // Filter
    if (_filter === 'my' && test.owner_id !== userId) return false;
    if (_filter === 'shared' && (test.access_level !== 'shared' || test.owner_id === userId)) return false;
    if (_filter === 'public' && test.access_level !== 'public') return false;
    // Search
    if (_query && !test.title.toLowerCase().includes(_query.toLowerCase())) return false;
    return true;
  });
}

function getTestTag(test) {
  const state = getState();
  if (test.owner_id === state.user?.id) return t('common.my') || 'My';
  if (test.access_level === 'public') return t('common.public') || 'Public';
  return t('common.shared') || 'Shared';
}

// ─── SVG Sparkline ────────────────────────────────────────────

function buildSparklineSvg(values, width = 280, height = 120) {
  if (!values || values.length < 2) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <text x="${width/2}" y="${height/2}" text-anchor="middle" font-size="12" fill="var(--ink-mute)">No data</text>
    </svg>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 8;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const xs = values.map((_, i) => pad + (i / (values.length - 1)) * w);
  const ys = values.map(v => pad + h - ((v - min) / range) * h);
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const areaPath = `M${xs[0]},${height - pad} L${pts.split(' ').map((p, i) => i === 0 ? `${xs[0]},${ys[0]}` : p).join(' L')} L${xs[xs.length-1]},${height - pad} Z`;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible">
    <defs>
      <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#spark-grad)"/>
    <polyline
      points="${pts}"
      fill="none"
      stroke="var(--accent)"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    ${xs.map((x, i) => `<circle cx="${x}" cy="${ys[i]}" r="3" fill="var(--accent)" stroke="var(--paper)" stroke-width="2"/>`).join('')}
  </svg>`;
}

// ─── Heatmap ──────────────────────────────────────────────────

function buildHeatmapGrid(data) {
  // data: { date: 'YYYY-MM-DD', count: n }[]
  // Build 16 weeks × 7 days grid (column-major: Mon→Sun, week 0 = oldest)
  const WEEKS = 16;
  const today = new Date();
  const cells = [];

  const countByDate = {};
  if (Array.isArray(data)) {
    for (const d of data) {
      countByDate[d.date] = d.count || 0;
    }
  }

  // Build day-index array (row = day of week 0=Mon, col = week)
  // We'll render as a flat array of 16*7 cells, then use CSS grid
  // Going from oldest (top-left) to newest (bottom-right)
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (WEEKS * 7 - 1));

  for (let d = 0; d < WEEKS * 7; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const key = date.toISOString().slice(0, 10);
    const count = countByDate[key] || 0;
    const lvl = count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : 3;
    cells.push(`<div class="heatmap-cell" data-lvl="${lvl}" title="${key}: ${count} attempts"></div>`);
  }

  return `<div class="heatmap-grid" style="grid-template-columns:repeat(${WEEKS},1fr);grid-template-rows:repeat(7,1fr);">
    ${cells.join('')}
  </div>`;
}

// ─── TopBar ───────────────────────────────────────────────────

function buildTopBar() {
  const bar = document.createElement('div');
  bar.className = 'dh__topbar';

  // Logo
  const logo = document.createElement('div');
  logo.className = 'dh-topbar__logo';
  logo.textContent = 'TestMaster';
  logo.addEventListener('click', () => _mount(_root));

  // Search bar
  const search = document.createElement('div');
  search.className = 'dh-topbar__search';
  search.setAttribute('role', 'button');
  search.setAttribute('tabindex', '0');
  search.appendChild(iconEl('search', 14));
  const searchText = document.createElement('span');
  searchText.textContent = t('nav.search') || 'Search tests, questions…';
  search.appendChild(searchText);
  const hint = document.createElement('span');
  hint.className = 'dh-topbar__search-hint';
  hint.textContent = '⌘K';
  search.appendChild(hint);

  // Open search palette on click or Enter
  search.addEventListener('click', () => openSearchPalette());
  search.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openSearchPalette(); });

  // Actions
  const actions = document.createElement('div');
  actions.className = 'dh-topbar__actions';

  // Bell
  const bell = document.createElement('button');
  bell.className = 'dh-topbar__icon-btn';
  bell.setAttribute('aria-label', t('nav.notifications') || 'Notifications');
  bell.appendChild(iconEl('bell', 16));
  // Notification badge — populated asynchronously
  const badge = document.createElement('span');
  badge.className = 'dh-topbar__badge';
  badge.style.display = 'none';
  bell.appendChild(badge);
  bell.addEventListener('click', () => navigate('/notifications'));

  // Theme toggle
  const themeBtn = document.createElement('button');
  themeBtn.className = 'dh-topbar__icon-btn';
  themeBtn.setAttribute('aria-label', 'Toggle theme');
  themeBtn.appendChild(iconEl(getResolvedTheme() === 'dark' ? 'sun' : 'moon', 16));
  themeBtn.addEventListener('click', () => {
    const cur = getResolvedTheme();
    setTheme(cur === 'dark' ? 'light' : 'dark');
    themeBtn.innerHTML = '';
    themeBtn.appendChild(iconEl(getResolvedTheme() === 'dark' ? 'sun' : 'moon', 16));
  });

  // Settings
  const settings = document.createElement('button');
  settings.className = 'dh-topbar__icon-btn';
  settings.setAttribute('aria-label', t('nav.settings') || 'Settings');
  settings.appendChild(iconEl('cog', 16));
  settings.addEventListener('click', () => navigate('/settings'));

  // User
  const user = document.createElement('button');
  user.className = 'dh-topbar__icon-btn';
  user.setAttribute('aria-label', t('nav.profile') || 'Profile');
  const state = getState();
  if (state.user?.avatar_url) {
    const img = document.createElement('img');
    img.src = state.user.avatar_url;
    img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
    user.appendChild(img);
  } else {
    user.appendChild(iconEl('user', 16));
  }
  user.addEventListener('click', () => navigate('/profile'));

  actions.append(bell, themeBtn, settings, user);
  bar.append(logo, search, actions);
  return bar;
}

// ─── Sidebar ──────────────────────────────────────────────────

function buildSidebar() {
  const aside = document.createElement('div');
  aside.className = 'dh__sidebar';

  // Search
  const searchWrap = document.createElement('div');
  searchWrap.className = 'dh-sidebar__search';
  const searchBox = document.createElement('div');
  searchBox.className = 'dh-sidebar__search-input';
  searchBox.appendChild(iconEl('search', 14));
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = t('nav.search') || 'Search collections…';
  searchInput.value = _query;
  searchInput.addEventListener('input', e => {
    _query = e.target.value;
    renderList();
  });
  searchBox.appendChild(searchInput);
  searchWrap.appendChild(searchBox);

  // Filter chips
  const filters = document.createElement('div');
  filters.className = 'dh-sidebar__filters';

  const state = getState();
  const userId = state.user?.id;
  const myCnt = _tests.filter(t => t.owner_id === userId).length;
  const sharedCnt = _tests.filter(t => t.access_level === 'shared' && t.owner_id !== userId).length;
  const publicCnt = _tests.filter(t => t.access_level === 'public').length;

  const filterDefs = [
    ['all', `${t('common.all') || 'All'} ${_tests.length}`],
    ['my', `${t('common.my') || 'My'} ${myCnt}`],
    ['shared', `${t('common.shared') || 'Shared'} ${sharedCnt}`],
    ['public', `${t('common.public') || 'Public'} ${publicCnt}`],
  ];

  for (const [id, label] of filterDefs) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip--small' + (id === _filter ? ' chip--active' : '');
    chip.textContent = label;
    chip.addEventListener('click', () => {
      _filter = id;
      _mount(_root);
    });
    filters.appendChild(chip);
  }

  // Create + Import buttons
  const actionsRow = document.createElement('div');
  actionsRow.className = 'dh-sidebar__actions';

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'btn btn--primary btn--small';
  createBtn.style.flex = '1';
  createBtn.appendChild(iconEl('plus', 14));
  const createSpan = document.createElement('span');
  createSpan.textContent = t('test.create') || 'Create';
  createBtn.appendChild(createSpan);
  createBtn.addEventListener('click', () => openCreateTestModal());

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'btn btn--small';
  importBtn.style.flex = '1';
  importBtn.appendChild(iconEl('upload', 14));
  const importSpan = document.createElement('span');
  importSpan.textContent = t('test.import') || 'Import';
  importBtn.appendChild(importSpan);
  importBtn.addEventListener('click', () => navigate('/import'));

  actionsRow.append(createBtn, importBtn);

  // Collection list
  const list = document.createElement('div');
  list.className = 'dh-sidebar__list';
  list.id = 'dh-coll-list';

  function renderList() {
    list.innerHTML = '';
    const visible = filteredTests();
    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'dh-sidebar__empty';
      empty.textContent = _query ? (t('common.no_results') || 'No results') : (t('test.empty') || 'No collections yet');
      list.appendChild(empty);
      return;
    }
    for (const test of visible) {
      const item = document.createElement('div');
      item.className = 'dh-coll' + (test.id === _selectedId ? ' dh-coll--active' : '');

      const row = document.createElement('div');
      row.className = 'dh-coll__row';

      const title = document.createElement('div');
      title.className = 'dh-coll__title';
      title.textContent = test.title;

      const tag = document.createElement('div');
      tag.className = 'dh-coll__tag';
      tag.textContent = getTestTag(test);

      row.append(title, tag);

      const meta = document.createElement('div');
      meta.className = 'dh-coll__meta';
      const qCount = test.questionCount ?? test.question_count ?? '?';
      const aCount = test.attempt_count ?? 0;
      meta.textContent = `${qCount} q · ${aCount} attempts`;

      item.append(row, meta);
      item.addEventListener('click', async () => {
        _selectedId = test.id;
        _railTab = 'info';
        await loadTestData(test.id);
        _mount(_root);
      });
      list.appendChild(item);
    }
  }

  renderList();
  aside.append(searchWrap, filters, actionsRow, list);
  return aside;
}

// ─── Vertical Rail ────────────────────────────────────────────

const RAIL_TABS = [
  ['doc',   'Info',     'info'],
  ['chart', 'Stats',    'stats'],
  ['edit',  'Edit',     'edit'],
  ['clock', 'Activity', 'activity'],
  ['user',  'Access',   'access'],
];

function buildRail() {
  const rail = document.createElement('div');
  rail.className = 'dh__rail';

  for (const [iconKind, label, tab] of RAIL_TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dh-rail__btn' + (tab === _railTab ? ' dh-rail__btn--active' : '');
    btn.setAttribute('aria-label', label);
    btn.appendChild(iconEl(iconKind, 20));
    const lbl = document.createElement('span');
    lbl.className = 'dh-rail__label';
    lbl.textContent = label;
    btn.appendChild(lbl);
    btn.addEventListener('click', () => {
      _railTab = tab;
      _mount(_root);
    });
    rail.appendChild(btn);
  }

  return rail;
}

// ─── Rail tab content ─────────────────────────────────────────

function buildRailInfo() {
  const test = getSelected();
  if (!test) return buildEmptyPanel();

  const wrap = document.createElement('div');

  // Header
  const header = document.createElement('div');
  header.className = 'dh-info__header';

  const left = document.createElement('div');
  left.className = 'dh-info__header-left';

  const cap = document.createElement('div');
  cap.style.cssText = 'font-size:11px;color:var(--ink-mute);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;';
  cap.textContent = t('test.collection') || 'collection';

  const title = document.createElement('h1');
  title.className = 'dh-info__title';
  title.textContent = test.title;

  const chips = document.createElement('div');
  chips.className = 'dh-info__chips';

  const tagChip = document.createElement('span');
  tagChip.className = 'chip chip--small chip--active';
  tagChip.textContent = '◆ ' + getTestTag(test);

  const qChip = document.createElement('span');
  qChip.className = 'chip chip--small';
  const qCount = test.questionCount ?? test.question_count ?? 0;
  qChip.textContent = `${qCount} ${t('test.questions') || 'questions'}`;

  const aChip = document.createElement('span');
  aChip.className = 'chip chip--small';
  aChip.textContent = `${test.attempt_count ?? 0} ${t('test.attempts') || 'attempts'}`;

  chips.append(tagChip, qChip, aChip);
  left.append(cap, title, chips);

  // Action buttons
  const actionBtns = document.createElement('div');
  actionBtns.className = 'dh-info__actions';

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn btn--primary';
  startBtn.appendChild(iconEl('play', 16));
  const startSpan = document.createElement('span');
  startSpan.textContent = t('test.start') || 'Start test';
  startBtn.appendChild(startSpan);
  startBtn.addEventListener('click', () => navigate(`/test/${test.id}/take`));

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'btn';
  settingsBtn.appendChild(iconEl('cog', 16));
  const settingsSpan = document.createElement('span');
  settingsSpan.textContent = t('test.settings') || 'Settings';
  settingsBtn.appendChild(settingsSpan);
  settingsBtn.addEventListener('click', () => openCollectionSettingsModal(test));

  actionBtns.append(startBtn, settingsBtn);
  header.append(left, actionBtns);

  // Main grid: description + at-a-glance
  const grid = document.createElement('div');
  grid.className = 'dh-info__grid';

  // Description card
  const descCard = document.createElement('div');
  descCard.className = 'card';

  const descTitle = document.createElement('div');
  descTitle.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:8px;';
  descTitle.textContent = t('test.description') || 'Description';

  const descText = document.createElement('div');
  descText.className = 'dh-info__desc';
  descText.style.padding = '0';
  descText.textContent = test.description || (t('test.no_description') || 'No description provided.');
  descCard.append(descTitle, descText);

  // At-a-glance KPI 2×2
  const kpiCard = document.createElement('div');
  kpiCard.className = 'card';

  const kpiTitle = document.createElement('div');
  kpiTitle.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:10px;';
  kpiTitle.textContent = t('stats.at_glance') || 'At a glance';

  const kpiGrid = document.createElement('div');
  kpiGrid.className = 'kpi-grid kpi-grid--2';

  const stats = _testStats;
  const kpiData = [
    [qCount, t('test.questions') || 'questions'],
    [test.attempt_count ?? 0, t('test.attempts') || 'attempts'],
    [stats?.avg_score != null ? `${Math.round(stats.avg_score)}%` : '—', t('stats.your_avg') || 'your avg'],
    [stats?.avg_duration_seconds != null ? formatDuration(stats.avg_duration_seconds) : '—', t('stats.avg_time') || 'avg time'],
  ];

  for (const [val, lbl] of kpiData) {
    const tile = document.createElement('div');
    tile.className = 'kpi-tile';
    const v = document.createElement('div');
    v.className = 'kpi-tile__value';
    v.textContent = val;
    const l = document.createElement('div');
    l.className = 'kpi-tile__label';
    l.textContent = lbl;
    tile.append(v, l);
    kpiGrid.appendChild(tile);
  }

  kpiCard.append(kpiTitle, kpiGrid);
  grid.append(descCard, kpiCard);

  // Recent attempts table
  const attemptsCard = document.createElement('div');
  attemptsCard.className = 'card';
  attemptsCard.style.marginTop = '16px';

  const attRow = document.createElement('div');
  attRow.className = 'dh-section__head';
  const attTitle = document.createElement('div');
  attTitle.style.cssText = 'font-size:14px;font-weight:600;';
  attTitle.textContent = t('stats.recent_attempts') || 'Recent attempts';
  attRow.appendChild(attTitle);
  attemptsCard.appendChild(attRow);

  if (_testAttempts.length === 0) {
    const noAtt = document.createElement('p');
    noAtt.style.cssText = 'font-size:13px;color:var(--ink-mute);margin-top:8px;';
    noAtt.textContent = t('stats.no_attempts') || 'No attempts yet.';
    attemptsCard.appendChild(noAtt);
  } else {
    const table = document.createElement('table');
    table.className = 'attempts-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>
      <th>${t('stats.user') || 'User'}</th>
      <th>${t('stats.score') || 'Score'}</th>
      <th>${t('stats.duration') || 'Duration'}</th>
      <th>${t('stats.date') || 'Date'}</th>
    </tr>`;
    const tbody = document.createElement('tbody');

    for (const att of _testAttempts.slice(0, 6)) {
      const tr = document.createElement('tr');
      const score = att.score != null ? `${Math.round(att.score)}%` : '—';
      const dur = att.duration_seconds != null ? formatDuration(att.duration_seconds) : '—';
      const date = att.finished_at ? formatRelative(att.finished_at) : '—';
      tr.innerHTML = `
        <td style="font-weight:500;">${escHtml(att.username || 'You')}</td>
        <td style="color:${(att.score ?? 0) >= 70 ? 'var(--accent)' : '#c4554a'}">${score}</td>
        <td style="color:var(--ink-mute)">${dur}</td>
        <td style="color:var(--ink-mute)">${date}</td>
      `;
      tbody.appendChild(tr);
    }

    table.append(thead, tbody);
    attemptsCard.appendChild(table);
  }

  wrap.append(header, grid, attemptsCard);
  return wrap;
}

function buildRailStats() {
  const test = getSelected();
  if (!test) return buildEmptyPanel();

  const wrap = document.createElement('div');

  const h = document.createElement('h2');
  h.style.cssText = 'font:700 22px/1.2 Inter,sans-serif;letter-spacing:-0.01em;';
  h.textContent = t('nav.stats') || 'Statistics';
  const sub = document.createElement('p');
  sub.style.cssText = 'font-size:12px;color:var(--ink-mute);margin-top:3px;';
  sub.textContent = (t('stats.your_progress') || 'your progress') + ' · ' + test.title;
  wrap.append(h, sub);

  // KPI row
  const stats = _testStats;
  const kpiGrid = document.createElement('div');
  kpiGrid.className = 'kpi-grid kpi-grid--4';
  kpiGrid.style.marginTop = '16px';

  const kpiData = [
    [stats?.avg_score != null ? `${Math.round(stats.avg_score)}%` : '—', t('stats.accuracy') || 'accuracy'],
    [stats?.current_streak ?? '—', `${t('stats.streak') || 'streak'} 🔥`],
    [stats?.total_attempts ?? _testAttempts.length, t('test.attempts') || 'attempts'],
    [stats?.avg_duration_seconds != null ? formatDuration(stats.avg_duration_seconds) : '—', t('stats.avg_time') || 'avg time'],
  ];

  for (const [val, lbl] of kpiData) {
    const tile = document.createElement('div');
    tile.className = 'kpi-tile';
    const v = document.createElement('div');
    v.className = 'kpi-tile__value';
    v.textContent = val;
    const l = document.createElement('div');
    l.className = 'kpi-tile__label';
    l.textContent = lbl;
    tile.append(v, l);
    kpiGrid.appendChild(tile);
  }
  wrap.appendChild(kpiGrid);

  // Charts row
  const topRow = document.createElement('div');
  topRow.className = 'dh-stats__top';
  topRow.style.cssText = 'display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-top:16px;';

  // Sparkline card
  const sparkCard = document.createElement('div');
  sparkCard.className = 'card sparkline-wrap';
  const sparkTitle = document.createElement('div');
  sparkTitle.className = 'sparkline-wrap__title';
  sparkTitle.textContent = t('stats.accuracy_trend') || 'Accuracy over time';
  sparkCard.appendChild(sparkTitle);
  // Extract scores from attempts for sparkline
  const sparkValues = _testAttempts
    .slice().reverse()
    .map(a => a.score)
    .filter(s => s != null)
    .slice(-12);
  sparkCard.insertAdjacentHTML('beforeend', buildSparklineSvg(sparkValues.length >= 2 ? sparkValues : null, 280, 110));

  // Weak/Strong topics card
  const topicsCard = document.createElement('div');
  topicsCard.className = 'card';
  topicsCard.style.padding = '14px 16px';
  const topicsTitle = document.createElement('div');
  topicsTitle.style.cssText = 'font-size:13px;font-weight:600;margin-bottom:8px;';
  topicsTitle.textContent = t('stats.weak_topics') || 'Weak / strong topics';
  topicsCard.appendChild(topicsTitle);

  const weakQs = stats?.weak_questions || [];
  if (weakQs.length > 0) {
    for (const wq of weakQs.slice(0, 5)) {
      const pct = Math.round((wq.correct_rate ?? 0.5) * 100);
      const row = document.createElement('div');
      row.className = 'topic-row';
      row.innerHTML = `
        <div class="topic-row__head">
          <span>${escHtml(wq.question_text?.slice(0, 35) || `Q#${wq.question_id}`)}</span>
          <span>${pct}%</span>
        </div>
        <div class="topic-bar">
          <div class="topic-bar__fill${pct < 60 ? ' topic-bar__fill--weak' : ''}" style="width:${pct}%"></div>
        </div>`;
      topicsCard.appendChild(row);
    }
  } else {
    const noData = document.createElement('p');
    noData.style.cssText = 'font-size:12px;color:var(--ink-mute);margin-top:8px;';
    noData.textContent = t('stats.no_data') || 'No statistics yet. Complete an attempt first.';
    topicsCard.appendChild(noData);
  }

  topRow.append(sparkCard, topicsCard);
  wrap.appendChild(topRow);

  // Heatmap
  const heatCard = document.createElement('div');
  heatCard.className = 'card heatmap-wrap';
  heatCard.style.marginTop = '16px';
  const heatTitle = document.createElement('div');
  heatTitle.className = 'heatmap-wrap__title';
  heatTitle.textContent = t('stats.activity') || 'Activity';
  heatCard.appendChild(heatTitle);
  heatCard.insertAdjacentHTML('beforeend', buildHeatmapGrid(_heatmap));
  wrap.appendChild(heatCard);

  return wrap;
}

function buildRailEdit() {
  const test = getSelected();
  if (!test) return buildEmptyPanel();

  const isOwner = getState().user?.id === test.owner_id;
  return isOwner ? buildRailEditOwner(test) : buildRailEditNonOwner(test);
}

// ── Non-owner: propose changes prompt ─────────────────────────

function buildRailEditNonOwner(test) {
  const wrap = document.createElement('div');
  wrap.className = 'dh-edit dh-edit--centered';

  const iconWrap = document.createElement('div');
  iconWrap.style.cssText = 'margin-bottom:16px;opacity:.5;';
  iconWrap.appendChild(iconEl('edit', 40));

  const title = document.createElement('h2');
  title.style.cssText = 'font:700 20px/1.2 Inter,sans-serif;margin-bottom:10px;';
  title.textContent = t('test.propose_edit') || 'Propose changes';

  const desc = document.createElement('p');
  desc.style.cssText = 'font-size:13px;color:var(--ink-mute);margin-bottom:24px;line-height:1.6;max-width:300px;text-align:center;';
  desc.textContent = t('test.cr_tip') || 'You are not the owner of this collection. You can propose edits via Change Requests — the owner will review them.';

  const crBtn = document.createElement('button');
  crBtn.type = 'button';
  crBtn.className = 'btn btn--primary';
  crBtn.addEventListener('click', () => navigate(`/change-requests/${test.id}`));
  crBtn.appendChild(iconEl('edit', 14));
  const crSpan = document.createElement('span');
  crSpan.textContent = ` ${t('test.open_cr') || 'Open change requests'}`;
  crBtn.appendChild(crSpan);

  wrap.append(iconWrap, title, desc, crBtn);
  return wrap;
}

// ── Owner: real question list + edit form ─────────────────────

function _blocksToText(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map(b =>
    b.text || (Array.isArray(b.inlines) ? b.inlines.map(i => i.text || '').join('') : '')
  ).join(' ').trim();
}

function buildRailEditOwner(test) {
  const questions = _testFull?.questions || [];

  const wrap = document.createElement('div');
  wrap.className = 'dh-edit';

  // ── Question list (left) ──────────────────────────────────────
  const listPanel = document.createElement('div');
  listPanel.className = 'dh-edit__list';

  const listHeader = document.createElement('div');
  listHeader.className = 'dh-edit__list-header';

  const listTitle = document.createElement('div');
  listTitle.className = 'dh-edit__list-title';
  listTitle.textContent = `${t('test.questions') || 'Questions'} · ${questions.length}`;

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--ghost btn--small';
  addBtn.appendChild(iconEl('plus', 13));
  const addBtnSpan = document.createElement('span');
  addBtnSpan.textContent = ` ${t('test.add_question') || 'Add'}`;
  addBtn.appendChild(addBtnSpan);
  addBtn.addEventListener('click', () => { _editQId = '__new__'; _mount(_root); });

  listHeader.append(listTitle, addBtn);

  const listScroll = document.createElement('div');
  listScroll.className = 'dh-edit__list-scroll';

  if (!_testFull) {
    // Still loading — show skeletons
    for (let i = 0; i < 6; i++) {
      const sk = document.createElement('div');
      sk.className = 'skeleton';
      sk.style.cssText = 'height:44px;border-radius:6px;';
      listScroll.appendChild(sk);
    }
  } else if (questions.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--ink-mute);font-size:13px;text-align:center;padding:32px 8px;';
    empty.textContent = t('test.no_questions') || 'No questions yet.';
    listScroll.appendChild(empty);
  }

  for (let idx = 0; idx < questions.length; idx++) {
    const q = questions[idx];
    const card = document.createElement('div');
    card.className = 'dh-qcard' + (q.id === _editQId ? ' dh-qcard--active' : '');

    const meta = document.createElement('div');
    meta.className = 'dh-qcard__meta';

    const numSpan = document.createElement('span');
    numSpan.textContent = `#${idx + 1}`;

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn--ghost btn--icon dh-qcard__del';
    delBtn.title = t('common.delete') || 'Delete';
    delBtn.appendChild(iconEl('x', 11));
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(t('test.confirm_delete_q') || 'Delete this question?')) return;
      try {
        await deleteQuestion(test.id, q.id);
        _testFull.questions = _testFull.questions.filter(x => x.id !== q.id);
        if (_editQId === q.id) _editQId = null;
        _mount(_root);
      } catch (err) {
        console.error('[home] deleteQuestion:', err);
      }
    });

    meta.append(numSpan, delBtn);

    const preview = document.createElement('div');
    preview.className = 'dh-qcard__preview';
    const previewText = _blocksToText(q.question?.blocks);
    preview.textContent = previewText.slice(0, 90) || `${t('test.question') || 'Question'} #${idx + 1}`;

    card.append(meta, preview);
    card.addEventListener('click', () => { _editQId = q.id; _mount(_root); });
    listScroll.appendChild(card);
  }

  listPanel.append(listHeader, listScroll);

  // ── Detail panel (right) ─────────────────────────────────────
  const detailPanel = document.createElement('div');
  detailPanel.className = 'dh-edit__panel';

  const selectedQ = questions.find(q => q.id === _editQId);

  if (_editQId === '__new__') {
    detailPanel.appendChild(_buildQuestionForm(test.id, null, questions));
  } else if (selectedQ) {
    detailPanel.appendChild(_buildQuestionForm(test.id, selectedQ, questions));
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'dh-edit__hint';
    placeholder.innerHTML = `
      <div class="dh-edit__hint-icon">${iconEl('edit', 36).outerHTML}</div>
      <div class="dh-edit__hint-title">${t('test.select_question') || 'Select a question'}</div>
      <p>${t('test.edit_tip') || 'Click any question on the left to start editing, or add a new one.'}</p>
    `;
    detailPanel.appendChild(placeholder);
  }

  wrap.append(listPanel, detailPanel);
  return wrap;
}

// ── Question edit form ────────────────────────────────────────

function _buildQuestionForm(testId, q, allQuestions) {
  const isNew = !q;
  const KEYS = ['A', 'B', 'C', 'D'];

  const form = document.createElement('div');
  form.className = 'dh-qform';

  // Title
  const formTitle = document.createElement('div');
  formTitle.className = 'dh-qform__title';
  formTitle.textContent = isNew
    ? (t('test.new_question') || 'New question')
    : `${t('test.question') || 'Question'} #${allQuestions.indexOf(q) + 1}`;
  form.appendChild(formTitle);

  // Question text
  const qLabel = document.createElement('label');
  qLabel.className = 'dh-qform__label';
  qLabel.textContent = t('test.question_text') || 'Question';

  const qText = document.createElement('textarea');
  qText.className = 'dh-qform__textarea';
  qText.rows = 3;
  qText.placeholder = t('test.question_placeholder') || 'Type the question here…';
  if (q) qText.value = _blocksToText(q.question?.blocks);

  form.append(qLabel, qText);

  // Options
  const optsLabel = document.createElement('div');
  optsLabel.className = 'dh-qform__label';
  optsLabel.style.marginTop = '14px';
  optsLabel.textContent = t('test.options') || 'Answer options';
  form.appendChild(optsLabel);

  const optInputs = [];
  const opts = q?.options?.slice(0, 4) || [{}, {}, {}, {}];
  while (opts.length < 4) opts.push({});

  for (let i = 0; i < 4; i++) {
    const opt = opts[i] || {};
    const optRow = document.createElement('div');
    optRow.className = 'dh-qform__opt-row';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `qform-correct-${testId}`;
    radio.value = String(i);
    radio.className = 'dh-qform__radio';
    if (opt.isCorrect) radio.checked = true;

    const keySpan = document.createElement('span');
    keySpan.className = 'dh-qform__opt-key';
    keySpan.textContent = KEYS[i];

    const optInput = document.createElement('input');
    optInput.type = 'text';
    optInput.className = 'input dh-qform__opt-input';
    optInput.placeholder = `${t('test.option') || 'Option'} ${KEYS[i]}`;
    optInput.value = _blocksToText(opt.content?.blocks) || (opt.text || '');

    optInputs.push({ input: optInput, radio });
    optRow.append(radio, keySpan, optInput);
    form.appendChild(optRow);
  }

  // Ensure at least one radio is checked
  if (!optInputs.some(o => o.radio.checked)) optInputs[0].radio.checked = true;

  // Action buttons
  const btns = document.createElement('div');
  btns.className = 'dh-qform__btns';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn--primary btn--small';
  saveBtn.textContent = t('common.save') || 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--ghost btn--small';
  cancelBtn.textContent = t('common.cancel') || 'Cancel';
  cancelBtn.addEventListener('click', () => { _editQId = null; _mount(_root); });

  saveBtn.addEventListener('click', async () => {
    const questionText = qText.value.trim();
    if (!questionText) { qText.focus(); return; }

    const correctIdx = optInputs.findIndex(o => o.radio.checked);
    const options = optInputs.map((o, i) => ({
      text: o.input.value.trim() || `${KEYS[i]}`,
      isCorrect: i === correctIdx,
    }));

    saveBtn.disabled = true;
    saveBtn.textContent = t('common.saving') || 'Saving…';

    try {
      const result = isNew
        ? await addQuestion(testId, { questionText, options })
        : await updateQuestion(testId, q.id, { questionText, options });

      if (result?.payload?.questions) {
        _testFull.questions = result.payload.questions;
        // Update summary count in test list
        const listTest = _tests.find(tt => tt.id === testId);
        if (listTest) listTest.question_count = result.payload.questions.length;
      }
      _editQId = isNew ? result?.question?.id : q.id;
      _mount(_root);
    } catch (err) {
      console.error('[home] saveQuestion:', err);
      saveBtn.disabled = false;
      saveBtn.textContent = t('common.save') || 'Save';
    }
  });

  btns.append(saveBtn, cancelBtn);
  form.appendChild(btns);
  return form;
}

function buildRailActivity() {
  const test = getSelected();
  if (!test) return buildEmptyPanel();

  const wrap = document.createElement('div');

  const h = document.createElement('h2');
  h.style.cssText = 'font:700 22px/1.2 Inter,sans-serif;letter-spacing:-0.01em;';
  h.textContent = t('stats.activity') || 'Activity';
  const sub = document.createElement('p');
  sub.style.cssText = 'font-size:12px;color:var(--ink-mute);margin-top:3px;';
  sub.textContent = (t('test.events') || 'events on this collection');
  wrap.append(h, sub);

  const feed = document.createElement('div');
  feed.className = 'dh-activity__feed';

  // Use real attempt data for activity + placeholder events
  const events = [];

  for (const att of _testAttempts.slice(0, 4)) {
    const score = att.score != null ? `${Math.round(att.score)}%` : '';
    events.push({
      who: att.username || (t('common.you') || 'You'),
      what: `${t('stats.completed_attempt') || 'completed an attempt'} · ${score}`,
      when: att.finished_at ? formatRelative(att.finished_at) : '—',
    });
  }

  if (events.length === 0) {
    events.push(
      { who: t('common.you') || 'You', what: t('test.created') || 'created this collection', when: formatRelative(test.created_at) },
    );
  }

  for (const ev of events) {
    const item = document.createElement('div');
    item.className = 'dh-event';

    const avatar = document.createElement('div');
    avatar.className = 'dh-event__avatar';
    avatar.appendChild(iconEl('user', 14));

    const body = document.createElement('div');
    body.className = 'dh-event__body';
    const text = document.createElement('div');
    text.innerHTML = `<span class="dh-event__who">${escHtml(ev.who)}</span> ${escHtml(ev.what)}`;
    const when = document.createElement('div');
    when.className = 'dh-event__when';
    when.textContent = ev.when;
    body.append(text, when);
    item.append(avatar, body);
    feed.appendChild(item);
  }

  wrap.appendChild(feed);
  return wrap;
}

function buildRailAccess() {
  const test = getSelected();
  if (!test) return buildEmptyPanel();

  const wrap = document.createElement('div');

  const headerRow = document.createElement('div');
  headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;';

  const headerLeft = document.createElement('div');
  const h = document.createElement('h2');
  h.style.cssText = 'font:700 22px/1.2 Inter,sans-serif;letter-spacing:-0.01em;';
  h.textContent = t('test.access') || 'Access & sharing';
  const sub = document.createElement('p');
  sub.style.cssText = 'font-size:12px;color:var(--ink-mute);margin-top:3px;';
  sub.textContent = t('test.access_sub') || 'who can see · who can edit · change-request flow';
  headerLeft.append(h, sub);

  const inviteBtn = document.createElement('button');
  inviteBtn.type = 'button';
  inviteBtn.className = 'btn btn--primary';
  inviteBtn.appendChild(iconEl('user', 14));
  const inviteSpan = document.createElement('span');
  inviteSpan.textContent = t('test.invite') || 'Invite';
  inviteBtn.appendChild(inviteSpan);

  headerRow.append(headerLeft, inviteBtn);

  // Visibility
  const visSection = document.createElement('div');
  visSection.className = 'dh-access__section';
  const visTitle = document.createElement('div');
  visTitle.className = 'dh-access__section-title';
  visTitle.textContent = t('test.visibility') || 'Visibility';
  const visChips = document.createElement('div');
  visChips.className = 'dh-access__visibility';

  const levels = ['private', 'shared', 'public'];
  for (const lvl of levels) {
    const chip = document.createElement('span');
    chip.className = 'chip chip--small' + (test.access_level === lvl ? ' chip--active' : '');
    chip.textContent = (lvl === 'private' ? '◆ ' : lvl === 'shared' ? '◇ ' : '○ ') + (t(`test.${lvl}`) || lvl);
    visChips.appendChild(chip);
  }

  visSection.append(visTitle, visChips);

  // People
  const peopleSection = document.createElement('div');
  peopleSection.className = 'dh-access__section';

  const shares = Array.isArray(_testShares) ? _testShares : [];
  const peopleTitleEl = document.createElement('div');
  peopleTitleEl.className = 'dh-access__section-title';
  peopleTitleEl.textContent = `${t('test.people_with_access') || 'People with access'} · ${shares.length + 1}`;
  peopleSection.appendChild(peopleTitleEl);

  // Owner
  const state = getState();
  const ownerEl = buildPersonRow(state.user?.username || 'You', '', t('test.owner') || 'Owner', true);
  peopleSection.appendChild(ownerEl);

  for (const share of shares) {
    const shareEl = buildPersonRow(share.username || share.user_id, share.email || '', share.role || 'View', false);
    peopleSection.appendChild(shareEl);
  }

  // Change requests link
  const crLink = document.createElement('a');
  crLink.className = 'dh-cr-link';
  crLink.href = `#/change-requests/${test.id}`;
  crLink.appendChild(iconEl('edit', 20));
  const crBody = document.createElement('div');
  crBody.className = 'dh-cr-link__body';
  const crTitle = document.createElement('div');
  crTitle.className = 'dh-cr-link__title';
  crTitle.textContent = t('test.change_requests') || 'Change requests';
  const crSub = document.createElement('div');
  crSub.className = 'dh-cr-link__sub';
  crSub.textContent = t('test.cr_sub') || 'review proposed edits from collaborators →';
  crBody.append(crTitle, crSub);
  const crBadge = document.createElement('span');
  crBadge.className = 'chip chip--small chip--active';
  crBadge.textContent = '→';
  crLink.append(crBody, crBadge);

  wrap.append(headerRow, visSection, peopleSection, crLink);
  return wrap;
}

function buildPersonRow(name, email, role, isOwner) {
  const row = document.createElement('div');
  row.className = 'dh-person';

  const avatar = document.createElement('div');
  avatar.className = 'dh-person__avatar';
  avatar.appendChild(iconEl('user', 14));

  const info = document.createElement('div');
  info.className = 'dh-person__info';
  const nameEl = document.createElement('div');
  nameEl.className = 'dh-person__name';
  nameEl.textContent = name;
  const emailEl = document.createElement('div');
  emailEl.className = 'dh-person__email';
  emailEl.textContent = email;
  info.append(nameEl, emailEl);

  const roleChip = document.createElement('span');
  roleChip.className = 'chip chip--small' + (isOwner ? ' chip--active' : '');
  roleChip.textContent = role;

  row.append(avatar, info, roleChip);
  return row;
}

function buildEmptyPanel() {
  const wrap = document.createElement('div');
  wrap.className = 'dh-empty';
  const icon = document.createElement('div');
  icon.style.cssText = 'opacity:0.3;';
  icon.appendChild(iconEl('doc', 36));
  const title = document.createElement('div');
  title.className = 'dh-empty__title';
  title.textContent = t('test.select_collection') || 'Select a collection';
  const sub = document.createElement('p');
  sub.style.cssText = 'font-size:13px;';
  sub.textContent = t('test.select_sub') || 'Choose a collection from the left panel.';
  wrap.append(icon, title, sub);
  return wrap;
}

// ─── Load data ────────────────────────────────────────────────

async function loadTestData(testId) {
  _testStats = null;
  _testAccess = null;
  _testShares = null;
  _testAttempts = [];
  _testFull = null;
  _editQId = null;

  await Promise.allSettled([
    getMyAggregate({ test_id: testId })
      .then(d => {
        _testStats = d;
        // attempts list may be embedded in aggregate response
        if (Array.isArray(d?.attempts)) _testAttempts = d.attempts;
      })
      .catch(() => {}),
    getTestAccess(testId)
      .then(d => { _testAccess = d; })
      .catch(() => {}),
    getTestShares(testId)
      .then(d => { _testShares = d; })
      .catch(() => {}),
    getTest(testId)
      .then(d => { _testFull = d; })
      .catch(() => {}),
  ]);
}

// ─── Mount / Render ───────────────────────────────────────────

function _mount(root) {
  if (!root) return;
  root.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'dh';

  const topBar = buildTopBar();

  const body = document.createElement('div');
  body.className = 'dh__body';

  const sidebar = buildSidebar();
  const rail = buildRail();

  const main = document.createElement('div');
  main.className = 'dh__main';

  // Render active tab
  let content;
  if (!_selectedId) {
    content = buildEmptyPanel();
  } else {
    const builders = {
      info: buildRailInfo,
      stats: buildRailStats,
      edit: buildRailEdit,
      activity: buildRailActivity,
      access: buildRailAccess,
    };
    content = (builders[_railTab] || buildRailInfo)();
  }

  // Edit tab: remove padding, set as flex container so child fills full height
  if (_railTab === 'edit' && _selectedId) {
    main.style.padding = '0';
    main.style.overflow = 'hidden';
    main.style.display = 'flex';
    main.style.flexDirection = 'column';
  }

  main.appendChild(content);
  body.append(sidebar, rail, main);
  layout.append(topBar, body);
  root.appendChild(layout);
}

// ─── Entry point ──────────────────────────────────────────────

export default async function render(root, params = {}) {
  _root = root;
  ++_renderToken;
  const myToken = _renderToken;

  // Guard: returns true if we should abort (route changed or new render started)
  const stale = () => (!location.hash.startsWith('#/home') && !location.hash.startsWith('#/tests') && location.hash !== '#/')
    || _renderToken !== myToken;

  // Show skeleton immediately
  root.innerHTML = `
    <div class="dh" style="align-items:center;justify-content:center;">
      <div class="skeleton" style="width:200px;height:16px;border-radius:8px;"></div>
    </div>`;

  // Load tests
  try {
    const data = await listTests();
    if (stale()) return;
    _tests = Array.isArray(data) ? data : (data?.tests || data?.items || []);
  } catch (e) {
    console.error('[home] listTests error:', e);
    _tests = [];
  }
  if (stale()) return;

  // Auto-select first test if nothing selected (or previously selected one is gone)
  if (!_selectedId || !_tests.find(t => t.id === _selectedId)) {
    _selectedId = _tests[0]?.id || null;
  }

  // Load heatmap (global, not per-test)
  try {
    _heatmap = await getHeatmap(16);
  } catch { _heatmap = null; }
  if (stale()) return;

  // Load selected test data
  if (_selectedId) {
    await loadTestData(_selectedId);
  }
  if (stale()) return;

  _mount(root);
}

// ─── Create test modal ───────────────────────────────────────

function openCreateTestModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.cssText = 'max-width:480px;width:100%;';

  function close() { overlay.remove(); }

  // Header
  const header = document.createElement('div');
  header.className = 'modal__header';

  const titleEl = document.createElement('div');
  titleEl.className = 'modal__title';
  titleEl.textContent = t('test.create') || 'Create Test';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal__close btn btn--ghost btn--icon';
  closeBtn.appendChild(iconEl('x', 16));
  closeBtn.addEventListener('click', close);

  header.append(titleEl, closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'modal__body';
  body.style.cssText = 'display:flex;flex-direction:column;gap:18px;';

  // Title field
  const titleGroup = document.createElement('div');
  titleGroup.className = 'modal__field-group';

  const titleLabel = document.createElement('label');
  titleLabel.className = 'modal__field-label';
  titleLabel.textContent = t('test.title') || 'Title';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'input';
  titleInput.placeholder = t('test.title_placeholder') || 'Collection title';

  const titleErr = document.createElement('div');
  titleErr.style.cssText = 'font-size:12px;color:#c4554a;display:none;';
  titleErr.textContent = t('auth.error.invalid') || 'Title is required';

  titleGroup.append(titleLabel, titleInput, titleErr);

  // Description field
  const descGroup = document.createElement('div');
  descGroup.className = 'modal__field-group';

  const descLabel = document.createElement('label');
  descLabel.className = 'modal__field-label';
  descLabel.textContent = t('test.description') || 'Description';

  const descInput = document.createElement('textarea');
  descInput.className = 'input';
  descInput.rows = 3;
  descInput.style.cssText = 'resize:vertical;min-height:64px;font-family:inherit;';
  descInput.placeholder = t('test.description_placeholder') || 'Brief description…';

  descGroup.append(descLabel, descInput);

  // Access level
  const accessGroup = document.createElement('div');
  accessGroup.className = 'modal__field-group';

  const accessLabel = document.createElement('label');
  accessLabel.className = 'modal__field-label';
  accessLabel.textContent = t('test.visibility') || 'Visibility';

  const accessChips = document.createElement('div');
  accessChips.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;';

  let selectedAccess = 'private';
  const ACCESS_OPTS = [
    { value: 'private', label: t('test.private') || 'Private', icon: '◆' },
    { value: 'shared',  label: t('test.shared')  || 'Shared',  icon: '◇' },
    { value: 'public',  label: t('test.public')  || 'Public',  icon: '○' },
  ];
  for (const opt of ACCESS_OPTS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip--small' + (opt.value === 'private' ? ' chip--active' : '');
    chip.textContent = `${opt.icon} ${opt.label}`;
    chip.addEventListener('click', () => {
      selectedAccess = opt.value;
      accessChips.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
    });
    accessChips.appendChild(chip);
  }

  accessGroup.append(accessLabel, accessChips);
  body.append(titleGroup, descGroup, accessGroup);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'modal__footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--ghost';
  cancelBtn.textContent = t('common.cancel') || 'Cancel';
  cancelBtn.addEventListener('click', close);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = t('test.create') || 'Create Test';

  saveBtn.addEventListener('click', async () => {
    const newTitle = titleInput.value.trim();
    if (!newTitle) {
      titleErr.style.display = 'block';
      titleInput.focus();
      return;
    }
    titleErr.style.display = 'none';
    saveBtn.disabled = true;
    saveBtn.textContent = t('common.saving') || 'Creating…';

    try {
      const result = await createTest({
        title: newTitle,
        description: descInput.value.trim() || undefined,
        access_level: selectedAccess,
      });

      // The API returns { metadata, payload }
      const meta = result.metadata || result;
      const newTest = {
        id: meta.id,
        title: meta.title,
        description: meta.description || '',
        questionCount: meta.questionCount || 0,
        access_level: selectedAccess,
        is_owner: true,
        owner_id: getState().user?.id,
        owner_username: getState().user?.username,
        attempts: 0,
        best_score: null,
      };

      // Add to top of list, select it, go to Edit tab
      _tests.unshift(newTest);
      _selectedId = newTest.id;
      _railTab = 'edit';
      _testFull = null;
      _editQId = null;

      close();

      // Load fresh data for the new test then re-mount
      await loadTestData(newTest.id);
      _mount(_root);
    } catch (err) {
      console.error('[createTest]', err);
      saveBtn.disabled = false;
      saveBtn.textContent = t('test.create') || 'Create Test';
      titleErr.textContent = t('common.error') || 'An error occurred';
      titleErr.style.display = 'block';
    }
  });

  footer.append(cancelBtn, saveBtn);
  modal.append(header, body, footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  setTimeout(() => titleInput.focus(), 50);
}

// ─── Collection settings modal ───────────────────────────────

function openCollectionSettingsModal(test) {
  // Only owner can access settings
  const isOwner = getState().user?.id === test.owner_id;

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.cssText = 'max-width:520px;width:100%;';

  function close() {
    overlay.remove();
  }

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'modal__header';

  const titleEl = document.createElement('div');
  titleEl.className = 'modal__title';
  titleEl.textContent = t('test.settings') || 'Collection settings';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal__close btn btn--ghost btn--icon';
  closeBtn.appendChild(iconEl('x', 16));
  closeBtn.addEventListener('click', close);

  header.append(titleEl, closeBtn);

  // ── Body ──
  const body = document.createElement('div');
  body.className = 'modal__body';
  body.style.cssText = 'display:flex;flex-direction:column;gap:18px;';

  // Title field
  const titleGroup = document.createElement('div');
  titleGroup.className = 'modal__field-group';

  const titleLabel = document.createElement('label');
  titleLabel.className = 'modal__field-label';
  titleLabel.textContent = t('test.title') || 'Title';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'input';
  titleInput.value = test.title || '';
  titleInput.placeholder = t('test.title_placeholder') || 'Collection title';
  if (!isOwner) titleInput.disabled = true;

  titleGroup.append(titleLabel, titleInput);

  // Description field
  const descGroup = document.createElement('div');
  descGroup.className = 'modal__field-group';

  const descLabel = document.createElement('label');
  descLabel.className = 'modal__field-label';
  descLabel.textContent = t('test.description') || 'Description';

  const descInput = document.createElement('textarea');
  descInput.className = 'input';
  descInput.rows = 3;
  descInput.style.cssText = 'resize:vertical;min-height:64px;font-family:inherit;';
  descInput.value = test.description || '';
  descInput.placeholder = t('test.description_placeholder') || 'Brief description of this collection…';
  if (!isOwner) descInput.disabled = true;

  descGroup.append(descLabel, descInput);

  // Access level
  const accessGroup = document.createElement('div');
  accessGroup.className = 'modal__field-group';

  const accessLabel = document.createElement('label');
  accessLabel.className = 'modal__field-label';
  accessLabel.textContent = t('test.visibility') || 'Visibility';

  const accessChips = document.createElement('div');
  accessChips.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;';

  let selectedAccess = test.access_level || 'private';
  const ACCESS_OPTS = [
    { value: 'private', label: t('test.private') || 'Private', icon: '◆' },
    { value: 'shared',  label: t('test.shared')  || 'Shared',  icon: '◇' },
    { value: 'public',  label: t('test.public')  || 'Public',  icon: '○' },
  ];

  for (const opt of ACCESS_OPTS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip--small' + (opt.value === selectedAccess ? ' chip--active' : '');
    chip.textContent = `${opt.icon} ${opt.label}`;
    if (!isOwner) {
      chip.disabled = true;
    } else {
      chip.addEventListener('click', () => {
        selectedAccess = opt.value;
        accessChips.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
        chip.classList.add('chip--active');
      });
    }
    accessChips.appendChild(chip);
  }

  accessGroup.append(accessLabel, accessChips);

  // Shares list (only for owner)
  const sharesGroup = document.createElement('div');
  sharesGroup.className = 'modal__field-group';

  const sharesLabel = document.createElement('div');
  sharesLabel.className = 'modal__field-label';
  sharesLabel.textContent = t('test.people_with_access') || 'People with access';

  const sharesList = document.createElement('div');
  sharesList.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:6px;';

  // Owner row
  const ownerRow = _buildShareRow(getState().user?.username || 'You', t('test.owner') || 'Owner', null);
  sharesList.appendChild(ownerRow);

  // Shared users
  const currentShares = Array.isArray(_testShares) ? _testShares : [];
  for (const share of currentShares) {
    const uname = share.username || share.user?.username || `User ${share.user_id}`;
    const removeBtn = isOwner ? async () => {
      try {
        await removeShare(test.id, share.user_id);
        _testShares = _testShares.filter(s => s.user_id !== share.user_id);
        row.remove();
      } catch (e) { console.error('[modal] removeShare:', e); }
    } : null;
    const row = _buildShareRow(uname, t('test.viewer') || 'Viewer', removeBtn);
    sharesList.appendChild(row);
  }

  if (currentShares.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'font-size:12px;color:var(--ink-mute);font-style:italic;';
    emptyMsg.textContent = t('test.no_shares') || 'Only you have access.';
    sharesList.appendChild(emptyMsg);
  }

  sharesGroup.append(sharesLabel, sharesList);

  body.append(titleGroup, descGroup, accessGroup, sharesGroup);

  // ── Footer ──
  const footer = document.createElement('div');
  footer.className = 'modal__footer';

  const cancelBtn2 = document.createElement('button');
  cancelBtn2.type = 'button';
  cancelBtn2.className = 'btn btn--ghost';
  cancelBtn2.textContent = t('common.cancel') || 'Cancel';
  cancelBtn2.addEventListener('click', close);

  if (isOwner) {
    const saveBtn2 = document.createElement('button');
    saveBtn2.type = 'button';
    saveBtn2.className = 'btn btn--primary';
    saveBtn2.textContent = t('common.save') || 'Save';

    saveBtn2.addEventListener('click', async () => {
      const newTitle = titleInput.value.trim();
      if (!newTitle) { titleInput.focus(); return; }

      saveBtn2.disabled = true;
      saveBtn2.textContent = t('common.saving') || 'Saving…';

      try {
        // Update title + description
        await updateTest(test.id, {
          title: newTitle,
          description: descInput.value.trim(),
        });

        // Update access level if changed
        if (selectedAccess !== test.access_level) {
          await updateTestAccess(test.id, selectedAccess);
        }

        // Update in-memory test list
        const listEntry = _tests.find(tt => tt.id === test.id);
        if (listEntry) {
          listEntry.title = newTitle;
          listEntry.description = descInput.value.trim();
          listEntry.access_level = selectedAccess;
        }
        if (_testFull) {
          _testFull.title = newTitle;
          _testFull.description = descInput.value.trim();
        }

        close();
        _mount(_root);
      } catch (err) {
        console.error('[modal] saveSettings:', err);
        saveBtn2.disabled = false;
        saveBtn2.textContent = t('common.save') || 'Save';
      }
    });

    footer.append(cancelBtn2, saveBtn2);
  } else {
    footer.appendChild(cancelBtn2);
  }

  modal.append(header, body, footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Focus title input
  setTimeout(() => titleInput.focus(), 50);
}

function _buildShareRow(username, role, onRemove) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 10px;border:var(--border);border-radius:var(--radius-sm);';

  const avatar = document.createElement('div');
  avatar.style.cssText = 'width:28px;height:28px;border-radius:50%;border:var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:var(--ink-soft);flex-shrink:0;';
  avatar.textContent = (username[0] || '?').toUpperCase();

  const info = document.createElement('div');
  info.style.cssText = 'flex:1;min-width:0;';

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:13px;font-weight:500;';
  nameEl.textContent = username;

  const roleEl = document.createElement('div');
  roleEl.style.cssText = 'font-size:11px;color:var(--ink-mute);';
  roleEl.textContent = role;

  info.append(nameEl, roleEl);
  row.append(avatar, info);

  if (onRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn--ghost btn--small';
    removeBtn.textContent = t('common.remove') || 'Remove';
    removeBtn.style.cssText = 'font-size:12px;color:var(--ink-mute);';
    removeBtn.addEventListener('click', onRemove);
    row.appendChild(removeBtn);
  }

  return row;
}

// ─── Utilities ────────────────────────────────────────────────
// escHtml and formatSeconds imported at top.
// home.js passes seconds (not ms) to formatDuration → alias to formatSeconds.
const formatDuration = formatSeconds;

function formatRelative(dateStr) {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  } catch { return dateStr; }
}
