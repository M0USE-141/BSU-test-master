/**
 * screens/desktop/import.js — Import .docx wizard (Phase 7)
 *
 * 3 steps:
 *   1. Upload   — drag-and-drop zone + title input + access level
 *   2. Review   — parsed question list with issue flags
 *   3. Confirm  — summary + "Open test" navigation
 */
import { uploadTestDocx, uploadTestDocxWithProgress, createTest, deleteTest } from '../../api/tests.js';
import { updateTestAccess } from '../../api/access.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { mountAppShell } from '../../components/app-shell.js';
import { renderContent, typesetMath, attachAssets } from '../../utils/render-blocks.js';

// Mirror of api/config.py::MAX_DOCX_UPLOAD_BYTES. Pre-flight check so
// the user gets feedback without uploading megabytes only to see a 413.
// Server is still authoritative; this is just UX.
const MAX_DOCX_UPLOAD_BYTES = 50 * 1024 * 1024;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Module state ──────────────────────────────────────────────────────────────
let _root    = null;
let _step    = 1;          // 1: file/form | 2: live progress | 3: full preview | 4: done
let _file    = null;       // File object
let _title   = '';
let _description = '';
let _access  = 'private';
let _marker  = '';         // optional symbol/text marking correct answers in docx
let _result  = null;       // { metadata, payload, logs } from API
let _uploading = false;
let _uploadPct = 0;        // Step2 upload-bytes %
let _extractStart = 0;     // ms timestamp when bytes finished uploading
let _extractTick  = null;  // interval id for spinning the extraction phase
let _mode = 'import';      // 'import' | 'create' — top toggle on the wizard

// ── Entry point ───────────────────────────────────────────────────────────────
export default async function render(root, params = {}) {
  _root   = mountAppShell(root);
  _step   = 1;
  _file   = null;
  _title  = '';
  _description = '';
  _access = 'private';
  _marker = '';
  _result = null;
  _uploading = false;
  _uploadPct = 0;
  _mode = params.mode === 'create' ? 'create' : 'import';
  _mount();
}

