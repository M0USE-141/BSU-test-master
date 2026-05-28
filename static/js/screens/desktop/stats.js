/**
 * screens/desktop/stats.js — Statistics, mail-client redesign (Phase 5).
 *
 * Layout: AppShell + MailLayout.
 *   Sidebar:
 *     - Period chips (7 / 30 / All).
 *     - "Сводка" section: Все тесты, Слабые темы, Активность.
 *     - "По тестам" section: row per test that has attempts.
 *   Detail (depends on selection):
 *     - all-tests / per-test : 5 KPI tiles + heatmap-year.
 *     - weak-themes          : weak-questions list with bars.
 *     - activity             : full-year heatmap + last-N attempts.
 *
 * Backend endpoints used (all already exist):
 *   GET /api/stats/me/aggregate ? clientId=… [&testId=…]
 *   GET /api/stats/heatmap      ? weeks=52
 *   GET /api/stats/streak
 *   GET /api/stats/attempts     ? clientId=…  (recent attempts)
 *   GET /api/tests              ? with_stats=true
 *   GET /api/tests/{id}/weak-questions
 */
import { getMyAggregate, getHeatmap, getStreak, listAttempts, getWeakQuestions, getMyTrend } from '../../api/statistics.js';
import { listTests } from '../../api/tests.js';
import { mountAppShell } from '../../components/app-shell.js';
import { buildMailLayout } from '../../components/mail-layout.js';
import { navigate } from '../../router.js';
import { iconEl } from '../../icons.js';
import { t } from '../../utils/locale.js';
import { getClientId } from '../../utils/client-id.js';

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
  skel.style.height = '60%';
  skel.style.minHeight = '300px';
  skel.style.margin = '24px';
  skel.style.borderRadius = 'var(--radius-md)';
  main.appendChild(skel);

  // Load tests for the "По тестам" sidebar list — uses Phase 5a's
  // with_stats so we get attempts_count + avg_score for free.
  let tests = [];
  try {
    const resp = await listTests({ with_stats: true, limit: 100 });
    tests = (resp && resp.tests) || [];
  } catch (_) { /* sidebar will be empty */ }
  if (stale()) return;

  // Filter to tests the user has actually attempted.
  const activeTests = tests.filter(function (t) {
    return (t.attempts_count || 0) > 0;
  });

  main.innerHTML = '';

  const state = {
    period: params.period || '30',     // '7' | '30' | 'all'
    sel: params.sel || 'all',          // 'all' | 'weak' | 'activity' | <testId>
  };

  const built = buildMailLayout(main, { sidebarWidth: 260 });
  renderSidebar(built.sidebar, state, activeTests, function () {
    history.replaceState({}, '', '#/stats?sel=' + encodeURIComponent(state.sel) + '&period=' + state.period);
    renderDetail(built.detail, state, tests);
  });
  renderDetail(built.detail, state, tests);
}

// ─── Sidebar ─────────────────────────────────────────────────

function renderSidebar(sidebar, state, activeTests, onChange) {
  sidebar.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'mail-layout__sidebar-head';

  const titleCaps = document.createElement('div');
  titleCaps.className = 'caps';
  titleCaps.textContent = t('nav.stats') || 'Статистика';
  head.appendChild(titleCaps);

  // Period chips.
  const periodRow = document.createElement('div');
  periodRow.style.display = 'flex';
  periodRow.style.gap = '4px';
  periodRow.style.marginTop = '6px';
  const periods = [['7', '7 дн'], ['30', '30 дн'], ['all', 'Всё']];
  const periodChips = {};
  periods.forEach(function (p) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip--small' + (state.period === p[0] ? ' chip--active' : '');
    chip.textContent = p[1];
    chip.addEventListener('click', function () {
      state.period = p[0];
      Object.keys(periodChips).forEach(function (k) {
        periodChips[k].classList.toggle('chip--active', k === p[0]);
      });
      onChange();
    });
    periodChips[p[0]] = chip;
    periodRow.appendChild(chip);
  });
  head.appendChild(periodRow);
  sidebar.appendChild(head);

  // Сводка section.
  const list = document.createElement('div');
  list.style.flex = '1';
  list.style.overflowY = 'auto';

  list.appendChild(sectionLabel('Сводка'));
  list.appendChild(buildNavItem('stats',      'Все тесты',    null,  state.sel === 'all',      function () { state.sel = 'all';      refreshActive(); onChange(); }));
  list.appendChild(buildNavItem('flag',       'Слабые темы', null,  state.sel === 'weak',     function () { state.sel = 'weak';     refreshActive(); onChange(); }));
  list.appendChild(buildNavItem('clock',      'Активность',   null,  state.sel === 'activity', function () { state.sel = 'activity'; refreshActive(); onChange(); }));

  if (activeTests.length > 0) {
    list.appendChild(sectionLabel('По тестам'));
    activeTests.forEach(function (test) {
      const id = test.id;
      const score = (test.avg_score !== null && test.avg_score !== undefined) ? (Math.round(test.avg_score) + '%') : null;
      list.appendChild(buildNavItem(null, test.title || id, score, state.sel === id, function () {
        state.sel = id;
        refreshActive();
        onChange();
      }));
    });
  }

  sidebar.appendChild(list);

  function refreshActive() {
    sidebar.querySelectorAll('[data-sel]').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.sel === state.sel);
    });
  }

  // Tag rows with data-sel for refresh.
  Array.from(list.querySelectorAll('button')).forEach(function (b) {
    if (b.dataset.sel === undefined && b.textContent) {
      // Buttons are tagged via buildNavItem already; this is just for the
      // record — leave it alone.
    }
  });
}

