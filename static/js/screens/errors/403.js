/**
 * screens/errors/403.js — access-denied page.
 *
 * Used when:
 *   - opening a private test the user doesn't own/share access to
 *   - opening a shared-only test that requires the author's approval
 *
 * Phase 3 wires the "Запросить доступ" button to the access-requests
 * backend; this commit stubs the click to a toast.
 */
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { toast } from '../../components/toast.js';
import { requestAccess } from '../../api/access-requests.js';

export default async function render(root, params = {}) {
  const layout = document.createElement('div');
  layout.className = 'auth-layout';

  const card = document.createElement('div');
  card.className = 'auth-card';
  card.style.maxWidth = '460px';

  const iconWrap = document.createElement('div');
  iconWrap.style.cssText = `
    width: 72px; height: 72px; border-radius: 50%;
    background: var(--warning-soft); color: #8a6a17;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto;
  `;
  iconWrap.appendChild(iconEl('lock', 30));
  card.appendChild(iconWrap);

  const caps = document.createElement('div');
  caps.className = 'caps';
  caps.style.textAlign = 'center';
  caps.textContent = '403';
  card.appendChild(caps);

  const title = document.createElement('h1');
  title.className = 'auth-card__title';
  title.style.textAlign = 'center';
  title.textContent = t('error.403.title');
  card.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'auth-card__subtitle';
  desc.style.textAlign = 'center';
  desc.style.margin = '0';
  desc.textContent = t('error.403.desc');
  card.appendChild(desc);

  // Buttons row
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;';

  const homeBtn = document.createElement('button');
  homeBtn.type = 'button';
  homeBtn.className = 'btn';
  homeBtn.textContent = t('error.403.go_home');
  homeBtn.addEventListener('click', () => navigate('/home'));
  btnRow.appendChild(homeBtn);

  // Show "Request access" only when we have a target test id from the route
  if (params.testId) {
    const reqBtn = document.createElement('button');
    reqBtn.type = 'button';
    reqBtn.className = 'btn btn--primary';
    reqBtn.textContent = t('error.403.request_access');
    reqBtn.addEventListener('click', async () => {
      reqBtn.disabled = true;
      try {
        await requestAccess(params.testId);
        toast(t('error.403.requested'), { tone: 'success' });
      } catch (e) {
        // The endpoint is idempotent + 200-on-no-existence, so any error
        // here is genuinely a transport problem.
        reqBtn.disabled = false;
        toast(t('common.error'), { tone: 'error' });
      }
    });
    btnRow.appendChild(reqBtn);
  }

  card.appendChild(btnRow);
  layout.appendChild(card);
  root.innerHTML = '';
  root.appendChild(layout);
}
