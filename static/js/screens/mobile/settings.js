/**
 * mobile/settings.js — Mobile settings screen (M5 redesign).
 *
 * Top-level menu of labelled row sections. Tapping Appearance rows
 * (Theme / Accent / Language) opens a `mSheet` with the actual chooser.
 * Account/Data/About rows currently surface toasts for placeholders.
 *
 * Backend: `setTheme`, `setAccent` from `utils/theme.js`; `setLocale`
 * from `utils/locale.js`. No API calls — settings are persisted to
 * localStorage by those helpers + sent to the server via theme/locale
 * profile fields when the user saves them in mobile/profile.js.
 */
import { t, setLocale, getLocale } from '../../utils/locale.js';
import { setTheme, getTheme, setAccent, getAccent } from '../../utils/theme.js';
import { iconEl } from '../../icons.js';
import { navigate } from '../../router.js';
import {
  topBar, mShell, mSheet, caps,
} from '../../components/mobile-atoms.js';
import { toast } from '../../components/toast.js';

const ACCENTS = [
  ['green',  '#4f9b6a'],
  ['coral',  '#e07a5f'],
  ['yellow', '#e6b54a'],
  ['blue',   '#4a78c4'],
  ['mono',   '#3a3530'],
];

const THEMES = [
  { id: 'light',  label: 'Светлая',  bg: '#f9f6ef', fg: '#1c1a18' },
  { id: 'dark',   label: 'Тёмная',   bg: '#1a1714', fg: '#f3ece0' },
  { id: 'system', label: 'Системная', bg: 'linear-gradient(135deg,#f9f6ef 50%,#1a1714 50%)', fg: '#1c1a18' },
];

const LANGS = [
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
  { id: 'uz', label: "O'zbek" },
];

function buildRow({ icon, title, sub, right, onClick }) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '13px 0',
    borderBottom: '1px solid var(--ink-soft)',
    cursor: onClick ? 'pointer' : 'default',
  });
  if (onClick) row.addEventListener('click', onClick);
  if (icon) {
    const wrap = document.createElement('span');
    Object.assign(wrap.style, {
      color: 'var(--ink-fade)', display: 'flex', flexShrink: '0',
    });
    wrap.appendChild(iconEl(icon, 16));
    row.appendChild(wrap);
  }
  const mid = document.createElement('div');
  Object.assign(mid.style, { flex: '1', minWidth: '0' });
  const t1 = document.createElement('div');
  Object.assign(t1.style, {
    fontSize: '14px', fontWeight: '500', color: 'var(--ink)',
  });
  t1.textContent = title;
  mid.appendChild(t1);
  if (sub) {
    const t2 = document.createElement('div');
    Object.assign(t2.style, {
      fontSize: '11px', color: 'var(--ink-mute)', marginTop: '2px',
    });
    t2.textContent = sub;
    mid.appendChild(t2);
  }
  row.appendChild(mid);
  if (right) row.appendChild(right instanceof Node ? right : document.createTextNode(String(right)));
  else if (onClick) {
    const chev = iconEl('chevR', 14);
    chev.style.color = 'var(--ink-mute)';
    row.appendChild(chev);
  }
  return row;
}

function accentSwatch(hex) {
  const dot = document.createElement('span');
  Object.assign(dot.style, {
    width: '16px', height: '16px', borderRadius: '50%',
    background: hex, border: '1.5px solid var(--ink)',
    display: 'inline-block',
  });
  return dot;
}