function sectionLabel(text) {
  const el = document.createElement('div');
  el.className = 'mail-layout__sidebar-section';
  el.textContent = text;
  return el;
}

function buildNavItem(iconKind, label, rightText, active, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.sel = label;  // approximate; reactive refresh in refreshActive sets it
  btn.className = 'mail-row' + (active ? ' is-active' : '');
  btn.style.borderLeft = active ? '3px solid var(--accent)' : '3px solid transparent';

  const main = document.createElement('div');
  main.className = 'mail-row__main';
  main.style.display = 'flex';
  main.style.alignItems = 'center';
  main.style.gap = '8px';
  if (iconKind) {
    const ic = document.createElement('span');
    ic.style.lineHeight = '0';
    ic.style.color = 'var(--ink-tertiary)';
    ic.appendChild(iconEl(iconKind, 14));
    main.appendChild(ic);
  }
  const titleEl = document.createElement('div');
  titleEl.className = 'mail-row__title';
  titleEl.textContent = label;
  main.appendChild(titleEl);

  btn.appendChild(main);
  if (rightText) {
    const right = document.createElement('div');
    right.className = 'mail-row__right mono';
    right.textContent = rightText;
    btn.appendChild(right);
  }
  btn.addEventListener('click', onClick);
  return btn;
}

// ─── Detail ──────────────────────────────────────────────────

async function renderDetail(detail, state, tests) {
  detail.innerHTML = '';

  // Header strip.
  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.justifyContent = 'space-between';
  head.style.alignItems = 'flex-start';
  head.style.padding = 'var(--sp-4) var(--sp-5) var(--sp-3)';
  head.style.borderBottom = '1px solid var(--ink-soft)';

  const headLeft = document.createElement('div');
  const headCaps = document.createElement('div');
  headCaps.className = 'caps';
  const title = document.createElement('h2');
  title.style.fontSize = '22px';
  title.style.fontWeight = 'var(--fw-bold)';
  title.style.letterSpacing = '-0.01em';
  title.style.margin = '2px 0 0';

  const periodLabel = state.period === 'all' ? 'всё время' : (state.period + ' дней');
  let scopeLabel;
  if (state.sel === 'all')           scopeLabel = 'Все тесты';
  else if (state.sel === 'weak')     scopeLabel = 'Слабые темы';
  else if (state.sel === 'activity') scopeLabel = 'Активность';
  else                                scopeLabel = (tests.find(function (t) { return t.id === state.sel; }) || {}).title || 'Тест';

  headCaps.textContent = scopeLabel + ' · ' + periodLabel;
  headLeft.appendChild(headCaps);
  if (state.sel === 'all' || (typeof state.sel === 'string' && state.sel.length > 8)) {
    title.textContent = state.sel === 'all' ? 'Сводная статистика' : 'Детально по тесту';
  } else if (state.sel === 'weak') {
    title.textContent = 'Где вы слабее';
  } else {
    title.textContent = 'Активность';
  }
  headLeft.appendChild(title);
  head.appendChild(headLeft);

  // CSV export button.
  const csvBtn = document.createElement('a');
  csvBtn.className = 'btn btn--ghost btn--small';
  const params = new URLSearchParams();
  params.set('clientId', getClientId());
  if (state.sel && state.sel !== 'all' && state.sel !== 'weak' && state.sel !== 'activity') {
    params.set('testId', state.sel);
  }
  csvBtn.href = '/api/stats/attempts.csv?' + params.toString();
  csvBtn.setAttribute('download', '');
  const lbl = document.createElement('span');
  lbl.textContent = 'Экспорт CSV';
  csvBtn.appendChild(lbl);
  head.appendChild(csvBtn);

  // Body.
  const body = document.createElement('div');
  body.style.padding = 'var(--sp-4) var(--sp-5)';
  body.style.overflowY = 'auto';

  detail.appendChild(head);
  detail.appendChild(body);

  // Loading skeleton in body while we fetch.
  const skel = document.createElement('div');
  skel.className = 'skeleton';
  skel.style.height = '180px';
  skel.style.borderRadius = 'var(--radius-md)';
  body.appendChild(skel);

  if (state.sel === 'weak') {
    await renderWeakView(body, state, tests);
  } else if (state.sel === 'activity') {
    await renderActivityView(body, state);
  } else {
    await renderSummaryView(body, state, tests);
  }
}

