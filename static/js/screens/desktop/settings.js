/**
 * screens/desktop/settings.js — Settings screen stub
 */
import { setTheme, getTheme, setAccent, getAccent } from '../../utils/theme.js';

export default async function render(root) {
  const currentTheme  = getTheme();
  const currentAccent = getAccent();

  root.innerHTML = `
    <div class="screen">
      <div class="page-header">
        <span class="page-header__title">Настройки</span>
      </div>
      <div class="screen__body">
        <div class="card" style="max-width:480px;margin:0 auto;display:flex;flex-direction:column;gap:20px;">
          <div>
            <p style="font-size:18px;font-weight:600;margin-bottom:4px;">Настройки</p>
            <p style="color:var(--ink-mute);font-size:14px;">Settings screen — coming in Phase 6</p>
          </div>

          <div class="field">
            <span class="field__label">Тема</span>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${['light','dark','system'].map(t => `
                <button class="chip ${currentTheme === t ? 'chip--active' : ''}" data-theme-btn="${t}">
                  ${t === 'light' ? 'Светлая' : t === 'dark' ? 'Тёмная' : 'Системная'}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="field">
            <span class="field__label">Акцент</span>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${['green','coral','yellow','blue','mono'].map(a => `
                <button class="chip ${currentAccent === a ? 'chip--active' : ''}" data-accent-btn="${a}">
                  ${a}
                </button>
              `).join('')}
            </div>
          </div>

          <div>
            <a href="#/home" class="btn btn--ghost btn--small">← Back</a>
          </div>
        </div>
      </div>
    </div>
  `;

  // Theme buttons
  root.querySelectorAll('[data-theme-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      setTheme(btn.dataset.themeBtn);
      render(root); // re-render to update active state
    });
  });

  // Accent buttons
  root.querySelectorAll('[data-accent-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      setAccent(btn.dataset.accentBtn);
      render(root);
    });
  });
}
