/**
 * mobile/import.js — Mobile import/create wizard (parity with desktop).
 *
 * Two modes, switchable from a top toggle that's visible only on Step 1:
 *
 *   • import  (default)
 *     1. File picker + title + description + access
 *     2. Live progress — upload bar + extraction timer + log strip
 *     3. Full preview — every question with options + materials
 *        (auth'd via attachAssets blob-swap)
 *     4. Success card with "Открыть тест" + "Отменить и удалить"
 *        (DELETE on the just-created test if user discards)
 *
 *   • create  (empty collection)
 *     1. Title + description + access (no file)
 *     2. Success card → /test/:id/edit
 *
 * Sync upload backend (`/api/tests/upload`) still creates the test
 * synchronously; if the user discards from Step 3/4, we hit DELETE which
 * cascades to storage via `_drop_storage_prefix`. See
 * `docs/superpowers/specs/2026-05-29-temp-storage-imports-design.md` for
 * the proper temp-storage flow planned as follow-up.
 */
import {
  uploadTestDocxWithProgress, createTest, deleteTest,
} from '../../api/tests.js';
import { updateTestAccess } from '../../api/access.js';
import { t } from '../../utils/locale.js';
import { navigate } from '../../router.js';
import { iconEl } from '../../icons.js';
import {
  topBar, mShell, mCard, mChip, mBtn, mSticky,
} from '../../components/mobile-atoms.js';
import { toast } from '../../components/toast.js';
import {
  renderContent, typesetMath, attachAssets,
} from '../../utils/render-blocks.js';

const MAX_DOCX_UPLOAD_BYTES = 50 * 1024 * 1024;

let _renderToken = 0;

function progressDots(step, total) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '14px',
  });
  for (let s = 1; s <= total; s++) {
    const dot = document.createElement('div');
    const filled = s <= step;
    const done = s < step;
    Object.assign(dot.style, {
      width: '22px', height: '22px', borderRadius: '999px',
      background: filled ? 'var(--accent)' : 'var(--paper)',
      border: `1.5px solid ${filled ? 'var(--accent)' : 'var(--ink-mute)'}`,
      color: filled ? '#fff' : 'var(--ink-mute)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      font: "700 10px Inter, sans-serif",
      flexShrink: '0',
    });
    if (done) dot.appendChild(iconEl('check', 12));
    else dot.textContent = String(s);
    wrap.appendChild(dot);
    if (s < total) {
      const seg = document.createElement('div');
      Object.assign(seg.style, {
        flex: '1', height: '1px',
        background: s < step ? 'var(--accent)' : 'var(--ink-soft)',
      });
      wrap.appendChild(seg);
    }
  }
  return wrap;
}

function buildAccessChips(value, onChange) {
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '8px', flexWrap: 'wrap' });
  const opts = [
    { id: 'private', label: t('access.private') || 'Приватный' },
    { id: 'shared',  label: t('access.shared')  || 'Shared' },
    { id: 'public',  label: t('access.public')  || 'Public' },
  ];
  for (const o of opts) {
    row.appendChild(mChip({
      active: value === o.id,
      onClick: () => onChange(o.id),
    }, o.label));
  }
  return row;
}

