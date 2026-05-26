/**
 * screens/mobile/collection.js — Mobile collection detail
 * Route: /collection/:id  (also used for /test/:id)
 */
import { getTest } from '../../api/tests.js';
import { getMyAggregate, listAttempts } from '../../api/statistics.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { navigate } from '../../router.js';
import { buildBottomNav, esc, getClientId, fmtDate } from './_shell.js';

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
        <div class="skeleton" style="height:28px;border-radius:8px;margin-bottom:8px;max-width:80%;"></div>
        <div class="skeleton" style="height:16px;border-radius:8px;margin-bottom:16px;max-width:50%;"></div>
        <div class="skeleton" style="height:44px;border-radius:var(--radius-md);margin-bottom:8px;"></div>
        <div class="skeleton" style="height:44px;border-radius:var(--radius-md);"></div>
      </div>
    </div>`;
  root.querySelector('.mob-back-btn')?.addEventListener('click', () => history.back());

  // Fetch
  let test = null, agg = null, recentAttempts = [];
  try {
    const [testRes, aggRes, attRes] = await Promise.allSettled([
      getTest(testId),
      getMyAggregate({ test_id: testId }),
      listAttempts({ clientId: getClientId(), testId, status: 'completed', limit: 5 }),
    ]);
    if (testRes.status  === 'fulfilled') test           = testRes.value?.metadata || testRes.value;
    if (aggRes.status   === 'fulfilled') agg            = aggRes.value;
    if (attRes.status   === 'fulfilled') recentAttempts = attRes.value?.attempts || [];
  } catch {}

  if (!test) {
    root.innerHTML = `<div class="mob" style="padding:24px;color:var(--ink-mute)">${t('common.error') || 'Error loading.'}</div>`;
    return;
  }

  const qCount   = test.questionCount ?? test.question_count ?? test.questions?.length ?? '?';
  const attempts = agg?.attemptCount ?? 0;
  const avgPct   = Math.round(agg?.avgPercentCorrect ?? 0);
  const avgTimeSec = agg?.avgTimePerQuestion ? Math.round(agg.avgTimePerQuestion / 1000) + 's' : '—';

  const screen = document.createElement('div');
  screen.className = 'mob';
  screen.innerHTML = `
    <div class="mob__content">
      <div style="display:flex;align-items:center;gap:8px;padding:12px 16px 0;">
        <button class="mob-topbar__back mob-back-btn-inner">${iconEl('chevL', 16)?.outerHTML || '←'}</button>
        <span style="font:400 11px/1 Inter,sans-serif;color:var(--ink-mute);text-transform:uppercase;letter-spacing:.06em;">
          ${t('test.collection') || 'collection'}
        </span>
      </div>

      <div class="mob-coll-header">
        <div class="mob-coll-title">${esc(test.title || 'Untitled')}</div>
        <div class="mob-coll-chips">
          <span class="chip chip--active">${
            test.access_level === 'public'  ? (t('test.public')  || 'Public')
            : test.access_level === 'shared' ? (t('test.shared') || 'Shared')
            : (t('test.private') || 'Private')
          }</span>
          <span class="chip">${qCount} ${t('test.questions') || 'q'}</span>
          <span class="chip">${attempts} ${t('test.attempts') || 'att'}</span>
        </div>
      </div>

      <div class="mob-coll-actions">
        <a href="#/test/${testId}/take" class="btn btn--primary" style="flex:1;justify-content:center;">
          ${iconEl('play', 14)?.outerHTML || ''} ${t('test.start') || 'Start test'}
        </a>
      </div>

      <div class="mob-kpis">
        <div class="mob-kpi">
          <div class="mob-kpi__val">${qCount}</div>
          <div class="mob-kpi__label">${t('common.questions') || 'questions'}</div>
        </div>
        <div class="mob-kpi">
          <div class="mob-kpi__val">${attempts}</div>
          <div class="mob-kpi__label">${t('test.attempts') || 'attempts'}</div>
        </div>
        <div class="mob-kpi">
          <div class="mob-kpi__val">${avgPct ? `${avgPct}%` : '—'}</div>
          <div class="mob-kpi__label">${t('stats.your_avg') || 'your avg'}</div>
        </div>
        <div class="mob-kpi">
          <div class="mob-kpi__val">${avgTimeSec}</div>
          <div class="mob-kpi__label">${t('stats.avg_time') || 'avg/q'}</div>
        </div>
      </div>

      <div style="padding:0 16px 14px;">
        <div style="font:600 13px/1 Inter,sans-serif;color:var(--ink);margin-bottom:6px;">${t('test.description') || 'Description'}</div>
        <div style="font:400 13px/1.5 Inter,sans-serif;color:var(--ink-fade);">
          ${esc(test.description || '') || `<em style="color:var(--ink-mute)">${t('test.no_description') || 'No description.'}</em>`}
        </div>
      </div>

      <div style="padding:0 16px 24px;">
        <div style="font:600 13px/1 Inter,sans-serif;color:var(--ink);margin-bottom:8px;">${t('stats.recent_attempts') || 'Recent attempts'}</div>
        ${!recentAttempts.length
          ? `<div style="font:400 13px/1 Inter,sans-serif;color:var(--ink-mute);">${t('stats.no_attempts') || 'No attempts yet.'}</div>`
          : recentAttempts.map(a => `
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--ink-soft);">
                <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font:600 12px/1.4 'JetBrains Mono',monospace;">
                  ${Math.round(a.percentCorrect ?? 0)}%
                </span>
                <span style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);">${fmtDate(a.finishedAt || a.startedAt)}</span>
              </div>`).join('')
        }
      </div>
    </div>
  `;

  screen.querySelector('.mob-back-btn-inner')?.addEventListener('click', () => history.back());
  screen.appendChild(buildBottomNav('tests'));
  root.innerHTML = '';
  root.appendChild(screen);
}
