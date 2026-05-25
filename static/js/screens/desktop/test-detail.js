/**
 * test-detail.js — desktop test detail screen stub
 */
export default async function render(root, params = {}) {
  root.innerHTML = `<div class="screen" style="padding: var(--pad)"><p style="color: var(--ink-fade); font-size: 14px">Test Detail (${escapeHtml(params.id)}) — coming soon</p></div>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
