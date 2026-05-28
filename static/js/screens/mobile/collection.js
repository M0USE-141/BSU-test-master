/**
 * screens/mobile/collection.js — Mobile collection detail
 * Route: /collection/:id  (also used for /test/:id)
 *
 * Tabs: Overview | History | Stats
 */
import { getTest } from '../../api/tests.js';
import { getMyAggregate, listAttempts } from '../../api/statistics.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { navigate } from '../../router.js';
import { buildBottomNav, esc, getClientId, fmtDate } from './_shell.js';

// ── Helpers ───────────────────────────────────────────────────

function fmtMs(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  if (m === 0) return `${ss}s`;
  return ss > 0 ? `${m}m ${ss}s` : `${m}m`;
}

function buildSparkline(scores) {
  if (scores.length < 2) return '';
  const W = 240, H = 44, P = 5;
  const max = Math.max(...scores, 1);
  const min = Math.min(...scores);
  const range = max - min || 1;
  const step = (W - P * 2) / (scores.length - 1);
  const pts = scores.map((v, i) => {
    const x = P + i * step;
    const y = H - P - ((v - min) / range) * (H - P * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const dots = scores.map((v, i) => {
    const x = P + i * step;
    const y = H - P - ((v - min) / range) * (H - P * 2);
    const last = i === scores.length - 1;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${last ? 4 : 2.5}"
      fill="var(--accent)" opacity="${last ? 1 : 0.5}"/>`;
  }).join('');
  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}"
         preserveAspectRatio="none" style="display:block;overflow:visible;">
      <polyline points="${pts}" fill="none" stroke="var(--accent)"
                stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
    </svg>`;
}

// ── Main render ───────────────────────────────────────────────

export default async function render(root, params = {}) {
  const testId = params.id;
  if (!testId) { navigate('/home'); return; }

  // Skeleton
  root.innerHTML = `
    <div class="mob">
      <div class="mob__content" style="padding:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <button class="mob-topbar__back mob-back-btn">${iconEl('chevL', 16)?.outerHTML || '←'}</button>
          <span style="font:600 17px/1 Inter,sans-serif;color:var(--ink);">${t('test.collection') || 'Collection'}</span>
        </div>
        ${[80, 50, 44, 44].map(h =>
          `<div class="skeleton" style="height:${h}px;border-radius:var(--radius-md);margin-bottom:8px;"></div>`
        ).join('')}
      </div>
    </div>`;
  root.querySelector('.mob-back-btn')?.addEventListener('click', () => history.back());

  // ── Fetch all data upfront ────────────────────────────────
  let test = null, agg = null, allAttempts = [];
  try {
    const [testRes, aggRes, attRes] = await Promise.allSettled([
      getTest(testId),
      getMyAggregate({ test_id: testId }),
      listAttempts({ clientId: getClientId(), testId, status: 'completed', limit: 100 }),
    ]);
    if (testRes.status === 'fulfilled') test         = testRes.value?.metadata || testRes.value;
    if (aggRes.status === 'fulfilled')  agg          = aggRes.value;
    if (attRes.status === 'fulfilled')  allAttempts  = attRes.value?.attempts || [];
    if (!Array.isArray(allAttempts)) allAttempts = [];
  } catch {}

  if (!test) {
    root.innerHTML = `<div class="mob" style="padding:24px;color:var(--ink-mute)">
      ${t('common.error') || 'Error loading.'}
    </div>`;
    return;
  }

  // ── Derived stats ─────────────────────────────────────────
  const qCount   = test.questionCount ?? test.question_count ?? test.questions?.length ?? '?';
  const attCount = agg?.attemptCount ?? 0;
  const avgPct   = Math.round(agg?.avgPercentCorrect ?? 0);
  const avgTimeSec = agg?.avgTimePerQuestion ? Math.round(agg.avgTimePerQuestion / 1000) : null;
  const bestPct  = allAttempts.length
    ? Math.round(Math.max(...allAttempts.map(a => a.percentCorrect ?? 0)))
    : null;

  let activeTab = 'overview';

  // ── Tab: Overview ─────────────────────────────────────────
  function renderOverview() {
    return `
      <div class="mob-kpis">
        <div class="mob-kpi">
          <div class="mob-kpi__val">${qCount}</div>
          <div class="mob-kpi__label">${t('common.questions') || 'questions'}</div>
        </div>
        <div class="mob-kpi">
          <div class="mob-kpi__val">${attCount}</div>
          <div class="mob-kpi__label">${t('test.attempts') || 'attempts'}</div>
        </div>
        <div class="mob-kpi">
          <div class="mob-kpi__val">${avgPct ? `${avgPct}%` : '—'}</div>
          <div class="mob-kpi__label">${t('stats.your_avg') || 'your avg'}</div>
        </div>
        <div class="mob-kpi">
          <div class="mob-kpi__val">${avgTimeSec !== null ? `${avgTimeSec}s` : '—'}</div>
          <div class="mob-kpi__label">${t('stats.avg_time') || 'avg/q'}</div>
        </div>
      </div>

      <div style="padding:0 16px 24px;">
        <div style="font:600 13px/1 Inter,sans-serif;color:var(--ink);margin-bottom:6px;">
          ${t('test.description') || 'Description'}
        </div>
        <div style="font:400 13px/1.5 Inter,sans-serif;color:var(--ink-fade);">
          ${esc(test.description || '') ||
            `<em style="color:var(--ink-mute)">${t('test.no_description') || 'No description.'}</em>`}
        </div>
      </div>`;
  }

  // ── Tab: History ──────────────────────────────────────────
  function renderHistory() {
    if (!allAttempts.length) {
      return `<div class="mob-empty"><div class="mob-empty__text">
        ${t('stats.no_attempts') || 'No attempts yet.'}
      </div></div>`;
    }
    return `<div style="padding:0 16px 32px;">
      ${allAttempts.map(a => {
        const pct   = Math.round(a.percentCorrect ?? 0);
        const color = pct >= 70 ? 'var(--accent)' : '#c4554a';
        const bg    = pct >= 70 ? 'var(--accent-soft)' : 'rgba(196,85,74,.10)';
        const dur   = fmtMs(a.totalDurationMs);
        const when  = fmtDate(a.finishedAt || a.startedAt);
        return `
          <div class="mob-att-row" data-attempt-id="${esc(a.attemptId || '')}">
            <span class="mob-att-badge" style="background:${bg};color:${color};">${pct}%</span>
            <div style="flex:1;min-width:0;">
              <div style="font:500 13px/1.3 Inter,sans-serif;color:var(--ink);">
                ${a.correctCount ?? '?'}&thinsp;/&thinsp;${a.questionCount ?? '?'}
                ${t('results.correct') || 'correct'}
              </div>
              <div style="font:400 11px/1 Inter,sans-serif;color:var(--ink-mute);margin-top:3px;">
                ${dur} · ${when}
              </div>
            </div>
            ${iconEl('chevR', 12)?.outerHTML || ''}
          </div>`;
      }).join('')}
    </div>`;
  }

  // ── Tab: Stats ────────────────────────────────────────────
  function renderStats() {
    // Show scores oldest-first for the trend chart
    const recentScores = allAttempts.slice(0, 10).reverse().map(a => a.percentCorrect ?? 0);

    return `<div style="padding:0 16px 32px;">

      <!-- KPI grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">
        <div class="mob-kpi">
          <div class="mob-kpi__val">${attCount || '—'}</div>
          <div class="mob-kpi__label">${t('stats.total_attempts') || 'attempts'}</div>
        </div>
        <div class="mob-kpi">
          <div class="mob-kpi__val">${bestPct !== null ? `${bestPct}%` : '—'}</div>
          <div class="mob-kpi__label">${t('stats.best_score') || 'best score'}</div>
        </div>
        <div class="mob-kpi">
          <div class="mob-kpi__val">${avgPct ? `${avgPct}%` : '—'}</div>
          <div class="mob-kpi__label">${t('stats.your_avg') || 'avg score'}</div>
        </div>
        <div class="mob-kpi">
          <div class="mob-kpi__val">${avgTimeSec !== null ? `${avgTimeSec}s` : '—'}</div>
          <div class="mob-kpi__label">${t('stats.avg_time') || 'avg/q'}</div>
        </div>
      </div>

      <!-- Score trend sparkline -->
      ${recentScores.length >= 2 ? `
      <div>
        <div style="font:600 13px/1 Inter,sans-serif;color:var(--ink);margin-bottom:8px;">
          ${t('results.trend') || 'Score trend'}
          <span style="font-weight:400;color:var(--ink-mute);">
            (${t('stats.last') || 'last'} ${recentScores.length})
          </span>
        </div>
        <div style="border:var(--border);border-radius:var(--radius-md);
                    padding:12px 12px 6px;background:var(--paper);">
          ${buildSparkline(recentScores)}
          <div style="display:flex;justify-content:space-between;margin-top:2px;
                      font:400 10px/1 Inter,sans-serif;color:var(--ink-mute);">
            <span>${t('stats.oldest') || 'oldest'}</span>
            <span>${t('stats.recent_label') || 'recent'}</span>
          </div>
        </div>
      </div>` : `
      <div style="font:400 13px/1.5 Inter,sans-serif;color:var(--ink-mute);">
        ${t('results.trend_coming') || 'Complete more attempts to see your trend.'}
      </div>`}
    </div>`;
  }

  // ── Build screen ──────────────────────────────────────────
  const screen = document.createElement('div');
  screen.className = 'mob';
  screen.innerHTML = `
    <div class="mob__content">

      <!-- Back + crumb -->
      <div style="display:flex;align-items:center;gap:8px;padding:12px 16px 0;">
        <button class="mob-topbar__back mob-coll-back">${iconEl('chevL', 16)?.outerHTML || '←'}</button>
        <span style="font:400 11px/1 Inter,sans-serif;color:var(--ink-mute);
                     text-transform:uppercase;letter-spacing:.06em;">
          ${t('test.collection') || 'collection'}
        </span>
      </div>

      <!-- Title + access chip -->
      <div class="mob-coll-header">
        <div class="mob-coll-title">${esc(test.title || 'Untitled')}</div>
        <div class="mob-coll-chips">
          <span class="chip chip--active">${
            test.access_level === 'public'  ? (t('test.public')  || 'Public')
            : test.access_level === 'shared' ? (t('test.shared') || 'Shared')
            : (t('test.private') || 'Private')
          }</span>
          <span class="chip">${qCount} ${t('test.questions') || 'q'}</span>
          ${attCount ? `<span class="chip">${attCount} ${t('test.attempts') || 'att'}</span>` : ''}
        </div>
      </div>

      <!-- Start button -->
      <div class="mob-coll-actions">
        <a href="#/test/${testId}/take" class="btn btn--primary" style="flex:1;justify-content:center;">
          ${iconEl('play', 14)?.outerHTML || ''} ${t('test.start') || 'Start test'}
        </a>
      </div>

      <!-- Tab bar -->
      <div class="mob-segment" id="mob-coll-tabs" style="margin:0 16px 0;">
        ${['overview', 'history', 'stats'].map(tab => `
          <div class="mob-segment__item ${tab === activeTab ? 'mob-segment__item--active' : ''}"
               data-tab="${tab}">
            ${tab === 'overview' ? (t('common.overview') || 'Overview')
            : tab === 'history'  ? (t('stats.history')   || 'History')
            :                      (t('nav.stats')        || 'Stats')}
          </div>`).join('')}
      </div>

      <!-- Tab content area -->
      <div id="mob-coll-content">${renderOverview()}</div>

    </div>`;

  // Wire up history row clicks (also called after each tab render)
  function wireHistoryClicks() {
    screen.querySelectorAll('.mob-att-row').forEach(row => {
      row.addEventListener('click', () => {
        const attemptId = row.dataset.attemptId;
        if (!attemptId) return;
        // Store clientId so results.js can load this historical attempt
        sessionStorage.setItem(`att:${attemptId}:client`, getClientId());
        sessionStorage.setItem(`att:${attemptId}:testId`, testId);
        navigate(`/test/${testId}/results/${attemptId}`);
      });
    });
  }

  // Tab switching
  screen.querySelector('#mob-coll-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-tab]');
    if (!btn || btn.dataset.tab === activeTab) return;
    activeTab = btn.dataset.tab;
    screen.querySelectorAll('[data-tab]').forEach(el => {
      el.classList.toggle('mob-segment__item--active', el.dataset.tab === activeTab);
    });
    const content = screen.querySelector('#mob-coll-content');
    if (!content) return;
    content.innerHTML =
      activeTab === 'overview' ? renderOverview()
      : activeTab === 'history' ? renderHistory()
      : renderStats();
    if (activeTab === 'history') wireHistoryClicks();
  });

  screen.querySelector('.mob-coll-back')?.addEventListener('click', () => history.back());
  screen.appendChild(buildBottomNav('tests'));
  root.innerHTML = '';
  root.appendChild(screen);
}
