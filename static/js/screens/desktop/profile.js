/**
 * screens/desktop/profile.js — Profile mail-client (Phase 5e).
 *
 * Layout: AppShell + MailLayout.
 *   Sidebar (240px):
 *     - User card (large avatar + display name + email).
 *     - "Профиль" section: Личные данные / Безопасность / Доступ / Сессии.
 *     - "Уведомления" section: Email / push.
 *     - "Опасная зона": Удалить аккаунт.
 *   Detail:
 *     - Personal: avatar uploader + crop modal, display_name / email /
 *       username form, save row.
 *     - Security: change-password card; 2FA placeholder.
 *     - Access / Sessions / Notifications: stub cards (real data
 *       lands when the corresponding backend endpoints exist —
 *       sessions table is there but no list endpoint yet).
 *
 * Avatar upload pipeline:
 *   1. <input type=file> picker → openAvatarCrop(file)
 *   2. Crop modal returns a 512×512 PNG Blob
 *   3. POST /api/users/me/avatar with the cropped blob
 *   4. On success, refresh getMyProfile() so the topbar avatar updates
 */
import { getMyProfile, updateProfile, uploadAvatar, deleteAvatar } from '../../api/users.js';
import { getMe } from '../../api/auth.js';
import { setTheme, getResolvedTheme, setAccent, getAccent } from '../../utils/theme.js';
import { setLocale, getLocale } from '../../utils/locale.js';
// changePassword is loaded lazily on click — this lets profile.js render
// even when an older auth.js is sitting in the browser's ES-module realm
// cache (common during dev after auth.js gains a new export).
import { navigate } from '../../router.js';
import { getState, setState } from '../../state.js';
import { mountAppShell } from '../../components/app-shell.js';
import { buildMailLayout } from '../../components/mail-layout.js';
import { confirm as confirmDialog } from '../../components/confirm-dialog.js';
import { toast } from '../../components/toast.js';
import { openAvatarCrop } from '../../components/avatar-crop.js';
import { iconEl } from '../../icons.js';
import { t } from '../../utils/locale.js';

let _renderToken = 0;

export default async function render(root, params) {
  params = params || {};
  const token = ++_renderToken;
  const stale = function () { return _renderToken !== token; };

  const main = mountAppShell(root);
  main.innerHTML = '';

  const skel = document.createElement('div');
  skel.className = 'skeleton';
  skel.style.height = '60%';
  skel.style.minHeight = '300px';
  skel.style.margin = '24px';
  skel.style.borderRadius = 'var(--radius-md)';
  main.appendChild(skel);

  let profile = null;
  try { profile = await getMyProfile(); } catch (_) { /* ignored */ }
  if (!profile) {
    try { profile = await getMe(); } catch (_) { /* ignored */ }
  }
  if (stale()) return;
  if (!profile) {
    main.innerHTML = '';
    main.appendChild(emptyState('Не удалось загрузить профиль', 'Попробуйте обновить страницу'));
    return;
  }
  main.innerHTML = '';

  // Accept both `?sub=` (legacy) and `?section=` (post-unification with
  // /settings redirect). Known sub-panes:
  //   personal | security | access | sessions | notif (Профиль/Уведомления)
  //   appearance         (Внешний вид: тема/акцент/язык в одном пане)
  //   data               (Данные: экспорт + очистить кэш)
  //   about              (О приложении: версия)
  const requestedSub = params.section || params.sub || 'personal';
  const KNOWN_SUBS = ['personal','security','access','sessions','notif',
                      'appearance','data','about'];
  const state = {
    profile: profile,
    sub: KNOWN_SUBS.includes(requestedSub) ? requestedSub : 'personal',
  };

  const built = buildMailLayout(main, { sidebarWidth: 252 });
  renderSidebar(built.sidebar, built.detail, state);
  renderDetail(built.detail, state);
}

// ─── Sidebar ─────────────────────────────────────────────────

