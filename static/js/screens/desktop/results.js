/**
 * screens/desktop/results.js — Test results screen stub
 */
export default async function render(root, params) {
  root.innerHTML = `
    <div class="screen">
      <div class="page-header">
        <span class="page-header__title">Результаты</span>
      </div>
      <div class="screen__body">
        <div class="card" style="max-width:600px;margin:0 auto;">
          <p style="font-size:18px;font-weight:600;margin-bottom:8px;">Результаты</p>
          <p style="color:var(--ink-mute);font-size:14px;">
            Test: ${params?.id || '—'} / Attempt: ${params?.attemptId || '—'}
          </p>
          <p style="color:var(--ink-mute);font-size:14px;margin-top:4px;">Results screen — coming in Phase 3</p>
          <div style="margin-top:16px;">
            <a href="#/home" class="btn btn--ghost btn--small">← Back</a>
          </div>
        </div>
      </div>
    </div>
  `;
}
