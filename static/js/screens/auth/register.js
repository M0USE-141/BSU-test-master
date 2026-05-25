/**
 * screens/auth/register.js — Register screen stub
 */
export default async function render(root) {
  root.innerHTML = `
    <div class="screen" style="align-items:center;justify-content:center;">
      <div class="card auth-card">
        <p style="font-size:20px;font-weight:700;margin-bottom:8px;">Регистрация</p>
        <p style="color:var(--ink-mute);font-size:14px;">Register screen — coming in Phase 1</p>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <a href="#/auth/login" class="btn btn--ghost btn--small">Войти</a>
          <a href="#/home" class="btn btn--primary btn--small">Home (stub)</a>
        </div>
      </div>
    </div>
  `;
}