function fmtSize(bytes) {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${mb.toFixed(1)} МБ`;
}

function modeToggle(currentMode, onChange) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    display: 'flex', gap: '4px', padding: '3px',
    background: 'var(--ink-soft)', borderRadius: '999px',
    marginBottom: '14px',
  });
  const opts = [
    ['import', t('wizard.mode.import') || 'Импорт .docx'],
    ['create', t('wizard.mode.create') || 'Пустая коллекция'],
  ];
  for (const [key, label] of opts) {
    const b = document.createElement('button');
    b.type = 'button';
    Object.assign(b.style, {
      flex: '1', padding: '6px 10px', borderRadius: '999px',
      border: 'none', cursor: 'pointer',
      font: '500 12px Inter,sans-serif',
      background: currentMode === key ? 'var(--paper)' : 'transparent',
      color: currentMode === key ? 'var(--ink)' : 'var(--ink-mute)',
      boxShadow: currentMode === key ? 'var(--shadow-sm)' : 'none',
    });
    b.textContent = label;
    b.addEventListener('click', () => onChange(key));
    wrap.appendChild(b);
  }
  return wrap;
}

function fieldInput(value, placeholder, onInput, multiline = false) {
  const el = document.createElement(multiline ? 'textarea' : 'input');
  if (!multiline) el.type = 'text';
  el.value = value;
  el.placeholder = placeholder;
  if (multiline) el.rows = 3;
  Object.assign(el.style, {
    width: '100%', border: '1.5px solid var(--ink)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 12px', fontSize: '13px', outline: 'none',
    background: 'var(--paper)', color: 'var(--ink)',
    fontFamily: 'Inter, sans-serif',
    boxSizing: 'border-box',
    ...(multiline ? { resize: 'vertical', minHeight: '64px' } : {}),
  });
  el.addEventListener('input', (e) => onInput(e.target.value));
  return el;
}

export default async function render(root, params = {}) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  // ── State ────────────────────────────────────────────────────
  let mode = params.mode === 'create' ? 'create' : 'import';
  let step = 1;
  let file = null;
  let title = '';
  let description = '';
  let access = 'private';
  let marker = '';        // optional symbol/text marking correct answers in docx
  let uploading = false;
  let uploadPct = 0;
  let extractStart = 0;
  let extractTick = null;
  let result = null;        // { metadata, payload, logs }

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    fileInput.value = '';
  });

  function handleFile(f) {
    if (!f.name.toLowerCase().endsWith('.docx')) {
      toast(t('import.only_docx') || 'Только .docx файлы', { tone: 'error' });
      return;
    }
    if (f.size > MAX_DOCX_UPLOAD_BYTES) {
      const limit = Math.floor(MAX_DOCX_UPLOAD_BYTES / (1024 * 1024));
      toast(`${t('import.file_too_large') || 'Файл слишком большой'}: ${(f.size / (1024 * 1024)).toFixed(1)} MB / ${limit} MB`,
        { tone: 'error' });
      return;
    }
    file = f;
    if (!title) title = f.name.replace(/\.docx$/i, '');
    paint();
  }

  // ── Step builders — IMPORT mode ──────────────────────────────
  function buildImportStep1() {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '14px';

    if (!file) {
      const zone = document.createElement('div');
      Object.assign(zone.style, {
        border: '2px dashed var(--accent)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px 16px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '8px', textAlign: 'center',
        background: 'var(--accent-soft)', color: 'var(--accent)',
        cursor: 'pointer',
      });
      zone.appendChild(iconEl('upload', 28));
      const head = document.createElement('div');
      Object.assign(head.style, { font: "600 14px Inter, sans-serif" });
      head.textContent = t('import.drop_hint') || 'Перетащите .docx сюда';
      zone.appendChild(head);
      const sub = document.createElement('div');
      Object.assign(sub.style, { font: "400 12px Inter, sans-serif", opacity: '0.8' });
      sub.textContent = t('import.or_browse') || 'или нажмите для выбора';
      zone.appendChild(sub);
      zone.addEventListener('click', () => fileInput.click());
      zone.addEventListener('dragover', (e) => { e.preventDefault(); });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        const f = e.dataTransfer?.files?.[0];
        if (f) handleFile(f);
      });
      wrap.appendChild(zone);
    } else {
      // File chosen — summary card.
      const fileBody = document.createElement('div');
      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', gap: '12px', alignItems: 'center' });
      const docIcon = document.createElement('div');
      Object.assign(docIcon.style, {
        width: '40px', height: '48px', borderRadius: '4px',
        background: 'var(--ink-soft)', color: 'var(--ink-mute)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: '0',
      });
      docIcon.appendChild(iconEl('doc', 22));
      row.appendChild(docIcon);
      const mid = document.createElement('div');
      Object.assign(mid.style, { flex: '1', minWidth: '0' });
      const name = document.createElement('div');
      Object.assign(name.style, {
        fontSize: '13px', fontWeight: '600',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      });
      name.textContent = file.name;
      mid.appendChild(name);
      const meta = document.createElement('div');
      Object.assign(meta.style, { fontSize: '11px', color: 'var(--ink-mute)' });
      meta.textContent = fmtSize(file.size);
      mid.appendChild(meta);
      row.appendChild(mid);
      row.appendChild(mBtn({
        sm: true, onClick: () => { file = null; paint(); },
      }, t('import.replace') || 'Зам.'));
      fileBody.appendChild(row);
      wrap.appendChild(mCard({ title: t('import.file') || 'Файл' }, fileBody));
    }

    // Title.
    const titleBody = document.createElement('div');
    titleBody.appendChild(fieldInput(
      title, t('import.test_title.placeholder') || 'например, Анатомия мидтерм',
      (v) => { title = v; },
    ));
    wrap.appendChild(mCard({ title: t('import.test_title') || 'Название' }, titleBody));

    // Description.
    const descBody = document.createElement('div');
    descBody.appendChild(fieldInput(
      description,
      t('import.test_description.placeholder') || 'Короткое описание (необязательно)',
      (v) => { description = v; },
      true,
    ));
    wrap.appendChild(mCard({
      title: `${t('import.test_description') || 'Описание'} (${t('common.optional') || 'необязательно'})`,
    }, descBody));

    // Marker — optional symbol marking correct answers in the docx.
    // Backend defaults to "*" when empty.
    const markerBody = document.createElement('div');
    const markerInp = document.createElement('input');
    markerInp.type = 'text';
    markerInp.value = marker;
    markerInp.maxLength = 32;
    markerInp.placeholder = t('import.marker.placeholder') || 'по умолчанию: *';
    Object.assign(markerInp.style, {
      width: '100%', border: '1.5px solid var(--ink)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 12px', fontSize: '13px', outline: 'none',
      background: 'var(--paper)', color: 'var(--ink)',
      fontFamily: "'JetBrains Mono', monospace",
      boxSizing: 'border-box',
    });
    markerInp.addEventListener('input', (e) => { marker = e.target.value; });
    markerBody.appendChild(markerInp);
    const markerHint = document.createElement('div');
    Object.assign(markerHint.style, {
      font: '400 11px/1.5 Inter,sans-serif',
      color: 'var(--ink-mute)', marginTop: '6px',
    });
    markerHint.textContent = t('import.marker.hint')
      || 'Символ или текст, который стоит перед правильным ответом в .docx. Например * или ✓.';
    markerBody.appendChild(markerHint);
    wrap.appendChild(mCard({
      title: `${t('import.marker') || 'Маркер правильного'} (${t('common.optional') || 'необязательно'})`,
    }, markerBody));

    // Access.
    const accessBody = document.createElement('div');
    accessBody.appendChild(buildAccessChips(access, (v) => { access = v; paint(); }));
    wrap.appendChild(mCard({ title: t('access.level') || 'Доступ' }, accessBody));

    return wrap;
  }

  function buildImportStep2Progress() {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '14px';

    const head = document.createElement('h2');
    Object.assign(head.style, { font: '700 18px/1.2 Inter,sans-serif', margin: '0' });
    head.textContent = file?.name || (t('import.uploading') || 'Загрузка');
    wrap.appendChild(head);

    // Phase 1 — upload.
    const phase1 = document.createElement('div');
    Object.assign(phase1.style, {
      border: '1.5px solid var(--ink-soft)', borderRadius: 'var(--radius-md)',
      padding: '12px', background: 'var(--paper)',
    });
    const p1Head = document.createElement('div');
    Object.assign(p1Head.style, {
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: '8px',
    });
    const p1Label = document.createElement('span');
    Object.assign(p1Label.style, { font: '600 12px Inter,sans-serif' });
    p1Label.textContent = '1. ' + (t('import.phase.upload') || 'Загрузка файла');
    p1Head.appendChild(p1Label);
    const p1Pct = document.createElement('span');
    p1Pct.id = 'imp-up-pct';
    Object.assign(p1Pct.style, {
      font: "500 12px 'JetBrains Mono',monospace", color: 'var(--accent)',
    });
    p1Pct.textContent = uploadPct + '%';
    p1Head.appendChild(p1Pct);
    phase1.appendChild(p1Head);

    const barOuter = document.createElement('div');
    Object.assign(barOuter.style, {
      height: '8px', borderRadius: '4px',
      background: 'var(--ink-soft)', overflow: 'hidden',
    });
    const bar = document.createElement('div');
    bar.id = 'imp-up-bar';
    Object.assign(bar.style, {
      height: '100%', width: uploadPct + '%',
      background: 'var(--accent)', transition: 'width 120ms ease',
    });
    barOuter.appendChild(bar);
    phase1.appendChild(barOuter);
    wrap.appendChild(phase1);

    // Phase 2 — extraction.
    const phase2 = document.createElement('div');
    Object.assign(phase2.style, {
      border: '1.5px solid var(--ink-soft)', borderRadius: 'var(--radius-md)',
      padding: '12px', background: 'var(--paper)',
    });
    const p2Head = document.createElement('div');
    Object.assign(p2Head.style, {
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: '8px',
    });
    const p2Label = document.createElement('span');
    Object.assign(p2Label.style, { font: '600 12px Inter,sans-serif' });
    p2Label.textContent = '2. ' + (t('import.phase.extract') || 'Извлечение вопросов');
    p2Head.appendChild(p2Label);
    const p2Time = document.createElement('span');
    p2Time.id = 'imp-ex-elapsed';
    Object.assign(p2Time.style, {
      font: "500 12px 'JetBrains Mono',monospace", color: 'var(--ink-mute)',
    });
    p2Time.textContent = '0.0s';
    p2Head.appendChild(p2Time);
    phase2.appendChild(p2Head);

    const p2Body = document.createElement('div');
    Object.assign(p2Body.style, {
      display: 'flex', gap: '6px', alignItems: 'center',
      font: '400 12px/1.4 Inter,sans-serif', color: 'var(--ink-mute)',
    });
    const dotSkel = document.createElement('span');
    dotSkel.className = 'skeleton';
    Object.assign(dotSkel.style, {
      width: '10px', height: '10px', borderRadius: '50%',
    });
    p2Body.appendChild(dotSkel);
    const dotLbl = document.createElement('span');
    dotLbl.textContent = t('import.phase.extract.detail')
      || 'Парсинг таблиц, картинок, формул…';
    p2Body.appendChild(dotLbl);
    phase2.appendChild(p2Body);
    wrap.appendChild(phase2);

    const note = document.createElement('div');
    Object.assign(note.style, {
      font: '400 12px/1.5 Inter,sans-serif', color: 'var(--ink-mute)',
    });
    note.textContent = t('import.phase.note')
      || 'Логи парсера появятся в превью после извлечения. Не закрывайте вкладку.';
    wrap.appendChild(note);

    return wrap;
  }

  function buildImportStep3Preview() {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '12px';

    if (!result) {
      const card = mCard({ title: t('import.review') || 'Превью' });
      const hint = document.createElement('div');
      Object.assign(hint.style, {
        padding: '14px 0', textAlign: 'center',
        color: 'var(--ink-mute)', fontSize: '13px',
      });
      hint.textContent = t('import.review.empty')
        || 'Нет данных. Вернитесь к шагу 1.';
      card.appendChild(hint);
      wrap.appendChild(card);
      return wrap;
    }

    const { metadata, payload, logs } = result;
    const questions = payload?.questions || [];
    const qCount = metadata?.questionCount ?? questions.length;
    const testId = metadata?.id;
    const assetsBase = payload?.assetsBaseUrl
      || (testId ? `/api/tests/${testId}/assets` : '');

    // Summary header.
    const summary = document.createElement('div');
    Object.assign(summary.style, {
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'baseline', gap: '8px', flexWrap: 'wrap',
    });
    const title1 = document.createElement('div');
    Object.assign(title1.style, { font: '700 16px/1.2 Inter,sans-serif', flex: '1', minWidth: '0' });
    title1.textContent = metadata?.title || title || 'Без названия';
    summary.appendChild(title1);
    const qBadge = document.createElement('div');
    Object.assign(qBadge.style, {
      font: "500 12px 'JetBrains Mono',monospace", color: 'var(--ink-mute)',
    });
    qBadge.textContent = `${qCount} вопросов`;
    summary.appendChild(qBadge);
    wrap.appendChild(summary);

    // Issue chip.
    const issues = _detectIssues(questions, logs || []);
    const issueChip = document.createElement('div');
    Object.assign(issueChip.style, {
      padding: '4px 10px', borderRadius: '999px',
      font: '500 11px Inter,sans-serif',
      display: 'inline-block', alignSelf: 'flex-start',
    });
    if (issues.length) {
      Object.assign(issueChip.style, {
        background: 'rgba(196,85,74,.10)', color: '#c4554a',
        border: '1px solid #c4554a',
      });
      issueChip.textContent = `⚠ ${issues.length} требуют внимания`;
    } else {
      Object.assign(issueChip.style, {
        background: 'var(--accent-soft)', color: 'var(--accent)',
        border: '1px solid var(--accent)',
      });
      issueChip.textContent = '✓ Всё хорошо';
    }
    wrap.appendChild(issueChip);

    // Logs (collapsible).
    if (logs && logs.length) {
      const details = document.createElement('details');
      Object.assign(details.style, {
        border: '1px solid var(--ink-soft)', borderRadius: 'var(--radius-sm)',
        padding: '8px 10px', background: 'var(--paper)',
      });
      const summaryEl = document.createElement('summary');
      Object.assign(summaryEl.style, {
        font: '500 12px Inter,sans-serif', cursor: 'pointer', color: 'var(--ink-mute)',
      });
      summaryEl.textContent = `Логи парсера (${logs.length})`;
      details.appendChild(summaryEl);
      const pre = document.createElement('pre');
      Object.assign(pre.style, {
        marginTop: '8px', padding: '8px',
        background: 'var(--ink-soft)', borderRadius: '4px',
        font: "400 10px/1.5 'JetBrains Mono',monospace",
        color: 'var(--ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        maxHeight: '160px', overflow: 'auto',
      });
      pre.textContent = logs.join('\n');
      details.appendChild(pre);
      wrap.appendChild(details);
    }

    // Question list.
    const list = document.createElement('div');
    Object.assign(list.style, {
      display: 'flex', flexDirection: 'column', gap: '10px',
    });
    const issueSet = new Set(issues.map(i => i.idx));
    for (let i = 0; i < questions.length; i++) {
      list.appendChild(_buildPreviewQuestion(questions[i], i, issueSet.has(i), assetsBase));
    }
    wrap.appendChild(list);

    queueMicrotask(() => {
      typesetMath(list).catch(() => {});
      attachAssets(list).catch(() => {});
    });
    return wrap;
  }

  function _buildPreviewQuestion(q, i, hasIssue, assetsBase) {
    const item = document.createElement('div');
    Object.assign(item.style, {
      padding: '12px', borderRadius: 'var(--radius-md)',
      border: '1.5px solid ' + (hasIssue ? '#c4554a' : 'var(--ink-soft)'),
      background: hasIssue ? 'rgba(196,85,74,.05)' : 'var(--paper)',
    });
    const head = document.createElement('div');
    Object.assign(head.style, {
      display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-start',
    });
    const tick = document.createElement('span');
    Object.assign(tick.style, {
      color: hasIssue ? '#c4554a' : 'var(--accent)', flexShrink: '0', marginTop: '1px',
    });
    tick.appendChild(iconEl(hasIssue ? 'x' : 'check', 13));
    head.appendChild(tick);
    const meta = document.createElement('div');
    Object.assign(meta.style, { flex: '1', minWidth: '0' });
    const idxRow = document.createElement('div');
    Object.assign(idxRow.style, {
      font: '600 10px/1 Inter,sans-serif', color: 'var(--ink-mute)',
      marginBottom: '4px',
    });
    idxRow.textContent = `#${i + 1}`;
    meta.appendChild(idxRow);
    const qBody = document.createElement('div');
    qBody.className = 'tk-q-text';
    Object.assign(qBody.style, { font: '500 13px/1.4 Inter,sans-serif' });
    const qBlocks = q?.question?.blocks
      || (Array.isArray(q?.question) ? q.question : null);
    if (qBlocks) {
      qBody.innerHTML = renderContent({ blocks: qBlocks }, assetsBase) || '';
    }
    meta.appendChild(qBody);
    head.appendChild(meta);
    item.appendChild(head);

    const opts = q?.options || [];
    if (opts.length) {
      const ol = document.createElement('div');
      Object.assign(ol.style, {
        display: 'flex', flexDirection: 'column', gap: '6px',
        paddingLeft: '22px',
      });
      const letters = ['A','B','C','D','E','F'];
      for (let k = 0; k < opts.length; k++) {
        const opt = opts[k];
        const isCorrect = !!opt?.isCorrect;
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', gap: '6px', alignItems: 'flex-start',
          padding: '5px 8px', borderRadius: 'var(--radius-sm)',
          background: isCorrect ? 'var(--accent-soft)' : 'transparent',
        });
        const key = document.createElement('span');
        Object.assign(key.style, {
          flexShrink: '0', font: '600 11px/1.4 Inter,sans-serif',
          color: isCorrect ? 'var(--accent)' : 'var(--ink-mute)',
        });
        key.textContent = (letters[k] || (k + 1)) + '.';
        row.appendChild(key);
        const txt = document.createElement('div');
        Object.assign(txt.style, {
          flex: '1', font: '400 12px/1.4 Inter,sans-serif',
          color: isCorrect ? 'var(--accent)' : 'var(--ink)',
          fontWeight: isCorrect ? '600' : '400',
        });
        const optBlocks = opt?.content?.blocks
          || (Array.isArray(opt?.content) ? opt.content : null);
        if (optBlocks) {
          txt.innerHTML = renderContent({ blocks: optBlocks }, assetsBase) || '';
        } else if (opt?.text) {
          txt.textContent = String(opt.text);
        }
        if (isCorrect) txt.appendChild(document.createTextNode(' ✓'));
        row.appendChild(txt);
        ol.appendChild(row);
      }
      item.appendChild(ol);
    }
    return item;
  }

  function buildImportStep4Done() {
    return buildSuccessCard({
      title: t('import.success') || 'Импорт успешен!',
      sub: `${result?.metadata?.questionCount ?? result?.payload?.questions?.length ?? 0} ${t('import.questions_imported') || 'вопросов импортировано'}`,
      testId: result?.metadata?.id,
      openHref: (id) => `/home?id=${encodeURIComponent(id)}`,
    });
  }

  // ── Step builders — CREATE mode ──────────────────────────────
  function buildCreateStep1() {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '14px';

    const heading = document.createElement('h2');
    Object.assign(heading.style, { font: '700 18px/1.2 Inter,sans-serif', margin: '0' });
    heading.textContent = t('wizard.create.title') || 'Новая пустая коллекция';
    wrap.appendChild(heading);

    const sub = document.createElement('p');
    Object.assign(sub.style, {
      font: '400 12px/1.5 Inter,sans-serif', color: 'var(--ink-mute)', margin: '0',
    });
    sub.textContent = t('wizard.create.desc')
      || 'Создайте коллекцию без файла. Вопросы добавите в редакторе после создания.';
    wrap.appendChild(sub);

    // Title.
    const titleBody = document.createElement('div');
    const titleHint = document.createElement('div');
    Object.assign(titleHint.style, {
      font: '500 10px Inter,sans-serif', color: 'var(--ink-mute)', marginBottom: '4px',
    });
    titleHint.innerHTML = (t('wizard.create.title.label') || 'Название')
      + ' <span style="color:#c4554a">*</span>';
    titleBody.appendChild(titleHint);
    titleBody.appendChild(fieldInput(
      title, t('wizard.create.title.placeholder') || 'Например, Анатомия — экзамен',
      (v) => { title = v; },
    ));
    wrap.appendChild(mCard({ title: t('wizard.create.section.basic') || 'Основное' }, titleBody));

    // Description.
    const descBody = document.createElement('div');
    descBody.appendChild(fieldInput(
      description,
      t('import.test_description.placeholder') || 'Короткое описание (необязательно)',
      (v) => { description = v; },
      true,
    ));
    wrap.appendChild(mCard({
      title: `${t('import.test_description') || 'Описание'} (${t('common.optional') || 'необязательно'})`,
    }, descBody));

    // Access.
    const accessBody = document.createElement('div');
    accessBody.appendChild(buildAccessChips(access, (v) => { access = v; paint(); }));
    wrap.appendChild(mCard({ title: t('access.level') || 'Доступ' }, accessBody));

    return wrap;
  }

  function buildCreateStep2Done() {
    return buildSuccessCard({
      title: t('wizard.create.success') || 'Коллекция создана!',
      sub: t('wizard.create.success.sub') || 'Откройте редактор, чтобы добавить вопросы.',
      testId: result?.metadata?.id,
      // Land on the editor — that's the natural next step for create.
      openHref: (id) => `/test/${encodeURIComponent(id)}/edit`,
      openLabel: t('wizard.create.open_editor') || 'Открыть редактор',
    });
  }

  function buildSuccessCard({ title: ttl, sub, testId, openHref, openLabel }) {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', textAlign: 'center', gap: '12px',
      padding: '24px 16px',
    });
    const check = document.createElement('div');
    check.style.fontSize = '40px';
    check.textContent = '✅';
    wrap.appendChild(check);
    const h = document.createElement('div');
    Object.assign(h.style, { font: '700 18px Inter,sans-serif' });
    h.textContent = ttl;
    wrap.appendChild(h);
    if (sub) {
      const s = document.createElement('div');
      Object.assign(s.style, { font: '400 12px Inter,sans-serif', color: 'var(--ink-mute)' });
      s.textContent = sub;
      wrap.appendChild(s);
    }
    // Open + retry buttons land in the sticky footer (see paint()).
    return wrap;
  }

  // ── Async actions ─────────────────────────────────────────────
  async function doUpload() {
    if (!file || uploading) return;
    uploading = true;
    uploadPct = 0;
    extractStart = 0;
    step = 2;
    paint();
    try {
      const res = await uploadTestDocxWithProgress(file, {
        title: title || undefined,
        description: description || undefined,
        access_level: access,
        symbol: marker.trim() || undefined,
      }, {
        onUploadProgress: (pct) => {
          uploadPct = pct;
          const bar = document.getElementById('imp-up-bar');
          const lbl = document.getElementById('imp-up-pct');
          if (bar) bar.style.width = pct + '%';
          if (lbl) lbl.textContent = pct + '%';
        },
        onUploadComplete: () => {
          extractStart = Date.now();
          if (extractTick) clearInterval(extractTick);
          extractTick = setInterval(() => {
            const el = document.getElementById('imp-ex-elapsed');
            if (el) el.textContent = ((Date.now() - extractStart) / 1000).toFixed(1) + 's';
          }, 100);
        },
      });
      if (extractTick) { clearInterval(extractTick); extractTick = null; }
      result = res;
      step = 3;
      uploading = false;
      paint();
    } catch (e) {
      if (extractTick) { clearInterval(extractTick); extractTick = null; }
      uploading = false;
      step = 1;
      paint();
      const code = e?.payload?.code;
      let msg = e?.message || (t('common.error') || 'Ошибка');
      if (code === 'test_limit_reached') msg = t('errors.test_limit_reached') || msg;
      else if (code === 'file_too_large') msg = t('errors.file_too_large') || msg;
      toast(msg, { tone: 'error' });
    }
  }

  async function doCreate() {
    const ttl = (title || '').trim();
    if (!ttl) {
      toast(t('wizard.create.error.title_required') || 'Введите название', { tone: 'error' });
      return;
    }
    try {
      const res = await createTest({ title: ttl, description: description || undefined, access_level: access });
      if (access !== 'private' && res?.metadata?.id) {
        try { await updateTestAccess(res.metadata.id, access); }
        catch { /* non-fatal */ }
      }
      result = res;
      step = 2; // success card.
      paint();
    } catch (e) {
      const msg = e?.payload?.code === 'test_limit_reached'
        ? (t('errors.test_limit_reached') || 'Лимит тестов')
        : (e?.message || t('common.error') || 'Не удалось создать');
      toast(msg, { tone: 'error' });
    }
  }

  async function doCancelImport() {
    const ok = confirm(t('import.cancel.confirm')
      || 'Удалить созданный тест и связанные материалы? Это действие необратимо.');
    if (!ok) return;
    const testId = result?.metadata?.id;
    if (testId) {
      try { await deleteTest(testId); }
      catch { /* best-effort */ }
    }
    result = null;
    step = 1;
    paint();
  }

  // ── Paint ────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.padding = '12px 16px 20px';
  body.appendChild(fileInput);

  function paint() {
    body.replaceChildren();
    body.appendChild(fileInput);

    // Mode toggle — only on Step 1 (switching mid-flow would wipe state).
    if (step === 1) {
      body.appendChild(modeToggle(mode, (m) => {
        if (m === mode) return;
        mode = m; step = 1; file = null; result = null;
        uploading = false; uploadPct = 0;
        paint();
      }));
    }

    const totalSteps = mode === 'create' ? 2 : 4;
    body.appendChild(progressDots(step, totalSteps));

    if (mode === 'import') {
      if (step === 1) body.appendChild(buildImportStep1());
      else if (step === 2) body.appendChild(buildImportStep2Progress());
      else if (step === 3) body.appendChild(buildImportStep3Preview());
      else if (step === 4) body.appendChild(buildImportStep4Done());
    } else {
      if (step === 1) body.appendChild(buildCreateStep1());
      else if (step === 2) body.appendChild(buildCreateStep2Done());
    }

    // Sticky footer buttons — vary by mode/step.
    const stickyChildren = [];
    if (mode === 'import') {
      if (step === 1) {
        stickyChildren.push(mBtn({
          primary: true, full: true,
          onClick: () => {
            if (!file) {
              toast(t('import.pick_first') || 'Выберите файл', { tone: 'error' });
              return;
            }
            doUpload();
          },
        }, iconEl('doc', 14),
           t('import.upload') || 'Загрузить и распознать'));
      } else if (step === 2) {
        // No buttons during progress — upload is in-flight.
      } else if (step === 3) {
        stickyChildren.push(mBtn({
          full: true,
          style: { color: 'var(--error)', borderColor: 'var(--error)' },
          onClick: doCancelImport,
        }, iconEl('trash', 14),
           t('import.cancel') || 'Отменить и удалить'));
        stickyChildren.push(mBtn({
          primary: true, full: true,
          onClick: () => { step = 4; paint(); },
        }, t('import.confirm') || 'Подтвердить'));
      } else if (step === 4) {
        const id = result?.metadata?.id;
        if (id) {
          stickyChildren.push(mBtn({
            primary: true, full: true,
            onClick: () => navigate(`/home?id=${encodeURIComponent(id)}`),
          }, t('import.open_test') || 'Открыть тест'));
        }
        stickyChildren.push(mBtn({
          full: true,
          onClick: () => {
            step = 1; file = null; result = null; title = ''; description = '';
            paint();
          },
        }, t('import.import_another') || 'Импортировать ещё'));
      }
    } else {
      // Create mode.
      if (step === 1) {
        stickyChildren.push(mBtn({
          primary: true, full: true,
          onClick: doCreate,
        }, iconEl('plus', 14),
           t('wizard.create.submit') || 'Создать коллекцию'));
      } else if (step === 2) {
        const id = result?.metadata?.id;
        if (id) {
          stickyChildren.push(mBtn({
            primary: true, full: true,
            onClick: () => navigate(`/test/${encodeURIComponent(id)}/edit`),
          }, t('wizard.create.open_editor') || 'Открыть редактор'));
        }
      }
    }
    const sticky = stickyChildren.length ? mSticky(...stickyChildren) : null;

    mShell({
      root,
      topbar: topBar({
        title: `${mode === 'create'
          ? (t('wizard.create.short') || 'Создание')
          : (t('import.title') || 'Импорт')} · ${step}/${totalSteps}`,
      }),
      body, sticky,
      navActive: 'import',
      // Bottom-nav hidden during in-flight uploading so accidental taps
      // don't strand the user.
      hideNav: uploading,
    });
  }

  paint();
  if (stale()) return;
}

