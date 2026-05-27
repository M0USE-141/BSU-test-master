/**
 * screens/desktop/stats.js — Statistics screen (Phase 4)
 * 3 tabs: Overall · By Test · Activity
 */
import { getMyAggregate, getHeatmap, getStreak, listAttempts } from '../../api/statistics.js';
import { listTests } from '../../api/tests.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { icon, iconEl } from '../../icons.js';
import { escHtml as escapeHtml } from '../../utils/escape.js';
import { getClientId } from '../../utils/client-id.js';
import { formatDuration } from '../../utils/format.js';

// ─── Module state ─────────────────────────────────────────────
/** @type {HTMLElement|null} */
let _root = null;
let _tab = 'overall'; // 'overall' | 'bytest' | 'activity'

/** @type {any} */
let _agg = null;
let _streak = 0;
/** @type {any[]} */
let _heatmapData = [];
/** @type {any[]} */
let _attempts = [];
/** @type {any[]} */
let _tests = [];

// ─── Helpers ──────────────────────────────────────────────────

/** Wrap formatDuration with a '—' fallback for zero/null values. */
function fmtDuration(ms) {
  if (!ms) return '—';
  return formatDuration(ms);
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return '—';
  }
}

function scoreColor(pct) {
  if (pct >= 75) return 'var(--accent)';
  if (pct >= 50) return 'var(--ink-fade)';
  return 'var(--ink-mute)';
}

// ─── SVG Sparkline ────────────────────────────────────────────