function renderSidebar(sidebar, detail, state) {
  sidebar.innerHTML = '';
  const p = state.profile;

  // User card.
  const card = document.createElement('div');
  card.style.padding = '14px 14px 12px';
  card.style.borderBottom = '1px solid var(--ink-soft)';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.alignItems = 'center';
  card.style.gap = '8px';

  const av = document.createElement('span');
  av.className = 'avatar avatar--xl';
  av.textContent = userInitials(p);
  if (p.avatar_url) {
    const img = document.createElement('img');
    img.src = p.avatar_url;
    img.alt = '';
    av.innerHTML = '';
    av.appendChild(img);
  }
  card.appendChild(av);

  const name = document.createElement('div');
  name.style.fontSize = '14px';
  name.style.fontWeight = 'var(--fw-semibold)';
  name.textContent = p.display_name || p.username || '—';
  card.appendChild(name);

  const email = document.createElement('div');
  email.style.fontSize = '11px';
  email.style.color = 'var(--ink-tertiary)';
  email.textContent = p.email || '';
  card.appendChild(email);

  sidebar.appendChild(card);

  // Nav.
  const nav = document.createElement('div');
  nav.style.flex = '1';
  nav.style.overflowY = 'auto';
  nav.style.padding = '6px 0';

  nav.appendChild(sectionLabel('Профиль'));
  navItem(nav, 'user',   'Личные данные',         state, 'personal',  detail);
  navItem(nav, 'lock',   'Безопасность',          state, 'security',  detail);
  navItem(nav, 'share',  'Доступ к моим тестам',  state, 'access',    detail);

  nav.appendChild(sectionLabel('Внешний вид'));
  navItem(nav, 'sun',    'Тема, акцент, язык',    state, 'appearance', detail);

  nav.appendChild(sectionLabel('Уведомления'));
  navItem(nav, 'bell',   'Email / push',          state, 'notif',     detail);

  nav.appendChild(sectionLabel('Данные'));
  navItem(nav, 'download', 'Экспорт + кэш',       state, 'data',      detail);

  nav.appendChild(sectionLabel('О приложении'));
  navItem(nav, 'info',   'Версия',                state, 'about',     detail);

  // Сеанс: sessions list + logout. Sits just above the danger zone so
  // logout is discoverable without being adjacent to "Delete account".
  nav.appendChild(sectionLabel('Сеанс'));
  navItem(nav, 'clock', 'Сессии', state, 'sessions', detail);
  const logoutRow = document.createElement('button');
  logoutRow.type = 'button';
  logoutRow.className = 'mail-row';
  const lMain = document.createElement('div');
  lMain.className = 'mail-row__main';
  lMain.style.display = 'flex';
  lMain.style.alignItems = 'center';
  lMain.style.gap = '8px';
  const lIc = document.createElement('span');
  lIc.style.lineHeight = '0';
  lIc.appendChild(iconEl('arrowL', 14));
  lMain.appendChild(lIc);
  const lTitle = document.createElement('div');
  lTitle.className = 'mail-row__title';
  lTitle.textContent = t('profile.row.logout') || 'Выйти';
  lMain.appendChild(lTitle);
  logoutRow.appendChild(lMain);
  logoutRow.addEventListener('click', async function () {
    try {
      const { logout } = await import('../../api/auth.js');
      await logout();
    } catch { /* best-effort */ }
    setState({ user: null });
    navigate('/auth/login');
  });
  nav.appendChild(logoutRow);

  nav.appendChild(sectionLabel('Опасная зона'));
  const dangerRow = document.createElement('button');
  dangerRow.type = 'button';
  dangerRow.className = 'mail-row';
  dangerRow.style.color = 'var(--error)';
  const dMain = document.createElement('div');
  dMain.className = 'mail-row__main';
  dMain.style.display = 'flex';
  dMain.style.alignItems = 'center';
  dMain.style.gap = '8px';
  const dIc = document.createElement('span');
  dIc.style.lineHeight = '0';
  dIc.style.color = 'var(--error)';
  dIc.appendChild(iconEl('trash', 14));
  dMain.appendChild(dIc);
  const dTitle = document.createElement('div');
  dTitle.className = 'mail-row__title';
  dTitle.style.color = 'var(--error)';
  dTitle.textContent = 'Удалить аккаунт';
  dMain.appendChild(dTitle);
  dangerRow.appendChild(dMain);
  dangerRow.addEventListener('click', async function () {
    const ok = await confirmDialog({
      title: 'Удалить аккаунт?',
      message: 'Все ваши тесты, попытки и CR будут удалены безвозвратно. Это действие необратимо.',
      danger: true,
      typeToConfirm: state.profile.email,
      confirmLabel: 'Удалить аккаунт',
    });
    if (!ok) return;
    // No backend endpoint yet — surface a clear error rather than
    // pretending to delete.
    toast('Удаление аккаунта пока не реализовано на сервере', { tone: 'error' });
  });
  nav.appendChild(dangerRow);

  sidebar.appendChild(nav);
}

