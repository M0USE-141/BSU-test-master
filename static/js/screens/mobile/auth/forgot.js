/**
 * mobile/auth/forgot.js — Mobile "forgot password" flow.
 *
 * Single email field → POST /api/auth/forgot-password. The server
 * always responds 200 to avoid leaking which addresses are registered;
 * the screen reflects that by showing the same success banner whether
 * the email exists or not (anti-enumeration).
 */
import { navigate } from '../../../router.js';
import { t } from '../../../utils/locale.js';
import { apiFetch } from '../../../api/_fetch.js';
import { mField, mBtn } from '../../../components/mobile-atoms.js';
import { buildAuthLayout, inlineLink } from './_card.js';

export default async function render(root) {
  const { wrap, card } = buildAuthLayout({
    title: t('auth.forgot.title') || 'Восстановить пароль',
    sub:   t('auth.forgot.sub')   || 'Пришлём ссылку на смену',
  });

  let email = '';
  const emailField = mField({
    label: t('auth.email') || 'Email',
    placeholder: 'you@bsu.by', type: 'email', autocomplete: 'email',
    onInput: (v) => { email = v; clearErr(); },
  });
  card.appendChild(emailField);

  const errBox = document.createElement('div');
  Object.assign(errBox.style, {
    display: 'none',
    background: 'var(--error-soft)', color: 'var(--error)',
    border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)',
    padding: '8px 10px', fontSize: '12px', marginBottom: '10px',
  });
  errBox.setAttribute('role', 'alert');
  card.appendChild(errBox);

  // Success placeholder. Replaces the field + button after successful
  // submit; the screen stays on the same card so the user has clear
  // context about what just happened.
  const successBox = document.createElement('div');
  Object.assign(successBox.style, {
    background: 'var(--accent-soft)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius-sm)',
    padding: '12px 14px', color: 'var(--accent)',
    fontWeight: '500', fontSize: '13px', textAlign: 'center',
    lineHeight: '1.5',
  });
  successBox.textContent = t('auth.forgot.success')
    || 'Если email зарегистрирован, ссылка уже у вас в почте.';

  const submitBtn = mBtn({
    primary: true, full: true,
    style: { padding: '12px 14px', fontSize: '14px' },
    onClick: handleSubmit,
  }, t('auth.forgot.cta') || 'Отправить ссылку');
  card.appendChild(submitBtn);

  // Back to login.
  const backRow = document.createElement('div');
  Object.assign(backRow.style, {
    textAlign: 'center', marginTop: '14px',
    fontSize: '12px', color: 'var(--ink-fade)',
  });
  backRow.appendChild(inlineLink(
    t('auth.forgot.back') || '← Назад ко входу',
    () => navigate('/auth/login'),
  ));
  card.appendChild(backRow);

  function clearErr() {
    errBox.textContent = '';
    errBox.style.display = 'none';
  }
  function showErr(msg) {
    errBox.textContent = msg;
    errBox.style.display = '';
  }

  async function handleSubmit() {
    clearErr();
    const e = (email || emailField.input.value).trim();
    if (!e.includes('@') || !e.includes('.')) {
      showErr(t('auth.error.invalid_email') || 'Email невалиден');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = t('common.loading') || 'Отправляем…';
    try {
      // Server always 200s — we don't read the response.
      await apiFetch('POST', '/api/auth/forgot-password', { email: e });
    } catch {
      // Even on transport error we show success to maintain anti-enum.
    } finally {
      // Replace the form with the success banner.
      emailField.replaceWith(successBox);
      submitBtn.remove();
    }
  }

  emailField.input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') handleSubmit();
  });

  root.replaceChildren(wrap);
  emailField.input.focus();
}
