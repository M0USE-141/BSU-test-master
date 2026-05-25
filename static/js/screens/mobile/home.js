/**
 * screens/mobile/home.js — Mobile home screen stub
 */
export default async function render(root) {
  root.innerHTML = `
    <div class="screen">
      <div class="page-header">
        <span class="page-header__title">TestMaster</span>
      </div>
      <div class="screen__body">
        <div class="card">
          <p style="font-size:18px;font-weight:600;margin-bottom:8px;">Mobile Home</p>
          <p style="color:var(--ink-mute);font-size:14px;">Mobile screens — coming in Phase 5</p>
          <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
            <a href="#/auth/login" class="btn btn--ghost btn--small">Login</a>
            <a href="#/settings" class="btn btn--ghost btn--small">Settings</a>
          </div>
        </div>
      </div>
    </div>
  `;
}
