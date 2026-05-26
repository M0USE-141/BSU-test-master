/**
 * screens/auth/register.js — Register screen (Phase 1)
 * Full DOM-based implementation with client-side validation and auto-login.
 */
import { register, login, getMe } from '../../api/auth.js';
import { navigate } from '../../router.js';
import { setState } from '../../state.js';
import { t, setLocale, getLocale } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { setTheme, getResolvedTheme } from '../../utils/theme.js';

// ─── helpers ────────────────────────────────────────────────

/**
 * Build a simple labelled field with an icon in the input.
 * @param {string} id
 * @param {string} labelText
 * @param {string} type
 * @param {string} placeholder
 * @param {string} iconKind
 * @param {string} [autocomplete]
 * @returns {{ field: HTMLElement, input: HTMLInputElement, errorEl: HTMLElement }}
 */
function buildField(id, labelText, type, placeholder, iconKind, autocomplete = '') {
  const field = document.createElement('div');
  field.className = 'auth-form__field';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.className = 'field__label';
  label.textContent = labelText;

  const wrapper = document.createElement('div');
  wrapper.className = 'input-wrapper';

  const iconSpan = document.createElement('span');
  iconSpan.className = 'input-icon';
  iconSpan.appendChild(iconEl(iconKind, 16));

  const input = document.createElement('input');
  input.id = id;
  input.type = type;
  input.placeholder = placeholder;
  input.className = 'input';
  if (autocomplete) input.autocomplete = autocomplete;

  wrapper.appendChild(iconSpan);
  wrapper.appendChild(input);

  const errorEl = document.createElement('span');
  errorEl.className = 'auth-form__field-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.style.display = 'none';

  field.appendChild(label);
  field.appendChild(wrapper);
  field.appendChild(errorEl);
  return { field, input, errorEl };
}

/**
 * Build a password field with eye toggle and icon.
 * @param {string} id
 * @param {string} labelText
 * @param {string} [autocomplete]
 * @returns {{ field: HTMLElement, input: HTMLInputElement, errorEl: HTMLElement }}
 */
function buildPasswordField(id, labelText, autocomplete = 'new-password') {
  const field = document.createElement('div');
  field.className = 'auth-form__field';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.className = 'field__label';
  label.textContent = labelText;

  const wrapper = document.createElement('div');
  wrapper.className = 'input-wrapper';

  const iconSpan = document.createElement('span');
  iconSpan.className = 'input-icon';
  iconSpan.appendChild(iconEl('lock', 16));

  const input = document.createElement('input');
  input.id = id;
  input.type = 'password';
  input.placeholder = '••••••••';
  input.className = 'input has-toggle';
  input.autocomplete = autocomplete;

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

  wrapper.appendChild(iconSpan);
  wrapper.appendChild(input);
  wrapper.appendChild(toggle);

  const errorEl = document.createElement('span');
  errorEl.className = 'auth-form__field-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.style.display = 'none';

  field.appendChild(label);
  field.appendChild(wrapper);
  field.appendChild(errorEl);
  return { field, input, errorEl };
}

/**
 * Show an error on a field.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} errorEl
 * @param {string} msg
 */
function showFieldError(input, errorEl, msg) {
  input.classList.add('input--error');
  errorEl.textContent = msg;
  errorEl.style.display = '';
}

/**
 * Clear error from a field.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} errorEl
 */
function clearFieldError(input, errorEl) {
  input.classList.remove('input--error');
  errorEl.style.display = 'none';
  errorEl.textContent = '';
}

/**
 * Build language picker chips.
 * @returns {HTMLElement}
 */
function buildLangPicker() {
  const container = document.createElement('div');
  container.className = 'auth-footer__langs';

  const currentLocale = getLocale();
  const langs = ['ru', 'en', 'uz'];
  const labels = { ru: 'RU', en: 'EN', uz: 'UZ' };

  for (const lang of langs) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip--small' + (lang === currentLocale ? ' chip--active' : '');
    chip.textContent = labels[lang];
    chip.addEventListener('click', async () => {
      await setLocale(lang);
      // localechange event triggers router re-render
    });
    container.appendChild(chip);
  }

  return container;
}

