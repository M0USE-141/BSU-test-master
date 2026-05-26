/**
 * screens/mobile/home.js — Mobile home screen
 */
import { listTests } from '../../api/tests.js';
import { getStreak, getMyAggregate } from '../../api/statistics.js';
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

function segmentFilter(tests, filter, userId) {
  if (filter === 'my')     return tests.filter(c => c.owner_id === userId);
  if (filter === 'shared') return tests.filter(c => c.access_level === 'shared' && c.owner_id !== userId);
  if (filter === 'public') return tests.filter(c => c.access_level === 'public');
  return tests;
}

export default async function render(root) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken || (!location.hash.startsWith('#/home') && !location.hash.startsWith('#/tests'));

  const state = getState();
  const username = state.user?.display_name || state.user?.username || 'there';

  // ── Skeleton ─────────────────────────────────────────────
  root.innerHTML = `
    <div class="mob">
      <div class="mob__content">
        <div class="mob-home">
          <div class="mob-greeting">
            <div class="mob-greeting__sub">${greeting()}</div>
            <div class="mob-greeting__name">${esc(username)}</div>
          </div>
          <div class="skeleton" style="height:62px;border-radius:var(--radius-md);margin-bottom:14px;"></div>
          <div class="skeleton" style="height:36px;border-radius:var(--radius-pill);margin-bottom:12px;"></div>
          ${[1,2,3].map(() => `<div class="skeleton" style="height:48px;border-radius:var(--radius-md);margin-bottom:8px;"></div>`).join('')}
        </div>
      </div>
    </div>
  `;

  // ── Fetch data ────────────────────────────────────────────
  let tests = [], streak = 0, agg = null;
  try {
    const [testsRes, streakRes, aggRes] = await Promise.allSettled([
      listTests(),
      getStreak(),
      getMyAggregate(),
    ]);
    if (stale()) return;
    tests  = testsRes.status  === 'fulfilled' ? (testsRes.value?.tests  || testsRes.value  || []) : [];
    streak = streakRes.status === 'fulfilled' ? (streakRes.value?.streak ?? 0) : 0;
    agg    = aggRes.status    === 'fulfilled' ? aggRes.value : null;
  } catch { if (stale()) return; }

  if (stale()) return;

  // ── Build full screen ─────────────────────────────────────
  let filter = 'all';
  const userId = state.user?.id;

  function buildList() {
    const visible = segmentFilter(tests, filter, userId);
    if (!visible.length) {
      return `<div class="mob-empty"><div class="mob-empty__text">${t('test.empty') || 'No collections yet'}</div></div>`;
    }
    return visible.map(test => {
      const qc = test.questionCount ?? test.question_count ?? 0;
      const tag = test.owner_id === userId
        ? (t('common.my') || 'My')
        : test.access_level === 'public' ? (t('common.public') || 'Public') : (t('common.shared') || 'Shared');
      return `
        <a class="mob-test-card" href="#/test/${test.id}">
          <div class="mob-test-card__body">
            <div class="mob-test-card__title">${esc(test.title || 'Untitled')}</div>
            <div class="mob-test-card__meta">${qc} ${t('test.questions') || 'q'} · ${tag}</div>
          </div>
          <div class="mob-test-card__score">
            ${iconEl('chevR', 14)?.outerHTML || '›'}
          </div>
        </a>`;
    }).join('');
  }

  const avgPct = Math.round(agg?.avgPercentCorrect ?? 0);
  const streakEmoji = streak >= 7 ? '🔥' : streak >= 3 ? '⚡' : '📚';

  const screen = document.createElement('div');
  screen.className = 'mob';
  screen.innerHTML = `
    <div class="mob__content">
      <div class="mob-home">
        <div class="mob-greeting">
          <div class="mob-greeting__sub">${greeting()}</div>
          <div class="mob-greeting__name">${esc(username)}</div>
        </div>

        <div class="mob-streak-banner" id="mob-streak-banner">
          <div class="mob-streak-banner__icon">${streakEmoji}</div>
          <div>
            <div class="mob-streak-banner__main">
              ${streak > 0
                ? `${streak}-${t('stats.days') || 'day'} ${t('stats.streak') || 'streak'}`
                : t('stats.no_attempts') || 'Start your first test!'
              }
            </div>
            <div class="mob-streak-banner__sub">
              ${avgPct > 0 ? `${avgPct}% ${t('stats.your_avg') || 'avg'}` : t('test.start') || 'Start a test to build your streak'}
            </div>
          </div>
          ${iconEl('chevR', 14)?.outerHTML || ''}
        </div>

        <div class="mob-segment" id="mob-segment">
          ${['all','my','public'].map(f => `
            <div class="mob-segment__item ${filter === f ? 'mob-segment__item--active' : ''}" data-filter="${f}">
              ${f === 'all' ? (t('common.all')||'All') : f === 'my' ? (t('common.my')||'My') : (t('common.public')||'Public')}
            </div>
          `).join('')}
        </div>

        <div id="mob-test-list">${buildList()}</div>
      </div>
    </div>
  `;

  // ── Wire up interactivity ─────────────────────────────────
  screen.querySelector('#mob-streak-banner')
    ?.addEventListener('click', () => navigate('/stats'));

  screen.querySelector('#mob-segment')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      filter = btn.dataset.filter;
      screen.querySelectorAll('.mob-segment__item').forEach(el => {
        el.classList.toggle('mob-segment__item--active', el.dataset.filter === filter);
      });
      screen.querySelector('#mob-test-list').innerHTML = buildList();
    });

  screen.appendChild(buildBottomNav());

  root.innerHTML = '';
  root.appendChild(screen);
}
