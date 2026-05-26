/**
 * screens/mobile/stats.js — Mobile statistics screen
 */
import { getMyAggregate, getHeatmap, getStreak, listAttempts } from '../../api/statistics.js';
import { listTests } from '../../api/tests.js';
import { t } from '../../utils/locale.js';
import { buildBottomNav, esc, getClientId, fmtDate } from './_shell.js';

let _renderToken = 0;

function buildHeatmapCells(data, weeks) {
  const WEEKS = weeks || 12;
  const today = new Date();
  const countByDate = {};
  if (Array.isArray(data)) {
    for (const d of data) countByDate[d.date] = d.count || 0;
  }
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (WEEKS * 7 - 1));
  let html = '';
  for (let d = 0; d < WEEKS * 7; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const key = date.toISOString().slice(0, 10);
    const count = countByDate[key] || 0;
    const lvl = count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : 3;
    html += `<div class="heatmap-cell" data-lvl="${lvl}" title="${key}: ${count}"></div>`;
  }
  return `<div class="heatmap-grid" style="grid-template-columns:repeat(${WEEKS},13px);grid-template-rows:repeat(7,13px);">${html}</div>`;
}

export default async function render(root) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  root.innerHTML = `
    <div class="mob">
      <div class="mob-topbar">
        <span class="mob-topbar__title">${t('nav.stats') || 'Statistics'}</span>
      </div>
      <div class="mob__content">
        <div class="mob-stats">
          <div class="mob-stats-kpis">
            ${[1,2,3,4].map(() => `<div class="skeleton" style="height:68px;border-radius:var(--radius-md);"></div>`).join('')}
          </div>
          <div class="skeleton" style="height:120px;border-radius:var(--radius-md);"></div>
        </div>
      </div>
    </div>`;

  let agg = null, streak = 0, heatmapData = [], attempts = [], tests = [];
  try {
    const [aggRes, strRes, hmRes, attRes, testsRes] = await Promise.allSettled([
      getMyAggregate(),
      getStreak(),
      getHeatmap(12),
      listAttempts({ clientId: getClientId(), status: 'completed', limit: 100 }),
      listTests(),
    ]);
    if (stale()) return;
    agg         = aggRes.status   === 'fulfilled' ? aggRes.value : null;
    streak      = strRes.status   === 'fulfilled' ? (strRes.value?.streak ?? 0) : 0;
    heatmapData = hmRes.status    === 'fulfilled' ? (hmRes.value?.days || []) : [];
    attempts    = attRes.status   === 'fulfilled' ? (attRes.value?.attempts || []) : [];
    tests       = testsRes.status === 'fulfilled' ? (testsRes.value?.tests || testsRes.value || []) : [];
  } catch { if (stale()) return; }
  if (stale()) return;

  const pct     = Math.round(agg?.avgPercentCorrect ?? 0);
  const avgSec  = agg?.avgTimePerQuestion ? Math.round(agg.avgTimePerQuestion / 1000) : 0;

  const screen = document.createElement('div');
  screen.className = 'mob';
  screen.innerHTML = `
    <div class="mob-topbar" style="flex-shrink:0;">
      <span class="mob-topbar__title">${t('nav.stats') || 'Statistics'}</span>
    </div>
    <div class="mob__content">
      <div class="mob-stats">
        <!-- KPIs -->
        <div class="mob-stats-kpis">
          <div class="mob-kpi">
            <div class="mob-kpi__val">${pct ? `${pct}%` : '—'}</div>
            <div class="mob-kpi__label">${t('stats.accuracy') || 'Accuracy'}</div>
          </div>
          <div class="mob-kpi">
            <div class="mob-kpi__val">${streak}${streak >= 3 ? ' 🔥' : ''}</div>
            <div class="mob-kpi__label">${t('stats.streak') || 'Streak'}</div>
          </div>
          <div class="mob-kpi">
            <div class="mob-kpi__val">${agg?.attemptCount ?? 0}</div>
            <div class="mob-kpi__label">${t('stats.total_attempts') || 'Attempts'}</div>
          </div>
          <div class="mob-kpi">
            <div class="mob-kpi__val">${avgSec ? `${avgSec}s` : '—'}</div>
            <div class="mob-kpi__label">${t('stats.avg_time') || 'Avg/Q'}</div>
          </div>
        </div>

        <!-- Heatmap -->
        <div style="border:var(--border);border-radius:var(--radius-md);padding:14px;margin-bottom:14px;overflow-x:auto;">
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="font:600 13px/1 Inter,sans-serif;color:var(--ink);">${t('stats.activity') || 'Activity'}</span>
            <span style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);">12 wks</span>
          </div>
          ${buildHeatmapCells(heatmapData, 12)}
          <div class="st-heatmap-legend" style="margin-top:8px;">
            <span class="st-heatmap-legend__label">less</span>
            ${[0,1,2,3].map(l => `<div class="st-heatmap-legend__cell heatmap-cell" data-lvl="${l}"></div>`).join('')}
            <span class="st-heatmap-legend__label">more</span>
          </div>
        </div>

        <!-- Recent attempts -->
        <div style="font:600 13px/1 Inter,sans-serif;color:var(--ink);margin-bottom:8px;">${t('stats.recent_attempts') || 'Recent attempts'}</div>
        ${!attempts.length
          ? `<div class="mob-empty"><div class="mob-empty__text">${t('stats.no_attempts') || 'No attempts yet.'}</div></div>`
          : attempts.slice(0, 20).map(a => {
              const pct = Math.round(a.percentCorrect ?? 0);
              const title = tests.find(te => te.id === a.testId)?.title || '—';
              return `
                <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--ink-soft);">
                  <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${pct >= 50 ? 'var(--accent-soft)' : 'var(--ink-soft)'};
                        color:${pct >= 50 ? 'var(--accent)' : 'var(--ink-fade)'};font:600 12px/1.4 'JetBrains Mono',monospace;flex-shrink:0;">${pct}%</span>
                  <span style="flex:1;font:400 13px/1.3 Inter,sans-serif;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(String(title).slice(0,40))}</span>
                  <span style="font:400 11px/1 Inter,sans-serif;color:var(--ink-mute);flex-shrink:0;">${fmtDate(a.finishedAt || a.startedAt)}</span>
                </div>`;
            }).join('')
        }
      </div>
    </div>
  `;

  screen.appendChild(buildBottomNav('stats'));
  root.innerHTML = '';
  root.appendChild(screen);
}