// ─── Views ───────────────────────────────────────────────────

async function renderSummaryView(body, state, tests) {
  body.innerHTML = '';

  const clientId = getClientId();
  const aggParams = { clientId: clientId };
  if (state.sel !== 'all') aggParams.testId = state.sel;
  // Apply period as a date range via startDate.
  const days = state.period === '7' ? 7 : state.period === '30' ? 30 : null;
  if (days) {
    const since = new Date(Date.now() - days * 86400000);
    aggParams.startDate = since.toISOString();
  }

  const [aggResp, streakResp] = await Promise.all([
    getMyAggregate(aggParams).catch(function () { return null; }),
    getStreak().catch(function () { return null; }),
  ]);

  const agg = aggResp || {};
  const streak = (streakResp && streakResp.streak) || 0;

  // KPI grid.
  const kpiGrid = document.createElement('div');
  kpiGrid.style.display = 'grid';
  kpiGrid.style.gridTemplateColumns = 'repeat(5, 1fr)';
  kpiGrid.style.gap = '8px';
  kpiGrid.style.marginBottom = '14px';
  kpiGrid.appendChild(buildKpi('Средний балл',
    typeof agg.avgPercentCorrect === 'number' ? Math.round(agg.avgPercentCorrect) + '%' : '—'));
  kpiGrid.appendChild(buildKpi('Попыток', String(agg.attemptCount || 0)));
  kpiGrid.appendChild(buildKpi('Время', fmtDurationShort(agg.totalDurationMs)));
  kpiGrid.appendChild(buildKpi('Streak', streak ? streak + ' дн' : '—'));
  const accuracy = (agg.totalAnswered > 0)
    ? Math.round((agg.totalCorrect / agg.totalAnswered) * 100) + '%'
    : '—';
  kpiGrid.appendChild(buildKpi('Точность', accuracy));
  body.appendChild(kpiGrid);

  // Two-up row: Прогресс по дням (Bars) + Слабые темы mini-card.
  const twoUp = document.createElement('div');
  twoUp.style.display = 'grid';
  twoUp.style.gridTemplateColumns = '3fr 2fr';
  twoUp.style.gap = '12px';
  twoUp.style.marginBottom = '14px';

  const barsCard = buildCard('Прогресс по дням · 15 дн');
  const barsSlot = document.createElement('div');
  barsSlot.style.minHeight = '140px';
  barsCard.body.appendChild(barsSlot);
  twoUp.appendChild(barsCard.el);

  const weakMini = buildCard('Слабые темы');
  const weakMiniSlot = document.createElement('div');
  weakMiniSlot.style.minHeight = '140px';
  weakMini.body.appendChild(weakMiniSlot);
  twoUp.appendChild(weakMini.el);
  body.appendChild(twoUp);

  // Fetch trend + weak in parallel.
  getMyTrend(15).then(function (resp) {
    const rows = (resp && resp.trend) || [];
    if (!rows.length) {
      barsSlot.appendChild(emptyHint('Нет попыток за выбранный период'));
      return;
    }
    renderTrendBars(barsSlot, rows);
  }).catch(function () {
    barsSlot.appendChild(emptyHint('Не удалось загрузить прогресс'));
  });

  // Aggregate weak questions across owned tests (capped to keep it cheap).
  (async function () {
    try {
      const ownTests = (tests || []).filter(function (t) { return !!t.is_owner; }).slice(0, 8);
      const results = await Promise.all(ownTests.map(function (t) {
        return getWeakQuestions(t.id).then(function (r) {
          return { title: t.title, questions: (r && r.questions) || [] };
        }).catch(function () { return null; });
      }));
      const flat = [];
      results.forEach(function (r) {
        if (!r) return;
        r.questions.slice(0, 3).forEach(function (q) {
          flat.push({ testTitle: r.title, q: q });
        });
      });
      flat.sort(function (a, b) {
        return (a.q.correctRate || 0) - (b.q.correctRate || 0);
      });
      const top = flat.slice(0, 3);
      if (!top.length) {
        weakMiniSlot.appendChild(emptyHint('Слабых тем не выявлено'));
        return;
      }
      top.forEach(function (item) {
        const row = document.createElement('div');
        row.style.marginBottom = '10px';
        const head = document.createElement('div');
        head.style.display = 'flex';
        head.style.justifyContent = 'space-between';
        head.style.fontSize = '12px';
        head.style.marginBottom = '4px';
        const t1 = document.createElement('span');
        t1.style.color = 'var(--ink)';
        t1.style.fontWeight = '600';
        t1.textContent = (item.testTitle || '').slice(0, 28) || '—';
        const t2 = document.createElement('span');
        t2.style.color = 'var(--ink-tertiary)';
        const rate = Math.round((item.q.correctRate || 0) * 100);
        t2.textContent = rate + '%';
        head.appendChild(t1);
        head.appendChild(t2);
        const bar = document.createElement('div');
        bar.style.height = '6px';
        bar.style.background = 'var(--ink-soft)';
        bar.style.borderRadius = '3px';
        bar.style.overflow = 'hidden';
        const fill = document.createElement('div');
        fill.style.height = '100%';
        fill.style.width = rate + '%';
        fill.style.background = rate < 60 ? 'var(--error)' : 'var(--warning)';
        bar.appendChild(fill);
        row.appendChild(head);
        row.appendChild(bar);
        weakMiniSlot.appendChild(row);
      });
    } catch (_) {
      weakMiniSlot.appendChild(emptyHint('—'));
    }
  })();

  // Activity-for-year heatmap card.
  const hmCard = buildCard('Активность за год');
  const hmSlot = document.createElement('div');
  hmSlot.style.minHeight = '120px';
  hmCard.body.appendChild(hmSlot);
  body.appendChild(hmCard.el);

  try {
    const hm = await getHeatmap(53);
    if (hm && Array.isArray(hm.days)) renderHeatmap(hmSlot, hm.days);
    else hmSlot.appendChild(emptyHint('Нет данных за год'));
  } catch (_) {
    hmSlot.appendChild(emptyHint('Не удалось загрузить активность'));
  }
}

