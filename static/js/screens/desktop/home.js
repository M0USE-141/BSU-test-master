/**
 * screens/desktop/home.js — Desktop home screen stub
 */
export default async function render(root, params) {
  const testId = params?.id ? ` (Test: ${params.id})` : '';
  root.innerHTML = `
    <div class="screen">
      <div class="page-header">
        <span class="page-header__title">TestMaster${testId}</span>
        <div class="page-header__actions">
          <a href="#/stats" class="btn btn--ghost btn--small">Stats</a>
          <a href="#/profile" class="btn btn--ghost btn--small">Profile</a>
        </div>
      </div>
      <div class="screen__body">
        <div class="card" style="max-width:480px;margin:0 auto;">
          <p style="font-size:18px;font-weight:600;margin-bottom:8px;">Главная</p>
          <p style="color:var(--ink-mute);font-size:14px;">Desktop home — coming in Phase 2</p>
          <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px;">
            <a href="#/auth/login" class="btn btn--ghost btn--small">Login</a>
            <a href="#/stats" class="btn btn--ghost btn--small">Stats</a>
            <a href="#/profile" class="btn btn--ghost btn--small">Profile</a>
            <a href="#/settings" class="btn btn--ghost btn--small">Settings</a>
            <a href="#/import" class="btn btn--primary btn--small">Import</a>
          </div>
        </div>
      </div>
    </div>
  `;
}