function buildSparklineSvg(values, width, height) {
  if (!values || values.length < 2) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <text x="${width/2}" y="${height/2+4}" text-anchor="middle" font-size="11"
            fill="var(--ink-mute)" font-family="Inter,sans-serif">No data</text>
    </svg>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 10;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const xs = values.map((_, i) => pad + (i / (values.length - 1)) * w);
  const ys = values.map(v => pad + h - ((v - min) / range) * h);
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  // Area fill path
  const area = `M${xs[0]},${height - pad} L${xs.map((x, i) => `${x},${ys[i]}`).join(' L')} L${xs[xs.length-1]},${height - pad} Z`;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible">
    <defs>
      <linearGradient id="st-spark-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#st-spark-grad)"/>
    <polyline points="${pts}" fill="none" stroke="var(--accent)"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${xs.map((x, i) => `<circle cx="${x}" cy="${ys[i]}" r="3" fill="var(--accent)" stroke="var(--paper)" stroke-width="2"/>`).join('')}
  </svg>`;
}

// ─── Heatmap ──────────────────────────────────────────────────

function buildHeatmapGrid(data, weeks) {
  const WEEKS = weeks || 16;
  const today = new Date();
  const cells = [];

  const countByDate = {};
  if (Array.isArray(data)) {
    for (const d of data) {
      if (d.date) countByDate[d.date] = d.count || 0;
    }
  }

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (WEEKS * 7 - 1));

  for (let d = 0; d < WEEKS * 7; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const key = date.toISOString().slice(0, 10);
    const count = countByDate[key] || 0;
    const lvl = count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : 3;
    cells.push(`<div class="heatmap-cell" data-lvl="${lvl}" title="${key}: ${count}"></div>`);
  }

  return `<div class="heatmap-grid" style="grid-template-columns:repeat(${WEEKS},13px);grid-template-rows:repeat(7,13px);">
    ${cells.join('')}
  </div>`;
}

// ─── Per-test grouping ────────────────────────────────────────

function groupByTest(attempts) {
  /** @type {Map<string, { best: number, count: number, last: string }>} */
  const map = new Map();
  for (const a of attempts) {
    if (!a.testId || a.status !== 'completed') continue;
    const pct = a.percentCorrect ?? 0;
    const existing = map.get(a.testId);
    if (!existing) {
      map.set(a.testId, { best: pct, count: 1, last: a.finishedAt || a.startedAt });
    } else {
      existing.count += 1;
      if (pct > existing.best) existing.best = pct;
      const d = a.finishedAt || a.startedAt;
      if (d && d > existing.last) existing.last = d;
    }
  }
  return map;
}

// ─── Tab: Overall ─────────────────────────────────────────────

function buildOverallTab() {
  const agg = _agg || {};
  const streak = _streak;

  // KPI data
  const pct = Math.round(agg.avgPercentCorrect ?? 0);
  const avgTimeMs = agg.avgTimePerQuestion ?? 0;
  const avgTimeSec = Math.round(avgTimeMs / 1000);

  const kpiData = [
    { label: t('stats.accuracy') || 'Accuracy',      val: pct ? `${pct}%` : '—',             cls: '' },
    { label: t('stats.streak') || 'Streak',          val: `${streak}`,   suffix: ` ${t('stats.days')||'d'}`, cls: 'st-kpi--streak', emoji: streak >= 3 ? '🔥' : '' },
    { label: t('stats.total_attempts') || 'Attempts',val: agg.attemptCount ?? 0,               cls: '' },
    { label: t('stats.avg_time') || 'Avg time/Q',    val: avgTimeSec ? `${avgTimeSec}s` : '—', cls: '' },
    { label: t('common.questions') || 'Questions',      val: agg.totalQuestions ?? 0,            cls: '' },
  ];

  // Attempt accuracy trend from _attempts (sorted old→new, take last 20 completed)
  const completed = _attempts
    .filter(a => a.status === 'completed' && typeof a.percentCorrect === 'number')
    .slice(0, 20)
    .reverse();
  const sparkValues = completed.map(a => a.percentCorrect);

  // Weak topics: attempts sorted by lowest percentCorrect, grouped by test
  const testMap = groupByTest(_attempts);
  const testList = _tests.filter(te => testMap.has(te.id));
  const weakTopics = testList
    .map(test => ({ title: test.title, pct: Math.round(testMap.get(test.id).best), ...testMap.get(test.id) }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 6);

  const kpiHTML = kpiData.map(k => `
    <div class="st-kpi ${k.cls}">
      <div class="st-kpi__label">${k.label}</div>
      <div class="st-kpi__val">${k.val}${k.suffix || ''}${k.emoji ? ` ${k.emoji}` : ''}</div>
    </div>
  `).join('');

  const noData = !completed.length;

  return `
    <div class="st-kpi-row">${kpiHTML}</div>

    <div class="st-charts">
      <div class="st-chart-card">
        <div class="st-chart-card__head">
          <span class="st-chart-card__title">${t('stats.accuracy_trend') || 'Accuracy over time'}</span>
          <span class="st-chart-card__sub">${completed.length ? `${completed.length} attempts` : ''}</span>
        </div>
        ${noData
          ? `<div class="st-empty" style="padding:24px 0;">
               <div class="st-empty__text">${t('stats.no_data') || 'No data yet.'}</div>
             </div>`
          : buildSparklineSvg(sparkValues, 460, 130)
        }
      </div>

      <div class="st-chart-card">
        <div class="st-chart-card__head">
          <span class="st-chart-card__title">${t('stats.weak_topics') || 'Weak / strong topics'}</span>
        </div>
        ${!weakTopics.length
          ? `<div class="st-empty" style="padding:16px 0;">
               <div class="st-empty__text">${t('stats.no_data') || 'No data yet.'}</div>
             </div>`
          : weakTopics.map(topic => `
              <div class="st-topic-row">
                <div class="st-topic-head">
                  <span class="st-topic-name">${escapeHtml(topic.title)}</span>
                  <span class="st-topic-pct">${topic.pct}%</span>
                </div>
                <div class="st-topic-track">
                  <div class="st-topic-fill ${topic.pct < 60 ? 'st-topic-fill--weak' : ''}"
                       style="width:${topic.pct}%"></div>
                </div>
              </div>
            `).join('')
        }
      </div>
    </div>

    <div class="st-heatmap-wrap">
      <div class="st-heatmap-head">
        <span class="st-heatmap-title">${t('stats.activity') || 'Activity'}</span>
        <span class="st-heatmap-sub">16 wks</span>
      </div>
      ${buildHeatmapGrid(_heatmapData, 16)}
      <div class="st-heatmap-legend">
        <span class="st-heatmap-legend__label">less</span>
        ${[0,1,2,3].map(l => `<div class="st-heatmap-legend__cell heatmap-cell" data-lvl="${l}"></div>`).join('')}
        <span class="st-heatmap-legend__label">more</span>
      </div>
    </div>
  `;
}

// ─── Tab: By Test ─────────────────────────────────────────────

function buildByTestTab() {
  const testMap = groupByTest(_attempts);

  const attemptedTests = _tests
    .filter(test => testMap.has(test.id))
    .map(test => ({ test, stats: testMap.get(test.id) }))
    .sort((a, b) => (b.stats.last > a.stats.last ? 1 : -1));

  if (!attemptedTests.length) {
    return `<div class="st-empty">
      <div class="st-empty__icon">${iconEl('chart', 40)?.outerHTML || ''}</div>
      <div class="st-empty__text">${t('stats.no_data') || 'No statistics yet. Complete an attempt first.'}</div>
      <a href="#/home" class="btn btn--ghost btn--small" style="margin-top:16px">← ${t('nav.home') || 'Home'}</a>
    </div>`;
  }

  const cards = attemptedTests.map(({ test, stats }) => {
    const best = Math.round(stats.best);
    return `
      <a class="st-test-card" href="#/test/${test.id}">
        <div class="st-test-card__title">${escapeHtml(test.title || 'Untitled')}</div>
        <div class="st-test-card__stats">
          <div class="st-test-card__stat">
            <span class="st-test-card__stat-val">${best}%</span>
            <span class="st-test-card__stat-label">${t('test.best') || 'best'}</span>
          </div>
          <div class="st-test-card__stat">
            <span class="st-test-card__stat-val">${stats.count}</span>
            <span class="st-test-card__stat-label">${t('test.attempts') || 'attempts'}</span>
          </div>
          <div class="st-test-card__stat">
            <span class="st-test-card__stat-val">${fmtDate(stats.last)}</span>
            <span class="st-test-card__stat-label">${t('stats.date') || 'last'}</span>
          </div>
        </div>
        <div class="st-test-card__score-bar">
          <div class="st-test-card__score-fill" style="width:${best}%"></div>
        </div>
      </a>
    `;
  }).join('');

  return `<div class="st-test-grid">${cards}</div>`;
}

// ─── Tab: Activity ────────────────────────────────────────────

function buildActivityTab() {
  const completed = _attempts.filter(a => a.status === 'completed');

  return `
    <div class="st-heatmap-wrap" style="margin-bottom:20px;">
      <div class="st-heatmap-head">
        <span class="st-heatmap-title">${t('stats.activity') || 'Activity'}</span>
        <span class="st-heatmap-sub">16 wks</span>
      </div>
      ${buildHeatmapGrid(_heatmapData, 16)}
      <div class="st-heatmap-legend">
        <span class="st-heatmap-legend__label">less</span>
        ${[0,1,2,3].map(l => `<div class="st-heatmap-legend__cell heatmap-cell" data-lvl="${l}"></div>`).join('')}
        <span class="st-heatmap-legend__label">more</span>
      </div>
    </div>

    <div class="st-recent-head">${t('stats.recent_attempts') || 'Recent attempts'}</div>

    ${!completed.length
      ? `<div class="st-empty">
           <div class="st-empty__text">${t('stats.no_attempts') || 'No attempts yet.'}</div>
         </div>`
      : `<table class="st-attempts-table">
           <thead>
             <tr>
               <th>${t('nav.tests') || 'Test'}</th>
               <th>${t('stats.score') || 'Score'}</th>
               <th>${t('stats.duration') || 'Time'}</th>
               <th>${t('stats.date') || 'Date'}</th>
             </tr>
           </thead>
           <tbody>
             ${completed.slice(0, 50).map(a => {
               const pct = Math.round(a.percentCorrect ?? 0);
               const testTitle = _tests.find(te => te.id === a.testId)?.title || a.testId || '—';
               return `
                 <tr>
                   <td>
                     <a href="#/test/${a.testId}" style="color:var(--ink);text-decoration:none;">
                       ${escapeHtml(String(testTitle).slice(0, 48))}
                     </a>
                   </td>
                   <td>
                     <span class="st-score-pill ${pct < 50 ? 'st-score-pill--weak' : ''}">${pct}%</span>
                   </td>
                   <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--ink-fade)">
                     ${fmtDuration(a.totalDurationMs)}
                   </td>
                   <td style="font-size:12px;color:var(--ink-mute)">
                     ${fmtDate(a.finishedAt || a.startedAt)}
                   </td>
                 </tr>
               `;
             }).join('')}
           </tbody>
         </table>`
    }
  `;
}

// ─── Full screen render ───────────────────────────────────────

function buildScreen() {
  const tabCfg = [
    { id: 'overall',  label: t('stats.overall')  || 'Overall'  },
    { id: 'bytest',   label: t('stats.by_test')  || 'By Test'  },
    { id: 'activity', label: t('stats.activity') || 'Activity' },
  ];

  const tabsHTML = tabCfg.map(tc => `
    <button class="st-tab ${_tab === tc.id ? 'st-tab--active' : ''}"
            data-tab="${tc.id}">${tc.label}</button>
  `).join('');

  let bodyHTML;
  if (_tab === 'overall')  bodyHTML = buildOverallTab();
  else if (_tab === 'bytest')   bodyHTML = buildByTestTab();
  else                          bodyHTML = buildActivityTab();

  const el = document.createElement('div');
  el.className = 'st';
  el.innerHTML = `
    <div class="st__topbar">
      <div style="display:flex;align-items:center;gap:10px;">
        <a href="#/home" class="btn btn--ghost btn--small" style="display:inline-flex;align-items:center;gap:5px;">
          ${icon('chevL', 14)} ${t('common.back') || 'Back'}
        </a>
        <span class="st-topbar__title">${t('nav.stats') || 'Statistics'}</span>
      </div>
      <div class="st-topbar__tabs">${tabsHTML}</div>
    </div>
    <div class="st__body">${bodyHTML}</div>
  `;

  // Tab click handlers
  el.querySelectorAll('.st-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _tab = btn.dataset.tab;
      mount(_root);
    });
  });

  return el;
}

// ─── Loading skeleton ─────────────────────────────────────────

function buildSkeleton() {
  return `<div class="st-skeleton-kpi">
    ${[1,2,3,4,5].map(() => '<div class="skeleton"></div>').join('')}
  </div>
  <div class="skeleton" style="height:180px;border-radius:var(--radius-md);margin-bottom:14px;"></div>
  <div class="skeleton" style="height:120px;border-radius:var(--radius-md);"></div>`;
}

// ─── Mount ────────────────────────────────────────────────────

async function mount(root) {
  _root = root;
  root.innerHTML = '';

  // Show skeleton while loading
  const shell = document.createElement('div');
  shell.className = 'st';
  shell.innerHTML = `
    <div class="st__topbar">
      <div style="display:flex;align-items:center;gap:10px;">
        <a href="#/home" class="btn btn--ghost btn--small" style="display:inline-flex;align-items:center;gap:5px;">
          ${icon('chevL', 14)} ${t('common.back') || 'Back'}
        </a>
        <span class="st-topbar__title">${t('nav.stats') || 'Statistics'}</span>
      </div>
      <div class="st-topbar__tabs">
        ${['overall','bytest','activity'].map(id => `
          <button class="st-tab ${_tab === id ? 'st-tab--active' : ''}" data-tab="${id}">
            ${id === 'overall' ? (t('stats.overall')||'Overall') : id === 'bytest' ? (t('stats.by_test')||'By Test') : (t('stats.activity')||'Activity')}
          </button>
        `).join('')}
      </div>
    </div>
    <div class="st__body" id="st-body">${buildSkeleton()}</div>
  `;
  root.appendChild(shell);

  // Wire up tab clicks even during load
  shell.querySelectorAll('.st-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _tab = btn.dataset.tab;
      mount(_root);
    });
  });

  // Fetch data in parallel
  try {
    const clientId = getClientId();
    const [aggRes, streakRes, heatmapRes, attemptsRes, testsRes] = await Promise.allSettled([
      getMyAggregate(),
      getStreak(),
      getHeatmap(16),
      listAttempts({ clientId, status: 'completed', limit: 200 }),
      listTests(),
    ]);

    _agg         = aggRes.status         === 'fulfilled' ? aggRes.value         : null;
    _streak      = streakRes.status      === 'fulfilled' ? (streakRes.value?.streak ?? 0) : 0;
    _heatmapData = heatmapRes.status     === 'fulfilled' ? (heatmapRes.value?.days || heatmapRes.value?.heatmap || []) : [];
    _attempts    = attemptsRes.status    === 'fulfilled' ? (attemptsRes.value?.attempts || []) : [];
    _tests       = Array.isArray(testsRes.value)         ? testsRes.value
                   : (testsRes.status === 'fulfilled' ? (testsRes.value?.tests || testsRes.value || []) : []);
  } catch (e) {
    console.error('[stats] load error:', e);
  }

  // Re-render with real data
  const newScreen = buildScreen();
  root.innerHTML = '';
  root.appendChild(newScreen);
}

// ─── Entry point ──────────────────────────────────────────────

export default async function render(root) {
  // Reset state on each navigation
  _tab = 'overall';
  _agg = null;
  _streak = 0;
  _heatmapData = [];
  _attempts = [];
  _tests = [];

  await mount(root);
}