function renderTrendBars(slot, rows) {
  slot.innerHTML = '';
  // Normalise to fill 15 slots; rows are sparse (only days with attempts).
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'flex-end';
  wrap.style.gap = '4px';
  wrap.style.height = '120px';
  wrap.style.padding = '8px 0';

  const maxScore = 100;
  rows.slice(-15).forEach(function (r) {
    const col = document.createElement('div');
    col.style.flex = '1';
    col.style.display = 'flex';
    col.style.flexDirection = 'column';
    col.style.alignItems = 'center';
    col.style.gap = '4px';
    col.title = r.date + ' · ' + r.avg_score + '% · ' + r.attempts_count + ' поп.';

    const bar = document.createElement('div');
    bar.style.width = '100%';
    bar.style.minHeight = '4px';
    const h = Math.max(4, Math.round((r.avg_score || 0) / maxScore * 96));
    bar.style.height = h + 'px';
    bar.style.background = (r.avg_score >= 70) ? 'var(--accent)'
                          : (r.avg_score >= 50) ? 'var(--warning)'
                          : 'var(--error)';
    bar.style.borderRadius = '3px';
    col.appendChild(bar);

    const lbl = document.createElement('div');
    lbl.style.fontSize = '10px';
    lbl.style.color = 'var(--ink-tertiary)';
    const dt = r.date && r.date.slice(5).replace('-', '.');
    lbl.textContent = dt || '';
    col.appendChild(lbl);

    wrap.appendChild(col);
  });
  slot.appendChild(wrap);
}

