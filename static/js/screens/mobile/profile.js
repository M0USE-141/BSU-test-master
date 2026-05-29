/**
 * mobile/profile.js — Mobile profile screen (M5 redesign).
 *
 * Centre-aligned avatar + name + email header, 3-cell stat strip,
 * three labelled row sections (Account / Sessions / Danger zone).
 * Avatar upload happens inline on tap (file picker → uploadAvatar);
 * inline name editing toggles via a pencil button.
 *
 * Backend wiring: `getMyProfile`, `updateProfile`, `uploadAvatar` from
 * the existing API; `getMyAggregate` + `getStreak` for the stat strip;
 * `logout` for the danger-zone sign-out.
 */
import { getMyProfile, updateProfile, uploadAvatar } from '../../api/users.js';
import { getMyAggregate, getStreak, listAttempts } from '../../api/statistics.js';
import { logout, changePassword } from '../../api/auth.js';
import { getState, setState } from '../../state.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { navigate } from '../../router.js';
import {
  topBar, mShell, caps,
} from '../../components/mobile-atoms.js';
import { toast } from '../../components/toast.js';
import { confirm as confirmDialog } from '../../components/confirm-dialog.js';
import { setTheme, getResolvedTheme, setAccent, getAccent } from '../../utils/theme.js';
import { setLocale, getLocale } from '../../utils/locale.js';

let _renderToken = 0;

function statCell(value, label, accent = false) {
  const cell = document.createElement('div');
  Object.assign(cell.style, {
    textAlign: 'center', padding: '10px 0',
    border: '1.5px solid var(--ink)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--paper)',
    boxShadow: 'var(--shadow-sm)',
  });
  const v = document.createElement('div');
  Object.assign(v.style, {
    font: "700 18px Inter, sans-serif",
    color: accent ? 'var(--accent)' : 'var(--ink)',
  });
  v.textContent = value;
  cell.appendChild(v);
  const l = document.createElement('div');
  Object.assign(l.style, { fontSize: '10px', color: 'var(--ink-mute)' });
  l.textContent = label;
  cell.appendChild(l);
  return cell;
}

