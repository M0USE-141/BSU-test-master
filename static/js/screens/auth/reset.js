/**
 * screens/auth/reset.js — consume a reset token and set a new password.
 *
 * Route: #/auth/reset?token=…
 */
import { resetPassword } from '../../api/auth.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { buildPasswordChecklist } from './_password-checklist.js';

export default async function render(root, params = {}) {
  const token = params.token || '';

  const layout = document.createElement('div');
  layout.className = 'auth-layout';

  const brand = document.createElement('div');
  brand.className = 'auth-header';
  const logo = document.createElement('div');
  logo.className = 'auth-header__logo';
  logo.textContent = 'TestMaster';
  brand.appendChild(logo);
  layout.appendChild(brand);

  const card = document.createElement('div');
  card.className = 'auth-card';
  layout.appendChild(card);

  // Missing-token state
  if (!token) {
    renderError(card, t('auth.reset.no_token'));
    root.innerHTML = '';
    root.appendChild(layout);
    return;
  }

  const title = document.createElement('h1');
  title.className = 'auth-card__title';
  title.textContent = t('auth.reset.title');
  card.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'auth-card__subtitle';
  desc.style.margin = '0';
  desc.textContent = t('auth.reset.desc');
  card.appendChild(desc);

  // Wrap fields in .auth-form so the icon-positioning rules in auth.css apply
  const form = document.createElement('div');
  form.className = 'auth-form';
  const pwField = buildPasswordField('reset-new', t('auth.reset.new_password'));
  form.appendChild(pwField.field);

  const confirmField = buildPasswordField('reset-confirm', t('auth.reset.confirm_password'));
  form.appendChild(confirmField.field);
  card.appendChild(form);

  const checklist = await buildPasswordChecklist({
    passwordInput: pwField.input,
    confirmInput: confirmField.input,
  });
  card.appendChild(checklist.el);

  const generalError = document.createElement('div');
  generalError.className = 'auth-form__general-error';
  generalError.style.display = 'none';
  card.appendChild(generalError);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn--primary btn--full';
  submitBtn.textContent = t('auth.reset.cta');
  card.appendChild(submitBtn);

  const linkRow = document.createElement('div');
  linkRow.className = 'auth-form__link';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'auth-link-btn';
  back.textContent = t('auth.forgot.back_to_login');
  back.addEventListener('click', () => navigate('/auth/login'));
  linkRow.appendChild(back);
  card.appendChild(linkRow);

  async function handleSubmit() {
    generalError.style.display = 'none';
    if (!checklist.isValid()) {
      generalError.textContent = t('common.error');
      generalError.style.display = '';
      return;
    }
    submitBtn.disabled = true;
    try {
      await resetPassword(token, pwField.input.value);
      renderSuccess(card);
    } catch (e) {
      submitBtn.disabled = false;
      generalError.textContent = (e?.detail?.code === 'weak_password')
        ? t('common.error')
        : (e?.message || t('auth.reset.no_token'));
      generalError.style.display = '';
    }
  }

  submitBtn.addEventListener('click', handleSubmit);
  [pwField.input, confirmField.input].forEach(inp => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmit(); });
  });

  root.innerHTML = '';
  root.appendChild(layout);
  pwField.input.focus();
}

function buildPasswordField(id, labelText) {
  const field = document.createElement('div');
  field.className = 'auth-form__field';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.className = 'field__label';
  label.textContent = labelText;

  const wrap = document.createElement('div');
  wrap.className = 'input-wrapper';
  const iconSpan = document.createElement('span');
  iconSpan.className = 'input-icon';
  iconSpan.appendChild(iconEl('lock', 16));

  const input = document.createElement('input');
  input.id = id;
  input.type = 'password';
  input.className = 'input has-toggle';
  input.placeholder = '••••••••';
  input.autocomplete = 'new-password';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'input-toggle';
  toggle.setAttribute('aria-label', 'Toggle password visibility');
  toggle.appendChild(iconEl('eye', 16));
  toggle.addEventListener('click', () => {
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    toggle.innerHTML = '';
    toggle.appendChild(iconEl(isText ? 'eye' : 'eyeOff', 16));
  });

  wrap.appendChild(iconSpan);
  wrap.appendChild(input);
  wrap.appendChild(toggle);

  field.appendChild(label);
  field.appendChild(wrap);
  return { field, input };
}

function renderSuccess(card) {
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

  const title = document.createElement('h1');
  title.className = 'auth-card__title';
  title.style.textAlign = 'center';
  title.textContent = t('auth.reset.success_title');
  card.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'auth-card__subtitle';
  desc.style.textAlign = 'center';
  desc.style.margin = '0';
  desc.textContent = t('auth.reset.success_desc');
  card.appendChild(desc);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--primary btn--full';
  btn.textContent = t('auth.reset.go_login');
  btn.addEventListener('click', () => navigate('/auth/login'));
  card.appendChild(btn);
}

function renderError(card, msg) {
  const iconWrap = document.createElement('div');
  iconWrap.style.cssText = `
    width: 56px; height: 56px; border-radius: 50%;
    background: var(--error-soft); color: var(--error);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto;
  `;
  iconWrap.appendChild(iconEl('x', 24));
  card.appendChild(iconWrap);

  const title = document.createElement('h1');
  title.className = 'auth-card__title';
  title.style.textAlign = 'center';
  title.textContent = t('auth.reset.no_token');
  card.appendChild(title);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--primary btn--full';
  btn.textContent = t('auth.forgot.cta');
  btn.addEventListener('click', () => navigate('/auth/forgot'));
  card.appendChild(btn);
}