async function renderWeakView(body, state, tests) {
  body.innerHTML = '';

  // If a specific test is selected by a different sel branch we can scope
  // weak-questions to it. Otherwise show weak themes across all tests.
  let weakRows = [];
  try {
    // For "weak", aggregate across all tests-with-attempts by pulling
    // each test's weak list. This is bounded to user's owned + accessible
    // tests so the loop count is small.
    const targets = (tests || []).filter(function (t) { return (t.attempts_count || 0) > 0; }).slice(0, 5);
    const all = await Promise.all(targets.map(function (t) {
      return getWeakQuestions(t.id).then(function (resp) {
        return { test: t, weak: (resp && resp.questions) || [] };
      }).catch(function () { return null; });
    }));
    weakRows = all.filter(function (x) { return x && x.weak.length > 0; });
  } catch (_) {}

  if (weakRows.length === 0) {
    body.appendChild(emptyHint('Пока нет данных о слабых темах — пройдите больше попыток.'));
    return;
  }

  const card = buildCard(weakRows.length + ' тестов со слабыми вопросами');
  weakRows.forEach(function (entry, i) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '14px';
    row.style.padding = '14px 0';
    row.style.borderTop = i > 0 ? '1px solid var(--ink-soft)' : 'none';

    const left = document.createElement('div');
    left.style.flex = '1';
    const title = document.createElement('div');
    title.style.fontSize = '15px';
    title.style.fontWeight = 'var(--fw-semibold)';
    title.textContent = entry.test.title || entry.test.id;
    const sub = document.createElement('div');
    sub.style.fontSize = '11px';
    sub.style.color = 'var(--ink-tertiary)';
    sub.style.marginTop = '3px';
    sub.textContent = entry.weak.length + ' слабых вопросов';
    left.appendChild(title);
    left.appendChild(sub);
    row.appendChild(left);

    const bar = document.createElement('div');
    bar.className = 'bar bar--weak';
    bar.style.width = '160px';
    const fill = document.createElement('div');
    fill.className = 'bar__fill';
    // Heuristic: percentage of correct answers per question available?
    // We don't have it here, so render a flat 35% as visual cue.
    fill.style.width = '35%';
    bar.appendChild(fill);
    row.appendChild(bar);

    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'btn btn--small';
    cta.textContent = 'Тренировка';
    cta.addEventListener('click', function () {
      navigate('/test/' + encodeURIComponent(entry.test.id) + '/start?source=weak');
    });
    row.appendChild(cta);

    card.body.appendChild(row);
  });
  body.appendChild(card.el);
}

