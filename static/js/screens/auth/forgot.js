/**
 * screens/auth/forgot.js — request a password reset link.
 */
import { forgotPassword } from '../../api/auth.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';

export default async function render(root) {
  const layout = document.createElement('div');
  layout.className = 'auth-layout';

  const brand = document.createElement('div');
  brand.className = 'auth-header';
  const logo = document.createElement('div');
  logo.className = 'auth-header__logo';
  logo.textContent = 'TestMaster';
  brand.appendChild(logo);

  const card = document.createElement('div');
  card.className = 'auth-card';

  const title = document.createElement('h1');
  title.className = 'auth-card__title';
  title.textContent = t('auth.forgot.title');
  card.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'auth-card__subtitle';
  desc.style.margin = '0';
  desc.textContent = t('auth.forgot.desc');
  card.appendChild(desc);

  // Email field — wrapped in .auth-form for the icon-positioning CSS rules
  const form = document.createElement('div');
  form.className = 'auth-form';
  const field = document.createElement('div');
  field.className = 'auth-form__field';
  const label = document.createElement('label');
  label.className = 'field__label';
  label.htmlFor = 'forgot-email';
  label.textContent = t('auth.email');
  const wrap = document.createElement('div');
  wrap.className = 'input-wrapper';
  const iconSpan = document.createElement('span');
  iconSpan.className = 'input-icon';
  iconSpan.appendChild(iconEl('user', 16));
  const input = document.createElement('input');
  input.id = 'forgot-email';
  input.type = 'email';
  input.className = 'input';
  input.placeholder = 'name@example.com';
  input.autocomplete = 'email';
  input.required = true;
  wrap.appendChild(iconSpan);
  wrap.appendChild(input);
  const errEl = document.createElement('span');
  errEl.className = 'auth-form__error';
  errEl.style.display = 'none';
  field.appendChild(label);
  field.appendChild(wrap);
  field.appendChild(errEl);
  form.appendChild(field);
  card.appendChild(form);

  // Submit
  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn--primary btn--full';
  submitBtn.textContent = t('auth.forgot.cta');
  card.appendChild(submitBtn);

  // Link back to login
  const linkRow = document.createElement('div');
  linkRow.className = 'auth-form__link';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'auth-link-btn';
  back.textContent = t('auth.forgot.back_to_login');
  back.addEventListener('click', () => navigate('/auth/login'));
  linkRow.appendChild(back);
  card.appendChild(linkRow);

  // Success state — swaps in after submission.
  function showSent() {
    card.innerHTML = '';

    const iconWrap = document.createElement('div');
    iconWrap.style.cssText = `
      width: 56px; height: 56px; border-radius: 50%;
      background: var(--success-soft); color: var(--success);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto;
    `;
    iconWrap.appendChild(iconEl('check', 24));
    card.appendChild(iconWrap);

    const sentTitle = document.createElement('h1');
    sentTitle.className = 'auth-card__title';
    sentTitle.style.textAlign = 'center';
    sentTitle.textContent = t('auth.forgot.sent_title');
    card.appendChild(sentTitle);

    const sentDesc = document.createElement('p');
    sentDesc.className = 'auth-card__subtitle';
    sentDesc.style.textAlign = 'center';
    sentDesc.style.margin = '0';
    sentDesc.textContent = t('auth.forgot.sent_desc');
    card.appendChild(sentDesc);

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn btn--primary btn--full';
    okBtn.textContent = t('auth.forgot.back_to_login');
    okBtn.addEventListener('click', () => navigate('/auth/login'));
    card.appendChild(okBtn);
  }

  async function handleSubmit() {
    errEl.style.display = 'none';
    input.classList.remove('input--error');
    const email = input.value.trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      input.classList.add('input--error');
      errEl.textContent = t('auth.error.invalid');
      errEl.style.display = '';
      return;
    }
    submitBtn.disabled = true;
    try {
      await forgotPassword(email);
      showSent();
    } catch (e) {
      // Even on error, behave the same as success — backend always returns 200,
      // but if the network is down we should tell the user.
      submitBtn.disabled = false;
      errEl.textContent = t('auth.error.network');
      errEl.style.display = '';
    }
  }

  submitBtn.addEventListener('click', handleSubmit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmit(); });

  layout.appendChild(brand);
  layout.appendChild(card);
  root.innerHTML = '';
  root.appendChild(layout);
  input.focus();
}