function sectionLabel(text) {
  const el = document.createElement('div');
  el.className = 'mail-layout__sidebar-section';
  el.textContent = text;
  return el;
}

function navItem(parent, iconKind, label, state, key, detail) {
  const active = state.sub === key;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mail-row' + (active ? ' is-active' : '');

  const main = document.createElement('div');
  main.className = 'mail-row__main';
  main.style.display = 'flex';
  main.style.alignItems = 'center';
  main.style.gap = '8px';
  const ic = document.createElement('span');
  ic.style.lineHeight = '0';
  ic.style.color = 'var(--ink-tertiary)';
  ic.appendChild(iconEl(iconKind, 14));
  main.appendChild(ic);
  const titleEl = document.createElement('div');
  titleEl.className = 'mail-row__title';
  titleEl.textContent = label;
  main.appendChild(titleEl);
  btn.appendChild(main);

  btn.addEventListener('click', function () {
    state.sub = key;
    // Re-render sidebar to update active state + detail to switch pane.
    const sidebar = btn.closest('.mail-layout__sidebar');
    renderSidebar(sidebar, detail, state);
    renderDetail(detail, state);
  });
  parent.appendChild(btn);
}

// ─── Detail ──────────────────────────────────────────────────

function renderDetail(detail, state) {
  detail.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.padding = '24px 28px';
  wrap.style.maxWidth = '600px';
  detail.appendChild(wrap);

  const subTitle = {
    personal:   'Личные данные',
    security:   'Безопасность',
    access:     'Доступ',
    sessions:   'Сессии',
    notif:      'Уведомления',
    appearance: 'Тема, акцент, язык',
    data:       'Данные',
    about:      'О приложении',
  }[state.sub] || '';

  const caps = document.createElement('div');
  caps.className = 'caps';
  caps.textContent = 'Профиль';
  wrap.appendChild(caps);

  const h = document.createElement('h2');
  h.style.fontSize = '22px';
  h.style.margin = '2px 0 18px';
  h.style.letterSpacing = '-0.01em';
  h.style.fontWeight = 'var(--fw-bold)';
  h.textContent = subTitle;
  wrap.appendChild(h);

  if (state.sub === 'personal') renderPersonal(wrap, state);
  else if (state.sub === 'security') renderSecurity(wrap, state);
  else if (state.sub === 'sessions') renderSessions(wrap);
  else if (state.sub === 'access') renderAccessStub(wrap);
  else if (state.sub === 'notif') renderNotifStub(wrap);
  else if (state.sub === 'appearance') renderAppearance(wrap);
  else if (state.sub === 'data') renderData(wrap);
  else if (state.sub === 'about') renderAbout(wrap);
}

// ─── Appearance / Data / About panes (moved from /settings) ───────