/**
 * Build theme toggle button.
 * @returns {HTMLElement}
 */
function buildThemeToggle() {
  const resolved = getResolvedTheme();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'auth-footer__theme-btn';
  btn.setAttribute('aria-label', 'Toggle theme');
  btn.textContent = resolved === 'dark' ? '☀' : '☽';

  btn.addEventListener('click', () => {
    const current = getResolvedTheme();
    setTheme(current === 'dark' ? 'light' : 'dark');
    btn.textContent = getResolvedTheme() === 'dark' ? '☀' : '☽';
  });

  return btn;
}

/**
 * Simple email format check.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Extract a human-readable error message from ApiError.
 * @param {any} err
 * @returns {string}
 */
function parseApiError(err) {
  if (!err || !err.status) return t('auth.error.network');
  if (err.status === 0) return t('auth.error.network');
  if (err.status === 400 || err.status === 409 || err.status === 422) {
    const d = err.detail;
    if (Array.isArray(d)) {
      const first = d[0];
      return (first?.msg) || t('auth.error.invalid');
    }
    if (typeof d === 'string') return d;
    return t('auth.error.invalid');
  }
  return t('common.error');
}

// ─── render ─────────────────────────────────────────────────

export default async function render(root, params = {}) {
  // Auto-redirect if token already valid
  const existingToken = localStorage.getItem('access_token');
  if (existingToken) {
    try {
      const user = await getMe();
      setState({ user });
      navigate('/home');
      return;
    } catch {
      localStorage.removeItem('access_token');
    }
  }

  // ── Layout shell ──
  const layout = document.createElement('div');
  layout.className = 'auth-layout';

  // ── Brand ──
  const header = document.createElement('div');
  header.className = 'auth-header';

  const logo = document.createElement('div');
  logo.className = 'auth-header__logo';
  logo.textContent = 'TestMaster';

  const tagline = document.createElement('div');
  tagline.className = 'auth-header__tagline';
  tagline.textContent = t('auth.tagline');

  header.appendChild(logo);
  header.appendChild(tagline);

  // ── Card ──
  const card = document.createElement('div');
  card.className = 'auth-card';

  const cardTitle = document.createElement('h1');
  cardTitle.className = 'auth-card__title';
  cardTitle.textContent = t('auth.register.title');

  const cardSubtitle = document.createElement('p');
  cardSubtitle.className = 'auth-card__subtitle';
  cardSubtitle.textContent = t('auth.no_account');

  // ── Form ──
  const form = document.createElement('form');
  form.className = 'auth-form';
  form.noValidate = true;
  form.addEventListener('submit', e => { e.preventDefault(); handleSubmit(); });

  // Username field
  const { field: usernameField, input: usernameInput, errorEl: usernameError } =
    buildField('reg-username', t('auth.username'), 'text', t('auth.username'), 'user', 'username');

  // Email field
  const { field: emailField, input: emailInput, errorEl: emailError } =
    buildField('reg-email', t('auth.email'), 'email', t('auth.email'), 'globe', 'email');

  // Password field
  const { field: passwordField, input: passwordInput, errorEl: passwordError } =
    buildPasswordField('reg-password', t('auth.password'), 'new-password');

  // Confirm password field
  const { field: confirmField, input: confirmInput, errorEl: confirmError } =
    buildPasswordField('reg-confirm', t('auth.password_confirm'), 'new-password');

  // General error banner
  const generalError = document.createElement('div');
  generalError.className = 'auth-form__general-error';
  generalError.setAttribute('role', 'alert');
  generalError.style.display = 'none';

  // Submit button
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn--primary btn--full';

  function setButtonLoading(loading) {
    submitBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
    submitBtn.disabled = loading;
    if (loading) {
      submitBtn.classList.add('btn--loading');
      submitBtn.textContent = t('auth.register.cta');
    } else {
      submitBtn.classList.remove('btn--loading');
      submitBtn.textContent = t('auth.register.cta');
    }
  }
  setButtonLoading(false);

  // Link to login
  const linkRow = document.createElement('div');
  linkRow.className = 'auth-form__link';
  const linkText = document.createTextNode(t('auth.have_account') + ' ');
  const loginBtn = document.createElement('button');
  loginBtn.type = 'button';
  loginBtn.className = 'auth-link-btn';
  loginBtn.textContent = t('auth.login');
  loginBtn.addEventListener('click', () => navigate('/auth/login'));
  linkRow.appendChild(linkText);
  linkRow.appendChild(loginBtn);

  // ── Validation ──
  function validateForm() {
    let valid = true;

    clearFieldError(usernameInput, usernameError);
    clearFieldError(emailInput, emailError);
    clearFieldError(passwordInput, passwordError);
    clearFieldError(confirmInput, confirmError);
    generalError.style.display = 'none';

    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;

    if (!username) {
      showFieldError(usernameInput, usernameError, t('auth.error.invalid'));
      valid = false;
    } else if (username.length < 3) {
      showFieldError(usernameInput, usernameError, t('auth.error.invalid'));
      valid = false;
    }

    if (!email) {
      showFieldError(emailInput, emailError, t('auth.error.invalid'));
      valid = false;
    } else if (!isValidEmail(email)) {
      showFieldError(emailInput, emailError, t('auth.error.invalid'));
      valid = false;
    }

    if (!password) {
      showFieldError(passwordInput, passwordError, t('auth.error.invalid'));
      valid = false;
    } else if (password.length < 6) {
      showFieldError(passwordInput, passwordError, t('auth.error.invalid'));
      valid = false;
    }

    if (!confirm) {
      showFieldError(confirmInput, confirmError, t('auth.error.invalid'));
      valid = false;
    } else if (password && confirm !== password) {
      showFieldError(confirmInput, confirmError, t('auth.error.passwords_mismatch'));
      valid = false;
    }

    return valid;
  }

  // ── Submit handler ──
  async function handleSubmit() {
    if (!validateForm()) {
      // Focus first errored field
      for (const inp of [usernameInput, emailInput, passwordInput, confirmInput]) {
        if (inp.classList.contains('input--error')) {
          inp.focus();
          break;
        }
      }
      return;
    }

    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    setButtonLoading(true);

    // Step 1: Register
    try {
      await register(username, email, password);
    } catch (err) {
      setButtonLoading(false);
      const msg = parseApiError(err);

      // Try to surface username/email conflicts specifically
      const detail = err?.detail || '';
      const detailStr = typeof detail === 'string' ? detail.toLowerCase() : '';

      if (detailStr.includes('username') || detailStr.includes('taken')) {
        showFieldError(usernameInput, usernameError, t('auth.error.taken'));
        usernameInput.focus();
      } else if (detailStr.includes('email')) {
        showFieldError(emailInput, emailError, t('auth.error.email_taken'));
        emailInput.focus();
      } else {
        generalError.textContent = msg;
        generalError.style.display = '';
      }
      return;
    }

    // Step 2: Auto-login (registration already succeeded)
    try {
      const data = await login(username, password);
      if (data?.access_token) {
        localStorage.setItem('access_token', data.access_token);
      }
      const user = await getMe();
      setState({ user });
      navigate('/home');
    } catch (err) {
      // Auto-login failed AFTER successful registration — send to login page
      setButtonLoading(false);
      navigate('/auth/login');
    }
  }

  // ── Assemble form ──
  form.appendChild(usernameField);
  form.appendChild(emailField);
  form.appendChild(passwordField);
  form.appendChild(confirmField);
  form.appendChild(generalError);
  form.appendChild(submitBtn);
  form.appendChild(linkRow);

  // ── Assemble card ──
  card.appendChild(cardTitle);
  card.appendChild(cardSubtitle);
  card.appendChild(form);

  // ── Footer (lang + theme) ──
  const footer = document.createElement('div');
  footer.className = 'auth-footer';
  footer.appendChild(buildLangPicker());
  footer.appendChild(buildThemeToggle());

  // ── Assemble layout ──
  layout.appendChild(header);
  layout.appendChild(card);
  layout.appendChild(footer);

  // ── Mount ──
  root.innerHTML = '';
  root.appendChild(layout);

  // Focus first input
  usernameInput.focus();
}