function buildRow({ icon, title, sub, right, onClick, danger }) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '13px 0',
    borderBottom: '1px solid var(--ink-soft)',
    cursor: onClick ? 'pointer' : 'default',
  });
  if (onClick) row.addEventListener('click', onClick);
  if (icon) {
    const iconWrap = document.createElement('span');
    Object.assign(iconWrap.style, {
      color: danger ? 'var(--error)' : 'var(--ink-fade)',
      display: 'flex', flexShrink: '0',
    });
    iconWrap.appendChild(iconEl(icon, 16));
    row.appendChild(iconWrap);
  }
  const mid = document.createElement('div');
  Object.assign(mid.style, { flex: '1', minWidth: '0' });
  const t1 = document.createElement('div');
  Object.assign(t1.style, {
    fontSize: '14px', fontWeight: '500',
    color: danger ? 'var(--error)' : 'var(--ink)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  });
  t1.textContent = title;
  mid.appendChild(t1);
  if (sub) {
    const t2 = document.createElement('div');
    Object.assign(t2.style, {
      fontSize: '11px', color: 'var(--ink-mute)', marginTop: '2px',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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

function currentTag(label) {
  const tag = document.createElement('span');
  Object.assign(tag.style, {
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 8px', borderRadius: 'var(--radius-pill)',
    fontSize: '10px', fontWeight: '600',
    letterSpacing: '.04em', textTransform: 'uppercase',
    background: 'var(--accent-soft)', color: 'var(--accent)',
  });
  tag.textContent = label;
  return tag;
}

export default async function render(root, params = {}) {
  // If the desktop redirected via /settings → /profile?section=appearance
  // we honor the intent on mobile too by pushing the user to the
  // dedicated settings screen. Same for ?section=security etc. — mobile
  // settings has the matching panes.
  if (params.section) {
    navigate('/settings');
    return;
  }
  return _renderProfile(root);
}

async function _renderProfile(root) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  // Skeleton.
  const skeleton = document.createElement('div');
  skeleton.style.padding = '20px 16px';
  for (let i = 0; i < 4; i++) {
    const r = document.createElement('div');
    r.className = 'skeleton';
    Object.assign(r.style, {
      height: '50px', marginBottom: '8px', borderRadius: 'var(--radius-md)',
    });
    skeleton.appendChild(r);
  }
  mShell({
    root,
    topbar: topBar({
      large: true,
      title: t('nav.profile') || 'Профиль',
    }),
    body: skeleton,
    navActive: 'me',
  });

  // Fetch.
  const stateNow = getState();
  let profile = stateNow.user || null;
  let agg = null;
  let streak = 0;
  try {
    const [pRes, aRes, sRes] = await Promise.allSettled([
      getMyProfile(),
      getMyAggregate(),
      getStreak(),
    ]);
    if (stale()) return;
    if (pRes.status === 'fulfilled') {
      profile = pRes.value;
      setState({ user: profile });
    }
    if (aRes.status === 'fulfilled') agg = aRes.value;
    if (sRes.status === 'fulfilled') streak = sRes.value?.streak ?? 0;
  } catch { /* fall through */ }
  if (stale()) return;

  const displayName = profile?.display_name || profile?.username || 'User';
  const email = profile?.email || '';
  const avatarUrl = profile?.avatar_url || null;
  const initial = (displayName[0] || 'U').toUpperCase();
  const totalAttempts = agg?.attemptCount ?? agg?.attempt_count ?? 0;
  const avgPct = Math.round(agg?.avgPercentCorrect ?? agg?.avg_percent_correct ?? 0);

  // Body container.
  const body = document.createElement('div');

  // ── Avatar + name + email block ─────────────────────────────────
  const head = document.createElement('div');
  Object.assign(head.style, {
    padding: '20px 16px 0',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '8px',
  });

  // Avatar bubble — click opens file picker for upload.
  const avatarWrap = document.createElement('button');
  avatarWrap.type = 'button';
  avatarWrap.setAttribute('aria-label', t('profile.upload_avatar') || 'Сменить аватар');
  Object.assign(avatarWrap.style, {
    width: '80px', height: '80px', borderRadius: '50%',
    border: '1.5px solid var(--ink)',
    background: avatarUrl ? `center/cover no-repeat url("${avatarUrl}")` : 'var(--accent-soft)',
    color: avatarUrl ? 'transparent' : 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: '600', fontSize: '32px', cursor: 'pointer',
    padding: '0', overflow: 'hidden',
  });
  avatarWrap.textContent = avatarUrl ? '' : initial;
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const updated = await uploadAvatar(f);
      const blobUrl = URL.createObjectURL(f);
      Object.assign(avatarWrap.style, {
        background: `center/cover no-repeat url("${blobUrl}")`,
        color: 'transparent',
      });
      avatarWrap.textContent = '';
      setState({ user: { ...(getState().user || {}), ...(updated || {}) } });
      toast(t('profile.avatar_saved') || 'Аватар обновлён', { tone: 'success' });
    } catch (er) { toast(er.message || 'Ошибка', { tone: 'error' }); }
    finally { fileInput.value = ''; }
  });
  avatarWrap.addEventListener('click', () => fileInput.click());
  head.appendChild(avatarWrap);
  head.appendChild(fileInput);

  // Editable name — click pencil to swap to input.
  const nameRow = document.createElement('div');
  Object.assign(nameRow.style, {
    display: 'flex', alignItems: 'center', gap: '6px',
    marginTop: '6px',
  });
  const nameSpan = document.createElement('span');
  Object.assign(nameSpan.style, { font: "700 18px Inter, sans-serif" });
  nameSpan.textContent = displayName;
  nameRow.appendChild(nameSpan);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  Object.assign(editBtn.style, {
    padding: '4px', background: 'none', border: 'none',
    color: 'var(--ink-mute)', cursor: 'pointer',
  });
  editBtn.setAttribute('aria-label', t('profile.edit_name') || 'Изменить имя');
  editBtn.appendChild(iconEl('edit', 14));
  nameRow.appendChild(editBtn);
  head.appendChild(nameRow);

  editBtn.addEventListener('click', () => {
    nameRow.replaceChildren();
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = nameSpan.textContent;
    Object.assign(inp.style, {
      font: "700 18px Inter, sans-serif",
      padding: '4px 8px', border: '1.5px solid var(--ink)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--paper)', color: 'var(--ink)',
      outline: 'none', textAlign: 'center',
    });
    const save = async () => {
      const newName = inp.value.trim();
      if (!newName || newName === nameSpan.textContent) {
        nameRow.replaceChildren(nameSpan, editBtn);
        return;
      }
      try {
        const updated = await updateProfile({ display_name: newName });
        nameSpan.textContent = newName;
        setState({ user: { ...(getState().user || {}), ...(updated || {}) } });
        toast(t('profile.name_saved') || 'Имя обновлено', { tone: 'success' });
      } catch (er) { toast(er.message || 'Ошибка', { tone: 'error' }); }
      nameRow.replaceChildren(nameSpan, editBtn);
    };
    inp.addEventListener('blur', save);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    nameRow.appendChild(inp);
    inp.focus();
    inp.select();
  });

  const emailEl = document.createElement('div');
  Object.assign(emailEl.style, { fontSize: '12px', color: 'var(--ink-mute)' });
  emailEl.textContent = email;
  head.appendChild(emailEl);
  body.appendChild(head);

  // ── Stat grid (3 cells) ────────────────────────────────────────
  const stats = document.createElement('div');
  Object.assign(stats.style, {
    display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
    gap: '8px', padding: '18px 16px',
  });
  stats.appendChild(statCell(String(totalAttempts), t('profile.attempts') || 'попыток'));
  stats.appendChild(statCell(avgPct > 0 ? `${avgPct}%` : '—', t('profile.avg') || 'средний'));
  stats.appendChild(statCell(streak > 0 ? `${streak}` : '—', t('profile.streak') || 'streak', streak > 0));
  body.appendChild(stats);

  // ── Sections ───────────────────────────────────────────────────
  const sections = document.createElement('div');
  sections.style.padding = '0 16px 24px';

  // Rows now open inline panes (no navigation to /settings).
  const openPane = (paneKey) => _renderPane(root, paneKey, profile);

  // Профиль.
  sections.appendChild(caps('Профиль', { padding: '8px 0' }));
  sections.appendChild(buildRow({
    icon: 'user', title: 'Личные данные',
    onClick: () => openPane('personal'),
  }));
  sections.appendChild(buildRow({
    icon: 'lock', title: 'Безопасность',
    sub: '2FA выключена',
    onClick: () => openPane('security'),
  }));

  // Внешний вид.
  sections.appendChild(caps('Внешний вид', { padding: '14px 0 8px' }));
  sections.appendChild(buildRow({
    icon: 'sun', title: 'Тема, акцент, язык',
    sub: ({ ru: 'Русский', uz: "O'zbekcha" }[profile?.language] || 'English'),
    onClick: () => openPane('appearance'),
  }));

  // Уведомления.
  sections.appendChild(caps('Уведомления', { padding: '14px 0 8px' }));
  sections.appendChild(buildRow({
    icon: 'bell', title: 'Email / push',
    onClick: () => openPane('notif'),
  }));

  // Данные.
  sections.appendChild(caps('Данные', { padding: '14px 0 8px' }));
  sections.appendChild(buildRow({
    icon: 'download', title: 'Экспорт + кэш',
    onClick: () => openPane('data'),
  }));

  // О приложении.
  sections.appendChild(caps('О приложении', { padding: '14px 0 8px' }));
  sections.appendChild(buildRow({
    icon: 'info', title: 'Версия',
    sub: 'v' + (window.__APP_VERSION__ || 'dev'),
    onClick: () => openPane('about'),
  }));

  // Сеанс.
  sections.appendChild(caps('Сеанс', { padding: '14px 0 8px' }));
  sections.appendChild(buildRow({
    icon: 'clock', title: 'Текущая сессия',
    sub: navigator.userAgent.split(/[()]/)[1] || navigator.userAgent.split(' ')[0],
    right: currentTag(t('profile.tag.current') || 'текущая'),
    onClick: () => openPane('sessions'),
  }));
  sections.appendChild(buildRow({
    icon: 'arrowL', title: t('profile.row.logout') || 'Выйти',
    onClick: async () => {
      try { await logout(); } catch {}
      setState({ user: null });
      navigate('/auth/login');
    },
  }));

  // Опасная зона.
  sections.appendChild(caps(t('profile.section.danger') || 'Опасная зона', { padding: '14px 0 8px' }));
  sections.appendChild(buildRow({
    icon: 'trash',
    title: t('profile.row.delete') || 'Удалить аккаунт',
    danger: true,
    onClick: () => confirmDialog({
      title: t('profile.delete.title') || 'Удалить аккаунт?',
      message: t('profile.delete.hint')
        || 'Все ваши тесты, попытки и CR будут удалены безвозвратно.',
      confirmLabel: t('profile.delete.cta') || 'Удалить',
      danger: true,
      confirmText: email,
      onConfirm: () => {
        toast(t('profile.delete.placeholder')
          || 'Удаление аккаунта пока недоступно — обратитесь к админу',
          { tone: 'error' });
      },
    }),
  }));
  const tail = document.createElement('div');
  tail.style.height = '24px';
  sections.appendChild(tail);

  body.appendChild(sections);

  mShell({
    root,
    topbar: topBar({ title: t('nav.profile') || 'Профиль' }),
    body,
    navActive: 'me',
  });
}

// ── Inline pane renderer ────────────────────────────────────────────
//
// Each pane replaces the screen with a topbar containing back-to-profile
// + the pane title, plus a body specific to the section. No navigation
// to /settings — everything stays at /profile.

function _renderPane(root, paneKey, profile) {
  const titles = {
    personal:   'Личные данные',
    security:   'Безопасность',
    appearance: 'Тема, акцент, язык',
    notif:      'Уведомления',
    data:       'Данные',
    about:      'О приложении',
    sessions:   'Текущая сессия',
  };
  const body = document.createElement('div');
  body.style.padding = '12px 16px 24px';

  if (paneKey === 'appearance')      _paneAppearance(body);
  else if (paneKey === 'data')       _paneData(body);
  else if (paneKey === 'about')      _paneAbout(body);
  else if (paneKey === 'personal')   _panePersonal(body, profile);
  else if (paneKey === 'security')   _paneSecurity(body);
  else if (paneKey === 'notif')      _paneNotif(body);
  else if (paneKey === 'sessions')   _paneSessions(body);
  else                               _paneComingSoon(body);

  mShell({
    root,
    topbar: topBar({
      title: titles[paneKey] || 'Настройки',
      back: () => _renderProfile(root),
    }),
    body,
    navActive: 'me',
  });
}

function _paneCard(parent, title) {
  const card = document.createElement('div');
  Object.assign(card.style, {
    border: '1.5px solid var(--ink)', borderRadius: 'var(--radius-md)',
    background: 'var(--paper)', marginBottom: '12px', overflow: 'hidden',
  });
  if (title) {
    const head = document.createElement('div');
    Object.assign(head.style, {
      padding: '10px 12px', borderBottom: '1px solid var(--ink-soft)',
      fontSize: '12px', fontWeight: '600', color: 'var(--ink)',
    });
    head.textContent = title;
    card.appendChild(head);
  }
  const inner = document.createElement('div');
  inner.style.padding = '12px';
  card.appendChild(inner);
  parent.appendChild(card);
  return inner;
}

function _chipRow() {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex', gap: '6px', flexWrap: 'wrap',
  });
  return row;
}