// ── Helpers (parser issue detection — same heuristics as desktop) ──

function _detectIssues(questions, logs) {
  const issues = [];
  questions.forEach((q, i) => {
    const text = _textFromQuestion(q, i);
    if (!text) issues.push({ idx: i, msg: 'текст не распознан' });
    const objects = q?.objects || [];
    if (objects.some(o => o?.type === 'image' && !o?.src && !o?.id)) {
      issues.push({ idx: i, msg: 'картинка отсутствует' });
    }
    const opts = q?.options || [];
    if (opts.length > 0 && !opts.some(o => o?.isCorrect)) {
      issues.push({ idx: i, msg: 'нет правильного' });
    }
  });
  logs.forEach((log) => {
    const match = String(log).match(/question\s*#?(\d+)/i);
    if (match) {
      const idx = parseInt(match[1]) - 1;
      if (idx >= 0 && idx < questions.length
          && !issues.some(x => x.idx === idx)) {
        issues.push({ idx, msg: 'предупреждение парсера' });
      }
    }
  });
  return issues;
}

function _textFromQuestion(q, i) {
  if (q?.text) return String(q.text);
  const blocks = q?.question?.blocks || [];
  const txt = blocks.flatMap(b =>
    (b?.inlines || []).map(il => il?.text || '').filter(Boolean)
  ).join(' ').trim();
  return txt;
}
