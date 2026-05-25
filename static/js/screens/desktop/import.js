/**
 * screens/desktop/import.js — Import .docx screen stub
 */
export default async function render(root) {
  root.innerHTML = `
    <div class="screen">
      <div class="page-header">
        <span class="page-header__title">Импорт теста</span>
      </div>
      <div class="screen__body">
        <div class="card" style="max-width:480px;margin:0 auto;">
          <p style="font-size:18px;font-weight:600;margin-bottom:8px;">Импорт .docx</p>
          <p style="color:var(--ink-mute);font-size:14px;">Import wizard — coming in Phase 7</p>
          <div style="margin-top:16px;">
            <a href="#/home" class="btn btn--ghost btn--small">← Back</a>
          </div>
        </div>
      </div>
    </div>
  `;
}
