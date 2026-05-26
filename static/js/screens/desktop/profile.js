/**
 * screens/desktop/profile.js — User profile screen (Phase 6)
 */
import { getMyProfile } from '../../api/users.js';
import { getMyAggregate, getStreak } from '../../api/statistics.js';
import { logout, getMe } from '../../api/auth.js';
import { getState, setState } from '../../state.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }); }
  catch { return ''; }
}

export default async function render(root) {
  // Skeleton
  root.innerHTML = `
    <div class="screen" style="align-items:center;justify-content:center;">
      <div class="skeleton" style="width:160px;height:16px;border-radius:8px;"></div>
    </div>`;

  let profile = null, agg = null, streak = 0;
  try {
    const [pRes, aRes, sRes] = await Promise.allSettled([
      getMyProfile(),
      getMyAggregate({}),
      getStreak(),
    ]);
    if (pRes.status === 'fulfilled') profile = pRes.value;
    if (aRes.status === 'fulfilled') agg = aRes.value;
    if (sRes.status === 'fulfilled') streak = sRes.value?.streak ?? 0;
  } catch {}

  // Fall back to auth/me then state.user if profile API failed
  if (!profile?.email) {
    try { profile = await getMe(); } catch {}
  }
  if (!profile) profile = getState().user || null;

  if (!profile) {
    root.innerHTML = `<div class="screen" style="padding:var(--pad);color:var(--ink-mute);">${t('common.error') || 'Error'}</div>`;
    return;
  }

  const initial  = (profile.display_name || profile.username || '?')[0].toUpperCase();
  const avatarSrc = profile.avatar_url ? `/api/users/${profile.id}/avatar` : null;
  const attempts  = agg?.attemptCount ?? 0;
  const accuracy  = agg ? Math.round(agg.avgPercentCorrect ?? 0) : 0;

  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;overflow-y:auto;';

  screen.innerHTML = `
    <!-- Header bar -->
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:12px var(--pad);border-bottom:var(--border);flex-shrink:0;">
      <div style="display:flex;align-items:center;gap:8px;">
        <a href="#/home" class="btn btn--ghost btn--small" style="display:flex;align-items:center;gap:4px;">
          ${iconEl('chevL', 16)?.outerHTML || '←'}
        </a>
        <span style="font:700 18px/1 Inter,sans-serif;color:var(--ink);">${t('nav.profile') || 'Profile'}</span>
      </div>
      <a href="#/settings" class="btn btn--ghost btn--small">
        ${iconEl('cog', 14)?.outerHTML || ''}
        <span>${t('nav.settings') || 'Settings'}</span>
      </a>
    </div>

    <!-- Profile card -->
    <div style="padding:32px var(--pad);max-width:680px;">

      <!-- Avatar + name -->
      <div style="display:flex;align-items:center;gap:20px;margin-bottom:28px;">
        <div style="width:80px;height:80px;border-radius:50%;border:var(--border);
                    background:var(--ink-soft);overflow:hidden;display:flex;
                    align-items:center;justify-content:center;
                    font:700 32px/1 Inter,sans-serif;color:var(--ink);flex-shrink:0;">
          ${avatarSrc
            ? `<img src="${esc(avatarSrc)}" style="width:100%;height:100%;object-fit:cover;">`
            : esc(initial)}
        </div>
        <div>
          <div style="font:700 24px/1.1 Inter,sans-serif;color:var(--ink);letter-spacing:-.02em;">
            ${esc(profile.display_name || profile.username)}
          </div>
          <div style="font:400 14px/1 Inter,sans-serif;color:var(--ink-mute);margin-top:6px;">
            @${esc(profile.username)}
          </div>
          ${profile.created_at ? `
          <div style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);margin-top:4px;">
            Joined ${esc(fmtDate(profile.created_at))}
          </div>` : ''}
        </div>
      </div>

      <!-- KPI row -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px;">
        ${[
          { val: attempts, label: t('stats.total_attempts') || 'Attempts' },
          { val: accuracy + '%', label: t('stats.accuracy') || 'Accuracy' },
          { val: streak, label: t('stats.streak') || 'Streak' },
        ].map(k => `
          <div style="border:var(--border);border-radius:var(--radius-md);padding:16px 18px;
                      background:var(--paper);box-shadow:var(--shadow-sm);">
            <div style="font:700 24px/1 Inter,sans-serif;color:var(--ink);letter-spacing:-.02em;">${esc(String(k.val))}</div>
            <div style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);margin-top:6px;">${esc(k.label)}</div>
          </div>
        `).join('')}
      </div>

      <!-- Menu links -->
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${[
          { href: '#/settings',                icon: 'cog',   label: t('nav.settings') || 'Settings' },
          { href: '#/stats',                   icon: 'chart', label: t('nav.stats')    || 'Statistics' },
          { href: '#/notifications',           icon: 'bell',  label: t('nav.notifications') || 'Notifications' },
        ].map(item => `
          <a href="${esc(item.href)}" style="
            display:flex;align-items:center;gap:12px;padding:14px 16px;
            border:var(--border);border-radius:var(--radius-md);
            color:var(--ink);text-decoration:none;background:var(--paper);
            box-shadow:var(--shadow-sm);transition:box-shadow 120ms ease;">
            <span style="color:var(--ink-mute);">${iconEl(item.icon, 16)?.outerHTML || ''}</span>
            <span style="font:500 14px/1 Inter,sans-serif;flex:1;">${esc(item.label)}</span>
            ${iconEl('chevR', 14)?.outerHTML || '›'}
          </a>
        `).join('')}

        <button type="button" id="prof-logout" style="
          display:flex;align-items:center;gap:12px;padding:14px 16px;
          border:1.5px solid #c4554a;border-radius:var(--radius-md);
          color:#c4554a;background:var(--paper);cursor:pointer;margin-top:4px;
          font:500 14px/1 Inter,sans-serif;box-shadow:var(--shadow-sm);
          transition:box-shadow 120ms ease;">
          ${iconEl('x', 16)?.outerHTML || ''}
          <span>${t('auth.logout') || 'Sign out'}</span>
        </button>
      </div>
    </div>
  `;

  screen.querySelector('#prof-logout')?.addEventListener('click', async () => {
    try { await logout(); } catch {}
    setState({ user: null });
    navigate('/auth/login');
  });

  root.innerHTML = '';
  root.appendChild(screen);
}