function _chip(label, active, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  Object.assign(b.style, {
    padding: '6px 12px', borderRadius: '999px',
    border: '1.5px solid ' + (active ? 'var(--ink)' : 'var(--ink-soft)'),
    background: active ? 'var(--accent)' : 'var(--paper)',
    color: active ? '#fff' : 'var(--ink)',
    fontSize: '12px', fontWeight: '500', cursor: 'pointer',
  });
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function _paneAppearance(body) {
  // Theme.
  let themeBody = _paneCard(body, 'Тема');
  const renderTheme = () => {
    themeBody.replaceChildren();
    const row = _chipRow();
    const current = getResolvedTheme();
    ['light', 'dark'].forEach((mode) => {
      row.appendChild(_chip(
        mode === 'light' ? 'Светлая' : 'Тёмная',
        current === mode,
        () => {
          setTheme(mode);
          updateProfile({ theme: mode }).catch(() => {});
          renderTheme();
        },
      ));
    });
    themeBody.appendChild(row);
  };
  renderTheme();

  // Accent.
  let accentBody = _paneCard(body, 'Акцент');
  const swatches = [
    ['green', '#4f9b6a', 'Green'], ['coral', '#e07a5f', 'Coral'],
    ['yellow', '#e6b54a', 'Yellow'], ['blue', '#4a78c4', 'Blue'],
    ['mono', '#3a3530', 'Mono'],
  ];
  const renderAccent = () => {
    accentBody.replaceChildren();
    const row = _chipRow();
    const active = getAccent();
    swatches.forEach(([key, color, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      Object.assign(b.style, {
        padding: '5px 10px 5px 6px', display: 'inline-flex',
        alignItems: 'center', gap: '6px',
        border: '1.5px solid ' + (active === key ? 'var(--ink)' : 'var(--ink-soft)'),
        background: active === key ? 'var(--accent-soft)' : 'var(--paper)',
        borderRadius: '999px', fontSize: '12px', cursor: 'pointer',
        color: 'var(--ink)',
      });
      const dot = document.createElement('span');
      Object.assign(dot.style, {
        width: '12px', height: '12px', borderRadius: '50%', background: color, flexShrink: '0',
      });
      b.appendChild(dot);
      b.appendChild(document.createTextNode(label));
      b.addEventListener('click', () => {
        setAccent(key);
        updateProfile({ accent: key }).catch(() => {});
        renderAccent();
      });
      row.appendChild(b);
    });
    accentBody.appendChild(row);
  };
  renderAccent();

  // Language.
  let langBody = _paneCard(body, 'Язык интерфейса');
  const langs = [['ru', 'Русский'], ['en', 'English'], ['uz', "O'zbekcha"]];
  const renderLang = () => {
    langBody.replaceChildren();
    const row = _chipRow();
    const active = getLocale();
    langs.forEach(([code, label]) => {
      row.appendChild(_chip(label, active === code, async () => {
        await setLocale(code);
        updateProfile({ language: code }).catch(() => {});
        toast(label, { tone: 'success', timeout: 1200 });
      }));
    });
    langBody.appendChild(row);
  };
  renderLang();
}

function _paneData(body) {
  const exportBody = _paneCard(body, 'Экспорт');
  const desc = document.createElement('div');
  Object.assign(desc.style, { fontSize: '12px', color: 'var(--ink-mute)', marginBottom: '10px' });
  desc.textContent = 'Скачайте все попытки в формате JSON.';
  exportBody.appendChild(desc);
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  Object.assign(exportBtn.style, {
    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
    border: '1.5px solid var(--ink)', background: 'var(--paper)',
    color: 'var(--ink)', font: '500 13px Inter, sans-serif', cursor: 'pointer',
  });
  exportBtn.textContent = 'Экспортировать попытки';
  exportBtn.addEventListener('click', async () => {
    try {
      const resp = await listAttempts({ limit: 1000 });
      const blob = new Blob([JSON.stringify(resp, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'testmaster-attempts.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast('Экспорт готов', { tone: 'success' });
    } catch (e) { toast(e?.message || 'Не удалось', { tone: 'error' }); }
  });
  exportBody.appendChild(exportBtn);

  const cacheBody = _paneCard(body, 'Локальный кэш');
  const cacheDesc = document.createElement('div');
  Object.assign(cacheDesc.style, { fontSize: '12px', color: 'var(--ink-mute)', marginBottom: '10px' });
  cacheDesc.textContent = 'Предпочтения и prefetch-данные. На сервере ничего не меняется.';
  cacheBody.appendChild(cacheDesc);
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  Object.assign(clearBtn.style, {
    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
    border: '1.5px solid var(--ink)', background: 'var(--paper)',
    color: 'var(--ink)', font: '500 13px Inter, sans-serif', cursor: 'pointer',
  });
  clearBtn.textContent = 'Очистить кэш';
  clearBtn.addEventListener('click', () => {
    try {
      const keep = ['theme', 'accent', 'locale'];
      const saved = {};
      keep.forEach((k) => { saved[k] = localStorage.getItem(k); });
      localStorage.clear();
      sessionStorage.clear();
      keep.forEach((k) => { if (saved[k] != null) localStorage.setItem(k, saved[k]); });
      toast('Кэш очищен', { tone: 'success' });
    } catch (e) { toast(e?.message || 'Не удалось', { tone: 'error' }); }
  });
  cacheBody.appendChild(clearBtn);
}

function _paneAbout(body) {
  const inner = _paneCard(body);
  const rows = [
    ['Версия', String(window.__APP_VERSION__ || 'dev')],
    ['Сборка', 'SPA / hash-router'],
    ['Стек', 'FastAPI + Postgres + MinIO'],
  ];
  const dl = document.createElement('div');
  Object.assign(dl.style, {
    display: 'grid', gridTemplateColumns: 'max-content 1fr',
    gap: '6px 14px', fontSize: '13px',
  });
  rows.forEach(([k, v]) => {
    const ke = document.createElement('div');
    Object.assign(ke.style, { color: 'var(--ink-mute)' });
    ke.textContent = k;
    const ve = document.createElement('div');
    Object.assign(ve.style, {
      color: 'var(--ink)', fontFamily: "'JetBrains Mono', monospace",
      fontSize: '11px', wordBreak: 'break-all',
    });
    ve.textContent = v;
    dl.appendChild(ke);
    dl.appendChild(ve);
  });
  inner.appendChild(dl);
}

function _panePersonal(body, profile) {
  const card = _paneCard(body, 'Профиль');
  const fields = [
    ['Имя', profile?.display_name || profile?.username || '—'],
    ['Email', profile?.email || '—'],
    ['Username', profile?.username || '—'],
  ];
  fields.forEach(([k, v]) => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', justifyContent: 'space-between',
      padding: '8px 0', borderTop: '1px solid var(--ink-soft)',
      fontSize: '13px',
    });
    const ke = document.createElement('div');
    ke.style.color = 'var(--ink-mute)';
    ke.textContent = k;
    const ve = document.createElement('div');
    ve.style.color = 'var(--ink)';
    ve.textContent = v;
    row.appendChild(ke);
    row.appendChild(ve);
    card.appendChild(row);
  });
  const hint = document.createElement('div');
  Object.assign(hint.style, { marginTop: '12px', fontSize: '12px', color: 'var(--ink-mute)' });
  hint.textContent = 'Имя и аватар меняются на главной странице профиля.';
  body.appendChild(hint);
}

function _paneSecurity(body) {
  const card = _paneCard(body, 'Смена пароля');
  const mkInput = (placeholder, type = 'password') => {
    const i = document.createElement('input');
    i.type = type; i.placeholder = placeholder;
    Object.assign(i.style, {
      width: '100%', padding: '10px 12px', marginBottom: '10px',
      border: '1.5px solid var(--ink-soft)', borderRadius: 'var(--radius-sm)',
      background: 'var(--paper)', color: 'var(--ink)', fontSize: '13px',
      outline: 'none', boxSizing: 'border-box',
    });
    return i;
  };
  const cur = mkInput('Текущий пароль');
  const nw  = mkInput('Новый пароль');
  const rep = mkInput('Повторите новый пароль');
  card.appendChild(cur); card.appendChild(nw); card.appendChild(rep);

  const btn = document.createElement('button');
  btn.type = 'button';
  Object.assign(btn.style, {
    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
    border: '1.5px solid var(--ink)', background: 'var(--accent)',
    color: '#fff', font: '600 13px Inter, sans-serif', cursor: 'pointer',
    width: '100%',
  });
  btn.textContent = 'Сменить пароль';
  btn.addEventListener('click', async () => {
    if (!cur.value || !nw.value) return toast('Заполните все поля', { tone: 'error' });
    if (nw.value !== rep.value) return toast('Пароли не совпадают', { tone: 'error' });
    if (nw.value.length < 8) return toast('Минимум 8 символов', { tone: 'error' });
    try {
      await changePassword(cur.value, nw.value);
      toast('Пароль обновлён', { tone: 'success' });
      cur.value = ''; nw.value = ''; rep.value = '';
    } catch (e) {
      toast(e?.message || 'Ошибка', { tone: 'error' });
    }
  });
  card.appendChild(btn);

  const tfa = _paneCard(body, 'Двухфакторная авторизация');
  const tfaTxt = document.createElement('div');
  Object.assign(tfaTxt.style, { fontSize: '12px', color: 'var(--ink-mute)' });
  tfaTxt.textContent = 'Скоро.';
  tfa.appendChild(tfaTxt);
}

function _paneNotif(body) {
  const card = _paneCard(body, 'Уведомления');
  const txt = document.createElement('div');
  Object.assign(txt.style, { fontSize: '13px', color: 'var(--ink-mute)' });
  txt.textContent = 'Настройки email/push-уведомлений появятся, когда сервер начнёт их рассылать. Сейчас уведомления видны в Уведомлениях.';
  card.appendChild(txt);
}

function _paneSessions(body) {
  const card = _paneCard(body, 'Текущая сессия');
  const rows = [
    ['Browser', navigator.userAgent.split(/[()]/)[1] || navigator.userAgent.split(' ')[0]],
    ['Refresh', 'HttpOnly cookie · /api/auth'],
  ];
  rows.forEach(([k, v]) => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', justifyContent: 'space-between',
      padding: '6px 0', fontSize: '12px',
    });
    const ke = document.createElement('div');
    ke.style.color = 'var(--ink-mute)';
    ke.textContent = k;
    const ve = document.createElement('div');
    ve.style.color = 'var(--ink)';
    ve.textContent = v;
    row.appendChild(ke);
    row.appendChild(ve);
    card.appendChild(row);
  });
  const logout = document.createElement('button');
  logout.type = 'button';
  Object.assign(logout.style, {
    marginTop: '14px', width: '100%',
    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
    border: '1.5px solid var(--ink)', background: 'var(--paper)',
    color: 'var(--ink)', font: '500 13px Inter, sans-serif', cursor: 'pointer',
  });
  logout.textContent = 'Выйти из этой сессии';
  logout.addEventListener('click', async () => {
    try {
      const { logout: doLogout } = await import('../../api/auth.js');
      await doLogout();
    } catch {}
    setState({ user: null });
    navigate('/auth/login');
  });
  body.appendChild(logout);
}

function _paneComingSoon(body) {
  const card = _paneCard(body);
  const txt = document.createElement('div');
  Object.assign(txt.style, { fontSize: '13px', color: 'var(--ink-mute)' });
  txt.textContent = 'Скоро.';
  card.appendChild(txt);
}
