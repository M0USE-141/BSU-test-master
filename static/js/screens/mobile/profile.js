/**
 * screens/mobile/profile.js — Mobile profile screen
 *
 * Modes: view | edit
 * Edit allows changing display_name and uploading a new avatar.
 */
import { getMyProfile, updateProfile, uploadAvatar } from '../../api/users.js';
import { getMyAggregate, getStreak } from '../../api/statistics.js';
import { logout } from '../../api/auth.js';
import { getState, setState } from '../../state.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { navigate } from '../../router.js';
import { buildBottomNav, esc } from './_shell.js';

// ── Module state ──────────────────────────────────────────────
let _root = null;
const _s = {
  profile: null,
  agg: null,
  streak: 0,
  mode: 'view',          // 'view' | 'edit'
  editName: '',
  editAvatarFile: null,
  editAvatarPreview: null,
  saving: false,
  saveMsg: '',           // '' | 'success' | error text
};

// ── Renderers ─────────────────────────────────────────────────

function _mount() {
  if (!_root) return;
  _root.innerHTML = '';

  const state = getState();
  const profile = _s.profile;
  const cachedUser = state.user;

  const displayName  = profile?.display_name || profile?.username
    || cachedUser?.display_name || cachedUser?.username || 'User';
  const email        = profile?.email || cachedUser?.email || '';
  const avatarUrl    = _s.editAvatarPreview || profile?.avatar_url || cachedUser?.avatar_url;
  const initial      = (displayName[0] || 'U').toUpperCase();
  const joinedAt     = profile?.created_at;
  const joinedStr    = joinedAt
    ? new Date(joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '';
  const totalAttempts = _s.agg?.attemptCount ?? 0;
  const avgPct        = Math.round(_s.agg?.avgPercentCorrect ?? 0);
  const streak        = _s.streak;

  const screen = document.createElement('div');
  screen.className = 'mob';

  if (_s.mode === 'edit') {
    _buildEditMode(screen, displayName, email, avatarUrl, initial, joinedStr, totalAttempts, avgPct, streak);
  } else {
    _buildViewMode(screen, displayName, email, avatarUrl, initial, joinedStr, totalAttempts, avgPct, streak);
  }

  screen.appendChild(buildBottomNav('me'));
  _root.appendChild(screen);
}

function _avatarEl(avatarUrl, initial, size = 72) {
  const wrap = document.createElement('div');
  wrap.className = 'mob-profile__avatar';
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = initial;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    wrap.appendChild(img);
  } else {
    wrap.textContent = initial;
  }
  return wrap;
}

// ── View mode ─────────────────────────────────────────────────

function _buildViewMode(screen, displayName, email, avatarUrl, initial, joinedStr, totalAttempts, avgPct, streak) {
  screen.innerHTML = `
    <div class="mob-topbar" style="flex-shrink:0;">
      <span class="mob-topbar__title">${t('nav.profile') || 'Profile'}</span>
      <button class="btn btn--ghost btn--small" id="mob-edit-btn"
              style="margin-left:auto;font-size:13px;">
        ${iconEl('edit', 14)?.outerHTML || ''}
        ${t('profile.edit_profile') || 'Edit profile'}
      </button>
    </div>
    <div class="mob__content">

      <!-- Avatar + name -->
      <div class="mob-profile" id="mob-profile-header">
        <div class="mob-profile__name">${esc(displayName)}</div>
        ${email ? `<div class="mob-profile__email">${esc(email)}</div>` : ''}
        ${joinedStr
          ? `<div style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);margin-top:2px;">
               ${t('profile.joined') || 'joined'} ${esc(joinedStr)}
             </div>`
          : ''}
        ${_s.saveMsg === 'success'
          ? `<div style="color:var(--accent);font:500 12px/1 Inter,sans-serif;margin-top:6px;">
               ${t('profile.edit_success') || 'Profile updated!'}
             </div>`
          : ''}
      </div>

      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;
                  padding:0 16px;margin-bottom:20px;">
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
        <a href="#/tests" class="mob-menu-item">
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
    </div>`;

  // Inject avatar element (above the name)
  const header = screen.querySelector('#mob-profile-header');
  if (header) {
    const avatarEl = _avatarEl(avatarUrl, initial);
    header.insertBefore(avatarEl, header.firstChild);
  }

  screen.querySelector('#mob-edit-btn')?.addEventListener('click', () => {
    _s.mode = 'edit';
    _s.editName = _s.profile?.display_name || _s.profile?.username || '';
    _s.editAvatarFile = null;
    _s.editAvatarPreview = null;
    _s.saveMsg = '';
    _mount();
  });

  screen.querySelector('#mob-logout-btn')?.addEventListener('click', () => {
    logout();
    setState({ user: null });
    navigate('/auth/login');
  });
}

