/**
 * screens/desktop/import.js — Import .docx wizard (Phase 7)
 *
 * 3 steps:
 *   1. Upload   — drag-and-drop zone + title input + access level
 *   2. Review   — parsed question list with issue flags
 *   3. Confirm  — summary + "Open test" navigation
 */
import { uploadTestDocx } from '../../api/tests.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { mountAppShell } from '../../components/app-shell.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Module state ──────────────────────────────────────────────────────────────
let _root    = null;
let _step    = 1;          // 1 | 2 | 3
let _file    = null;       // File object
let _title   = '';
let _access  = 'private';
let _result  = null;       // { metadata, payload, logs } from API
let _uploading = false;

// ── Entry point ───────────────────────────────────────────────────────────────
export default async function render(root) {
  // Render inside the AppShell main slot — the wizard now lives next to
  // the rail/topbar instead of a bespoke header.
  _root   = mountAppShell(root);
  _step   = 1;
  _file   = null;
  _title  = '';
  _access = 'private';
  _result = null;
  _uploading = false;
  _mount();
}

// ── Step progress bar ─────────────────────────────────────────────────────────
//
// Uses the new .wizard-steps block defined in components.css — numbered
// circles connected by lines. The step name is localized via the
// `wizard.step.*` keys added in Phase 5 final.
function _stepBar() {
  const steps = [
    [1, t('wizard.step.upload')  || 'Файл'],
    [2, t('wizard.step.markers') || 'Маркеры'],
    [3, t('wizard.step.confirm') || 'Подтверждение'],
  ];
  return steps.map(function (entry, i) {
    const n = entry[0];
    const label = entry[1];
    const done   = n < _step;
    const active = n === _step;
    const dotClass = 'wizard-steps__dot' + (done ? ' is-done' : '') + (active ? ' is-active' : '');
    const labelClass = 'wizard-steps__label' + (active ? ' is-active' : '');
    const line = (i < steps.length - 1)
      ? '<span class="wizard-steps__line' + (done ? ' is-done' : '') + '"></span>'
      : '';
    const inner = done
      ? (iconEl('check', 10) ? iconEl('check', 10).outerHTML : '✓')
      : String(n);
    return ''
      + '<div class="wizard-steps__item">'
      +   '<div class="' + dotClass + '">' + inner + '</div>'
      +   '<span class="' + labelClass + '">' + esc(label) + '</span>'
      + '</div>'
      + line;
  }).join('');
}

// ── Mount ─────────────────────────────────────────────────────────────────────
function _mount() {
  if (!_root) return;

  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;';

  // Header — keep just the wizard step strip; the AppShell topbar
  // already provides app-level navigation.
  const hdr = document.createElement('div');
  hdr.style.cssText = `
    display:flex;align-items:center;justify-content:center;
    padding:16px var(--pad);border-bottom:1px solid var(--ink-soft);flex-shrink:0;`;
  hdr.innerHTML = `<div class="wizard-steps">${_stepBar()}</div>`;

  // Body — swap based on step
  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow-y:auto;display:flex;align-items:flex-start;justify-content:center;padding:32px var(--pad);';

  if (_step === 1) _buildStep1(body);
  if (_step === 2) _buildStep2(body);
  if (_step === 3) _buildStep3(body);

  screen.append(hdr, body);
  _root.innerHTML = '';
  _root.appendChild(screen);
}

