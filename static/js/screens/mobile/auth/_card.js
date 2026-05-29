/**
 * mobile/auth/_card.js — shared brand + card frame for mobile auth screens.
 *
 * Wraps the three auth flows (login/register/forgot) with a centred
 * "TestMaster" logo block above a card. Layout is full-height flex so
 * the card hangs near the middle of the viewport on tall phones and
 * scrolls cleanly on short ones.
 */
import { iconEl } from '../../../icons.js';
import { t } from '../../../utils/locale.js';

/**
 * Build the auth shell.
 * @param {{ title: string, sub?: string }} opts
 * @returns {{ wrap: HTMLElement, card: HTMLElement }}
 *   `wrap` is full-height container, append it to `root`.
 *   `card` is where callers add fields, button and links.
 */
export function buildAuthLayout({ title, sub }) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    flex: '1',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    padding: '24px 20px',
    background: 'var(--paper)',
    minHeight: '100dvh',
  });

  // Brand block — logo + tagline.
  const brand = document.createElement('div');
  brand.style.textAlign = 'center';
  brand.style.marginBottom = '24px';
  const logo = document.createElement('div');
  logo.style.font = "700 26px/1.2 Inter, sans-serif";
  logo.style.letterSpacing = '-.02em';
  logo.textContent = 'TestMaster';
  brand.appendChild(logo);
  const tagline = document.createElement('div');
  tagline.style.font = "400 12px Inter, sans-serif";
  tagline.style.color = 'var(--ink-fade)';
  tagline.style.marginTop = '4px';
  tagline.textContent = t('auth.tagline') || 'тесты, как надо';
  brand.appendChild(tagline);
  wrap.appendChild(brand);

  // Card.
  const card = document.createElement('div');
  Object.assign(card.style, {
    background: 'var(--paper)',
    border: '1.5px solid var(--ink)',
    borderRadius: 'var(--radius-lg)',
    padding: '22px',
    boxShadow: 'var(--shadow-md)',
  });

  const head = document.createElement('div');
  head.style.font = "700 18px Inter, sans-serif";
  head.style.marginBottom = '4px';
  head.textContent = title;
  card.appendChild(head);

  if (sub) {
    const subEl = document.createElement('div');
    subEl.style.font = "400 12px Inter, sans-serif";
    subEl.style.color = 'var(--ink-fade)';
    subEl.style.marginBottom = '18px';
    subEl.textContent = sub;
    card.appendChild(subEl);
  }

  wrap.appendChild(card);
  return { wrap, card };
}

/** Inline link button. Renders flat-text in accent colour. */
export function inlineLink(text, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  Object.assign(btn.style, {
    color: 'var(--accent)', fontWeight: '600',
    padding: '0', background: 'none', border: 'none', cursor: 'pointer',
    fontFamily: 'Inter, sans-serif', fontSize: 'inherit',
  });
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Footer line under the card: "<prompt> <link>".
 * @param {string} prompt
 * @param {string} linkText
 * @param {() => void} onClick
 */
export function buildSwitchPrompt(prompt, linkText, onClick) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    textAlign: 'center', marginTop: '12px',
    fontSize: '12px', color: 'var(--ink-fade)',
  });
  row.appendChild(document.createTextNode(prompt + ' '));
  row.appendChild(inlineLink(linkText, onClick));
  return row;
}
