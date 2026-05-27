/**
 * screens/desktop/settings.js — Settings screen (Phase 6)
 * 2-column layout: section nav | content area
 */
import { setTheme, getTheme, setAccent, getAccent } from '../../utils/theme.js';
import { setLocale, getLocale } from '../../utils/locale.js';
import { getMyProfile, updateProfile } from '../../api/users.js';
import { logout, getMe } from '../../api/auth.js';
import { getState, setState } from '../../state.js';
import { navigate } from '../../router.js';
import { icon, iconEl } from '../../icons.js';
import { t } from '../../utils/locale.js';
import { escHtml as esc } from '../../utils/escape.js';
import { mountAppShell } from '../../components/app-shell.js';

const SECTIONS = ['account', 'appearance', 'language'];

/**
 * Best-effort PATCH of user preferences to the server.
 * Only runs when a user is logged in (token present).
 * Never blocks the UI — fire-and-forget.
 */
function _persistPref(patch) {
  if (!localStorage.getItem('access_token')) return;
  updateProfile(patch).catch(() => { /* ignore network errors */ });
}

let _root = null;
let _section = 'appearance';
let _profile = null;

export default async function render(root, params = {}) {
  // Render inside the AppShell main slot so the topbar + rail stay
  // consistent. The screen's own back-button + title strip is kept
  // for now (slightly redundant but lets us land this without a full
  // redesign).
  _root = mountAppShell(root);
  if (params.section && SECTIONS.includes(params.section)) {
    _section = params.section;
  }

  // Load profile — try profile endpoint, fall back to auth/me, then state
  const stateUser = getState().user;
  try { _profile = await getMyProfile(); } catch { _profile = null; }
  if (!_profile?.email) {
    // getMyProfile uses cached users.js which may call wrong URL — use auth/me as fallback
    try { _profile = await getMe(); } catch {}
  }
  if (!_profile) _profile = stateUser;

  _mount();
}

function _mount() {
  if (!_root) return;

  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;';

  // ── Topbar ──────────────────────────────────────────────────
  const topbar = document.createElement('div');
  topbar.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;
    padding:12px var(--pad);border-bottom:var(--border);flex-shrink:0;
    background:var(--paper);`;
  topbar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <a href="#/home" class="btn btn--ghost btn--small" style="display:flex;align-items:center;gap:4px;">
        ${iconEl('chevL', 16)?.outerHTML || '←'}
      </a>
      <span style="font:700 18px/1 Inter,sans-serif;color:var(--ink);">${t('nav.settings') || 'Settings'}</span>
    </div>`;

  // ── Body ─────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex:1;min-height:0;';

  // Left nav
  const nav = document.createElement('nav');
  nav.style.cssText = `
    width:200px;flex-shrink:0;border-right:var(--border);
    padding:16px 12px;display:flex;flex-direction:column;gap:2px;`;
  nav.innerHTML = [
    ['account',    'user',   t('settings.account')      || 'Account'],
    ['appearance', 'cog',    t('settings.appearance')   || 'Appearance'],
    ['language',   'globe',  t('settings.language')     || 'Language'],
  ].map(([id, icon, label]) => `
    <button type="button" data-sec="${id}" class="settings-nav-btn ${_section === id ? 'settings-nav-btn--active' : ''}">
      ${iconEl(icon, 14)?.outerHTML || ''}
      <span>${esc(label)}</span>
    </button>
  `).join('');

  nav.querySelectorAll('[data-sec]').forEach(btn => {
    btn.addEventListener('click', () => {
      _section = btn.dataset.sec;
      _mount();
    });
  });

  // Right content
  const content = document.createElement('div');
  content.style.cssText = 'flex:1;overflow-y:auto;padding:24px 32px;';

  if (_section === 'account')    _buildAccount(content);
  if (_section === 'appearance') _buildAppearance(content);
  if (_section === 'language')   _buildLanguage(content);

  body.append(nav, content);
  screen.append(topbar, body);

  _root.innerHTML = '';
  _root.appendChild(screen);
}

// ── Section: Account ─────────────────────────────────────────