// ── Step 1: Upload ─────────────────────────────────────────────────────────────
function _buildStep1(el) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;max-width:560px;display:flex;flex-direction:column;gap:20px;';

  // Drop zone
  const zone = document.createElement('div');
  zone.id = 'drop-zone';
  zone.style.cssText = `
    border:2px dashed var(--ink-mute);border-radius:var(--radius-lg);
    padding:48px 32px;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:12px;text-align:center;cursor:pointer;
    background:var(--ink-soft);transition:border-color 120ms ease,background 120ms ease;`;

  zone.innerHTML = `
    <div style="font-size:32px;">${iconEl('doc', 32)?.outerHTML || '📄'}</div>
    <div style="font:600 16px/1.3 Inter,sans-serif;color:var(--ink);">
      ${_file ? esc(_file.name) : (t('import.drop_hint') || 'Drag a .docx file here')}
    </div>
    <div style="font:400 13px/1 Inter,sans-serif;color:var(--ink-mute);">
      ${_file
        ? `${((_file.size) / 1024).toFixed(1)} KB · <span style="color:var(--accent);font-weight:600;">Change file</span>`
        : (t('import.or_browse') || 'or click to browse')}
    </div>
    <input id="file-input" type="file" accept=".docx" style="display:none;">`;

  // Drag-and-drop handlers
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.style.borderColor = 'var(--accent)';
    zone.style.background  = 'var(--accent-soft)';
  });
  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = 'var(--ink-mute)';
    zone.style.background  = 'var(--ink-soft)';
  });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = 'var(--ink-mute)';
    zone.style.background  = 'var(--ink-soft)';
    const f = e.dataTransfer?.files?.[0];
    if (f) _onFileChosen(f);
  });
  zone.addEventListener('click', () => wrap.querySelector('#file-input')?.click());
  wrap.querySelector?.('#file-input'); // ensure attached after innerHTML

  // Title input
  const titleRow = document.createElement('div');
  titleRow.innerHTML = `
    <label style="display:block;font:500 13px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:6px;">
      ${t('import.test_title') || 'Test title'} <span style="color:var(--ink-mute);font-weight:400;">(optional — inferred from filename)</span>
    </label>
    <input id="import-title" type="text" class="input" placeholder="${esc(_file ? _file.name.replace(/\.docx$/i, '') : 'e.g. Anatomy midterm')}"
           value="${esc(_title)}" style="width:100%;">`;

  // Access level
  const accessRow = document.createElement('div');
  const ACCESS = [
    { id: 'private', label: t('access.private') || 'Private', desc: 'Only you' },
    { id: 'shared',  label: t('access.shared')  || 'Shared',  desc: 'Invited users' },
    { id: 'public',  label: t('access.public')  || 'Public',  desc: 'Everyone' },
  ];
  accessRow.innerHTML = `
    <label style="display:block;font:500 13px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:8px;">
      ${t('import.access_level') || 'Access level'}
    </label>
    <div style="display:flex;gap:8px;">
      ${ACCESS.map(a => `
        <button type="button" data-access="${a.id}" class="chip ${_access === a.id ? 'chip--active' : ''}">
          ${esc(a.label)}
        </button>`).join('')}
    </div>`;

  accessRow.querySelectorAll('[data-access]').forEach(btn => {
    btn.addEventListener('click', () => { _access = btn.dataset.access; _mount(); });
  });

  // Upload button
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;align-items:center;';
  btnRow.innerHTML = `
    <button id="upload-btn" type="button" class="btn btn--primary"
            ${!_file || _uploading ? 'disabled' : ''}>
      ${_uploading
        ? `<span>Uploading…</span>`
        : `${iconEl('doc', 14)?.outerHTML || ''}<span>${t('import.upload') || 'Upload & parse'}</span>`}
    </button>
    ${_uploading ? `<div class="skeleton" style="width:80px;height:12px;border-radius:6px;"></div>` : ''}`;

  wrap.append(zone, titleRow, accessRow, btnRow);
  el.appendChild(wrap);

  // Wire up after DOM insertion
  const fileInput = zone.querySelector('#file-input');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) _onFileChosen(f);
    });
  }

  wrap.querySelector('#import-title')?.addEventListener('input', e => {
    _title = e.target.value;
  });

  wrap.querySelector('#upload-btn')?.addEventListener('click', _doUpload);
}

function _onFileChosen(f) {
  if (!f.name.toLowerCase().endsWith('.docx')) {
    alert(t('import.only_docx') || 'Only .docx files are supported.');
    return;
  }
  _file = f;
  if (!_title) _title = f.name.replace(/\.docx$/i, '');
  _mount();
}

async function _doUpload() {
  if (!_file || _uploading) return;
  _uploading = true;
  _mount();

  try {
    const res = await uploadTestDocx(_file, {
      access_level: _access,
      title: _title || undefined,
    });
    _result = res;
    _step   = 2;
  } catch (e) {
    _uploading = false;
    _step      = 1;
    _mount();
    // Show error inline
    const err = _root?.querySelector?.('#upload-error');
    if (err) { err.textContent = e.message || (t('common.error') || 'Upload failed'); err.style.display = 'block'; }
    else      { alert(e.message || (t('common.error') || 'Upload failed')); }
    return;
  }
  _uploading = false;
  _mount();
}