function renderAppearance(wrap) {
  // Theme card.
  const themeCard = buildSettingsCard('Тема');
  const themeRow = document.createElement('div');
  themeRow.style.cssText = 'display:flex;gap:8px;';
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
      updateProfile({ theme: mode }).catch(function () {});
      renderAppearance(wrap);
      wrap.querySelectorAll('.card').forEach(function (c) { c.remove(); });
    });
    themeRow.appendChild(chip);
  });
  themeCard.body.appendChild(themeRow);
  wrap.appendChild(themeCard.el);

  // Accent card.
  const accentCard = buildSettingsCard('Акцент');
  accentCard.el.style.marginTop = '12px';
  const accentRow = document.createElement('div');
  accentRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
  const swatches = [
    ['green',  '#4f9b6a', 'Green'],
    ['coral',  '#e07a5f', 'Coral'],
    ['yellow', '#e6b54a', 'Yellow'],
    ['blue',   '#4a78c4', 'Blue'],
    ['mono',   '#3a3530', 'Mono'],
  ];
  const activeAccent = getAccent();
  swatches.forEach(function (entry) {
    const key = entry[0], color = entry[1], label = entry[2];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.accent = key;
    btn.style.cssText = [
      'padding:5px 10px 5px 6px;display:inline-flex;align-items:center;gap:6px;',
      'border-radius:999px;font-size:12px;cursor:pointer;color:var(--ink);',
      'background:' + (activeAccent === key ? 'var(--accent-soft)' : 'var(--paper)') + ';',
      'border:1.5px solid ' + (activeAccent === key ? 'var(--ink)' : 'var(--ink-soft)') + ';',
    ].join('');
    const dot = document.createElement('span');
    dot.style.cssText = 'width:14px;height:14px;border-radius:50%;background:' + color + ';flex-shrink:0;';
    btn.appendChild(dot);
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    btn.appendChild(labelEl);
    btn.addEventListener('click', function () {
      setAccent(key);
      updateProfile({ accent: key }).catch(function () {});
      accentRow.querySelectorAll('button').forEach(function (b) {
        const isActive = b.dataset.accent === key;
        b.style.background = isActive ? 'var(--accent-soft)' : 'var(--paper)';
        b.style.border = '1.5px solid ' + (isActive ? 'var(--ink)' : 'var(--ink-soft)');
      });
      toast(t('common.save') || 'Сохранено', { tone: 'success', timeout: 1200 });
    });
    accentRow.appendChild(btn);
  });
  accentCard.body.appendChild(accentRow);
  wrap.appendChild(accentCard.el);

  // Language card.
  const langCard = buildSettingsCard('Язык интерфейса');
  langCard.el.style.marginTop = '12px';
  const langRow = document.createElement('div');
  langRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
  const langs = [['ru', 'Русский'], ['en', 'English'], ['uz', 'Oʻzbek']];
  const activeLang = getLocale();
  langs.forEach(function (entry) {
    const code = entry[0], label = entry[1];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (activeLang === code ? ' chip--active' : '');
    chip.textContent = label;
    chip.addEventListener('click', async function () {
      await setLocale(code);
      updateProfile({ language: code }).catch(function () {});
      toast(label, { tone: 'success', timeout: 1200 });
    });
    langRow.appendChild(chip);
  });
  langCard.body.appendChild(langRow);
  wrap.appendChild(langCard.el);
}

