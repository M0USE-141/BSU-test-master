/**
 * mobile/first-run.js — Mobile onboarding (M7).
 *
 * Two variants triggered from `mobile/home.js`:
 *   1. `renderFirstRun(root)` — no tests yet. Centred onboarding with
 *      three primary actions (import .docx, public catalog, skip).
 *   2. `renderFirstRunSoft(root, firstTest)` — tests exist but the user
 *      hasn't completed any attempts. Shows a "try your first test"
 *      card with a Start button.
 *
 * Dismissal is recorded in `localStorage['mob:firstRunDismissed']`;
 * `mobile/home.js` checks it before rendering this screen.
 */
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { getState } from '../../state.js';
import { iconEl } from '../../icons.js';
import {
  topBar, mShell, mBtn, mCard, caps,
} from '../../components/mobile-atoms.js';

export const FIRST_RUN_KEY = 'mob:firstRunDismissed';

export function isFirstRunDismissed() {
  try { return localStorage.getItem(FIRST_RUN_KEY) === '1'; }
  catch { return false; }
}

export function dismissFirstRun() {
  try { localStorage.setItem(FIRST_RUN_KEY, '1'); }
  catch { /* private mode */ }
}

function firstName() {
  const u = getState().user;
  const name = u?.display_name || u?.username || '';
  return name.split(/\s+/)[0] || (t('user.guest') || 'друг');
}

// ── Variant 1: no tests ────────────────────────────────────────

export function renderFirstRun(root) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    padding: '40px 24px',
    flex: '1',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', textAlign: 'center',
    minHeight: '100dvh',
  });

  const top = document.createElement('div');
  top.style.flex = '1';
  wrap.appendChild(top);

  wrap.appendChild(caps(`${t('firstrun.hi') || 'Привет'}, ${firstName()}!`));

  const h = document.createElement('h1');
  Object.assign(h.style, {
    font: "700 24px/1.2 Inter, sans-serif",
    letterSpacing: '-.02em',
    margin: '8px 0 12px',
  });
  h.textContent = t('firstrun.title') || 'Начнём с импорта вашего первого теста';
  wrap.appendChild(h);

  const p = document.createElement('p');
  Object.assign(p.style, {
    fontSize: '13px',
    color: 'var(--ink-fade)',
    marginBottom: '24px',
  });
  p.textContent = t('firstrun.desc')
    || 'Импортируйте файл .docx или загляните в публичный каталог.';
  wrap.appendChild(p);

  // Three actions.
  const actions = document.createElement('div');
  Object.assign(actions.style, {
    width: '100%', display: 'flex', flexDirection: 'column', gap: '8px',
  });

  // Dashed import card — the visual "primary" action.
  const importCard = document.createElement('div');
  Object.assign(importCard.style, {
    border: '2px dashed var(--accent)',
    background: 'var(--accent-soft)',
    padding: '18px',
    borderRadius: 'var(--radius-md)',
    textAlign: 'center',
    cursor: 'pointer',
  });
  importCard.addEventListener('click', () => navigate('/import'));
  const iconRow = document.createElement('div');
  Object.assign(iconRow.style, {
    fontSize: '22px', marginBottom: '6px',
    display: 'flex', justifyContent: 'center',
    color: 'var(--accent)',
  });
  iconRow.appendChild(iconEl('upload', 22));
  importCard.appendChild(iconRow);
  const importLabel = document.createElement('div');
  Object.assign(importLabel.style, {
    fontWeight: '600', fontSize: '14px', color: 'var(--accent)',
  });
  importLabel.textContent = t('firstrun.cta.import') || 'Импорт .docx';
  importCard.appendChild(importLabel);
  actions.appendChild(importCard);

  // Public catalog secondary.
  actions.appendChild(mBtn({
    full: true,
    onClick: () => navigate('/home?filter=public'),
  }, iconEl('globe', 14), ' ' + (t('firstrun.cta.public') || 'Public-каталог')));

  wrap.appendChild(actions);

  const bot = document.createElement('div');
  bot.style.flex = '1';
  wrap.appendChild(bot);

  // Skip ghost button.
  wrap.appendChild(mBtn({
    ghost: true,
    onClick: () => { dismissFirstRun(); navigate('/home'); },
    style: { color: 'var(--ink-fade)' },
  }, t('firstrun.skip') || 'Пропустить'));

  mShell({
    root,
    topbar: topBar({}),
    body: wrap,
    hideNav: true,
  });
}

// ── Variant 2: tests exist, no attempts yet ────────────────────

export function renderFirstRunSoft(root, firstTest) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    padding: '32px 20px',
    textAlign: 'center',
    display: 'flex', flexDirection: 'column', gap: '14px',
    flex: '1', minHeight: '100dvh',
  });

  const top = document.createElement('div');
  top.style.flex = '1';
  wrap.appendChild(top);

  wrap.appendChild(caps(t('firstrun.soft.step') || '2 шаг из 3'));
  const h = document.createElement('h1');
  Object.assign(h.style, {
    font: "700 22px/1.2 Inter, sans-serif",
    letterSpacing: '-.01em',
    margin: '0',
  });
  h.textContent = t('firstrun.soft.title') || 'Попробуйте свой первый тест';
  wrap.appendChild(h);

  const p = document.createElement('p');
  Object.assign(p.style, {
    fontSize: '13px', color: 'var(--ink-fade)', margin: '0',
  });
  p.textContent = t('firstrun.soft.desc')
    || 'Запустите его — это лучший способ освоить интерфейс.';
  wrap.appendChild(p);

  // First-test card with Start button.
  if (firstTest) {
    const cardBody = document.createElement('div');
    Object.assign(cardBody.style, {
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '4px 0',
    });
    const av = document.createElement('div');
    Object.assign(av.style, {
      width: '40px', height: '40px', borderRadius: '8px',
      background: 'var(--accent-soft)', color: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '18px', fontWeight: '600',
      flexShrink: '0',
    });
    av.textContent = (firstTest.title || '?').charAt(0).toUpperCase();
    cardBody.appendChild(av);

    const mid = document.createElement('div');
    Object.assign(mid.style, { flex: '1', textAlign: 'left', minWidth: '0' });
    const name = document.createElement('div');
    Object.assign(name.style, {
      fontWeight: '600',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    });
    name.textContent = firstTest.title || '—';
    mid.appendChild(name);
    const meta = document.createElement('div');
    Object.assign(meta.style, { fontSize: '11px', color: 'var(--ink-mute)' });
    meta.textContent = `${firstTest.questionCount ?? 0} ${t('test.questions') || 'вопросов'}`;
    mid.appendChild(meta);
    cardBody.appendChild(mid);

    cardBody.appendChild(mBtn({
      sm: true, primary: true,
      onClick: () => {
        dismissFirstRun();
        navigate(`/test/${firstTest.id}/start`);
      },
    }, t('common.start') || 'Начать'));
    wrap.appendChild(mCard({}, cardBody));
  }

  const bot = document.createElement('div');
  bot.style.flex = '1';
  wrap.appendChild(bot);

  wrap.appendChild(mBtn({
    ghost: true,
    onClick: () => { dismissFirstRun(); navigate('/home'); },
    style: { color: 'var(--ink-fade)' },
  }, t('firstrun.skip') || 'Пропустить'));

  mShell({
    root,
    topbar: topBar({}),
    body: wrap,
    hideNav: true,
  });
}
