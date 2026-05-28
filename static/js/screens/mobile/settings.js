/**
 * screens/mobile/settings.js — Mobile settings screen
 */
import { t, setLocale, getLocale } from '../../utils/locale.js';
import { setTheme, getTheme, setAccent, getAccent } from '../../utils/theme.js';
import { iconEl } from '../../icons.js';
import { buildBottomNav, buildTopBar } from './_shell.js';

export default function render(root, params = {}) {
  const screen = document.createElement('div');
  screen.className = 'mob';
  screen.appendChild(buildTopBar({
    title: t('nav.settings') || 'Settings',
    back: true,
    backHref: '#/profile',
  }));

  let theme  = getTheme();
  let accent = getAccent();
  let locale = getLocale();

  const ACCENT_COLORS = [
    ['green',  '#4f9b6a'],
    ['coral',  '#e07a5f'],
    ['yellow', '#e6b54a'],
    ['blue',   '#4a78c4'],
    ['mono',   '#3a3530'],
  ];

  const content = document.createElement('div');
  content.className = 'mob__content';
  content.style.paddingTop = '8px';

  function rebuild() {
    content.innerHTML = `
      <!-- Appearance -->
      <div class="mob-menu-section">
        <div class="mob-menu-label">${t('settings.appearance') || 'Appearance'}</div>

        <!-- Theme -->
        <div class="mob-setting-row">
          <span class="mob-setting-label">Theme</span>
          <div style="display:flex;gap:6px;">
            ${['light', 'dark', 'system'].map(th => `
              <button data-theme-btn="${th}" class="chip chip--small ${theme === th ? 'chip--active' : ''}" style="padding:4px 10px;">
                ${th === 'light' ? '☀️' : th === 'dark' ? '🌙' : '⚙️'} ${t(`settings.theme.${th}`) || th}
              </button>`).join('')}
          </div>
        </div>

        <!-- Accent -->
        <div class="mob-setting-row">
          <span class="mob-setting-label">Accent</span>
          <div style="display:flex;gap:8px;align-items:center;">
            ${ACCENT_COLORS.map(([a, hex]) => `
              <button data-accent-btn="${a}"
                style="width:24px;height:24px;border-radius:50%;background:${hex};
                       border:2.5px solid ${accent === a ? 'var(--ink)' : 'transparent'};
                       cursor:pointer;flex-shrink:0;outline:${accent === a ? '2px solid '+hex : 'none'};outline-offset:1px;"
                title="${t(`settings.accent.${a}`) || a}"></button>`).join('')}
          </div>
        </div>
      </div>

      <!-- Language -->
      <div class="mob-menu-section">
        <div class="mob-menu-label">${t('settings.language') || 'Language'}</div>
        <div class="mob-setting-row">
          <span class="mob-setting-label">Language</span>
          <div style="display:flex;gap:6px;">
            ${['ru', 'en', 'uz'].map(loc => `
              <button data-locale-btn="${loc}" class="chip chip--small ${locale === loc ? 'chip--active' : ''}" style="padding:4px 12px;">
                ${loc === 'ru' ? 'RU' : loc === 'en' ? 'EN' : 'UZ'}
              </button>`).join('')}
          </div>
        </div>
      </div>

      <!-- Account -->
      <div class="mob-menu-section">
        <div class="mob-menu-label">${t('settings.account') || 'Account'}</div>
        <a href="#/profile" class="mob-menu-item">
          ${iconEl('user', 16)?.outerHTML || ''}
          <span class="mob-menu-item__label">Edit Profile</span>
          ${iconEl('chevR', 14)?.outerHTML || ''}
        </a>
      </div>

      <div style="height:24px;"></div>
    `;

    // Wire theme buttons
    content.querySelectorAll('[data-theme-btn]').forEach(btn => {
      btn.addEventListener('click', () => {
        theme = btn.dataset.themeBtn;
        setTheme(theme);
        rebuild();
      });
    });

    // Wire accent buttons
    content.querySelectorAll('[data-accent-btn]').forEach(btn => {
      btn.addEventListener('click', () => {
        accent = btn.dataset.accentBtn;
        setAccent(accent);
        rebuild();
      });
    });

    // Wire locale buttons
    content.querySelectorAll('[data-locale-btn]').forEach(btn => {
      btn.addEventListener('click', async () => {
        locale = btn.dataset.localeBtn;
        await setLocale(locale);
        rebuild();
      });
    });
  }

  rebuild();
  screen.appendChild(content);
  screen.appendChild(buildBottomNav('me'));
  root.innerHTML = '';
  root.appendChild(screen);
}