async function renderActivityView(body, state) {
  body.innerHTML = '';

  const hmCard = buildCard('Активность за год');
  const hmSlot = document.createElement('div');
  hmSlot.style.minHeight = '140px';
  hmCard.body.appendChild(hmSlot);
  body.appendChild(hmCard.el);

  try {
    const hm = await getHeatmap(53);
    if (hm && Array.isArray(hm.days)) renderHeatmap(hmSlot, hm.days);
    else hmSlot.appendChild(emptyHint('Нет данных'));
  } catch (_) {
    hmSlot.appendChild(emptyHint('Не удалось загрузить heatmap'));
  }

  // Recent attempts list.
  const attemptsCard = buildCard('Последние попытки');
  const listSlot = document.createElement('div');
  attemptsCard.body.appendChild(listSlot);
  attemptsCard.el.style.marginTop = '14px';
  body.appendChild(attemptsCard.el);

  try {
    const resp = await listAttempts({ clientId: getClientId(), limit: 30 });
    const items = Array.isArray(resp) ? resp : (resp.items || resp.attempts || []);
    if (items.length === 0) {
      listSlot.appendChild(emptyHint('Попыток ещё нет'));
    } else {
      const tbl = document.createElement('table');
      tbl.style.width = '100%';
      tbl.style.borderCollapse = 'collapse';
      tbl.style.fontSize = '12px';
      items.slice(0, 30).forEach(function (a) {
        const tr = document.createElement('tr');
        tr.style.borderTop = '1px solid var(--ink-soft)';
        tr.style.cursor = 'pointer';
        const score = (typeof a.percentCorrect === 'number') ? Math.round(a.percentCorrect) : 0;
        const tone     = score >= 80 ? 'var(--success)'      : score >= 60 ? 'var(--warning)'      : 'var(--error)';
        const toneSoft = score >= 80 ? 'var(--success-soft)' : score >= 60 ? 'var(--warning-soft)' : 'var(--error-soft)';
        const tdWhen = document.createElement('td');
        tdWhen.style.padding = '7px 0';
        tdWhen.textContent = a.finishedAt ? new Date(a.finishedAt).toLocaleDateString('ru', { day: '2-digit', month: 'short' }) : '—';
        const tdScore = document.createElement('td');
        const pill = document.createElement('span');
        pill.className = 'mono';
        pill.style.background = toneSoft;
        pill.style.color = tone;
        pill.style.padding = '1px 6px';
        pill.style.borderRadius = '999px';
        pill.textContent = score + '%';
        tdScore.appendChild(pill);
        const tdTest = document.createElement('td');
        tdTest.style.color = 'var(--ink-secondary)';
        tdTest.textContent = (a.testTitle || a.testId || '').slice(0, 40);
        tr.appendChild(tdWhen);
        tr.appendChild(tdScore);
        tr.appendChild(tdTest);
        if (a.testId && (a.id || a.attemptId)) {
          tr.addEventListener('click', function () {
            navigate('/test/' + encodeURIComponent(a.testId) + '/results/' + encodeURIComponent(a.id || a.attemptId));
          });
        }
        tbl.appendChild(tr);
      });
      listSlot.appendChild(tbl);
    }
  } catch (_) {
    listSlot.appendChild(emptyHint('Не удалось загрузить попытки'));
  }
}

// ─── Heatmap renderer ────────────────────────────────────────

function renderHeatmap(slot, days) {
  slot.innerHTML = '';
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  // Auto-compute weeks columns.
  const weeks = Math.ceil(days.length / 7);
  grid.style.gridTemplateColumns = 'repeat(' + weeks + ', 1fr)';
  grid.style.gridTemplateRows = 'repeat(7, 1fr)';
  grid.style.gridAutoFlow = 'column';
  grid.style.gap = '3px';
  grid.style.aspectRatio = String(weeks) + ' / 7';
  grid.style.maxWidth = '100%';

  const maxCount = days.reduce(function (m, d) { return Math.max(m, d.count || 0); }, 1);

  days.forEach(function (d) {
    const cell = document.createElement('div');
    cell.style.borderRadius = '2px';
    cell.title = d.date + ': ' + (d.count || 0) + ' попыток';
    const lvl = Math.min(4, Math.ceil((d.count / maxCount) * 4));
    cell.style.background =
      d.count === 0 ? 'var(--ink-soft)' :
      lvl === 1 ? 'var(--accent-soft)' :
      lvl === 2 ? 'color-mix(in srgb, var(--accent) 40%, transparent)' :
      lvl === 3 ? 'color-mix(in srgb, var(--accent) 65%, transparent)' :
                  'var(--accent)';
    grid.appendChild(cell);
  });
  slot.appendChild(grid);
}

// ─── Building blocks ─────────────────────────────────────────

function buildKpi(label, value, delta) {
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
  if (delta) {
    const d = document.createElement('div');
    d.className = 'kpi__delta';
    d.textContent = delta;
    k.appendChild(d);
  }
  return k;
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

function emptyHint(text) {
  const el = document.createElement('div');
  el.style.padding = '24px 0';
  el.style.textAlign = 'center';
  el.style.color = 'var(--ink-tertiary)';
  el.style.fontSize = '13px';
  el.textContent = text;
  return el;
}

function fmtDurationShort(ms) {
  if (!ms || ms <= 0) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return sec + 'с';
  const min = Math.round(sec / 60);
  if (min < 60) return min + ' мин';
  const h = (min / 60);
  if (h < 100) return h.toFixed(1) + 'ч';
  return Math.round(h) + 'ч';
}
