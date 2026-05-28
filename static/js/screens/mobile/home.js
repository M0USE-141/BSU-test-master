/**
 * screens/mobile/home.js — Mobile Dashboard (home)
 *
 * Shows greeting, streak, personal KPIs, and recent attempt history.
 * The test collection list lives at /tests (mobile/tests-list.js).
 */
import { getStreak, getMyAggregate, listAttempts } from '../../api/statistics.js';
import { getState } from '../../state.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { buildBottomNav, esc, getClientId } from './_shell.js';
import { navigate } from '../../router.js';

let _renderToken = 0;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return t('greeting.morning') || 'good morning,';
  if (h < 18) return t('greeting.afternoon') || 'good afternoon,';
  return t('greeting.evening') || 'good evening,';
}

function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 120)    return t('time.just_now')  || 'just now';
  if (s < 3600)   return `${Math.round(s / 60)} ${t('time.min_ago') || 'min ago'}`;
  if (s < 86400)  return `${Math.round(s / 3600)} ${t('time.h_ago') || 'h ago'}`;
  if (s < 172800) return t('time.yesterday') || 'yesterday';
  return `${Math.round(s / 86400)} ${t('time.days_ago') || 'days ago'}`;
}

export default async function render(root) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  const state = getState();
  const username = state.user?.display_name || state.user?.username || '';

  // ── Skeleton ─────────────────────────────────────────────────
  root.innerHTML = `
    <div class="mob">
      <div class="mob__content">
        <div class="mob-home">
          <div class="mob-greeting">
            <div class="mob-greeting__sub">${greeting()}</div>
            <div class="mob-greeting__name">${username ? esc(username) : '&nbsp;'}</div>
          </div>
          <div class="skeleton" style="height:62px;border-radius:var(--radius-md);margin-bottom:14px;"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px;">
            ${[1,2,3].map(() =>
              `<div class="skeleton" style="height:70px;border-radius:var(--radius-md);"></div>`
            ).join('')}
          </div>
          <div class="skeleton" style="height:14px;border-radius:8px;margin-bottom:10px;max-width:40%;"></div>
          ${[1,2,3].map(() =>
            `<div class="skeleton" style="height:44px;border-radius:var(--radius-md);margin-bottom:8px;"></div>`
          ).join('')}
        </div>
      </div>
    </div>`;

  // ── Fetch data ────────────────────────────────────────────────
  let streak = 0, agg = null, recentAttempts = [];
  try {
    const [strRes, aggRes, attRes] = await Promise.allSettled([
      getStreak(),
      getMyAggregate(),
      listAttempts({ clientId: getClientId(), status: 'completed', limit: 5 }),
    ]);
    if (stale()) return;
    streak          = strRes.status === 'fulfilled' ? (strRes.value?.streak ?? 0) : 0;
    agg             = aggRes.status === 'fulfilled'  ? aggRes.value : null;
    recentAttempts  = attRes.status === 'fulfilled'
      ? (attRes.value?.attempts || attRes.value || [])
      : [];
    if (!Array.isArray(recentAttempts)) recentAttempts = [];
  } catch { if (stale()) return; }

  if (stale()) return;

  const totalAttempts = agg?.attemptCount ?? 0;
  const avgPct = Math.round(agg?.avgPercentCorrect ?? 0);

  // ── Recent activity rows ──────────────────────────────────────
  function buildRecent() {
    if (!recentAttempts.length) {
      return `<div style="padding:12px 0;font:400 13px/1.4 Inter,sans-serif;color:var(--ink-mute);">
        ${t('home.no_activity') || 'No attempts yet — start a test!'}
      </div>`;
    }
    return recentAttempts.map(a => {
      const pct   = Math.round(a.percentCorrect ?? 0);
      const color = pct >= 70 ? 'var(--accent)' : '#c4554a';
      const bg    = pct >= 70 ? 'var(--accent-soft)' : 'rgba(196,85,74,.10)';
      const when  = timeAgo(a.finishedAt || a.startedAt);
      const qc    = a.questionCount ?? '';
      return `
        <a class="mob-activity-row" href="#/test/${esc(a.testId || '')}">
          <span style="display:inline-block;min-width:44px;padding:3px 8px;border-radius:999px;
                       background:${bg};color:${color};text-align:center;
                       font:700 12px/1.6 'JetBrains Mono',monospace;flex-shrink:0;">
            ${pct}%
          </span>
          <span style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);flex:1;">
            ${when}${qc ? ` · ${qc} ${t('test.questions') || 'q'}` : ''}
          </span>
          ${iconEl('chevR', 12)?.outerHTML || ''}
        </a>`;
    }).join('');
  }

  // ── Build screen ──────────────────────────────────────────────
  const screen = document.createElement('div');
  screen.className = 'mob';
  screen.innerHTML = `
    <div class="mob__content">
      <div class="mob-home">

        <!-- Greeting -->
        <div class="mob-greeting">
          <div class="mob-greeting__sub">${greeting()}</div>
          <div class="mob-greeting__name">${username ? esc(username) : '&nbsp;'}</div>
        </div>

        <!-- Streak banner → /stats -->
        <div class="mob-streak-banner" id="mob-dash-streak"
             role="button" tabindex="0" style="margin-bottom:16px;cursor:pointer;">
          <div class="mob-streak-banner__icon">
            ${streak >= 7
              ? iconEl('star', 20)?.outerHTML  || ''
              : streak >= 1
                ? iconEl('chart', 20)?.outerHTML || ''
                : iconEl('play',  20)?.outerHTML  || ''}
          </div>
          <div>
            <div class="mob-streak-banner__main">
              ${streak > 0
                ? `${streak}-${t('stats.days') || 'day'} ${t('stats.streak') || 'streak'}`
                : (t('stats.no_attempts') || 'Start your first test!')}
            </div>
            <div class="mob-streak-banner__sub">
              ${avgPct > 0
                ? `${avgPct}% ${t('stats.your_avg') || 'avg accuracy'}`
                : (t('stats.no_attempts') || 'No attempts yet')}
            </div>
          </div>
          ${iconEl('chevR', 14)?.outerHTML || ''}
        </div>

        <!-- KPI grid -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px;">
          <div class="mob-kpi" style="text-align:center;">
            <div class="mob-kpi__val">${streak}</div>
            <div class="mob-kpi__label">${t('stats.streak') || 'streak'}</div>
          </div>
          <div class="mob-kpi" style="text-align:center;">
            <div class="mob-kpi__val">${avgPct ? `${avgPct}%` : '—'}</div>
            <div class="mob-kpi__label">${t('stats.accuracy') || 'accuracy'}</div>
          </div>
          <div class="mob-kpi" style="text-align:center;">
            <div class="mob-kpi__val">${totalAttempts}</div>
            <div class="mob-kpi__label">${t('stats.total_attempts') || 'attempts'}</div>
          </div>
        </div>

        <!-- Recent activity -->
        <div style="margin-bottom:20px;">
          <div style="font:600 13px/1 Inter,sans-serif;color:var(--ink);margin-bottom:8px;">
            ${t('home.recent_activity') || 'Recent activity'}
          </div>
          <div id="mob-recent-list">${buildRecent()}</div>
        </div>

        <!-- Browse tests CTA -->
        <div style="padding-bottom:24px;">
          <a href="#/tests" class="btn btn--primary"
             style="width:100%;justify-content:center;gap:6px;">
            ${iconEl('doc', 15)?.outerHTML || ''}
            ${t('home.browse_tests') || 'Browse tests'}
          </a>
        </div>

      </div>
    </div>`;

  screen.querySelector('#mob-dash-streak')
    ?.addEventListener('click', () => navigate('/stats'));

  screen.appendChild(buildBottomNav('home'));
  root.innerHTML = '';
  root.appendChild(screen);
}
