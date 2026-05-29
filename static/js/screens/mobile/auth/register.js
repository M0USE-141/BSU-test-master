/**
 * mobile/auth/register.js — Mobile registration screen.
 *
 * Wires the design-system mobile card to the real `register()` API.
 * Password rule hints are rendered as a live three-row checklist; the
 * primary CTA stays disabled while any rule fails so the user gets
 * feedback before they hit the server.
 */
import { register, login, getMe } from '../../../api/auth.js';
import { setState, getAccessToken, clearAccessToken } from '../../../state.js';
import { navigate } from '../../../router.js';
import { t } from '../../../utils/locale.js';
import { iconEl } from '../../../icons.js';
import { mField, mBtn } from '../../../components/mobile-atoms.js';
import { buildAuthLayout, buildSwitchPrompt } from './_card.js';

function parseApiError(err) {
  if (!err || !err.status) return t('auth.error.network') || 'Сетевая ошибка';
  const d = err.detail ?? err.payload?.detail ?? err.payload;
  if (Array.isArray(d)) return (d[0]?.msg) || (t('auth.error.invalid') || 'Неверный формат');
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object' && d.message) return d.message;
  return t('common.error') || 'Ошибка';
}

// Three password rules surfaced inline. Keep in sync with backend
// password_reset_service.password_rules() if it grows.
const RULES = [
  {
    test: (p) => p.length >= 8,
    label: t('auth.pwd.min') || 'минимум 8 символов',
  },
  {
    test: (p) => /[A-ZА-ЯЁ]/.test(p),
    label: t('auth.pwd.upper') || 'заглавная буква',
  },
  {
    test: (p) => /\d/.test(p),
    label: t('auth.pwd.digit') || 'цифра',
  },
];

export default async function render(root) {
  if (getAccessToken()) {
    try {
      const user = await getMe();
      setState({ user });
      navigate('/home');
      return;
    } catch { clearAccessToken(); }
  }

  const { wrap, card } = buildAuthLayout({
    title: t('auth.register.title') || 'Создать аккаунт',
    sub:   t('auth.register.sub')   || 'Бесплатно · приватные тесты по умолчанию',
  });

  let form = { email: '', username: '', pwd: '', pwd2: '' };

  const fields = {
    email: mField({
      label: t('auth.email') || 'Email',
      placeholder: 'you@bsu.by', autocomplete: 'email', type: 'email',
      onInput: (v) => { form.email = v; refresh(); },
    }),
    username: mField({
      label: t('auth.username') || 'Username',
      placeholder: 'mlys', autocomplete: 'username',
      onInput: (v) => { form.username = v; refresh(); },
    }),
    pwd: mField({
      label: t('auth.password') || 'Пароль',
      type: 'password',
      placeholder: '••••••••', autocomplete: 'new-password',
      onInput: (v) => { form.pwd = v; refresh(); },
    }),
    pwd2: mField({
      label: t('auth.password.confirm') || 'Повторите пароль',
      type: 'password',
      placeholder: '••••••••', autocomplete: 'new-password',
      onInput: (v) => { form.pwd2 = v; refresh(); },
    }),
  };
  for (const f of Object.values(fields)) card.appendChild(f);

  // Live password checklist.
  const checklist = document.createElement('div');
  Object.assign(checklist.style, {
    fontSize: '11px', color: 'var(--ink-mute)',
    marginTop: '-8px', marginBottom: '14px',
    display: 'flex', flexDirection: 'column', gap: '3px',
  });
  card.appendChild(checklist);

  // General error banner.
  const generalErr = document.createElement('div');
  Object.assign(generalErr.style, {
    display: 'none',
    background: 'var(--error-soft)', color: 'var(--error)',
    border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)',
    padding: '8px 10px', fontSize: '12px', marginBottom: '10px',
    lineHeight: '1.4',
  });
  generalErr.setAttribute('role', 'alert');
  card.appendChild(generalErr);

  const submitBtn = mBtn({
    primary: true, full: true,
    style: { padding: '12px 14px', fontSize: '14px' },
    onClick: handleSubmit,
  }, t('auth.register.cta') || 'Создать аккаунт');
  card.appendChild(submitBtn);

  card.appendChild(buildSwitchPrompt(
    t('auth.have_account') || 'Уже есть?',
    t('auth.login.title')   || 'Войти',
    () => navigate('/auth/login'),
  ));

  function refresh() {
    // Rebuild checklist rows.
    checklist.replaceChildren();
    let allRulesOk = true;
    for (const rule of RULES) {
      const ok = rule.test(form.pwd);
      if (!ok) allRulesOk = false;
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '6px',
        color: ok ? 'var(--accent)' : 'var(--ink-mute)',
      });
      if (ok) {
        row.appendChild(iconEl('check', 12));
      } else {
        const dot = document.createElement('span');
        Object.assign(dot.style, {
          width: '11px', height: '11px', borderRadius: '50%',
          border: '1.2px solid currentColor', display: 'inline-block',
        });
        row.appendChild(dot);
      }
      row.appendChild(document.createTextNode(rule.label));
      checklist.appendChild(row);
    }
    // Confirm-password match row (always shown when pwd2 is non-empty).
    if (form.pwd2.length > 0) {
      const match = form.pwd === form.pwd2;
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '6px',
        color: match ? 'var(--accent)' : 'var(--error)',
      });
      if (match) {
        row.appendChild(iconEl('check', 12));
      } else {
        const dot = document.createElement('span');
        Object.assign(dot.style, {
          width: '11px', height: '11px', borderRadius: '50%',
          border: '1.2px solid currentColor', display: 'inline-block',
        });
        row.appendChild(dot);
      }
      row.appendChild(document.createTextNode(
        match
          ? (t('auth.pwd.match') || 'пароли совпадают')
          : (t('auth.pwd.mismatch') || 'пароли не совпадают'),
      ));
      checklist.appendChild(row);
    }

    // Toggle CTA disabled state.
    const pwdMatch = form.pwd.length > 0 && form.pwd === form.pwd2;
    const formOk = form.email.includes('@')
      && form.username.trim() && allRulesOk && pwdMatch;
    submitBtn.disabled = !formOk;
    submitBtn.style.opacity = formOk ? '1' : '0.5';
  }
  refresh();

  async function handleSubmit() {
    if (submitBtn.disabled) return;
    generalErr.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = t('common.loading') || 'Создаём…';
    try {
      await register(form.username.trim(), form.email.trim(), form.pwd);
      // Auto-login right after register so the user lands on home.
      await login(form.username.trim(), form.pwd);
      const user = await getMe();
      setState({ user });
      navigate('/home');
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = t('auth.register.cta') || 'Создать аккаунт';
      generalErr.textContent = parseApiError(err);
      generalErr.style.display = '';
    }
  }

  // Submit by Enter from any input.
  for (const f of Object.values(fields)) {
    f.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });
  }

  root.replaceChildren(wrap);
  fields.email.input.focus();
}
