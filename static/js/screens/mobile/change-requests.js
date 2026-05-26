/**
 * screens/mobile/change-requests.js — Mobile change requests
 * Route: /change-requests/:testId
 * Single-column list; tap a row → bottom drawer with diff + actions.
 */
import { listChangeRequests, approveChangeRequest, rejectChangeRequest } from '../../api/change-requests.js';
import { getTest } from '../../api/tests.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { getState } from '../../state.js';
import { buildBottomNav, buildTopBar, esc } from './_shell.js';

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
let _status = 'pending';

export default async function render(root, params = {}) {
  _root = root;
  _testId = params.testId;
  _status = 'pending';
  if (!_testId) { navigate('/home'); return; }

  root.innerHTML = `
    <div class="mob">
      <div class="mob__content">
        <div class="skeleton" style="height:36px;border-radius:var(--radius-pill);margin-bottom:12px;"></div>
        ${[1, 2, 3].map(() => `
          <div class="skeleton" style="height:68px;border-radius:var(--radius-md);margin-bottom:8px;"></div>`).join('')}
      </div>
    </div>`;

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
    console.error('[cr-mobile]', e);
  }

  _mount();
}

async function _reload() {
  try {
    const data = await listChangeRequests(_testId, { status: _status });
    _crs = data?.change_requests || data?.items || data || [];
  } catch {}
  _mount();
}

