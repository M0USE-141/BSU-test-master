/**
 * mobile/errors/_err-shell.js — shared mobile error layout.
 *
 * Centred icon-circle + caps + h1 + paragraph + 1-2 action buttons,
 * wrapped in `mShell` with the bottom nav hidden. The two specific
 * error screens (403, 404) parametrize this with their copy + actions.
 */
import { iconEl } from '../../../icons.js';
import {
  topBar, mShell, mBtn, caps,
} from '../../../components/mobile-atoms.js';

export function buildErrorScreen({
  root,
  code,
  iconName = 'lock',
  iconBg = 'var(--warn-soft)',
  iconColor = '#8a6a17',
  title,
  message,
  primary,    // { label, onClick }
  secondary,  // { label, onClick }
} = {}) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    flex: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 24px',
    textAlign: 'center',
    minHeight: '100dvh',
  });

  const inner = document.createElement('div');
  Object.assign(inner.style, {
    maxWidth: '320px', margin: '0 auto',
  });

  // Icon circle.
  const iconWrap = document.createElement('div');
  Object.assign(iconWrap.style, {
    width: '64px', height: '64px',
    borderRadius: '50%',
    background: iconBg, color: iconColor,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 14px',
  });
  iconWrap.appendChild(iconEl(iconName, 28));
  inner.appendChild(iconWrap);

  // Code badge.
  if (code) inner.appendChild(caps(`Ошибка ${code}`));

  // Title.
  const h = document.createElement('h1');
  Object.assign(h.style, {
    fontSize: '22px', letterSpacing: '-.01em',
    margin: '6px 0 10px',
  });
  h.textContent = title;
  inner.appendChild(h);

  // Message.
  const p = document.createElement('p');
  Object.assign(p.style, {
    fontSize: '13px', color: 'var(--ink-fade)',
    marginBottom: '20px', lineHeight: '1.6',
  });
  p.textContent = message;
  inner.appendChild(p);

  // Buttons stack.
  const btns = document.createElement('div');
  Object.assign(btns.style, {
    display: 'flex', flexDirection: 'column', gap: '8px',
  });
  if (primary) {
    btns.appendChild(mBtn({
      primary: true,
      style: { padding: '12px 14px' },
      onClick: primary.onClick,
    }, primary.label));
  }
  if (secondary) {
    btns.appendChild(mBtn({
      onClick: secondary.onClick,
    }, secondary.label));
  }
  inner.appendChild(btns);

  wrap.appendChild(inner);

  mShell({
    root,
    topbar: topBar({}),
    body: wrap,
    hideNav: true,
  });
}
