/**
 * screens/desktop/change-requests.js — Change-requests review (Phase 6)
 * 2-pane: left list | right diff + approve/reject
 * Route: /change-requests/:testId
 */
import { listChangeRequests, approveChangeRequest, rejectChangeRequest } from '../../api/change-requests.js';
import { getTest } from '../../api/tests.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { getState } from '../../state.js';
import { escHtml as esc } from '../../utils/escape.js';

function fmtAgo(iso) {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 60) return min + 'm ago';
    const h = Math.floor(min / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  } catch { return ''; }
}

let _root = null;
let _testId = null;
let _test = null;
let _crs = [];
let _status = 'pending'; // 'pending' | 'approved' | 'rejected'
let _selectedIdx = 0;

export default async function render(root, params = {}) {
  _root = root;
  _testId = params.testId;
  if (!_testId) { navigate('/home'); return; }

  // Skeleton
  root.innerHTML = `
    <div class="screen" style="align-items:center;justify-content:center;">
      <div class="skeleton" style="width:180px;height:16px;border-radius:8px;"></div>
    </div>`;

  // Load
  try {
    const [testRes, crRes] = await Promise.allSettled([
      getTest(_testId),
      listChangeRequests(_testId, { status: _status }),
    ]);
    if (testRes.status === 'fulfilled') _test = testRes.value;
    if (crRes.status === 'fulfilled') {
      _crs = crRes.value?.change_requests || crRes.value?.items || crRes.value || [];
    }
  } catch (e) {
    console.error('[change-requests]', e);
  }

  _selectedIdx = 0;
  _mount();
}

async function _reload() {
  try {
    const data = await listChangeRequests(_testId, { status: _status });
    _crs = data?.change_requests || data?.items || data || [];
  } catch {}
  _selectedIdx = 0;
  _mount();
}

function _mount() {
  if (!_root) return;
  // Prefer API-provided is_owner flag; fall back to ID comparison for safety
  const isOwner = !!(_test?.is_owner ?? (getState().user?.id === _test?.owner_id));
  const sel = _crs[_selectedIdx] || null;

  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;';

  // ── Header ──────────────────────────────────────────────────
  const header = document.createElement('div');
  header.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;
    padding:12px var(--pad);border-bottom:var(--border);flex-shrink:0;`;
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <a href="#/home" class="btn btn--ghost btn--small" style="display:flex;align-items:center;gap:4px;">
        ${iconEl('chevL', 16)?.outerHTML || '←'}
      </a>
      <span style="font:700 18px/1 Inter,sans-serif;color:var(--ink);">
        ${t('test.change_requests') || 'Change requests'}
      </span>
      ${_crs.length && _status === 'pending'
        ? `<span class="chip chip--active" style="font-size:12px;">${esc(String(_crs.length))} pending</span>`
        : ''}
    </div>
    <div style="display:flex;gap:6px;" id="cr-status-tabs">
      ${['pending','approved','rejected'].map(s => `
        <button type="button" data-status="${s}"
                class="chip ${_status === s ? 'chip--active' : ''}">
          ${esc(s.charAt(0).toUpperCase() + s.slice(1))}
        </button>`).join('')}
    </div>`;

  header.querySelectorAll('[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      _status = btn.dataset.status;
      _reload();
    });
  });

  // ── Body ─────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex:1;min-height:0;';

  // Left list
  const list = document.createElement('div');
  list.style.cssText = 'width:300px;flex-shrink:0;border-right:var(--border);overflow-y:auto;';

  if (!_crs.length) {
    list.innerHTML = `
      <div style="padding:32px 16px;text-align:center;color:var(--ink-mute);">
        <div style="margin-bottom:8px;">${iconEl('doc', 28)?.outerHTML || '📄'}</div>
        <div style="font:500 14px/1.5 Inter,sans-serif;">
          No ${esc(_status)} change requests
        </div>
      </div>`;
  } else {
    _crs.forEach((cr, i) => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding:12px 16px;border-bottom:1px solid var(--ink-soft);cursor:pointer;
        transition:background 100ms ease;
        background:${i === _selectedIdx ? 'var(--accent-soft)' : 'transparent'};
        border-left:4px solid ${i === _selectedIdx ? 'var(--accent)' : 'transparent'};`;
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font:${i === _selectedIdx ? 700 : 500} 13px/1 Inter,sans-serif;color:var(--ink);">
            ${esc(cr.author_username || cr.proposer_username || 'user')}
          </span>
          <span style="font:400 11px/1 Inter,sans-serif;color:var(--ink-mute);">
            ${esc(fmtAgo(cr.created_at))}
          </span>
        </div>
        <div style="font:400 12px/1.3 Inter,sans-serif;color:var(--ink-mute);
                    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${esc(cr.message || cr.description || cr.type || 'Change proposal')}
        </div>`;
      item.addEventListener('click', () => { _selectedIdx = i; _mount(); });
      list.appendChild(item);
    });
  }

  // Right panel
  const panel = document.createElement('div');
  panel.style.cssText = 'flex:1;overflow-y:auto;padding:var(--pad);';

  if (!sel) {
    panel.innerHTML = `
      <div style="height:100%;display:flex;align-items:center;justify-content:center;
                  flex-direction:column;gap:8px;color:var(--ink-mute);">
        <div>${iconEl('doc', 36)?.outerHTML || '📄'}</div>
        <div style="font:500 14px/1 Inter,sans-serif;">
          ${_crs.length ? 'Select a request from the left' : 'No change requests'}
        </div>
      </div>`;
  } else {
    const payload = sel.payload || {};
    const crType = sel.type || 'edit';

    panel.innerHTML = `
      <!-- Meta + actions -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
        <div>
          <div style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:4px;">
            Proposed by
            <b style="color:var(--ink);">${esc(sel.author_username || sel.proposer_username || 'user')}</b>
            · ${esc(fmtAgo(sel.created_at))}
          </div>
          <div style="font:700 20px/1.2 Inter,sans-serif;color:var(--ink);">
            ${esc(crType.charAt(0).toUpperCase() + crType.slice(1).replace(/_/g, ' '))}
          </div>
        </div>
        ${isOwner && _status === 'pending' ? `
        <div style="display:flex;gap:8px;" id="cr-actions">
          <button type="button" id="cr-reject" class="btn btn--ghost btn--small"
                  style="color:#c4554a;border-color:#c4554a;">
            ${iconEl('x', 14)?.outerHTML || ''}
            <span>Reject</span>
          </button>
          <button type="button" id="cr-approve" class="btn btn--primary btn--small">
            ${iconEl('check', 14)?.outerHTML || ''}
            <span>Approve</span>
          </button>
        </div>` : ''}
      </div>

      <!-- Reviewer note / message -->
      ${sel.message ? `
      <div style="margin-bottom:16px;">
        <div style="font:600 12px/1 Inter,sans-serif;color:var(--ink-mute);
                    text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">
          Note
        </div>
        <div style="padding:12px;background:var(--ink-soft);border-radius:var(--radius-md);
                    font:400 13px/1.5 Inter,sans-serif;color:var(--ink);">
          ${esc(sel.message)}
        </div>
      </div>` : ''}

      <!-- Payload diff -->
      <div style="font:600 12px/1 Inter,sans-serif;color:var(--ink-mute);
                  text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">
        Proposed changes
      </div>
      ${_buildDiff(payload)}

      <!-- Raw payload (collapsed) -->
      <details style="margin-top:16px;">
        <summary style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);cursor:pointer;">
          Raw payload
        </summary>
        <pre style="margin-top:8px;padding:12px;background:var(--ink-soft);border-radius:var(--radius-md);
                    font:400 11px/1.5 'JetBrains Mono',monospace;color:var(--ink);overflow-x:auto;
                    white-space:pre-wrap;word-break:break-word;">${esc(JSON.stringify(sel.payload || sel, null, 2))}</pre>
      </details>
    `;

    // Actions
    panel.querySelector('#cr-approve')?.addEventListener('click', async () => {
      const btn = panel.querySelector('#cr-approve');
      btn.disabled = true;
      try {
        await approveChangeRequest(_testId, sel.id);
        _reload();
      } catch (e) {
        console.error('[CR] approve:', e);
        btn.disabled = false;
      }
    });

    panel.querySelector('#cr-reject')?.addEventListener('click', async () => {
      const btn = panel.querySelector('#cr-reject');
      btn.disabled = true;
      try {
        await rejectChangeRequest(_testId, sel.id);
        _reload();
      } catch (e) {
        console.error('[CR] reject:', e);
        btn.disabled = false;
      }
    });
  }

  body.append(list, panel);
  screen.append(header, body);

  _root.innerHTML = '';
  _root.appendChild(screen);
}

