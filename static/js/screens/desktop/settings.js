/**
 * screens/desktop/settings.js — Settings mail-client (Phase 5 final).
 *
 * Layout: AppShell + MailLayout (sidebarWidth 220).
 *   Sidebar: caps "Настройки" + 6 nav rows.
 *   Detail:  caps + h2 + sub-pane.
 *
 * Sub-panes:
 *   - account     → info card linking to /profile (where the real
 *                   personal fields + password live).
 *   - appearance  → Theme (light/dark chips + 2 preview tiles) +
 *                   Accent (5 pill swatches green/coral/yellow/blue/mono).
 *   - lang        → 3 chips Русский / English / Oʻzbek.
 *   - notif / security / io → "Раздел в разработке" placeholder.
 *
 * Persistence: setTheme/setAccent/setLocale apply immediately on the
 * `<html>` element and via [updateProfile] best-effort PATCHes to the
 * server so prefs sync across devices. Hydration on next load happens
 * in main.js (already wired in Phase 1).
 */
import { setTheme, getResolvedTheme, setAccent, getAccent } from '../../utils/theme.js';
import { setLocale, getLocale } from '../../utils/locale.js';
import { updateProfile } from '../../api/users.js';
import { navigate } from '../../router.js';
import { mountAppShell } from '../../components/app-shell.js';
import { buildMailLayout } from '../../components/mail-layout.js';
import { toast } from '../../components/toast.js';
import { iconEl } from '../../icons.js';
import { t } from '../../utils/locale.js';

const SUBS = ['account', 'appearance', 'lang', 'notif', 'security', 'io'];

export default async function render(root, params) {
  params = params || {};
  const main = mountAppShell(root);
  main.innerHTML = '';

  const state = {
    sub: SUBS.includes(params.sub) ? params.sub : 'appearance',
  };

  const built = buildMailLayout(main, { sidebarWidth: 220 });
  renderSidebar(built.sidebar, built.detail, state);
  renderDetail(built.detail, state);
}

// ─── Sidebar ─────────────────────────────────────────────────

function renderSidebar(sidebar, detail, state) {
  sidebar.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'mail-layout__sidebar-head';
  const caps = document.createElement('div');
  caps.className = 'caps';
  caps.textContent = t('nav.settings') || 'Настройки';
  head.appendChild(caps);
  sidebar.appendChild(head);

  const list = document.createElement('div');
  list.style.flex = '1';
  list.style.overflowY = 'auto';
  list.style.padding = '6px 0';

  const items = [
    ['account',    'user',   t('settings.account')     || 'Аккаунт'],
    ['appearance', 'cog',    t('settings.appearance')  || 'Тема и акцент'],
    ['lang',       'globe',  t('settings.language')    || 'Язык и регион'],
    ['notif',      'bell',   t('settings.notif')       || 'Уведомления'],
    ['security',   'lock',   t('settings.security')    || 'Безопасность'],
    ['io',         'doc',    t('settings.io')          || 'Импорт / экспорт'],
  ];
  items.forEach(function (entry) {
    const key = entry[0], icon = entry[1], label = entry[2];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mail-row' + (state.sub === key ? ' is-active' : '');
    const main = document.createElement('div');
    main.className = 'mail-row__main';
    main.style.display = 'flex';
    main.style.alignItems = 'center';
    main.style.gap = '8px';
    const ic = document.createElement('span');
    ic.style.lineHeight = '0';
    ic.style.color = 'var(--ink-tertiary)';
    ic.appendChild(iconEl(icon, 14));
    main.appendChild(ic);
    const titleEl = document.createElement('div');
    titleEl.className = 'mail-row__title';
    titleEl.textContent = label;
    main.appendChild(titleEl);
    btn.appendChild(main);
    btn.addEventListener('click', function () {
      state.sub = key;
      renderSidebar(sidebar, detail, state);
      renderDetail(detail, state);
      history.replaceState({}, '', '#/settings?sub=' + key);
    });
    list.appendChild(btn);
  });
  sidebar.appendChild(list);
}

// ─── Detail ──────────────────────────────────────────────────

