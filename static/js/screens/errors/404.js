/**
 * screens/errors/404.js — friendly not-found page.
 */
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';

export default async function render(root, params = {}) {
  const layout = document.createElement('div');
  layout.className = 'auth-layout';

  const card = document.createElement('div');
  card.className = 'auth-card';
  card.style.maxWidth = '460px';

  const iconWrap = document.createElement('div');
  iconWrap.style.cssText = `
    width: 72px; height: 72px; border-radius: 50%;
    background: var(--ink-soft); color: var(--ink-secondary);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto;
  `;
  iconWrap.appendChild(iconEl('search', 30));
  card.appendChild(iconWrap);

  const caps = document.createElement('div');
  caps.className = 'caps';
  caps.style.textAlign = 'center';
  caps.textContent = '404';
  card.appendChild(caps);

  const title = document.createElement('h1');
  title.className = 'auth-card__title';
  title.style.textAlign = 'center';
  title.textContent = t('error.404.title');
  card.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'auth-card__subtitle';
  desc.style.textAlign = 'center';
  desc.style.margin = '0';
  desc.textContent = t('error.404.desc');
  if (params.path) {
    const code = document.createElement('div');
    code.className = 'mono';
    code.style.cssText = 'font-size:var(--fs-xs);color:var(--ink-tertiary);margin-top:8px;word-break:break-all;';
    code.textContent = params.path;
    desc.appendChild(code);
  }
  card.appendChild(desc);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--primary btn--full';
  btn.textContent = t('error.404.go_home');
  btn.addEventListener('click', () => navigate('/home'));
  card.appendChild(btn);

  layout.appendChild(card);
  root.innerHTML = '';
  root.appendChild(layout);
}