function _buildAccount(el) {
  const p = _profile;
  const initial = (p?.display_name || p?.username || '?')[0].toUpperCase();
  const avatarSrc = p?.avatar_url ? `/api/users/${p.id}/avatar` : null;

  el.innerHTML = `
    <h2 style="font:700 20px/1 Inter,sans-serif;color:var(--ink);margin-bottom:4px;">${t('settings.account') || 'Account'}</h2>
    <p style="font:400 13px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:24px;">
      ${esc(t('settings.account') || 'Your basic account info.')}
    </p>

    <div style="display:grid;grid-template-columns:140px 1fr;row-gap:20px;column-gap:20px;max-width:560px;">

      <label style="font:500 13px/1 Inter,sans-serif;color:var(--ink-mute);padding-top:8px;">Avatar</label>
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:52px;height:52px;border-radius:50%;border:var(--border);
                    background:var(--ink-soft);overflow:hidden;display:flex;align-items:center;
                    justify-content:center;font:700 20px/1 Inter,sans-serif;color:var(--ink);">
          ${avatarSrc
            ? `<img src="${esc(avatarSrc)}" style="width:100%;height:100%;object-fit:cover;">`
            : esc(initial)}
        </div>
      </div>

      <label style="font:500 13px/1 Inter,sans-serif;color:var(--ink-mute);padding-top:10px;">Display name</label>
      <div>
        <input id="set-displayname" type="text" class="input"
               value="${esc(p?.display_name || '')}"
               placeholder="${esc(p?.username || 'Display name')}"
               style="width:100%;max-width:320px;">
      </div>

      <label style="font:500 13px/1 Inter,sans-serif;color:var(--ink-mute);padding-top:10px;">Email</label>
      <div style="font:400 14px/1 Inter,sans-serif;color:var(--ink-fade);padding-top:10px;">
        ${esc(p?.email || '—')}
      </div>

      <label style="font:500 13px/1 Inter,sans-serif;color:var(--ink-mute);padding-top:10px;">Username</label>
      <div style="font:400 14px/1 Inter,sans-serif;color:var(--ink-fade);padding-top:10px;">
        @${esc(p?.username || '—')}
      </div>

    </div>

    <div style="margin-top:24px;display:flex;gap:10px;align-items:center;">
      <button id="set-save-btn" type="button" class="btn btn--primary">
        ${iconEl('check', 14)?.outerHTML || ''}
        <span>${t('common.save') || 'Save'}</span>
      </button>
      <span id="set-save-msg" style="font:400 13px/1 Inter,sans-serif;color:var(--ink-mute);"></span>
    </div>

    <div style="margin-top:32px;padding-top:20px;border-top:var(--border);">
      <button id="set-logout-btn" type="button" class="btn btn--ghost"
              style="color:#c4554a;border-color:#c4554a;">
        ${iconEl('x', 14)?.outerHTML || ''}
        <span>${t('auth.logout') || 'Sign out'}</span>
      </button>
    </div>
  `;

  el.querySelector('#set-save-btn')?.addEventListener('click', async () => {
    const btn = el.querySelector('#set-save-btn');
    const msg = el.querySelector('#set-save-msg');
    const displayName = el.querySelector('#set-displayname')?.value?.trim();
    btn.disabled = true;
    try {
      await updateProfile({ display_name: displayName });
      if (msg) { msg.textContent = '✓ Saved'; msg.style.color = 'var(--accent)'; }
      _profile = { ..._profile, display_name: displayName };
      setTimeout(() => { if (msg) { msg.textContent = ''; } }, 2000);
    } catch (e) {
      if (msg) { msg.textContent = t('common.error') || 'Error'; msg.style.color = '#c4554a'; }
    } finally {
      btn.disabled = false;
    }
  });

  el.querySelector('#set-logout-btn')?.addEventListener('click', async () => {
    try { await logout(); } catch {}
    setState({ user: null });
    navigate('/auth/login');
  });
}

// ── Section: Appearance ───────────────────────────────────────

