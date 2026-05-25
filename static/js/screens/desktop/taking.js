/**
 * screens/desktop/taking.js — Test-taking screen stub
 */
export default async function render(root, params) {
  root.innerHTML = `
    <div class="screen">
      <div class="page-header">
        <span class="page-header__title">Прохождение теста</span>
      </div>
      <div class="screen__body">
        <div class="card" style="max-width:600px;margin:0 auto;">
          <p style="font-size:18px;font-weight:600;margin-bottom:8px;">Тест: ${params?.id || '—'}</p>
          <p style="color:var(--ink-mute);font-size:14px;">Test taking — coming in Phase 3</p>
          <div style="margin-top:16px;">
            <a href="#/home" class="btn btn--ghost btn--small">← Back</a>
          </div>
        </div>
      </div>
    </div>
  `;
}
