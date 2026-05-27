/**
 * screens/mobile/profile.js — Mobile profile screen
 */
import { getMyProfile } from '../../api/users.js';
import { getMyAggregate, getStreak } from '../../api/statistics.js';
import { logout } from '../../api/auth.js';
import { getState, setState } from '../../state.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { navigate } from '../../router.js';
import { buildBottomNav, esc } from './_shell.js';

export default async function render(root, params = {}) {
  const state = getState();
  const cachedUser = state.user;

  // Skeleton
  root.innerHTML = `
    <div class="mob">
      <div class="mob-topbar" style="flex-shrink:0;">
        <span class="mob-topbar__title">${t('nav.profile') || 'Profile'}</span>
      </div>
      <div class="mob__content">
        <div class="mob-profile" style="padding-top:24px;">
          <div class="skeleton" style="width:72px;height:72px;border-radius:50%;"></div>
          <div class="skeleton" style="width:130px;height:18px;border-radius:8px;margin-top:10px;"></div>
          <div class="skeleton" style="width:180px;height:13px;border-radius:8px;margin-top:6px;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:0 16px;margin:16px 0;">
          ${[1,2,3].map(() => `<div class="skeleton" style="height:60px;border-radius:var(--radius-md);"></div>`).join('')}
        </div>
      </div>
    </div>`;

  // Fetch
  let profile = null, agg = null, streak = 0;
  try {
    const [profRes, aggRes, strRes] = await Promise.allSettled([
      getMyProfile(),
      getMyAggregate(),
      getStreak(),
    ]);
    if (profRes.status === 'fulfilled') profile = profRes.value;
    if (aggRes.status === 'fulfilled') agg = aggRes.value;
    if (strRes.status === 'fulfilled') streak = strRes.value?.streak ?? 0;
  } catch {}

  const displayName = profile?.display_name || profile?.username
    || cachedUser?.display_name || cachedUser?.username || 'User';
  const email = profile?.email || cachedUser?.email || '';
  const initial = (displayName[0] || 'U').toUpperCase();
  const avatarUrl = profile?.avatar_url || cachedUser?.avatar_url;
  const joinedAt = profile?.created_at;
  const joinedStr = joinedAt
    ? new Date(joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '';

  const totalAttempts = agg?.attemptCount ?? 0;
  const avgPct = Math.round(agg?.avgPercentCorrect ?? 0);

  const screen = document.createElement('div');
  screen.className = 'mob';
  screen.innerHTML = `
    <div class="mob-topbar" style="flex-shrink:0;">
      <span class="mob-topbar__title">${t('nav.profile') || 'Profile'}</span>
    </div>
    <div class="mob__content">

      <!-- Avatar + name -->
      <div class="mob-profile">
        <div class="mob-profile__avatar">
          ${avatarUrl
            ? `<img src="${esc(avatarUrl)}" alt="${esc(displayName)}" style="width:100%;height:100%;object-fit:cover;">`
            : esc(initial)
          }
        </div>
        <div class="mob-profile__name">${esc(displayName)}</div>
        ${email ? `<div class="mob-profile__email">${esc(email)}</div>` : ''}
        ${joinedStr
          ? `<div style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);margin-top:2px;">${t('profile.joined') || 'joined'} ${esc(joinedStr)}</div>`
          : ''
        }
      </div>

      <!-- Stats 3-col -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:0 16px;margin-bottom:20px;">
        <div class="mob-kpi" style="text-align:center;">
          <div class="mob-kpi__val">${totalAttempts}</div>
          <div class="mob-kpi__label">${t('stats.total_attempts') || 'attempts'}</div>
        </div>
        <div class="mob-kpi" style="text-align:center;">
          <div class="mob-kpi__val">${avgPct ? `${avgPct}%` : '—'}</div>
          <div class="mob-kpi__label">${t('stats.accuracy') || 'accuracy'}</div>
        </div>
        <div class="mob-kpi" style="text-align:center;">
          <div class="mob-kpi__val">${streak}</div>
          <div class="mob-kpi__label">${t('stats.streak') || 'streak'}</div>
        </div>
      </div>

      <!-- Menu: Account -->
      <div class="mob-menu-section">
        <div class="mob-menu-label">${t('settings.account') || 'Account'}</div>
        <a href="#/stats" class="mob-menu-item">
          ${iconEl('chart', 16)?.outerHTML || ''}
          <span class="mob-menu-item__label">${t('nav.stats') || 'Statistics'}</span>
          ${iconEl('chevR', 14)?.outerHTML || ''}
        </a>
        <a href="#/home" class="mob-menu-item">
          ${iconEl('doc', 16)?.outerHTML || ''}
          <span class="mob-menu-item__label">${t('nav.tests') || 'Tests'}</span>
          ${iconEl('chevR', 14)?.outerHTML || ''}
        </a>
        <a href="#/settings" class="mob-menu-item">
          ${iconEl('cog', 16)?.outerHTML || ''}
          <span class="mob-menu-item__label">${t('nav.settings') || 'Settings'}</span>
          ${iconEl('chevR', 14)?.outerHTML || ''}
        </a>
        <a href="#/notifications" class="mob-menu-item">
          ${iconEl('bell', 16)?.outerHTML || ''}
          <span class="mob-menu-item__label">${t('nav.notifications') || 'Notifications'}</span>
          ${iconEl('chevR', 14)?.outerHTML || ''}
        </a>
      </div>

      <!-- Sign out -->
      <div class="mob-menu-section" style="margin-top:4px;">
        <button class="mob-menu-item mob-menu-item--danger" id="mob-logout-btn"
          style="width:100%;background:none;border:none;text-align:left;cursor:pointer;
                 display:flex;align-items:center;gap:12px;padding:13px 0;">
          ${iconEl('x', 16)?.outerHTML || ''}
          <span class="mob-menu-item__label">${t('auth.logout') || 'Sign Out'}</span>
        </button>
      </div>

      <div style="height:24px;"></div>
    </div>
  `;

  screen.querySelector('#mob-logout-btn')?.addEventListener('click', () => {
    logout();
    setState({ user: null });
    navigate('/auth/login');
  });

  screen.appendChild(buildBottomNav('me'));
  root.innerHTML = '';
  root.appendChild(screen);
}