function _buildAppearance(el) {
  const currentTheme  = getTheme();
  const currentAccent = getAccent();
  const ACCENTS = [
    { id: 'green',  color: '#4f9b6a', label: t('settings.accent.green')  || 'Green' },
    { id: 'coral',  color: '#e07a5f', label: t('settings.accent.coral')  || 'Coral' },
    { id: 'yellow', color: '#e6b54a', label: t('settings.accent.yellow') || 'Yellow' },
    { id: 'blue',   color: '#4a78c4', label: t('settings.accent.blue')   || 'Blue' },
    { id: 'mono',   color: '#3a3530', label: t('settings.accent.mono')   || 'Mono' },
  ];
  const THEMES = [
    { id: 'light',  svgIcon: icon('sun', 14),     label: t('settings.theme.light')  || 'Light' },
    { id: 'dark',   svgIcon: icon('moon', 14),    label: t('settings.theme.dark')   || 'Dark' },
    { id: 'system', svgIcon: icon('monitor', 14), label: t('settings.theme.system') || 'System' },
  ];

  el.innerHTML = `
    <h2 style="font:700 20px/1 Inter,sans-serif;color:var(--ink);margin-bottom:4px;">${t('settings.appearance') || 'Appearance'}</h2>
    <p style="font:400 13px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:24px;">Theme and accent colour.</p>

    <div style="margin-bottom:24px;">
      <p style="font:600 12px/1 Inter,sans-serif;color:var(--ink-mute);text-transform:uppercase;
                letter-spacing:.06em;margin-bottom:10px;">Theme</p>
      <div style="display:flex;gap:8px;">
        ${THEMES.map(th => `
          <button type="button" data-theme="${th.id}" class="chip ${currentTheme === th.id ? 'chip--active' : ''}" style="display:inline-flex;align-items:center;gap:5px;">
            ${th.svgIcon} ${esc(th.label)}
          </button>`).join('')}
      </div>
    </div>

    <div>
      <p style="font:600 12px/1 Inter,sans-serif;color:var(--ink-mute);text-transform:uppercase;
                letter-spacing:.06em;margin-bottom:10px;">Accent colour</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${ACCENTS.map(ac => `
          <button type="button" data-accent="${ac.id}" title="${esc(ac.label)}"
                  style="width:30px;height:30px;border-radius:50%;background:${esc(ac.color)};
                         border:2px solid ${currentAccent === ac.id ? 'var(--ink)' : 'transparent'};
                         outline:${currentAccent === ac.id ? '2px solid var(--ink-soft)' : 'none'};
                         cursor:pointer;transition:border 120ms ease;">
          </button>`).join('')}
      </div>
      <p style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);margin-top:8px;">
        ${esc(ACCENTS.find(a => a.id === currentAccent)?.label || currentAccent)}
      </p>
    </div>
  `;

  el.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      setTheme(theme);
      _persistPref({ theme });
      _mount();
    });
  });
  el.querySelectorAll('[data-accent]').forEach(btn => {
    btn.addEventListener('click', () => {
      const accent = btn.dataset.accent;
      setAccent(accent);
      _persistPref({ accent });
      _mount();
    });
  });
}

// ── Section: Language ─────────────────────────────────────────

function _buildLanguage(el) {
  const current = getLocale();
  const LANGS = [
    { id: 'ru', label: 'Русский' },
    { id: 'en', label: 'English' },
    { id: 'uz', label: "O'zbek" },
  ];

  el.innerHTML = `
    <h2 style="font:700 20px/1 Inter,sans-serif;color:var(--ink);margin-bottom:4px;">${t('settings.language') || 'Language'}</h2>
    <p style="font:400 13px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:24px;">
      Interface language — changes take effect immediately.
    </p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${LANGS.map(l => `
        <button type="button" data-lang="${l.id}" class="chip ${current === l.id ? 'chip--active' : ''}">
          ${esc(l.label)}
        </button>`).join('')}
    </div>
  `;

  el.querySelectorAll('[data-lang]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const language = btn.dataset.lang;
      await setLocale(language);
      _persistPref({ language });
      // localechange event fires → router re-renders screen
    });
  });
}