// ── Step progress bar ─────────────────────────────────────────────────────────
//
// Uses the new .wizard-steps block defined in components.css — numbered
// circles connected by lines. The step name is localized via the
// `wizard.step.*` keys added in Phase 5 final.
function _stepBar() {
  const steps = _mode === 'create'
    ? [
        [1, t('wizard.create.step1') || 'Описание'],
        [2, t('wizard.step.confirm') || 'Готово'],
      ]
    : [
        [1, t('wizard.step.upload')   || 'Файл'],
        [2, t('wizard.step.progress') || 'Загрузка'],
        [3, t('wizard.step.preview')  || 'Превью'],
        [4, t('wizard.step.confirm')  || 'Готово'],
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

  // Header — mode toggle + wizard step strip.
  const hdr = document.createElement('div');
  hdr.style.cssText = `
    display:flex;flex-direction:column;gap:14px;align-items:center;
    padding:14px var(--pad) 14px;border-bottom:1px solid var(--ink-soft);flex-shrink:0;`;
  // Only show the mode toggle on step 1 so users don't accidentally
  // wipe progress mid-flow.
  if (_step === 1) {
    const toggle = document.createElement('div');
    toggle.style.cssText = 'display:flex;gap:4px;padding:2px;background:var(--ink-soft);border-radius:999px;';
    [['import', t('wizard.mode.import') || 'Импорт .docx'],
     ['create', t('wizard.mode.create') || 'Пустая коллекция']]
      .forEach(([key, label]) => {
        const b = document.createElement('button');
        b.type = 'button';
        Object.assign(b.style, {
          padding: '6px 14px', borderRadius: '999px',
          border: 'none', cursor: 'pointer',
          font: '500 13px Inter,sans-serif',
          background: _mode === key ? 'var(--paper)' : 'transparent',
          color: _mode === key ? 'var(--ink)' : 'var(--ink-mute)',
          boxShadow: _mode === key ? 'var(--shadow-sm)' : 'none',
        });
        b.textContent = label;
        b.addEventListener('click', () => {
          if (_mode === key) return;
          _mode = key;
          _step = 1;
          _file = null;
          _result = null;
          _mount();
        });
        toggle.appendChild(b);
      });
    hdr.appendChild(toggle);
  }
  const stepStrip = document.createElement('div');
  stepStrip.className = 'wizard-steps';
  stepStrip.innerHTML = _stepBar();
  hdr.appendChild(stepStrip);

  // Body — swap based on mode + step.
  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow-y:auto;display:flex;align-items:flex-start;justify-content:center;padding:32px var(--pad);';

  if (_mode === 'import') {
    if (_step === 1) _buildStep1(body);
    if (_step === 2) _buildStep2Progress(body);
    if (_step === 3) _buildStep3Preview(body);
    if (_step === 4) _buildStep4Done(body);
  } else {
    // Create flow: 2 steps (form → success). Step 2 reuses the import
    // success card.
    if (_step === 1) _buildCreateStep1(body);
    if (_step === 2) _buildStep4Done(body);
  }

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
      ${t('import.test_title') || 'Test title'} <span style="color:var(--ink-mute);font-weight:400;">${t('import.test_title.hint') || '(optional — inferred from filename)'}</span>
    </label>
    <input id="import-title" type="text" class="input" placeholder="${esc(_file ? _file.name.replace(/\.docx$/i, '') : (t('import.test_title.placeholder') || 'e.g. Anatomy midterm'))}"
           value="${esc(_title)}" style="width:100%;">`;

  // Description input (optional)
  const descRow = document.createElement('div');
  descRow.innerHTML = `
    <label style="display:block;font:500 13px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:6px;">
      ${t('import.test_description') || 'Description'} <span style="color:var(--ink-mute);font-weight:400;">${t('common.optional') || '(optional)'}</span>
    </label>
    <textarea id="import-description" class="input" rows="3"
              placeholder="${esc(t('import.test_description.placeholder') || 'Short description shown on the test card')}"
              style="width:100%;resize:vertical;min-height:64px;">${esc(_description)}</textarea>`;

  // Marker — optional symbol the docx uses to mark the correct answer.
  // Backend defaults to "*" if empty (handles every docx we've seen);
  // exposing it lets users handle non-standard markers like ✓ or +.
  const markerRow = document.createElement('div');
  markerRow.innerHTML = `
    <label style="display:block;font:500 13px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:6px;">
      ${t('import.marker') || 'Маркер правильного ответа'}
      <span style="color:var(--ink-mute);font-weight:400;">${t('common.optional') || '(optional)'}</span>
    </label>
    <input id="import-marker" type="text" class="input"
           value="${esc(_marker)}"
           maxlength="32"
           placeholder="${esc(t('import.marker.placeholder') || 'по умолчанию: *')}"
           style="font-family:'JetBrains Mono',monospace;max-width:280px;">
    <div style="font:400 11px/1.5 Inter,sans-serif;color:var(--ink-tertiary);margin-top:6px;">
      ${esc(t('import.marker.hint') || 'Символ или текст, который стоит перед правильным ответом в .docx. Например * или ✓.')}
    </div>`;

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

  // Upload button — clicking advances to Step 2 (progress).
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;align-items:center;';
  btnRow.innerHTML = `
    <button id="upload-btn" type="button" class="btn btn--primary"
            ${!_file ? 'disabled' : ''}>
      ${iconEl('doc', 14)?.outerHTML || ''}<span>${t('import.upload') || 'Загрузить и распознать'}</span>
    </button>`;

  wrap.append(zone, titleRow, descRow, markerRow, accessRow, btnRow);
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

  wrap.querySelector('#import-description')?.addEventListener('input', e => {
    _description = e.target.value;
  });

  wrap.querySelector('#import-marker')?.addEventListener('input', e => {
    _marker = e.target.value;
  });

  wrap.querySelector('#upload-btn')?.addEventListener('click', _doUpload);
}

function _onFileChosen(f) {
  if (!f.name.toLowerCase().endsWith('.docx')) {
    alert(t('import.only_docx') || 'Only .docx files are supported.');
    return;
  }
  if (f.size > MAX_DOCX_UPLOAD_BYTES) {
    const limitMB = Math.floor(MAX_DOCX_UPLOAD_BYTES / (1024 * 1024));
    const sizeMB  = (f.size / (1024 * 1024)).toFixed(1);
    alert(
      (t('import.file_too_large') || 'File is too large')
      + `: ${sizeMB} MB / ${limitMB} MB`
    );
    return;
  }
  _file = f;
  if (!_title) _title = f.name.replace(/\.docx$/i, '');
  _mount();
}

async function _doUpload() {
  if (!_file || _uploading) return;
  _uploading = true;
  _uploadPct = 0;
  _extractStart = 0;
  _step = 2;
  _mount();

  try {
    const res = await uploadTestDocxWithProgress(_file, {
      access_level: _access,
      title: _title || undefined,
      description: _description || undefined,
      symbol: _marker.trim() || undefined,
    }, {
      onUploadProgress: (pct) => {
        _uploadPct = pct;
        const bar = document.getElementById('imp-up-bar');
        const lbl = document.getElementById('imp-up-pct');
        if (bar) bar.style.width = pct + '%';
        if (lbl) lbl.textContent = pct + '%';
      },
      onUploadComplete: () => {
        _extractStart = Date.now();
        const tickEl = document.getElementById('imp-ex-elapsed');
        if (_extractTick) clearInterval(_extractTick);
        _extractTick = setInterval(() => {
          if (!tickEl) return;
          tickEl.textContent = ((Date.now() - _extractStart) / 1000).toFixed(1) + 's';
        }, 100);
        const u = document.getElementById('imp-upload-phase');
        const e = document.getElementById('imp-extract-phase');
        if (u) u.classList.add('done');
        if (e) e.classList.add('active');
      },
    });
    if (_extractTick) { clearInterval(_extractTick); _extractTick = null; }
    _result = res;
    _step   = 3;
  } catch (e) {
    if (_extractTick) { clearInterval(_extractTick); _extractTick = null; }
    _uploading = false;
    _step      = 1;
    _mount();
    const code = e?.payload?.code;
    let msg;
    if (code === 'test_limit_reached') {
      msg = t('errors.test_limit_reached') || e.message || 'Test limit reached';
    } else if (code === 'file_too_large') {
      msg = t('errors.file_too_large') || e.message || 'File too large';
    } else {
      msg = e.message || t('common.error') || 'Upload failed';
    }
    const err = _root?.querySelector?.('#upload-error');
    if (err) { err.textContent = msg; err.style.display = 'block'; }
    else      { alert(msg); }
    return;
  }
  _uploading = false;
  _mount();
}

// ── Step 2: Live progress ─────────────────────────────────────────────────────
function _buildStep2Progress(el) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;max-width:560px;display:flex;flex-direction:column;gap:18px;';

  const title = document.createElement('h2');
  title.style.cssText = 'font:700 22px/1.2 Inter,sans-serif;color:var(--ink);margin:0;';
  title.textContent = _file?.name || 'Загрузка';
  wrap.appendChild(title);

  // Phase 1 — upload bytes.
  const phase1 = document.createElement('div');
  phase1.id = 'imp-upload-phase';
  phase1.style.cssText = 'border:1.5px solid var(--ink-soft);border-radius:var(--radius-md);padding:14px;background:var(--paper);';
  phase1.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font:600 13px/1 Inter,sans-serif;">1. Загрузка файла</span>
      <span id="imp-up-pct" style="font:500 13px/1 'JetBrains Mono',monospace;color:var(--accent);">${esc(String(_uploadPct))}%</span>
    </div>
    <div style="height:8px;border-radius:4px;background:var(--ink-soft);overflow:hidden;">
      <div id="imp-up-bar" style="height:100%;width:${esc(String(_uploadPct))}%;background:var(--accent);transition:width 120ms ease;"></div>
    </div>`;
  wrap.appendChild(phase1);

  // Phase 2 — extraction.
  const phase2 = document.createElement('div');
  phase2.id = 'imp-extract-phase';
  phase2.style.cssText = 'border:1.5px solid var(--ink-soft);border-radius:var(--radius-md);padding:14px;background:var(--paper);';
  phase2.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font:600 13px/1 Inter,sans-serif;">2. Извлечение вопросов</span>
      <span id="imp-ex-elapsed" style="font:500 13px/1 'JetBrains Mono',monospace;color:var(--ink-mute);">0.0s</span>
    </div>
    <div style="display:flex;gap:6px;align-items:center;font:400 12px/1.4 Inter,sans-serif;color:var(--ink-mute);">
      <span class="skeleton" style="width:10px;height:10px;border-radius:50%;"></span>
      <span>Парсинг таблиц, картинок, формул…</span>
    </div>`;
  wrap.appendChild(phase2);

  // Log strip (placeholder — server logs come back at the end with the
  // response payload; we surface them in Step 3 preview).
  const note = document.createElement('div');
  note.style.cssText = 'font:400 12px/1.5 Inter,sans-serif;color:var(--ink-mute);';
  note.textContent = 'Поток лога появится в превью после извлечения. Не закрывайте вкладку.';
  wrap.appendChild(note);

  el.appendChild(wrap);

  // Re-apply active state on phase 1 if upload is still going.
  if (_uploadPct < 100) phase1.classList.add('active');
}

// ── Step 3: Full preview ──────────────────────────────────────────────────────
function _buildStep3Preview(el) {
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

  // Full question preview — every question, all options, with proper
  // rich-content rendering (text + images + MathML/LaTeX formulas).
  const assetsBase = payload?.assetsBaseUrl || (testId ? `/api/tests/${testId}/assets` : '');
  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:10px;max-height:64vh;overflow-y:auto;margin-bottom:16px;padding-right:6px;';

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const hasIssue = issueSet.has(i);
    const qIssues  = issues.filter(x => x.idx === i);
    const options  = q?.options || [];

    const item = document.createElement('div');
    item.style.cssText = `
      padding:14px 16px;border:1.5px solid ${hasIssue ? '#c4554a' : 'var(--ink-soft)'};
      border-radius:var(--radius-md);
      background:${hasIssue ? 'rgba(196,85,74,.05)' : 'var(--paper)'};`;

    // Question header: index + status icon + parser warnings.
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;';
    const headLeft = document.createElement('span');
    headLeft.style.cssText = `color:${hasIssue ? '#c4554a' : 'var(--accent)'};flex-shrink:0;margin-top:2px;`;
    headLeft.innerHTML = hasIssue ? (iconEl('x', 14)?.outerHTML || '⚠')
                                  : (iconEl('check', 14)?.outerHTML || '✓');
    head.appendChild(headLeft);

    const headBody = document.createElement('div');
    headBody.style.cssText = 'flex:1;min-width:0;';
    const idxRow = document.createElement('div');
    idxRow.style.cssText = 'font:600 11px/1.4 Inter,sans-serif;color:var(--ink-mute);margin-bottom:4px;';
    idxRow.textContent = `#${i + 1}`;
    headBody.appendChild(idxRow);

    // Question body via shared renderer.
    const qBody = document.createElement('div');
    qBody.className = 'tk-q-text';
    qBody.style.cssText = 'font:500 14px/1.5 Inter,sans-serif;color:var(--ink);';
    const qBlocks = q?.question?.blocks
      || (Array.isArray(q?.question) ? q.question : null);
    if (qBlocks) {
      qBody.innerHTML = renderContent({ blocks: qBlocks }, assetsBase)
        || esc(_questionLabel(q, i));
    } else {
      qBody.textContent = _questionLabel(q, i);
    }
    headBody.appendChild(qBody);

    if (hasIssue) {
      const warn = document.createElement('div');
      warn.style.cssText = 'font:400 11px/1.4 Inter,sans-serif;color:#c4554a;margin-top:6px;';
      warn.textContent = qIssues.map(x => x.msg).join(', ');
      headBody.appendChild(warn);
    }
    head.appendChild(headBody);
    item.appendChild(head);

    if (options.length) {
      const ol = document.createElement('div');
      ol.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding-left:24px;';
      const letters = ['A','B','C','D','E','F','G','H'];
      for (let k = 0; k < options.length; k++) {
        const opt = options[k];
        const isCorrect = !!opt?.isCorrect;

        const row = document.createElement('div');
        row.style.cssText = `
          display:flex;gap:8px;align-items:flex-start;
          padding:6px 10px;border-radius:var(--radius-sm);
          background:${isCorrect ? 'var(--accent-soft)' : 'transparent'};`;
        const key = document.createElement('span');
        key.style.cssText = `flex-shrink:0;font:600 12px/1.5 Inter,sans-serif;
          color:${isCorrect ? 'var(--accent)' : 'var(--ink-mute)'};`;
        key.textContent = (letters[k] || String(k+1)) + '.';
        row.appendChild(key);

        const txt = document.createElement('div');
        txt.style.cssText = `flex:1;font:400 13px/1.5 Inter,sans-serif;
          color:${isCorrect ? 'var(--accent)' : 'var(--ink)'};
          ${isCorrect ? 'font-weight:600;' : ''}`;
        // Options use `content.blocks` (same shape the taking screen reads).
        const optBlocks = opt?.content?.blocks
          || (Array.isArray(opt?.content) ? opt.content : null);
        if (optBlocks) {
          txt.innerHTML = renderContent({ blocks: optBlocks }, assetsBase)
            || esc(String(opt?.text || ''));
        } else if (opt?.text != null) {
          txt.textContent = String(opt.text);
        }
        if (isCorrect) {
          const tick = document.createElement('span');
          tick.style.cssText = 'color:var(--accent);margin-left:6px;';
          tick.textContent = ' ✓';
          txt.appendChild(tick);
        }
        row.appendChild(txt);
        ol.appendChild(row);
      }
      item.appendChild(ol);
    }
    list.appendChild(item);
  }

  // Trigger MathJax typeset once the DOM is attached.
  queueMicrotask(() => { typesetMath(list).catch(() => {}); });

  // Asset endpoints require Bearer auth which <img> tags can't provide;
  // swap each <img.rb-image> src to a blob URL fetched via apiFetch.
  queueMicrotask(() => { attachAssets(list).catch(() => {}); });

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

  // Buttons.
  //
  // "Отменить и удалить" — destructive. We already created the test
  // synchronously during upload, so dismissing the wizard would leave
  // it orphaned. This button explicitly deletes it; the backend cleans
  // up storage objects via the existing test-delete pipeline (DB
  // cascade + `_drop_storage_prefix(test_id)`).
  //
  // "Подтвердить" — advances to Step 4 (success). The test stays as-is.
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;align-items:center;padding-top:8px;border-top:var(--border);';
  btnRow.innerHTML = `
    <button id="review-cancel" type="button" class="btn btn--ghost" style="flex:1;color:var(--error);border-color:var(--error);">
      ${iconEl('trash', 14)?.outerHTML || ''}<span>${t('import.cancel') || 'Отменить и удалить'}</span>
    </button>
    <button id="review-continue" type="button" class="btn btn--primary" style="flex:2;">
      <span>${t('import.confirm') || 'Подтвердить'} · ${esc(String(qCount))} вопросов</span>
    </button>`;

  wrap.innerHTML = logsSection;
  wrap.prepend(summaryBar, list);
  wrap.appendChild(btnRow);
  el.appendChild(wrap);

  wrap.querySelector('#review-cancel')?.addEventListener('click', async () => {
    const cancelBtn = wrap.querySelector('#review-cancel');
    if (!confirm(t('import.cancel.confirm')
        || 'Удалить созданный тест и связанные материалы? Это действие необратимо.')) return;
    if (cancelBtn) cancelBtn.setAttribute('disabled', 'disabled');
    if (testId) {
      try { await deleteTest(testId); } catch (_) { /* best-effort */ }
    }
    _step = 1; _result = null; _file = null; _title = ''; _description = '';
    _mount();
  });
  wrap.querySelector('#review-continue')?.addEventListener('click', () => {
    _step = 4; _mount();
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

// ── Step 4: Confirmation ──────────────────────────────────────────────────────
function _buildStep4Done(el) {
  if (!_result) { _step = 1; _mount(); return; }

  const { metadata, payload } = _result;
  const questions = payload?.questions || [];
  const qCount    = metadata?.questionCount ?? questions.length;
  const testId    = metadata?.id;
  const title     = metadata?.title || _title || 'Untitled';

  const ACCESS_LABELS = { private: 'Private', shared: 'Shared', public: 'Public' };

  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;max-width:480px;text-align:center;';
  const successTitle = _mode === 'create'
    ? (t('wizard.create.success') || 'Коллекция создана!')
    : (t('import.success') || 'Import successful!');
  const successSubtitle = _mode === 'create'
    ? (t('wizard.create.success.sub') || 'Добавьте вопросы в редакторе')
    : `${qCount} ${t('import.questions_imported') || 'questions imported'}`;
  wrap.innerHTML = `
    <div style="font-size:48px;margin-bottom:16px;">✅</div>
    <div style="font:700 24px/1.2 Inter,sans-serif;color:var(--ink);margin-bottom:8px;">
      ${esc(successTitle)}
    </div>
    <div style="font:400 14px/1.5 Inter,sans-serif;color:var(--ink-mute);margin-bottom:28px;">
      ${esc(successSubtitle)}
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
    // Create mode → open the editor so the user can add questions.
    // Import mode → home with the test pre-selected (same UX users get
    // when clicking through from the rail).
    if (_mode === 'create') navigate(`/test/${encodeURIComponent(testId)}/edit`);
    else                    navigate(`/home?id=${encodeURIComponent(testId)}`);
  });
  wrap.querySelector('#import-another-btn')?.addEventListener('click', () => {
    _step = 1; _file = null; _title = ''; _description = ''; _result = null; _mount();
  });
}

// ── Create-empty-collection flow ─────────────────────────────────────────────
// Step 1: title + description + access (no file).
// Step 2: preview with link to /test/:id/edit for adding questions.
// Step 3 (=4 in import mode): success card.

function _buildCreateStep1(el) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;max-width:560px;display:flex;flex-direction:column;gap:18px;';

  const heading = document.createElement('h2');
  heading.style.cssText = 'font:700 22px/1.2 Inter,sans-serif;color:var(--ink);margin:0 0 4px;';
  heading.textContent = t('wizard.create.title') || 'Новая пустая коллекция';
  wrap.appendChild(heading);

  const desc = document.createElement('p');
  desc.style.cssText = 'font:400 13px/1.5 Inter,sans-serif;color:var(--ink-mute);margin:0;';
  desc.textContent = t('wizard.create.desc')
    || 'Создайте коллекцию без файла. Вопросы можно будет добавить вручную в редакторе после создания.';
  wrap.appendChild(desc);

  const titleRow = document.createElement('div');
  titleRow.innerHTML = `
    <label style="display:block;font:500 13px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:6px;">
      ${t('wizard.create.title.label') || 'Название'}
      <span style="color:#c4554a;">*</span>
    </label>
    <input id="cr-title" type="text" class="input" placeholder="${esc(t('wizard.create.title.placeholder') || 'Например, Анатомия — экзамен')}"
           value="${esc(_title)}" style="width:100%;">`;
  wrap.appendChild(titleRow);

  const descRow = document.createElement('div');
  descRow.innerHTML = `
    <label style="display:block;font:500 13px/1 Inter,sans-serif;color:var(--ink-mute);margin-bottom:6px;">
      ${t('import.test_description') || 'Description'}
      <span style="color:var(--ink-mute);font-weight:400;">${t('common.optional') || '(optional)'}</span>
    </label>
    <textarea id="cr-desc" class="input" rows="3" placeholder="${esc(t('import.test_description.placeholder') || 'Short description')}"
              style="width:100%;resize:vertical;min-height:64px;">${esc(_description)}</textarea>`;
  wrap.appendChild(descRow);

  const accessRow = document.createElement('div');
  const ACCESS = [
    { id: 'private', label: t('access.private') || 'Private' },
    { id: 'shared',  label: t('access.shared')  || 'Shared' },
    { id: 'public',  label: t('access.public')  || 'Public' },
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
  wrap.appendChild(accessRow);

  const errSlot = document.createElement('div');
  errSlot.id = 'cr-error';
  errSlot.style.cssText = 'color:#c4554a;font:500 13px Inter,sans-serif;display:none;';
  wrap.appendChild(errSlot);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;align-items:center;';
  btnRow.innerHTML = `
    <button id="cr-submit" type="button" class="btn btn--primary">
      ${iconEl('plus', 14)?.outerHTML || ''}<span>${t('wizard.create.submit') || 'Создать коллекцию'}</span>
    </button>`;
  wrap.appendChild(btnRow);

  el.appendChild(wrap);

  wrap.querySelector('#cr-title')?.addEventListener('input', (e) => { _title = e.target.value; });
  wrap.querySelector('#cr-desc')?.addEventListener('input', (e) => { _description = e.target.value; });
  wrap.querySelector('#cr-submit')?.addEventListener('click', _doCreate);
}

async function _doCreate() {
  const title = (_title || '').trim();
  if (!title) {
    const err = _root?.querySelector?.('#cr-error');
    if (err) {
      err.textContent = t('wizard.create.error.title_required') || 'Введите название коллекции';
      err.style.display = 'block';
    }
    return;
  }
  const btn = _root?.querySelector?.('#cr-submit');
  if (btn) btn.setAttribute('disabled', 'disabled');
  try {
    const res = await createTest({ title, description: _description || undefined, access_level: _access });
    // createTest hands back { metadata, payload }; access on the test is
    // private by default. If user picked something else, sync it.
    if (_access !== 'private' && res?.metadata?.id) {
      try { await updateTestAccess(res.metadata.id, _access); }
      catch (e) { /* non-fatal — show the test anyway */ }
    }
    _result = res;
    _step = 2;  // create-mode "done" pane (same builder as import step 4).
    _mount();
  } catch (e) {
    if (btn) btn.removeAttribute('disabled');
    const err = _root?.querySelector?.('#cr-error');
    const msg = e?.payload?.code === 'test_limit_reached'
      ? (t('errors.test_limit_reached') || 'Достигнут лимит тестов')
      : (e?.message || t('common.error') || 'Не удалось создать');
    if (err) { err.textContent = msg; err.style.display = 'block'; }
    else     { alert(msg); }
  }
}

