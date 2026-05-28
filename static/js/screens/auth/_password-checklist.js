/**
 * screens/auth/_password-checklist.js — live password-rules checklist.
 *
 * Used by register and reset screens. Reads rules from /api/auth/password-rules,
 * shows green/grey check items that update on every keystroke.
 */
import { iconEl } from '../../icons.js';
import { t } from '../../utils/locale.js';
import { getPasswordRules } from '../../api/auth.js';

let _rulesCache = null;

/**
 * Build a checklist element bound to a password input. Optionally also to
 * a "confirm" input — adds a "passwords match" rule.
 *
 * @param {object} opts
 * @param {HTMLInputElement} opts.passwordInput
 * @param {HTMLInputElement} [opts.confirmInput]
 * @returns {Promise<{el: HTMLElement, isValid: () => boolean}>}
 */
export async function buildPasswordChecklist({ passwordInput, confirmInput }) {
  if (!_rulesCache) {
    try {
      _rulesCache = await getPasswordRules();
    } catch {
      _rulesCache = { min_length: 8, require_digit: true, require_upper: true };
    }
  }
  const rules = _rulesCache;

  const wrap = document.createElement('ul');
  wrap.className = 'pw-checklist';

  const items = [];
  function addItem(key, label, check) {
    const li = document.createElement('li');
    li.className = 'pw-checklist__item';
    const dot = document.createElement('span');
    dot.className = 'pw-checklist__dot';
    dot.appendChild(iconEl('check', 12));
    const text = document.createElement('span');
    text.textContent = label;
    li.appendChild(dot);
    li.appendChild(text);
    wrap.appendChild(li);
    items.push({ key, li, check });
  }

  addItem('min_length',
    t('auth.pwrule.min_length', { n: rules.min_length }),
    (pw) => pw.length >= rules.min_length);

  if (rules.require_digit) {
    addItem('require_digit', t('auth.pwrule.require_digit'),
      (pw) => /\d/.test(pw));
  }
  if (rules.require_upper) {
    addItem('require_upper', t('auth.pwrule.require_upper'),
      (pw) => /[A-ZА-ЯЎҚҒҲ]/.test(pw));
  }
  if (confirmInput) {
    addItem('match', t('auth.pwrule.match'),
      (pw, confirm) => pw.length > 0 && pw === confirm);
  }

  function refresh() {
    const pw = passwordInput.value;
    const confirm = confirmInput ? confirmInput.value : '';
    items.forEach(({ li, check }) => {
      li.classList.toggle('is-ok', check(pw, confirm));
    });
  }

  passwordInput.addEventListener('input', refresh);
  if (confirmInput) confirmInput.addEventListener('input', refresh);
  refresh();

  function isValid() {
    const pw = passwordInput.value;
    const confirm = confirmInput ? confirmInput.value : '';
    return items.every(({ check }) => check(pw, confirm));
  }

  return { el: wrap, isValid };
}

// Inject styles once
(function injectStyles() {
  if (document.getElementById('__pw_checklist_styles')) return;
  const style = document.createElement('style');
  style.id = '__pw_checklist_styles';
  style.textContent = `
    .pw-checklist {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .pw-checklist__item {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: var(--fs-sm);
      color: var(--ink-tertiary);
      transition: color var(--transition-fast);
    }
    .pw-checklist__dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--ink-soft);
      color: var(--ink-tertiary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background var(--transition-fast), color var(--transition-fast);
    }
    .pw-checklist__item.is-ok { color: var(--success); }
    .pw-checklist__item.is-ok .pw-checklist__dot {
      background: var(--success-soft);
      color: var(--success);
    }
  `;
  document.head.appendChild(style);
})();