function renderDetail(detail, state) {
  detail.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.padding = '24px 28px';
  wrap.style.maxWidth = '580px';
  detail.appendChild(wrap);

  const caps = document.createElement('div');
  caps.className = 'caps';
  caps.textContent = t('nav.settings') || 'Настройки';
  wrap.appendChild(caps);

  const titles = {
    account:    t('settings.account')    || 'Аккаунт',
    appearance: t('settings.appearance') || 'Тема и акцент',
    lang:       t('settings.language')   || 'Язык и регион',
    notif:      t('settings.notif')      || 'Уведомления',
    security:   t('settings.security')   || 'Безопасность',
    io:         t('settings.io')         || 'Импорт / экспорт',
  };

  const h = document.createElement('h2');
  h.style.fontSize = '22px';
  h.style.margin = '2px 0 18px';
  h.style.letterSpacing = '-0.01em';
  h.style.fontWeight = 'var(--fw-bold)';
  h.textContent = titles[state.sub];
  wrap.appendChild(h);

  if (state.sub === 'appearance') renderAppearance(wrap);
  else if (state.sub === 'lang')  renderLang(wrap);
  else if (state.sub === 'account') renderAccountInfo(wrap);
  else renderComingSoon(wrap);
}

// ─── Sub-panes ───────────────────────────────────────────────

function renderAppearance(wrap) {
  // ── Theme card ──
  const themeCard = buildCard('Тема');
  const themeRow = document.createElement('div');
  themeRow.style.display = 'flex';
  themeRow.style.gap = '8px';
  const current = getResolvedTheme();
  ['light', 'dark'].forEach(function (mode) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (current === mode ? ' chip--active' : '');
    chip.textContent = mode === 'light'
      ? (t('settings.theme.light') || 'Светлая')
      : (t('settings.theme.dark')  || 'Тёмная');
    chip.addEventListener('click', function () {
      setTheme(mode);
      // Persist best-effort.
      updateProfile({ theme: mode }).catch(function () { /* offline-safe */ });
      // Re-render so chips reflect the new active mode + preview tiles
      // update.
      renderAppearance(wrap);
      // The wrap kept the previous theme content, so we have to swap
      // ourselves out cleanly:
      wrap.querySelectorAll('.card').forEach(function (c) { c.remove(); });
    });
    themeRow.appendChild(chip);
  });
  themeCard.body.appendChild(themeRow);

  // Two static preview tiles (light + dark) per prototype.
  const previewRow = document.createElement('div');
  previewRow.style.display = 'grid';
  previewRow.style.gridTemplateColumns = '1fr 1fr';
  previewRow.style.gap = '8px';
  previewRow.style.marginTop = '12px';

  const lightTile = document.createElement('div');
  lightTile.style.background = '#f9f6ef';
  lightTile.style.color = '#1c1a18';
  lightTile.style.border = '1.5px solid #1c1a18';
  lightTile.style.borderRadius = '8px';
  lightTile.style.padding = '14px';
  lightTile.style.textAlign = 'center';
  lightTile.style.fontSize = '12px';
  lightTile.style.fontWeight = 'var(--fw-semibold)';
  lightTile.textContent = t('settings.theme.light') || 'Светлая';
  previewRow.appendChild(lightTile);

  const darkTile = document.createElement('div');
  darkTile.style.background = '#1a1714';
  darkTile.style.color = '#f3ece0';
  darkTile.style.border = '1.5px solid #f3ece0';
  darkTile.style.borderRadius = '8px';
  darkTile.style.padding = '14px';
  darkTile.style.textAlign = 'center';
  darkTile.style.fontSize = '12px';
  darkTile.style.fontWeight = 'var(--fw-semibold)';
  darkTile.textContent = t('settings.theme.dark') || 'Тёмная';
  previewRow.appendChild(darkTile);

  themeCard.body.appendChild(previewRow);
  wrap.appendChild(themeCard.el);

  // ── Accent card ──
  const accentCard = buildCard('Акцент');
  accentCard.el.style.marginTop = '12px';
  const accentRow = document.createElement('div');
  accentRow.style.display = 'flex';
  accentRow.style.gap = '8px';
  accentRow.style.flexWrap = 'wrap';

  const swatches = [
    ['green',  '#4f9b6a', t('settings.accent.green')  || 'Green'],
    ['coral',  '#e07a5f', t('settings.accent.coral')  || 'Coral'],
    ['yellow', '#e6b54a', t('settings.accent.yellow') || 'Yellow'],
    ['blue',   '#4a78c4', t('settings.accent.blue')   || 'Blue'],
    ['mono',   '#3a3530', t('settings.accent.mono')   || 'Mono'],
  ];
  const activeAccent = getAccent();
  swatches.forEach(function (entry) {
    const key = entry[0], color = entry[1], label = entry[2];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.accent = key;
    btn.style.padding = '5px 10px 5px 6px';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '6px';
    btn.style.borderRadius = '999px';
    btn.style.fontSize = '12px';
    btn.style.cursor = 'pointer';
    btn.style.background = activeAccent === key ? 'var(--accent-soft)' : 'var(--paper)';
    btn.style.border = activeAccent === key ? '1.5px solid var(--ink)' : '1.5px solid var(--ink-soft)';
    btn.style.color = 'var(--ink)';

    const dot = document.createElement('span');
    dot.style.width = '14px';
    dot.style.height = '14px';
    dot.style.borderRadius = '50%';
    dot.style.background = color;
    dot.style.flexShrink = '0';
    btn.appendChild(dot);

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    btn.appendChild(labelEl);

    btn.addEventListener('click', function () {
      setAccent(key);
      updateProfile({ accent: key }).catch(function () { /* offline-safe */ });
      // Re-paint just the accent row (cheap).
      accentRow.querySelectorAll('button').forEach(function (b) {
        const isActive = b.dataset.accent === key;
        b.style.background = isActive ? 'var(--accent-soft)' : 'var(--paper)';
        b.style.border = isActive ? '1.5px solid var(--ink)' : '1.5px solid var(--ink-soft)';
      });
      toast(t('common.save') || 'Сохранено', { tone: 'success', timeout: 1200 });
    });
    accentRow.appendChild(btn);
  });
  accentCard.body.appendChild(accentRow);
  wrap.appendChild(accentCard.el);
}