function _buildDiff(payload) {
  if (!payload || !Object.keys(payload).length) {
    return `<div style="color:var(--ink-mute);font:400 13px/1 Inter,sans-serif;">No diff data available.</div>`;
  }

  const fields = Object.entries(payload);
  return fields.map(([key, val]) => {
    const label = key.replace(/_/g, ' ');
    const isString = typeof val === 'string';
    const isBefore = typeof val === 'object' && val !== null && ('before' in val || 'after' in val || 'old' in val || 'new' in val);

    if (isBefore) {
      const before = val.before ?? val.old ?? '';
      const after  = val.after  ?? val.new ?? '';
      return `
        <div style="margin-bottom:12px;">
          <div style="font:600 11px/1 Inter,sans-serif;color:var(--ink-mute);
                      text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">
            ${esc(label)}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div style="padding:12px;border:var(--border);border-radius:var(--radius-md);">
              <div style="font:600 11px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:6px;">— current</div>
              <div style="font:500 14px/1.4 Inter,sans-serif;color:var(--ink-fade);
                          text-decoration:line-through;">${esc(String(before))}</div>
            </div>
            <div style="padding:12px;border:1.5px solid var(--accent);border-radius:var(--radius-md);
                        background:var(--accent-soft);">
              <div style="font:600 11px/1 Inter,sans-serif;color:var(--accent);margin-bottom:6px;">+ proposed</div>
              <div style="font:500 14px/1.4 Inter,sans-serif;color:var(--ink);">${esc(String(after))}</div>
            </div>
          </div>
        </div>`;
    }

    return `
      <div style="margin-bottom:10px;">
        <div style="font:600 11px/1 Inter,sans-serif;color:var(--ink-mute);
                    text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">
          ${esc(label)}
        </div>
        <div style="padding:10px 12px;border:var(--border);border-radius:var(--radius-md);
                    font:400 13px/1.4 Inter,sans-serif;color:var(--ink);">
          ${esc(isString ? val : JSON.stringify(val))}
        </div>
      </div>`;
  }).join('');
}
