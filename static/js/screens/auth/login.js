/**
 * screens/auth/login.js — Login screen (Phase 1)
 * Full DOM-based implementation with JWT flow, validation, lang/theme controls.
 */
import { login, getMe } from '../../api/auth.js';
import { navigate } from '../../router.js';
import { setState } from '../../state.js';
import { t, setLocale, getLocale } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { setTheme, getResolvedTheme } from '../../utils/theme.js';

// ─── helpers ────────────────────────────────────────────────

/**
 * Build a labelled field with an icon-wrapped input.
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
  errorEl.className = 'auth-form__error';
  errorEl.setAttribute('role', 'alert');
  errorEl.style.display = 'none';

  field.appendChild(label);
  field.appendChild(wrapper);
  field.appendChild(errorEl);
  return { field, input, errorEl };
}

/**
 * Build password field with an eye toggle and lock icon.
 * @param {string} id
 * @param {string} labelText
 * @returns {{ field: HTMLElement, input: HTMLInputElement, errorEl: HTMLElement }}
 */
function buildPasswordField(id, labelText) {
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
  input.autocomplete = id === 'login-password' ? 'current-password' : 'new-password';

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
  errorEl.className = 'auth-form__error';
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
 * Build lang picker chips.
 * @returns {HTMLElement}
 */
function buildLangPicker() {
  const picker = document.createElement('div');
  picker.className = 'auth-footer__langs';

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
    picker.appendChild(chip);
  }

  return picker;
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

  // In dark mode show sun (click → go light); in light mode show moon (click → go dark)
  btn.appendChild(iconEl(resolved === 'dark' ? 'sun' : 'moon', 16));

  btn.addEventListener('click', () => {
    const current = getResolvedTheme();
    setTheme(current === 'dark' ? 'light' : 'dark');
    btn.innerHTML = '';
    btn.appendChild(iconEl(getResolvedTheme() === 'dark' ? 'sun' : 'moon', 16));
  });

  return btn;
}

/**
 * Extract a human-readable error message from ApiError.
 * @param {any} err
 * @returns {string}
 */
function parseApiError(err) {
  if (!err || !err.status) return t('auth.error.network');
  if (err.status === 0) return t('auth.error.network');
  if (err.status === 401 || err.status === 400 || err.status === 422) {
    // detail may be a string or an array of validation objects
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
  const brand = document.createElement('div');
  brand.className = 'auth-header';
  const brandTitle = document.createElement('div');
  brandTitle.className = 'auth-header__logo';
  brandTitle.textContent = 'TestMaster';
  const brandTagline = document.createElement('div');
  brandTagline.className = 'auth-header__tagline';
  brandTagline.textContent = t('auth.tagline');
  brand.appendChild(brandTitle);
  brand.appendChild(brandTagline);

  // ── Card ──
  const card = document.createElement('div');
  card.className = 'auth-card';

  // Heading
  const heading = document.createElement('h1');
  heading.className = 'auth-card__title';
  heading.textContent = t('auth.login.title');

  // Fields
  const fieldsWrap = document.createElement('div');
  fieldsWrap.className = 'auth-form';

  const { field: usernameField, input: usernameInput, errorEl: usernameError } =
    buildField('login-username', t('auth.error.username_or_email'), 'text', t('auth.error.username_or_email'), 'user', 'username email');

  const { field: passwordField, input: passwordInput, errorEl: passwordError } =
    buildPasswordField('login-password', t('auth.password'));

  fieldsWrap.appendChild(usernameField);
  fieldsWrap.appendChild(passwordField);

  // General error banner
  const generalError = document.createElement('div');
  generalError.className = 'auth-form__general-error';
  generalError.setAttribute('role', 'alert');
  generalError.style.display = 'none';

  // Submit button
  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn--primary btn--full';

  function setButtonLoading(loading) {
    submitBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
    if (loading) {
      submitBtn.disabled = true;
      submitBtn.classList.add('btn--loading');
    } else {
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn--loading');
      submitBtn.innerHTML = '';
      submitBtn.appendChild(iconEl('play', 16));
      const span = document.createElement('span');
      span.textContent = t('auth.login.cta');
      submitBtn.appendChild(span);
    }
  }
  setButtonLoading(false);

  // Link to register
  const linkRow = document.createElement('div');
  linkRow.className = 'auth-form__link';
  const linkText = document.createTextNode(t('auth.no_account') + ' ');
  const registerLink = document.createElement('button');
  registerLink.type = 'button';
  registerLink.className = 'auth-link-btn';
  registerLink.textContent = t('auth.register');
  registerLink.addEventListener('click', () => navigate('/auth/register'));
  linkRow.appendChild(linkText);
  linkRow.appendChild(registerLink);

  // Forgot-password link
  const forgotRow = document.createElement('div');
  forgotRow.className = 'auth-form__link';
  forgotRow.style.marginTop = '-8px';
  const forgotLink = document.createElement('button');
  forgotLink.type = 'button';
  forgotLink.className = 'auth-link-btn';
  forgotLink.textContent = t('auth.forgot.link');
  forgotLink.addEventListener('click', () => navigate('/auth/forgot'));
  forgotRow.appendChild(forgotLink);

  // ── Form submission logic ──
  async function handleSubmit() {
    clearFieldError(usernameInput, usernameError);
    clearFieldError(passwordInput, passwordError);
    generalError.style.display = 'none';

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    let valid = true;
    if (!username) {
      showFieldError(usernameInput, usernameError, t('auth.error.invalid'));
      valid = false;
    }
    if (!password) {
      showFieldError(passwordInput, passwordError, t('auth.error.invalid'));
      valid = false;
    }
    if (!valid) return;

    setButtonLoading(true);
    try {
      await login(username, password);
      const user = await getMe();
      setState({ user });
      navigate('/home');
    } catch (err) {
      setButtonLoading(false);
      // If token was already stored by login(), getMe() failed — navigate anyway
      if (localStorage.getItem('access_token')) {
        navigate('/home');
        return;
      }
      const msg = parseApiError(err);
      // Show under password field for credential errors, general otherwise
      if (err?.status === 401 || err?.status === 400 || err?.status === 422) {
        showFieldError(passwordInput, passwordError, msg);
        passwordInput.focus();
      } else {
        generalError.textContent = msg;
        generalError.style.display = '';
      }
    }
  }

  submitBtn.addEventListener('click', handleSubmit);

  // Keyboard submit on Enter
  [usernameInput, passwordInput].forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleSubmit();
    });
  });

  // ── Assemble card ──
  card.appendChild(heading);
  card.appendChild(fieldsWrap);
  card.appendChild(generalError);
  card.appendChild(submitBtn);
  card.appendChild(forgotRow);
  card.appendChild(linkRow);

  // ── Footer (lang + theme) ──
  const footer = document.createElement('div');
  footer.className = 'auth-footer';
  footer.appendChild(buildLangPicker());
  footer.appendChild(buildThemeToggle());

  // ── Assemble layout ──
  layout.appendChild(brand);
  layout.appendChild(card);
  layout.appendChild(footer);

  // ── Mount ──
  root.innerHTML = '';
  root.appendChild(layout);

  // Focus first input
  usernameInput.focus();

}
