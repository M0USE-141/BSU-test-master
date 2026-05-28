/**
 * components/confirm-dialog.js — destructive confirmation dialog.
 *
 * Usage:
 *   const ok = await confirm({
 *     title: 'Удалить тест?',
 *     message: '80 вопросов и 12 попыток будут удалены.',
 *     danger: true,
 *     typeToConfirm: 'Алгоритмы и структуры',
 *     confirmLabel: 'Удалить навсегда'
 *   });
 *   if (ok) await deleteTest(...);
 */
import { iconEl } from '../icons.js';
import { escHtml } from '../utils/escape.js';
import { t } from '../utils/locale.js';

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.message]
 * @param {boolean} [opts.danger]            colors the confirm button as destructive
 * @param {string}  [opts.typeToConfirm]     if set, user must type this exact string to enable confirm
 * @param {string}  [opts.confirmLabel]      default: t('common.confirm')
 * @param {string}  [opts.cancelLabel]       default: t('common.cancel')
 * @returns {Promise<boolean>}
 */
export function confirm(opts) {
  const {
    title,
    message,
    danger = false,
    typeToConfirm = null,
    confirmLabel = t('common.confirm'),
    cancelLabel  = t('common.cancel'),
  } = opts;

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'modal confirm-dialog';
    modal.style.maxWidth = '460px';

    const header = document.createElement('div');
    header.className = 'confirm-dialog__head';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'confirm-dialog__icon' + (danger ? ' confirm-dialog__icon--danger' : '');
    iconWrap.appendChild(iconEl(danger ? 'trash' : 'info', 20));

    const titleWrap = document.createElement('div');
    titleWrap.className = 'confirm-dialog__title-wrap';
    const titleEl = document.createElement('div');
    titleEl.className = 'confirm-dialog__title';
    titleEl.textContent = title;
    titleWrap.appendChild(titleEl);

    if (message) {
      const msgEl = document.createElement('div');
      msgEl.className = 'confirm-dialog__msg';
      msgEl.textContent = message;
      titleWrap.appendChild(msgEl);
    }

    header.appendChild(iconWrap);
    header.appendChild(titleWrap);
    modal.appendChild(header);

    // Type-to-confirm
    let typeInput = null;
    if (typeToConfirm) {
      const label = document.createElement('div');
      label.className = 'caps';
      label.style.marginBottom = 'var(--sp-1)';
      label.style.marginTop = 'var(--sp-3)';
      label.textContent = t('confirm.type_to_confirm', { name: typeToConfirm });
      modal.appendChild(label);

      typeInput = document.createElement('input');
      typeInput.type = 'text';
      typeInput.className = 'input mono';
      typeInput.style.fontSize = 'var(--fs-sm)';
      typeInput.setAttribute('autocomplete', 'off');
      typeInput.setAttribute('spellcheck', 'false');
      modal.appendChild(typeInput);
    }

    const footer = document.createElement('div');
    footer.className = 'confirm-dialog__footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn';
    cancelBtn.textContent = cancelLabel;
    cancelBtn.addEventListener('click', () => close(false));

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn ' + (danger ? 'btn--danger-solid' : 'btn--primary');
    confirmBtn.textContent = confirmLabel;
    confirmBtn.addEventListener('click', () => close(true));

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    modal.appendChild(footer);
    backdrop.appendChild(modal);

    function refreshConfirmEnabled() {
      if (!typeInput) return;
      const ok = typeInput.value === typeToConfirm;
      confirmBtn.disabled = !ok;
    }
    if (typeInput) {
      typeInput.addEventListener('input', refreshConfirmEnabled);
      refreshConfirmEnabled();
    }

    let done = false;
    function close(result) {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey);
      backdrop.style.animation = 'backdrop-in .15s reverse both';
      modal.style.animation = 'modal-in .15s reverse both';
      setTimeout(() => backdrop.remove(), 150);
      resolve(result);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter' && !confirmBtn.disabled && document.activeElement !== typeInput) {
        e.preventDefault();
        close(true);
      } else if (e.key === 'Enter' && document.activeElement === typeInput && !confirmBtn.disabled) {
        e.preventDefault();
        close(true);
      }
    }

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
    window.addEventListener('keydown', onKey);
    document.body.appendChild(backdrop);

    setTimeout(() => {
      (typeInput || confirmBtn).focus();
    }, 50);
  });
}

// Inject component-local styles once
(function injectStyles() {
  if (document.getElementById('__confirm_dialog_styles')) return;
  const style = document.createElement('style');
  style.id = '__confirm_dialog_styles';
  style.textContent = `
    .confirm-dialog { padding: var(--sp-5); }
    .confirm-dialog__head { display: flex; gap: var(--sp-3); margin-bottom: var(--sp-3); }
    .confirm-dialog__icon {
      width: 44px; height: 44px; border-radius: 50%;
      background: var(--ink-soft); color: var(--ink);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .confirm-dialog__icon--danger { background: var(--error-soft); color: var(--error); }
    .confirm-dialog__title { font-weight: var(--fw-bold); font-size: var(--fs-lg); line-height: 1.3; }
    .confirm-dialog__msg { font-size: var(--fs-sm); color: var(--ink-secondary); margin-top: var(--sp-1); line-height: 1.5; }
    .confirm-dialog__footer {
      display: flex; gap: var(--sp-2); justify-content: flex-end; margin-top: var(--sp-5);
    }
  `;
  document.head.appendChild(style);
})();