function renderData(wrap) {
  const exportCard = buildSettingsCard('Экспорт');
  const exportDesc = document.createElement('div');
  exportDesc.style.cssText = 'font-size:13px;color:var(--ink-secondary);margin-bottom:10px;';
  exportDesc.textContent = 'Скачайте все ваши попытки в формате JSON.';
  exportCard.body.appendChild(exportDesc);
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'btn btn--small';
  exportBtn.textContent = 'Экспортировать попытки';
  exportBtn.addEventListener('click', async function () {
    try {
      const { listAttempts } = await import('../../api/statistics.js');
      const resp = await listAttempts({ limit: 1000 });
      const blob = new Blob([JSON.stringify(resp, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'testmaster-attempts.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast('Экспорт готов', { tone: 'success' });
    } catch (e) {
      toast(e?.message || 'Не удалось экспортировать', { tone: 'error' });
    }
  });
  exportCard.body.appendChild(exportBtn);
  wrap.appendChild(exportCard.el);

  const cacheCard = buildSettingsCard('Локальный кэш');
  cacheCard.el.style.marginTop = '12px';
  const cacheDesc = document.createElement('div');
  cacheDesc.style.cssText = 'font-size:13px;color:var(--ink-secondary);margin-bottom:10px;';
  cacheDesc.textContent = 'Сохранённые предпочтения интерфейса, prefetch-кэш списков. Не влияет на ваши данные на сервере.';
  cacheCard.body.appendChild(cacheDesc);
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn--small';
  clearBtn.textContent = 'Очистить кэш';
  clearBtn.addEventListener('click', function () {
    try {
      const keepKeys = ['theme', 'accent', 'locale'];
      const saved = {};
      keepKeys.forEach(function (k) { saved[k] = localStorage.getItem(k); });
      localStorage.clear();
      sessionStorage.clear();
      keepKeys.forEach(function (k) { if (saved[k] != null) localStorage.setItem(k, saved[k]); });
      toast('Кэш очищен', { tone: 'success' });
    } catch (e) {
      toast(e?.message || 'Не удалось очистить', { tone: 'error' });
    }
  });
  cacheCard.body.appendChild(clearBtn);
  wrap.appendChild(cacheCard.el);
}

function renderAbout(wrap) {
  const card = buildSettingsCard();
  const ver = (typeof window !== 'undefined' && window.__APP_VERSION__) || 'dev';
  const rows = [
    ['Версия', String(ver)],
    ['Сборка', 'SPA / hash-router'],
    ['Стек', 'FastAPI + Postgres + MinIO'],
  ];
  const dl = document.createElement('div');
  dl.style.cssText = 'display:grid;grid-template-columns:max-content 1fr;gap:8px 14px;font-size:13px;';
  rows.forEach(function (r) {
    const k = document.createElement('div');
    k.style.color = 'var(--ink-tertiary)';
    k.textContent = r[0];
    const v = document.createElement('div');
    v.style.color = 'var(--ink)';
    v.style.fontFamily = "'JetBrains Mono', monospace";
    v.style.fontSize = '12px';
    v.textContent = r[1];
    dl.appendChild(k); dl.appendChild(v);
  });
  card.body.appendChild(dl);
  wrap.appendChild(card.el);
}

function buildSettingsCard(title) {
  const el = document.createElement('div');
  el.className = 'card';
  el.style.padding = '0';
  if (title) {
    const head = document.createElement('div');
    head.style.cssText = 'padding:12px 14px;border-bottom:1px solid var(--ink-soft);';
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:var(--fw-semibold);';
    titleEl.textContent = title;
    head.appendChild(titleEl);
    el.appendChild(head);
  }
  const body = document.createElement('div');
  body.style.padding = '14px';
  el.appendChild(body);
  return { el: el, body: body };
}

// ─── Personal ────────────────────────────────────────────────

function renderPersonal(wrap, state) {
  const p = state.profile;
  const form = {
    display_name: p.display_name || '',
    email:        p.email || '',
    username:     p.username || '',
  };

  // Avatar row.
  const avRow = document.createElement('div');
  avRow.style.display = 'flex';
  avRow.style.gap = '14px';
  avRow.style.alignItems = 'center';
  avRow.style.marginBottom = '20px';

  const av = document.createElement('span');
  av.className = 'avatar avatar--xl';
  if (p.avatar_url) {
    const img = document.createElement('img');
    img.src = p.avatar_url + '?t=' + Date.now();
    img.alt = '';
    av.innerHTML = '';
    av.appendChild(img);
  } else {
    av.textContent = userInitials(p);
  }
  avRow.appendChild(av);

  const avRight = document.createElement('div');
  avRight.style.flex = '1';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp';
  fileInput.style.display = 'none';

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'btn';
  uploadBtn.appendChild(iconEl('upload', 14));
  const uL = document.createElement('span');
  uL.textContent = ' Загрузить фото';
  uploadBtn.appendChild(uL);
  uploadBtn.addEventListener('click', function () { fileInput.click(); });

  const deleteBtnEl = document.createElement('button');
  deleteBtnEl.type = 'button';
  deleteBtnEl.className = 'btn btn--ghost btn--danger';
  deleteBtnEl.textContent = 'Удалить';
  deleteBtnEl.style.marginLeft = '6px';
  deleteBtnEl.disabled = !p.avatar_url;
  deleteBtnEl.addEventListener('click', async function () {
    deleteBtnEl.disabled = true;
    try {
      await deleteAvatar();
      // Re-fetch profile to update avatar everywhere.
      const fresh = await getMyProfile();
      state.profile = fresh;
      setState({ user: Object.assign({}, getState().user, fresh) });
      toast('Аватар удалён', { tone: 'success' });
      renderDetail(wrap.parentElement, state);
    } catch (e) {
      deleteBtnEl.disabled = !state.profile.avatar_url;
      toast((e && e.message) || 'Не удалось удалить', { tone: 'error' });
    }
  });

  avRight.appendChild(uploadBtn);
  avRight.appendChild(deleteBtnEl);
  avRight.appendChild(fileInput);

  const hint = document.createElement('div');
  hint.style.fontSize = '11px';
  hint.style.color = 'var(--ink-tertiary)';
  hint.style.marginTop = '6px';
  hint.textContent = 'PNG / JPG / WEBP, до 2 МБ. Изображение будет обрезано в квадрат.';
  avRight.appendChild(hint);

  fileInput.addEventListener('change', async function () {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast('Файл больше 2 МБ', { tone: 'error' });
      fileInput.value = '';
      return;
    }
    const blob = await openAvatarCrop(file);
    fileInput.value = '';
    if (!blob) return;
    try {
      const cropped = new File([blob], 'avatar.png', { type: 'image/png' });
      await uploadAvatar(cropped);
      const fresh = await getMyProfile();
      state.profile = fresh;
      setState({ user: Object.assign({}, getState().user, fresh) });
      toast('Аватар сохранён', { tone: 'success' });
      renderDetail(wrap.parentElement, state);
    } catch (e) {
      toast((e && e.message) || 'Не удалось загрузить', { tone: 'error' });
    }
  });

  avRow.appendChild(avRight);
  wrap.appendChild(avRow);

  // Form fields.
  const fields = [
    ['Имя',         'display_name'],
    ['Email',       'email'],
    ['Username',    'username'],
  ];
  const inputs = {};
  fields.forEach(function (f) {
    const block = document.createElement('div');
    block.style.marginBottom = '14px';
    const lblEl = document.createElement('div');
    lblEl.className = 'caps';
    lblEl.style.marginBottom = '6px';
    lblEl.textContent = f[0];
    block.appendChild(lblEl);
    const input = document.createElement('input');
    input.type = f[1] === 'email' ? 'email' : 'text';
    input.value = form[f[1]];
    input.className = 'input';
    input.style.width = '100%';
    if (f[1] === 'username' || f[1] === 'email') {
      input.disabled = true;
      input.title = 'Изменение пока не реализовано — обратитесь к администратору';
    }
    input.addEventListener('input', function () { form[f[1]] = input.value; });
    inputs[f[1]] = input;
    block.appendChild(input);
    wrap.appendChild(block);
  });

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  actions.style.marginTop = '6px';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = 'Сохранить';
  saveBtn.addEventListener('click', async function () {
    saveBtn.disabled = true;
    try {
      await updateProfile({ display_name: form.display_name });
      const fresh = await getMyProfile();
      state.profile = fresh;
      setState({ user: Object.assign({}, getState().user, fresh) });
      toast('Сохранено', { tone: 'success' });
    } catch (e) {
      toast((e && e.message) || 'Не удалось сохранить', { tone: 'error' });
    } finally {
      saveBtn.disabled = false;
    }
  });
  actions.appendChild(saveBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn';
  cancelBtn.textContent = 'Отмена';
  cancelBtn.addEventListener('click', function () {
    inputs.display_name.value = p.display_name || '';
    inputs.email.value = p.email || '';
    inputs.username.value = p.username || '';
    form.display_name = p.display_name || '';
  });
  actions.appendChild(cancelBtn);

  wrap.appendChild(actions);
}

// ─── Security ────────────────────────────────────────────────

function renderSecurity(wrap, state) {
  // Change password card.
  const pwdCard = buildCard('Сменить пароль');
  const current = passwordInput('Текущий пароль');
  const next1 = passwordInput('Новый пароль');
  const next2 = passwordInput('Повторите новый');
  pwdCard.body.appendChild(current.el);
  pwdCard.body.appendChild(next1.el);
  pwdCard.body.appendChild(next2.el);

  const err = document.createElement('div');
  err.style.color = 'var(--error)';
  err.style.fontSize = 'var(--fs-sm)';
  err.style.minHeight = '18px';
  err.style.marginTop = '6px';
  pwdCard.body.appendChild(err);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn--primary';
  saveBtn.style.marginTop = '6px';
  saveBtn.textContent = 'Сменить пароль';
  saveBtn.addEventListener('click', async function () {
    err.textContent = '';
    if (!current.input.value || !next1.input.value || !next2.input.value) {
      err.textContent = 'Заполните все поля';
      return;
    }
    if (next1.input.value !== next2.input.value) {
      err.textContent = 'Новые пароли не совпадают';
      return;
    }
    saveBtn.disabled = true;
    try {
      const mod = await import('../../api/auth.js?cp=' + Date.now());
      const fn = mod.changePassword || (async function (cp, np) {
        // Fallback: hit the endpoint directly if the cached auth.js
        // wrapper is missing the helper.
        const { api } = await import('../../api/_fetch.js');
        return api.post('/api/auth/change-password', { current_password: cp, new_password: np });
      });
      await fn(current.input.value, next1.input.value);
      current.input.value = next1.input.value = next2.input.value = '';
      toast('Пароль обновлён', { tone: 'success' });
    } catch (e) {
      const detail = e && e.detail;
      if (detail && typeof detail === 'object' && detail.code === 'weak_password') {
        err.textContent = 'Пароль не отвечает требованиям';
      } else {
        err.textContent = (e && e.message) || 'Не удалось сменить пароль';
      }
    } finally {
      saveBtn.disabled = false;
    }
  });
  pwdCard.body.appendChild(saveBtn);

  wrap.appendChild(pwdCard.el);

  // 2FA card (stub — placeholder until 2FA infra exists).
  const tfaCard = buildCard('Двухфакторная аутентификация');
  tfaCard.el.style.marginTop = '14px';
  const msg = document.createElement('div');
  msg.style.fontSize = 'var(--fs-sm)';
  msg.style.color = 'var(--ink-secondary)';
  msg.textContent = '2FA пока не настроена. Появится в следующем обновлении.';
  tfaCard.body.appendChild(msg);
  wrap.appendChild(tfaCard.el);
}

function passwordInput(label) {
  const block = document.createElement('div');
  block.style.marginBottom = '10px';
  const lbl = document.createElement('div');
  lbl.className = 'caps';
  lbl.style.marginBottom = '6px';
  lbl.textContent = label;
  block.appendChild(lbl);
  const input = document.createElement('input');
  input.type = 'password';
  input.className = 'input';
  input.style.width = '100%';
  input.autocomplete = 'new-password';
  block.appendChild(input);
  return { el: block, input: input };
}

// ─── Other panes (stubs) ─────────────────────────────────────

function renderSessions(wrap) {
  const card = buildCard('Активные сессии');
  const msg = document.createElement('div');
  msg.style.fontSize = 'var(--fs-sm)';
  msg.style.color = 'var(--ink-secondary)';
  msg.style.lineHeight = '1.6';
  msg.textContent = 'Список сессий пока недоступен — нет публичного эндпоинта. Каждая авторизация создаёт запись в таблице sessions; интерфейс управления появится позже.';
  card.body.appendChild(msg);
  wrap.appendChild(card.el);
}

function renderAccessStub(wrap) {
  const card = buildCard('Доступ к моим тестам');
  const msg = document.createElement('div');
  msg.style.fontSize = 'var(--fs-sm)';
  msg.style.color = 'var(--ink-secondary)';
  msg.textContent = 'Список людей с доступом к каждому тесту доступен на вкладке «Доступ» в карточке теста.';
  card.body.appendChild(msg);
  wrap.appendChild(card.el);
}

function renderNotifStub(wrap) {
  const card = buildCard('Каналы уведомлений');
  const msg = document.createElement('div');
  msg.style.fontSize = 'var(--fs-sm)';
  msg.style.color = 'var(--ink-secondary)';
  msg.textContent = 'Тонкие настройки каналов появятся позже — пока все уведомления приходят в Inbox.';
  card.body.appendChild(msg);
  wrap.appendChild(card.el);
}

// ─── Building blocks ─────────────────────────────────────────

function buildCard(title) {
  const el = document.createElement('div');
  el.className = 'card';
  el.style.padding = '0';
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
  const body = document.createElement('div');
  body.style.padding = '14px';
  el.appendChild(body);
  return { el: el, head: head, body: body };
}

function emptyState(title, desc) {
  const el = document.createElement('div');
  el.className = 'empty';
  const t = document.createElement('div');
  t.className = 'empty__title';
  t.textContent = title;
  el.appendChild(t);
  if (desc) {
    const d = document.createElement('div');
    d.className = 'empty__desc';
    d.textContent = desc;
    el.appendChild(d);
  }
  return el;
}

function userInitials(p) {
  const src = (p && (p.display_name || p.username || p.email)) || '';
  const parts = src.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