function renderLang(wrap) {
  const card = buildCard('Язык интерфейса');
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.flexWrap = 'wrap';

  const langs = [
    ['ru', 'Русский'],
    ['en', 'English'],
    ['uz', 'Oʻzbek'],
  ];
  const active = getLocale();
  langs.forEach(function (entry) {
    const code = entry[0], label = entry[1];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (active === code ? ' chip--active' : '');
    chip.textContent = label;
    chip.addEventListener('click', async function () {
      await setLocale(code);
      updateProfile({ language: code }).catch(function () { /* offline-safe */ });
      toast(label, { tone: 'success', timeout: 1200 });
      // Router re-renders on localechange — chip state is rebuilt then.
    });
    row.appendChild(chip);
  });
  card.body.appendChild(row);
  wrap.appendChild(card.el);
}

function renderAccountInfo(wrap) {
  const card = buildCard();
  const msg = document.createElement('div');
  msg.style.fontSize = '13px';
  msg.style.color = 'var(--ink-secondary)';
  msg.style.lineHeight = '1.6';
  const txt1 = document.createTextNode((t('settings.account.copy') || 'Настройки аккаунта вынесены в') + ' ');
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'auth-link-btn';
  link.style.color = 'var(--accent)';
  link.style.background = 'none';
  link.style.border = 'none';
  link.style.cursor = 'pointer';
  link.style.padding = '0';
  link.style.fontWeight = 'var(--fw-semibold)';
  link.textContent = (t('settings.account.link') || 'Профиль → Личные данные');
  link.addEventListener('click', function () { navigate('/profile'); });
  msg.appendChild(txt1);
  msg.appendChild(link);
  msg.appendChild(document.createTextNode('.'));
  card.body.appendChild(msg);
  wrap.appendChild(card.el);
}

function renderComingSoon(wrap) {
  const card = buildCard();
  const msg = document.createElement('div');
  msg.style.fontSize = '13px';
  msg.style.color = 'var(--ink-secondary)';
  msg.textContent = t('settings.section.coming_soon') || 'Раздел в разработке.';
  card.body.appendChild(msg);
  wrap.appendChild(card.el);
}

// ─── Helpers ─────────────────────────────────────────────────

function buildCard(title) {
  const el = document.createElement('div');
  el.className = 'card';
  el.style.padding = '0';
  if (title) {
    const head = document.createElement('div');
    head.style.padding = '12px 14px';
    head.style.borderBottom = '1px solid var(--ink-soft)';
    const titleEl = document.createElement('div');
    titleEl.className = 'card__title';
    titleEl.style.fontSize = '13px';
    titleEl.style.fontWeight = 'var(--fw-semibold)';
    titleEl.textContent = title;
    head.appendChild(titleEl);
    el.appendChild(head);
  }
  const body = document.createElement('div');
  body.style.padding = '14px';
  el.appendChild(body);
  return { el: el, body: body };
}