export default async function render(root) {
  let theme  = getTheme();
  let accent = getAccent();
  let locale = getLocale();

  const body = document.createElement('div');
  body.style.padding = '8px 16px 24px';

  function rebuild() {
    body.replaceChildren();

    // Appearance.
    body.appendChild(caps(t('settings.appearance') || 'Внешний вид', { padding: '10px 0 4px' }));
    body.appendChild(buildRow({
      title: t('settings.theme') || 'Тема',
      sub: THEMES.find(x => x.id === theme)?.label || theme,
      onClick: openThemeSheet,
    }));
    body.appendChild(buildRow({
      title: t('settings.accent') || 'Акцент',
      sub: accent,
      right: accentSwatch(ACCENTS.find(a => a[0] === accent)?.[1] || 'var(--accent)'),
      onClick: openAccentSheet,
    }));
    body.appendChild(buildRow({
      title: t('settings.language') || 'Язык',
      sub: LANGS.find(l => l.id === locale)?.label || locale,
      onClick: openLangSheet,
    }));

    // Account.
    body.appendChild(caps(t('profile.section.account') || 'Аккаунт', { padding: '14px 0 4px' }));
    body.appendChild(buildRow({
      icon: 'user',
      title: t('profile.row.data') || 'Личные данные',
      onClick: () => navigate('/profile'),
    }));
    body.appendChild(buildRow({
      icon: 'lock',
      title: t('profile.row.security') || 'Безопасность',
      sub: t('profile.row.security.sub') || '2FA выключена',
      onClick: () => toast(t('settings.section_in_progress') || 'Раздел в разработке', { tone: 'info' }),
    }));
    body.appendChild(buildRow({
      icon: 'bell',
      title: t('profile.row.notifications') || 'Уведомления',
      onClick: () => toast(t('settings.section_in_progress') || 'Раздел в разработке', { tone: 'info' }),
    }));

    // Data.
    body.appendChild(caps(t('settings.data') || 'Данные', { padding: '14px 0 4px' }));
    body.appendChild(buildRow({
      icon: 'doc',
      title: t('settings.export') || 'Экспорт всех попыток',
      sub: 'CSV / PDF',
      onClick: () => toast(t('settings.export_placeholder') || 'Экспорт пока не реализован', { tone: 'info' }),
    }));
    body.appendChild(buildRow({
      icon: 'trash',
      title: t('settings.clear_cache') || 'Очистить кеш',
      onClick: () => {
        try {
          for (const k of Object.keys(sessionStorage)) {
            if (k.startsWith('pretest:') || k.startsWith('att:')) sessionStorage.removeItem(k);
          }
        } catch { /* private mode */ }
        toast(t('settings.cache_cleared') || 'Кеш очищен', { tone: 'success' });
      },
    }));

    // About.
    body.appendChild(caps(t('settings.about') || 'О приложении', { padding: '14px 0 4px' }));
    body.appendChild(buildRow({
      icon: 'doc',
      title: t('settings.version') || 'Версия',
      sub: window.__APP_VERSION__ ? `v${window.__APP_VERSION__} · TestMaster` : 'TestMaster',
    }));
  }

  // ── Sheets ─────────────────────────────────────────────────────

  function openThemeSheet() {
    const grid = document.createElement('div');
    grid.style.padding = '12px 16px 20px';
    const inner = document.createElement('div');
    Object.assign(inner.style, {
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px',
    });
    for (const th of THEMES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      Object.assign(btn.style, {
        padding: '20px 8px', borderRadius: 'var(--radius-md)',
        border: theme === th.id ? '2px solid var(--accent)' : '1.5px solid var(--ink-soft)',
        background: th.bg, color: th.fg,
        textAlign: 'center', font: "600 12px Inter, sans-serif",
        cursor: 'pointer',
      });
      btn.textContent = th.label;
      btn.addEventListener('click', () => {
        theme = th.id;
        setTheme(th.id);
        sheet.close();
        rebuild();
      });
      inner.appendChild(btn);
    }
    grid.appendChild(inner);
    const sheet = mSheet({ title: t('settings.choose_theme') || 'Выбор темы' }, grid);
    sheet.open();
  }

  function openAccentSheet() {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', gap: '14px', justifyContent: 'center',
      padding: '20px 16px',
    });
    for (const [id, hex] of ACCENTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      Object.assign(btn.style, {
        width: '42px', height: '42px', borderRadius: '50%',
        background: hex,
        border: accent === id ? '3px solid var(--ink)' : '1.5px solid var(--ink-soft)',
        cursor: 'pointer',
      });
      btn.setAttribute('aria-label', id);
      btn.addEventListener('click', () => {
        accent = id;
        setAccent(id);
        sheet.close();
        rebuild();
      });
      row.appendChild(btn);
    }
    const sheet = mSheet({ title: t('settings.choose_accent') || 'Цвет акцента' }, row);
    sheet.open();
  }

  function openLangSheet() {
    const list = document.createElement('div');
    Object.assign(list.style, {
      display: 'flex', flexDirection: 'column', padding: '8px 16px 20px',
    });
    LANGS.forEach((l, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 4px',
        border: 'none', background: 'none', cursor: 'pointer',
        borderTop: i ? '1px solid var(--ink-soft)' : 'none',
        font: '400 14px Inter, sans-serif', color: 'var(--ink)',
        textAlign: 'left',
      });
      const span = document.createElement('span');
      span.style.flex = '1';
      span.textContent = l.label;
      row.appendChild(span);
      if (locale === l.id) {
        const ck = iconEl('check', 16);
        ck.style.color = 'var(--accent)';
        row.appendChild(ck);
      }
      row.addEventListener('click', async () => {
        locale = l.id;
        await setLocale(l.id);
        sheet.close();
        rebuild();
      });
      list.appendChild(row);
    });
    const sheet = mSheet({ title: t('settings.choose_lang') || 'Язык интерфейса' }, list);
    sheet.open();
  }

  rebuild();

  mShell({
    root,
    topbar: topBar({
      title: t('nav.settings') || 'Настройки',
      back: true, backHref: '#/profile',
    }),
    body,
    navActive: 'me',
  });
}