// ── Step 2: Review ─────────────────────────────────────────────────────────────
function _buildStep2(el) {
  if (!_result) { _step = 1; _mount(); return; }

  const { metadata, payload, logs } = _result;
  const questions = payload?.questions || [];
  const qCount    = metadata?.questionCount ?? questions.length;
  const testId    = metadata?.id;

  // Detect questions with issues
  const issues = _detectIssues(questions, logs || []);
  const issueSet = new Set(issues.map(i => i.idx));

  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;max-width:760px;';

  // Summary bar
  const summaryBar = document.createElement('div');
  summaryBar.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;`;
  summaryBar.innerHTML = `
    <div>
      <span style="font:700 20px/1 Inter,sans-serif;color:var(--ink);">${esc(metadata?.title || _title || 'Untitled')}</span>
      <span style="font:400 14px/1 Inter,sans-serif;color:var(--ink-mute);margin-left:10px;">
        ${esc(String(qCount))} ${t('stats.questions') || 'questions'}
      </span>
    </div>
    ${issues.length
      ? `<span class="chip chip--active" style="font-size:12px;border-color:#c4554a;color:#c4554a;background:rgba(196,85,74,.10);">
           ⚠ ${esc(String(issues.length))} need attention
         </span>`
      : `<span class="chip chip--active" style="font-size:12px;">
           ✓ All good
         </span>`}`;

  // Question list
  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:60vh;overflow-y:auto;margin-bottom:16px;';

  const displayCount = Math.min(questions.length, 50);
  for (let i = 0; i < displayCount; i++) {
    const q = questions[i];
    const hasIssue = issueSet.has(i);
    const qIssues  = issues.filter(x => x.idx === i);
    const label    = _questionLabel(q, i);

    const item = document.createElement('div');
    item.style.cssText = `
      padding:12px 14px;border:1.5px solid ${hasIssue ? '#c4554a' : 'var(--ink-soft)'};
      border-radius:var(--radius-md);
      background:${hasIssue ? 'rgba(196,85,74,.05)' : 'var(--paper)'};`;
    item.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="color:${hasIssue ? '#c4554a' : 'var(--accent)'};">
          ${hasIssue ? (iconEl('x', 14)?.outerHTML || '⚠') : (iconEl('check', 14)?.outerHTML || '✓')}
        </span>
        <span style="font:600 13px/1 Inter,sans-serif;color:var(--ink);flex:1;
                     overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          #${i + 1} · ${esc(label)}
        </span>
        ${hasIssue ? `<span style="font:400 11px/1 Inter,sans-serif;color:#c4554a;">
          ${esc(qIssues.map(x => x.msg).join(', '))}
        </span>` : ''}
      </div>`;
    list.appendChild(item);
  }

  if (questions.length > displayCount) {
    const more = document.createElement('div');
    more.style.cssText = 'padding:8px 14px;font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);text-align:center;';
    more.textContent = `… ${questions.length - displayCount} more questions`;
    list.appendChild(more);
  }

  // Logs (collapsible)
  let logsSection = '';
  if (logs?.length) {
    logsSection = `
      <details style="margin-bottom:16px;">
        <summary style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);cursor:pointer;margin-bottom:6px;">
          Parser logs (${esc(String(logs.length))})
        </summary>
        <pre style="padding:12px;background:var(--ink-soft);border-radius:var(--radius-md);
                    font:400 11px/1.5 'JetBrains Mono',monospace;color:var(--ink);
                    overflow-x:auto;white-space:pre-wrap;word-break:break-word;max-height:200px;">
${esc(logs.join('\n'))}</pre>
      </details>`;
  }

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;align-items:center;padding-top:8px;border-top:var(--border);';
  btnRow.innerHTML = `
    <button id="review-back" type="button" class="btn btn--ghost" style="flex:1;">
      ${iconEl('chevL', 14)?.outerHTML || ''}<span>Back</span>
    </button>
    <button id="review-continue" type="button" class="btn btn--primary" style="flex:2;">
      <span>${t('import.continue') || 'Continue'} · ${esc(String(qCount))} q →</span>
    </button>`;

  wrap.innerHTML = logsSection;
  wrap.prepend(summaryBar, list);
  wrap.appendChild(btnRow);
  el.appendChild(wrap);

  wrap.querySelector('#review-back')?.addEventListener('click', () => {
    _step = 1; _result = null; _mount();
  });
  wrap.querySelector('#review-continue')?.addEventListener('click', () => {
    _step = 3; _mount();
  });
}

/** Extract a short text label from a question object */
function _questionLabel(q, idx) {
  // Try various shapes the backend might return
  const text = q?.question?.text
    || q?.text
    || _extractBlocksText(q?.question)
    || `Question ${idx + 1}`;
  return String(text).slice(0, 80);
}