function _mount() {
  if (!_root) return;
  const isOwner = !!(_test?.is_owner ?? (getState().user?.id === _test?.owner_id));

  const screen = document.createElement('div');
  screen.className = 'mob';

  screen.appendChild(buildTopBar({
    title: t('cr.title') || 'Change Requests',
    back: true,
    backHref: `#/test/${_testId}`,
  }));

  const content = document.createElement('div');
  content.className = 'mob__content';

  // ── Status tabs ─────────────────────────────────────────────
  const tabs = document.createElement('div');
  tabs.className = 'mob-segment';
  tabs.style.marginBottom = '12px';
  tabs.innerHTML = ['pending', 'approved', 'rejected'].map(s => `
    <div class="mob-segment__item ${_status === s ? 'mob-segment__item--active' : ''}" data-status="${s}">
      ${esc(s.charAt(0).toUpperCase() + s.slice(1))}
    </div>`).join('');
  tabs.addEventListener('click', e => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    _status = btn.dataset.status;
    _reload();
  });
  content.appendChild(tabs);

  // ── List ─────────────────────────────────────────────────────
  if (!_crs.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:56px 16px;color:var(--ink-mute);';
    empty.innerHTML = `
      <div style="margin-bottom:10px;">${iconEl('doc', 32)?.outerHTML || ''}</div>
      <div style="font:500 14px/1.5 Inter,sans-serif;">No ${esc(_status)} requests</div>`;
    content.appendChild(empty);
  } else {
    _crs.forEach(cr => {
      const card = document.createElement('div');
      card.className = 'mob-test-card';
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <div class="mob-test-card__body">
          <div class="mob-test-card__title">
            ${esc(cr.author_username || cr.proposer_username || 'user')}
          </div>
          <div class="mob-test-card__meta">
            ${esc(cr.message || cr.description || cr.type || 'Change proposal')}
            · ${esc(fmtAgo(cr.created_at))}
          </div>
        </div>
        <div class="mob-test-card__score">
          ${iconEl('chevR', 14)?.outerHTML || '›'}
        </div>`;
      card.addEventListener('click', () => _openDrawer(cr, isOwner));
      content.appendChild(card);
    });
  }

  screen.appendChild(content);
  screen.appendChild(buildBottomNav());

  _root.innerHTML = '';
  _root.appendChild(screen);
}

function _openDrawer(cr, isOwner) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;' +
    'display:flex;align-items:flex-end;';

  const drawer = document.createElement('div');
  drawer.style.cssText =
    'background:var(--surface);border-radius:var(--radius-lg) var(--radius-lg) 0 0;' +
    'width:100%;max-height:82vh;overflow-y:auto;' +
    'padding:16px var(--pad) calc(var(--pad) + env(safe-area-inset-bottom));';

  const crType = cr.type || 'edit';
  const payload = cr.payload || {};

  drawer.innerHTML = `
    <div style="width:36px;height:4px;background:var(--ink-soft);border-radius:2px;
                margin:0 auto 16px;flex-shrink:0;"></div>

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
      <div>
        <div style="font:400 11px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:4px;">
          ${esc(cr.author_username || cr.proposer_username || 'user')}
          · ${esc(fmtAgo(cr.created_at))}
        </div>
        <div style="font:700 17px/1.2 Inter,sans-serif;color:var(--ink);">
          ${esc(crType.charAt(0).toUpperCase() + crType.slice(1).replace(/_/g, ' '))}
        </div>
      </div>
      <button class="btn btn--ghost btn--icon btn--small" id="cr-close"
              aria-label="${t('common.close') || 'Close'}">
        ${iconEl('x', 16)?.outerHTML || '×'}
      </button>
    </div>

    ${cr.message ? `
    <div style="margin-bottom:14px;">
      <div style="font:600 11px/1 Inter,sans-serif;color:var(--ink-mute);
                  text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">
        ${t('cr.note') || 'Note'}
      </div>
      <div style="padding:10px 12px;background:var(--ink-soft);border-radius:var(--radius-md);
                  font:400 13px/1.5 Inter,sans-serif;color:var(--ink);">
        ${esc(cr.message)}
      </div>
    </div>` : ''}

    <div style="font:600 11px/1 Inter,sans-serif;color:var(--ink-mute);
                text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">
      ${t('cr.proposedChanges') || 'Proposed changes'}
    </div>
    ${_buildDiff(payload)}

    ${isOwner && _status === 'pending' ? `
    <div style="display:flex;gap:10px;margin-top:20px;" id="cr-actions">
      <button type="button" id="cr-reject" class="btn btn--ghost"
              style="flex:1;justify-content:center;gap:6px;color:#c4554a;border-color:#c4554a;">
        ${iconEl('x', 14)?.outerHTML || ''}
        ${t('cr.reject') || 'Reject'}
      </button>
      <button type="button" id="cr-approve" class="btn btn--primary"
              style="flex:1;justify-content:center;gap:6px;">
        ${iconEl('check', 14)?.outerHTML || ''}
        ${t('cr.approve') || 'Approve'}
      </button>
    </div>` : ''}
  `;

  const close = () => backdrop.remove();
  drawer.querySelector('#cr-close')?.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  drawer.querySelector('#cr-approve')?.addEventListener('click', async () => {
    const btn = drawer.querySelector('#cr-approve');
    btn.disabled = true;
    try {
      await approveChangeRequest(_testId, cr.id);
      close();
      _reload();
    } catch (e) {
      console.error('[CR] approve:', e);
      btn.disabled = false;
    }
  });

  drawer.querySelector('#cr-reject')?.addEventListener('click', async () => {
    const btn = drawer.querySelector('#cr-reject');
    btn.disabled = true;
    try {
      await rejectChangeRequest(_testId, cr.id);
      close();
      _reload();
    } catch (e) {
      console.error('[CR] reject:', e);
      btn.disabled = false;
    }
  });

  backdrop.appendChild(drawer);
  document.body.appendChild(backdrop);
}

function _buildDiff(payload) {
  if (!payload || !Object.keys(payload).length) {
    return `<div style="color:var(--ink-mute);font:400 13px/1 Inter,sans-serif;">No diff data.</div>`;
  }
  return Object.entries(payload).map(([key, val]) => {
    const label = key.replace(/_/g, ' ');
    const isBefore = typeof val === 'object' && val !== null &&
      ('before' in val || 'after' in val || 'old' in val || 'new' in val);

    if (isBefore) {
      const before = val.before ?? val.old ?? '';
      const after  = val.after  ?? val.new ?? '';
      return `
        <div style="margin-bottom:12px;">
          <div style="font:600 11px/1 Inter,sans-serif;color:var(--ink-mute);
                      text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">
            ${esc(label)}
          </div>
          <div style="padding:8px 10px;border:var(--border);border-radius:var(--radius-md);
                      font:400 13px/1.4 Inter,sans-serif;color:var(--ink-fade);
                      text-decoration:line-through;margin-bottom:4px;">
            ${esc(String(before))}
          </div>
          <div style="padding:8px 10px;border:1.5px solid var(--accent);border-radius:var(--radius-md);
                      font:400 13px/1.4 Inter,sans-serif;color:var(--ink);
                      background:var(--accent-soft);">
            ${esc(String(after))}
          </div>
        </div>`;
    }

    return `
      <div style="margin-bottom:10px;">
        <div style="font:600 11px/1 Inter,sans-serif;color:var(--ink-mute);
                    text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">
          ${esc(label)}
        </div>
        <div style="padding:8px 10px;border:var(--border);border-radius:var(--radius-md);
                    font:400 13px/1.4 Inter,sans-serif;color:var(--ink);">
          ${esc(typeof val === 'string' ? val : JSON.stringify(val))}
        </div>
      </div>`;
  }).join('');
}