// ── Edit mode ─────────────────────────────────────────────────

function _buildEditMode(screen, displayName, email, avatarUrl, initial, joinedStr, totalAttempts, avgPct, streak) {
  screen.innerHTML = `
    <div class="mob-topbar" style="flex-shrink:0;">
      <button class="mob-topbar__back" id="mob-cancel-btn"
              aria-label="${t('common.cancel') || 'Cancel'}">
        ${iconEl('chevL', 16)?.outerHTML || '←'}
      </button>
      <span class="mob-topbar__title">${t('profile.edit_profile') || 'Edit profile'}</span>
      <button class="btn btn--primary btn--small" id="mob-save-btn"
              style="margin-left:auto;" ${_s.saving ? 'disabled' : ''}>
        ${_s.saving
          ? (t('profile.saving') || 'Saving…')
          : (t('common.save') || 'Save')}
      </button>
    </div>
    <div class="mob__content">
      <div style="display:flex;flex-direction:column;align-items:center;padding:24px 16px 20px;gap:12px;">

        <!-- Avatar with change overlay -->
        <div style="position:relative;cursor:pointer;" id="mob-avatar-wrap">
          <div class="mob-profile__avatar" id="mob-avatar-el">
            ${avatarUrl
              ? `<img src="${esc(avatarUrl)}" alt="${esc(initial)}"
                     style="width:100%;height:100%;object-fit:cover;">`
              : esc(initial)
            }
          </div>
          <div style="position:absolute;inset:0;border-radius:50%;
                      background:rgba(0,0,0,.4);
                      display:flex;align-items:center;justify-content:center;">
            ${iconEl('edit', 18)?.outerHTML || '✎'}
          </div>
        </div>
        <input type="file" id="mob-avatar-input" accept="image/jpeg,image/png,image/webp"
               style="display:none;">
        <span style="font:400 11px/1 Inter,sans-serif;color:var(--ink-mute);">
          ${t('profile.upload_avatar') || 'Change photo'}
        </span>

        <!-- Display name input -->
        <div style="width:100%;max-width:320px;">
          <label style="display:block;font:600 12px/1 Inter,sans-serif;
                        color:var(--ink-mute);text-transform:uppercase;
                        letter-spacing:.06em;margin-bottom:6px;">
            ${t('profile.display_name') || 'Display name'}
          </label>
          <input id="mob-edit-name" class="input" type="text"
                 value="${esc(_s.editName || displayName)}"
                 placeholder="${esc(displayName)}"
                 style="width:100%;box-sizing:border-box;">
        </div>

        ${_s.saveMsg && _s.saveMsg !== 'success'
          ? `<div style="color:#c4554a;font:400 13px/1.4 Inter,sans-serif;max-width:320px;">
               ${esc(_s.saveMsg)}
             </div>`
          : ''}

        <!-- Read-only fields -->
        ${email ? `
        <div style="width:100%;max-width:320px;">
          <label style="display:block;font:600 12px/1 Inter,sans-serif;
                        color:var(--ink-mute);text-transform:uppercase;
                        letter-spacing:.06em;margin-bottom:6px;">
            ${t('settings.email') || 'Email'}
          </label>
          <div class="input" style="background:var(--ink-soft);color:var(--ink-mute);
                                    width:100%;box-sizing:border-box;">
            ${esc(email)}
          </div>
        </div>` : ''}

      </div>
    </div>`;

  // Avatar tap → file input
  const avatarWrap = screen.querySelector('#mob-avatar-wrap');
  const fileInput  = screen.querySelector('#mob-avatar-input');
  avatarWrap?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    _s.editAvatarFile = file;
    _s.editAvatarPreview = URL.createObjectURL(file);
    // Update avatar display
    const avatarEl = screen.querySelector('#mob-avatar-el');
    if (avatarEl) {
      avatarEl.innerHTML = `<img src="${_s.editAvatarPreview}" alt="preview"
        style="width:100%;height:100%;object-fit:cover;">`;
    }
  });

  // Cancel
  screen.querySelector('#mob-cancel-btn')?.addEventListener('click', () => {
    if (_s.editAvatarPreview) {
      URL.revokeObjectURL(_s.editAvatarPreview);
      _s.editAvatarPreview = null;
    }
    _s.editAvatarFile = null;
    _s.mode = 'view';
    _s.saveMsg = '';
    _mount();
  });

  // Save
  screen.querySelector('#mob-save-btn')?.addEventListener('click', async () => {
    if (_s.saving) return;
    const newName = screen.querySelector('#mob-edit-name')?.value?.trim() || '';
    _s.saving = true;
    _mount();

    try {
      // Update display name if changed
      const nameChanged = newName !== (_s.profile?.display_name || _s.profile?.username || '');
      if (nameChanged || newName) {
        await updateProfile({ display_name: newName || null });
      }
      // Upload avatar if selected
      if (_s.editAvatarFile) {
        await uploadAvatar(_s.editAvatarFile);
      }
      // Reload profile
      const fresh = await getMyProfile();
      _s.profile = fresh;
      // Update global state
      setState({ user: { ...(getState().user || {}), display_name: fresh?.display_name } });
      // Revoke object URL
      if (_s.editAvatarPreview) {
        URL.revokeObjectURL(_s.editAvatarPreview);
        _s.editAvatarPreview = null;
      }
      _s.editAvatarFile = null;
      _s.saving = false;
      _s.saveMsg = 'success';
      _s.mode = 'view';
    } catch (err) {
      _s.saving = false;
      _s.saveMsg = err?.message || (t('common.error') || 'An error occurred');
    }
    _mount();
  });
}

// ── Entry point ───────────────────────────────────────────────

export default async function render(root) {
  _root = root;
  // Reset edit state on fresh navigation
  _s.mode = 'view';
  _s.editName = '';
  _s.editAvatarFile = null;
  if (_s.editAvatarPreview) {
    URL.revokeObjectURL(_s.editAvatarPreview);
    _s.editAvatarPreview = null;
  }
  _s.saveMsg = '';
  _s.saving = false;

  // Skeleton while loading
  const cachedUser = getState().user;
  const cachedName = cachedUser?.display_name || cachedUser?.username || 'User';
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
          ${[1, 2, 3].map(() =>
            `<div class="skeleton" style="height:60px;border-radius:var(--radius-md);"></div>`
          ).join('')}
        </div>
      </div>
    </div>`;

  // Fetch
  try {
    const [profRes, aggRes, strRes] = await Promise.allSettled([
      getMyProfile(),
      getMyAggregate(),
      getStreak(),
    ]);
    if (profRes.status === 'fulfilled') _s.profile = profRes.value;
    if (aggRes.status === 'fulfilled')  _s.agg     = aggRes.value;
    if (strRes.status === 'fulfilled')  _s.streak  = strRes.value?.streak ?? 0;
  } catch {}

  _mount();
}