function _extractBlocksText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  const blocks = content?.blocks || [];
  return blocks.flatMap(b =>
    (b?.inlines || []).map(inline => inline?.text || '').filter(Boolean)
  ).join(' ');
}

function _detectIssues(questions, logs) {
  const issues = [];

  questions.forEach((q, i) => {
    // Flag questions with no parseable text
    const label = _questionLabel(q, i);
    if (!label || label === `Question ${i + 1}`) {
      issues.push({ idx: i, msg: 'text not extracted' });
    }

    // Flag questions where the objects array has image entries (image might be missing)
    const objects = q?.objects || [];
    if (objects.some(o => o?.type === 'image' && !o?.src && !o?.id)) {
      issues.push({ idx: i, msg: 'image missing' });
    }

    // Flag questions with no correct answer
    const options = q?.options || [];
    if (options.length > 0 && !options.some(o => o?.isCorrect)) {
      issues.push({ idx: i, msg: 'no correct option' });
    }
  });

  // Also flag indices mentioned in logs with "error" or "warn"
  logs.forEach(log => {
    const match = String(log).match(/question\s*#?(\d+)/i);
    if (match) {
      const idx = parseInt(match[1]) - 1;
      if (idx >= 0 && idx < questions.length) {
        if (!issues.some(x => x.idx === idx)) {
          issues.push({ idx, msg: 'parser warning' });
        }
      }
    }
  });

  return issues;
}

// ── Step 3: Confirm ────────────────────────────────────────────────────────────
function _buildStep3(el) {
  if (!_result) { _step = 1; _mount(); return; }

  const { metadata, payload } = _result;
  const questions = payload?.questions || [];
  const qCount    = metadata?.questionCount ?? questions.length;
  const testId    = metadata?.id;
  const title     = metadata?.title || _title || 'Untitled';

  const ACCESS_LABELS = { private: 'Private', shared: 'Shared', public: 'Public' };

  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;max-width:480px;text-align:center;';
  wrap.innerHTML = `
    <div style="font-size:48px;margin-bottom:16px;">✅</div>
    <div style="font:700 24px/1.2 Inter,sans-serif;color:var(--ink);margin-bottom:8px;">
      ${t('import.success') || 'Import successful!'}
    </div>
    <div style="font:400 14px/1.5 Inter,sans-serif;color:var(--ink-mute);margin-bottom:28px;">
      ${esc(String(qCount))} ${t('import.questions_imported') || 'questions imported'}
    </div>

    <!-- Summary card -->
    <div style="border:var(--border);border-radius:var(--radius-md);padding:20px;
                background:var(--paper);box-shadow:var(--shadow-sm);
                text-align:left;margin-bottom:24px;">
      <div style="display:grid;grid-template-columns:120px 1fr;row-gap:12px;">
        <span style="font:500 12px/1 Inter,sans-serif;color:var(--ink-mute);">${t('import.test_title') || 'Title'}</span>
        <span style="font:600 14px/1.2 Inter,sans-serif;color:var(--ink);">${esc(title)}</span>

        <span style="font:500 12px/1 Inter,sans-serif;color:var(--ink-mute);">${t('common.questions') || 'Questions'}</span>
        <span style="font:600 14px/1 Inter,sans-serif;color:var(--ink);">${esc(String(qCount))}</span>

        <span style="font:500 12px/1 Inter,sans-serif;color:var(--ink-mute);">${t('import.access_level') || 'Access'}</span>
        <span class="chip chip--active" style="font-size:12px;width:fit-content;">
          ${esc(ACCESS_LABELS[_access] || _access)}
        </span>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;">
      ${testId
        ? `<button id="open-test-btn" type="button" class="btn btn--primary" style="width:100%;justify-content:center;">
             ${iconEl('chevR', 14)?.outerHTML || ''}
             <span>${t('import.open_test') || 'Open test'}</span>
           </button>`
        : `<a href="#/home" class="btn btn--primary" style="width:100%;justify-content:center;">
             <span>${t('common.done') || 'Done'}</span>
           </a>`}
      <button id="import-another-btn" type="button" class="btn btn--ghost" style="width:100%;justify-content:center;">
        <span>${t('import.import_another') || 'Import another'}</span>
      </button>
    </div>`;

  el.appendChild(wrap);

  wrap.querySelector('#open-test-btn')?.addEventListener('click', () => {
    navigate(`/test/${testId}`);
  });
  wrap.querySelector('#import-another-btn')?.addEventListener('click', () => {
    _step = 1; _file = null; _title = ''; _result = null; _mount();
  });
}
