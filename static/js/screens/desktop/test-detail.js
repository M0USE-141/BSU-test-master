/**
 * screens/desktop/test-detail.js — Desktop test detail screen
 * Route: /test/:id
 * Shows test info, question list, quick actions.
 */
import { getTest } from '../../api/tests.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { getState } from '../../state.js';
import { escHtml as esc } from '../../utils/escape.js';
import { getMyQuestionStats, getMyAggregate, listAttempts } from '../../api/statistics.js';
import { kdBadge, donut, areaLine } from '../../utils/charts.js';

function accessChip(level) {
  const map = { public: 'public', shared: 'shared', private: 'private' };
  const label = t('test.' + (map[level] || level)) || level;
  return `<span class="chip chip--${level === 'public' ? 'active' : ''}">${esc(label)}</span>`;
}

export default async function render(root, params = {}) {
  const testId = params.id;
  if (!testId) { navigate('/home'); return; }

  root.innerHTML = `
    <div class="screen" style="padding:var(--pad);max-width:900px;margin:0 auto;">
      <div class="skeleton" style="width:220px;height:18px;border-radius:8px;margin-bottom:12px;"></div>
      <div class="skeleton" style="width:140px;height:14px;border-radius:8px;"></div>
    </div>`;

  let test = null;
  try {
    const raw = await getTest(testId);
    test = raw?.metadata ? { ...raw.metadata, ...raw } : raw;
  } catch (e) {
    root.innerHTML = `<div class="screen" style="padding:var(--pad);color:var(--ink-mute);">${t('common.error') || 'Failed to load test.'}</div>`;
    return;
  }

  if (!test) {
    root.innerHTML = `<div class="screen" style="padding:var(--pad);color:var(--ink-mute);">${t('test.notFound') || 'Test not found.'}</div>`;
    return;
  }

  // Fetch K/D stats, aggregate, and trend in parallel; degrade gracefully on failure.
  let kdByQ = {};
  let agg = null;
  let trendData = null;
  {
    const [ksRes, aggRes, trendRes] = await Promise.allSettled([
      getMyQuestionStats(testId),
      getMyAggregate({ test_id: testId }),
      listAttempts({ testId, limit: 30 }),
    ]);
    if (ksRes.status === 'fulfilled') {
      for (const s of (ksRes.value?.questions || [])) kdByQ[String(s.questionId)] = s;
    }
    if (aggRes.status === 'fulfilled') agg = aggRes.value;
    if (trendRes.status === 'fulfilled') trendData = trendRes.value;
  }

  const state = getState();
  const isOwner = test.is_owner ?? (state.user?.id === test.owner_id);
  const questions = test.questions || [];
  const qCount = test.questionCount ?? test.question_count ?? questions.length ?? 0;
  const title = test.title || 'Untitled';
  const desc = test.description || '';

  root.innerHTML = `
    <div class="screen" style="padding:var(--pad);max-width:900px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
        <button class="btn btn--ghost btn--icon" id="td-back" aria-label="${t('common.back') || 'Back'}" style="flex-shrink:0;">
          ${iconEl('chevL', 18)?.outerHTML || '←'}
        </button>
        <h1 style="font:600 20px/1.2 Inter,sans-serif;color:var(--ink);margin:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(title)}</h1>
      </div>

      <div style="display:grid;grid-template-columns:1fr 320px;gap:24px;align-items:start;">

        <!-- Left: questions -->
        <div>
          <div class="card" style="padding:16px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <span style="font:600 14px/1 Inter,sans-serif;">${t('test.questions') || 'Questions'} (${qCount})</span>
              ${isOwner ? `<a href="#/home" class="btn btn--ghost btn--small" style="font-size:12px;">${t('nav.home') || 'Manage in Home'}</a>` : ''}
            </div>
            ${questions.length === 0
              ? `<p style="color:var(--ink-mute);font-size:13px;margin:0;">${t('test.noQuestions') || 'No questions yet.'}</p>`
              : `<ol style="margin:0;padding:0 0 0 18px;display:flex;flex-direction:column;gap:8px;">
                  ${questions.slice(0, 20).map((q, i) => {
                    const qText = typeof q.question === 'string'
                      ? q.question
                      : (q.question?.blocks?.[0]?.text || q.question?.blocks?.[0]?.value || `Q${i + 1}`);
                    const s = kdByQ[String(q.id ?? (i + 1))];
                    const badge = s ? kdBadge(s.k, s.d, s.ratio, s.rank) : '';
                    return `<li style="font-size:13px;color:var(--ink);line-height:1.4;display:flex;align-items:baseline;gap:6px;"><span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-mute);font-weight:600;flex-shrink:0;">Q${q.id ?? (i + 1)}</span>${badge}<span>${esc(String(qText).slice(0, 160))}${String(qText).length > 160 ? '…' : ''}</span></li>`;
                  }).join('')}
                  ${questions.length > 20 ? `<li style="color:var(--ink-mute);font-size:12px;">…and ${questions.length - 20} more</li>` : ''}
                </ol>`
            }
          </div>
        </div>

        <!-- Right: info + actions -->
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div class="card" style="padding:16px;">
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:${desc ? '10px' : '0'};">
              ${accessChip(test.access_level || 'private')}
              ${isOwner ? `<span class="chip">${t('common.my') || 'My'}</span>` : ''}
              <span class="chip">${qCount} ${t('test.questions') || 'q'}</span>
            </div>
            ${desc ? `<p style="font-size:13px;color:var(--ink-mute);margin:0;line-height:1.5;">${esc(desc)}</p>` : ''}
            ${test.owner_username ? `<p style="font-size:11px;color:var(--ink-mute);margin:8px 0 0;"><span style="opacity:.6">${t('profile.by') || 'by'}</span> ${esc(test.owner_username)}</p>` : ''}
          </div>

          <a href="#/test/${testId}/take" class="btn btn--primary" style="justify-content:center;gap:8px;">
            ${iconEl('play', 16)?.outerHTML || ''}
            ${t('test.startTest') || 'Start Test'}
          </a>

          ${isOwner ? `
            <a href="#/change-requests/${testId}" class="btn btn--secondary" style="justify-content:center;gap:8px;">
              ${iconEl('bell', 16)?.outerHTML || ''}
              ${t('cr.title') || 'Change Requests'}
            </a>
          ` : `
            <a href="#/change-requests/${testId}" class="btn btn--secondary" style="justify-content:center;gap:8px;">
              ${iconEl('edit', 16)?.outerHTML || ''}
              ${t('cr.proposeChange') || 'Propose a Change'}
            </a>
          `}

          <button class="btn btn--ghost" id="td-home-btn" style="justify-content:center;gap:8px;">
            ${iconEl('home', 16)?.outerHTML || ''}
            ${t('nav.home') || 'Back to Home'}
          </button>

          ${(() => {
            // Stats section — only render if we have any data.
            const attemptCount = agg?.attemptCount || 0;
            const avgPct = Math.round(agg?.avgPercentCorrect || 0);
            const _att = (trendData?.attempts || []);
            // API returns newest-first; reverse to get oldest→newest for the chart.
            const trendPoints = _att.slice().reverse().map(a => ({ y: Math.round(a.percentCorrect || 0) }));
            const kdEntries = Object.entries(kdByQ).sort(([a], [b]) => Number(a) - Number(b));
            if (!agg && kdEntries.length === 0) return '';
            return `
          <div class="card" style="padding:16px;margin-top:0;">
            <div style="font:600 13px/1 Inter,sans-serif;margin-bottom:12px;color:var(--ink);">Статистика</div>

            ${agg ? `
            <div style="display:flex;gap:8px;justify-content:center;align-items:center;margin-bottom:12px;">
              ${donut(avgPct, 100, { unit: '%', label: 'Средний %' })}
              <div style="text-align:center;">
                <div style="font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700;color:var(--ink);">${attemptCount}</div>
                <div style="font-size:11px;color:var(--ink-tertiary);">Попытки</div>
              </div>
            </div>` : ''}

            ${trendPoints.length >= 2 ? `
            <div style="margin-bottom:12px;">
              <div style="font:500 11px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:6px;">Тренд (30 дней)</div>
              ${areaLine(trendPoints, { height: 96 })}
            </div>` : ''}

            ${kdEntries.length > 0 ? `
            <div>
              <div style="font:500 11px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:6px;">K/D по вопросам</div>
              <div style="display:flex;flex-direction:column;gap:4px;">
                ${kdEntries.map(([qId, s]) => `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-top:1px solid var(--ink-soft);">
                    <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-mute);font-weight:600;">Q${esc(qId)}</span>
                    ${kdBadge(s.k, s.d, s.ratio, s.rank)}
                  </div>`).join('')}
              </div>
            </div>` : ''}
          </div>`;
          })()}
        </div>
      </div>
    </div>`;

  root.querySelector('#td-back')?.addEventListener('click', () => history.back());
  root.querySelector('#td-home-btn')?.addEventListener('click', () => navigate('/home'));
}
