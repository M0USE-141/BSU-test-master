/**
 * mobile/auth/login.js — Mobile login screen.
 *
 * Same backend integration as the desktop screen (real `login()` + JWT
 * flow, `getMe()` hydration), wrapped in the mobile design language:
 * card-on-paper layout, `mField` inputs, primary `mBtn`, inline links
 * for "forgot password" and "register".
 */
import { login, getMe } from '../../../api/auth.js';
import { setState, getAccessToken, clearAccessToken } from '../../../state.js';
import { navigate } from '../../../router.js';
import { t } from '../../../utils/locale.js';
import { mField, mBtn } from '../../../components/mobile-atoms.js';
import { buildAuthLayout, inlineLink, buildSwitchPrompt } from './_card.js';

function parseApiError(err) {
  if (!err || !err.status) return t('auth.error.network') || 'Сетевая ошибка';
  if (err.status === 0)    return t('auth.error.network') || 'Сетевая ошибка';
  if ([400, 401, 422].includes(err.status)) {
    const d = err.detail ?? err.payload?.detail ?? err.payload;
    if (Array.isArray(d)) return (d[0]?.msg) || (t('auth.error.invalid') || 'Неверный формат');
    if (typeof d === 'string') return d;
    if (d && typeof d === 'object' && d.message) return d.message;
    return t('auth.error.invalid') || 'Неверные данные';
  }
  return t('common.error') || 'Ошибка';
}

export default async function render(root) {
  // Auto-redirect if the boot-time silent refresh restored a session.
  if (getAccessToken()) {
    try {
      const user = await getMe();
      setState({ user });
      navigate('/home');
      return;
    } catch {
      clearAccessToken();
    }
  }

  const { wrap, card } = buildAuthLayout({
    title: t('auth.login.title') || 'Войти',
    sub:   t('auth.login.sub')   || 'Email или username и пароль',
  });

  let usernameValue = '';
  let passwordValue = '';

  const usernameField = mField({
    label: t('auth.username_or_email') || 'Username или Email',
    placeholder: 'you@example.com',
    autocomplete: 'username',
    onInput: (v) => { usernameValue = v; clearGeneral(); },
  });
  const passwordField = mField({
    label: t('auth.password') || 'Пароль',
    type: 'password',
    placeholder: '••••••••',
    autocomplete: 'current-password',
    onInput: (v) => { passwordValue = v; clearGeneral(); },
  });
  card.appendChild(usernameField);
  card.appendChild(passwordField);

  // Forgot-password link — right-aligned under the password row.
  const forgotRow = document.createElement('div');
  Object.assign(forgotRow.style, { textAlign: 'right', marginBottom: '12px' });
  forgotRow.appendChild(inlineLink(
    t('auth.forgot.link') || 'Забыли пароль?',
    () => navigate('/auth/forgot'),
  ));
  // Slightly tighter colour for the link in this spot.
  forgotRow.firstChild.style.fontWeight = '500';
  forgotRow.firstChild.style.fontSize = '12px';
  card.appendChild(forgotRow);

  // Inline general error banner. Hidden by default.
  const generalErr = document.createElement('div');
  Object.assign(generalErr.style, {
    display: 'none',
    background: 'var(--error-soft)', color: 'var(--error)',
    border: '1px solid var(--error)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 10px', fontSize: '12px', marginBottom: '10px',
    lineHeight: '1.4',
  });
  generalErr.setAttribute('role', 'alert');
  card.appendChild(generalErr);

  function showGeneral(msg) {
    generalErr.textContent = msg;
    generalErr.style.display = '';
  }
  function clearGeneral() {
    generalErr.textContent = '';
    generalErr.style.display = 'none';
  }

  const submitBtn = mBtn({
    primary: true, full: true,
    style: { padding: '12px 14px', fontSize: '14px' },
    onClick: handleSubmit,
  }, t('auth.login.cta') || 'Войти');
  card.appendChild(submitBtn);

  // Switch prompt — "Нет аккаунта? Регистрация"
  card.appendChild(buildSwitchPrompt(
    t('auth.no_account') || 'Нет аккаунта?',
    t('auth.register')    || 'Регистрация',
    () => navigate('/auth/register'),
  ));

  // Submit by Enter from any field.
  for (const fld of [usernameField.input, passwordField.input]) {
    fld.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });
  }

  async function handleSubmit() {
    clearGeneral();
    const u = (usernameValue || usernameField.input.value).trim();
    const p = passwordValue || passwordField.input.value;
    if (!u || !p) {
      showGeneral(t('auth.error.invalid') || 'Заполните оба поля');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = t('common.loading') || 'Вход…';
    try {
      await login(u, p);
      const user = await getMe();
      setState({ user });
      navigate('/home');
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = t('auth.login.cta') || 'Войти';
      if (getAccessToken()) {
        navigate('/home');
        return;
      }
      showGeneral(parseApiError(err));
    }
  }

  root.replaceChildren(wrap);
  // Auto-focus the first empty field for fast keyboard re-entry.
  usernameField.input.focus();
}
