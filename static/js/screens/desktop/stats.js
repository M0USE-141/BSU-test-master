/**
 * screens/desktop/stats.js — Statistics screen stub
 */
export default async function render(root) {
  root.innerHTML = `
    <div class="screen">
      <div class="page-header">
        <span class="page-header__title">Статистика</span>
      </div>
      <div class="screen__body">
        <div class="card" style="max-width:480px;margin:0 auto;">
          <p style="font-size:18px;font-weight:600;margin-bottom:8px;">Статистика</p>
          <p style="color:var(--ink-mute);font-size:14px;">Statistics screen — coming in Phase 4</p>
          <div style="margin-top:16px;">
            <a href="#/home" class="btn btn--ghost btn--small">← Back</a>
          </div>
        </div>
      </div>
    </div>
  `;
}
