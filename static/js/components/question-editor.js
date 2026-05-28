/**
 * components/question-editor.js — question master-detail editor.
 *
 * Layout matches prototype.html:
 *   Sidebar (320px) — search input · filter chips · "+ Добавить вопрос"
 *                      · question cards (Q-num · preview · delete).
 *   Detail — preview mode by default with rendered question + options +
 *            metadata/accuracy stats, "Редактировать" + "Предложить
 *            изменение" buttons. Clicking either drops into edit mode:
 *            textarea for question, per-option rows (radio · A/B · input
 *            · delete), Тема field, footer with Delete / Отмена / Save.
 *
 * Save semantics:
 *   - Owner   → PATCH /api/tests/{id}/questions/{qid}   (or POST create)
 *   - Reviewer/other → POST /api/tests/{id}/change-requests with
 *     type=edit_question (existing) | add_question | delete_question.
 *
 * Tokens for embedded content (round-tripped via utils/token-blocks.js):
 *   [[img:src]]   — image (uploaded via /api/tests/{id}/assets first)
 *   [[math:tex]]  — LaTeX formula
 *   [[mathml:…]]  — raw MathML XML
 */
import { addQuestion, updateQuestion, deleteQuestion } from '../api/questions.js';
import { createChangeRequest } from '../api/change-requests.js';
import { listMaterials, uploadMaterial } from '../api/materials.js';
import { renderContent, typesetMath, hasFormulas } from '../utils/render-blocks.js';
import { blocksToTokens, tokensToBlocks } from '../utils/token-blocks.js';
import { toast } from './toast.js';
import { confirm as confirmDialog } from './confirm-dialog.js';
import { openMaterialsPanel } from './materials-panel.js';
import { iconEl } from '../icons.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * @typedef {Object} EditorOpts
 * @property {HTMLElement} host
 * @property {any} test
 * @property {boolean} canEdit
 * @property {(() => void)=} onChange
 */

/**
 * @param {EditorOpts} opts
 */
export function mountQuestionEditor(opts) {
  const state = {
    host: opts.host,
    test: opts.test,
    canEdit: !!opts.canEdit,
    onChange: opts.onChange || function () {},
    selId: opts.test.questions && opts.test.questions[0] && opts.test.questions[0].id,
    mode: 'preview',     // 'preview' | 'edit'
    draft: null,         // working copy when in edit mode
    filter: 'all',       // 'all' | 'flagged' | 'formula'
    search: '',
  };
  state.assetsBase = opts.test.assetsBaseUrl || `/api/tests/${opts.test.id}/assets`;

  // Materials map (id → {src, mathml}) for token resolution. Loaded
  // once per editor mount and refreshed after every upload.
  state.materialsById = {};
  state.materialsByMathml = {};
  state.activeTextarea = null;
  refreshMaterials(state);

  opts.host.innerHTML = '';
  opts.host.style.display = 'grid';
  opts.host.style.gridTemplateColumns = '320px 1fr';
  opts.host.style.gap = '14px';
  opts.host.style.alignItems = 'start';

  state.sidebarEl = document.createElement('div');
  state.sidebarEl.style.display = 'flex';
  state.sidebarEl.style.flexDirection = 'column';
  state.sidebarEl.style.gap = '8px';
  opts.host.appendChild(state.sidebarEl);

  state.detailEl = document.createElement('div');
  opts.host.appendChild(state.detailEl);

  renderAll(state);
}

function renderAll(state) {
  renderSidebar(state);
  renderDetail(state);
}

async function refreshMaterials(state) {
  try {
    const resp = await listMaterials(state.test.id);
    const items = (resp && resp.items) || [];
    state.materialsById = {};
    state.materialsByMathml = {};
    items.forEach(function (m) {
      state.materialsById[m.id] = { src: m.src, mathml: m.mathml, kind: m.kind };
      if (m.mathml) state.materialsByMathml[m.mathml] = m.id;
    });
  } catch (_) { /* best-effort */ }
}

/**
 * Walk every question + option block, count references to image
 * materials (formulas inline their MathML so they can't go stale).
 * Returns { refCounts, brokenByQid }:
 *   refCounts.<id>   — total references to that material across the test
 *   brokenByQid.<qid> — set of material IDs referenced but missing from
 *                       the materials map. Used to surface a ⚠ badge.
 */
function scanReferences(state) {
  const refCounts = {};
  const brokenByQid = {};
  const available = state.materialsById || {};

  function walkInlines(qid, inlines) {
    (inlines || []).forEach(function (inl) {
      if (!inl) return;
      if (inl.type === 'image') {
        const id = stemFromSrc(inl.src);
        if (!id) return;
        refCounts[id] = (refCounts[id] || 0) + 1;
        if (!available[id]) {
          (brokenByQid[qid] || (brokenByQid[qid] = new Set())).add(id);
        }
      }
    });
  }
  function walkBlocks(qid, content) {
    if (!content) return;
    const blocks = Array.isArray(content) ? content : (content.blocks || []);
    blocks.forEach(function (b) { if (b) walkInlines(qid, b.inlines); });
  }

  (state.test.questions || []).forEach(function (q) {
    walkBlocks(q.id, q.question);
    (q.options || []).forEach(function (o) { walkBlocks(q.id, o.content); });
  });

  return { refCounts: refCounts, brokenByQid: brokenByQid };
}

function stemFromSrc(src) {
  if (!src) return '';
  const last = String(src).split('/').pop() || '';
  const dot = last.lastIndexOf('.');
  return dot > 0 ? last.slice(0, dot) : last;
}

// ── Sidebar ─────────────────────────────────────────────────────────

function renderSidebar(state) {
  const host = state.sidebarEl;
  // Preserve the list's scrollTop across rebuilds — re-rendering on
  // every click was scrolling users back to Q1.
  const prevList = host.querySelector('.qe-q-list');
  const prevScroll = prevList ? prevList.scrollTop : 0;
  host.innerHTML = '';
  const questions = state.test.questions || [];
  const scan = scanReferences(state);
  state._scan = scan;

  // Search input.
  const searchBox = document.createElement('div');
  searchBox.style.display = 'flex';
  searchBox.style.alignItems = 'center';
  searchBox.style.gap = '6px';
  searchBox.style.padding = '6px 10px';
  searchBox.style.border = '1.5px solid var(--ink)';
  searchBox.style.borderRadius = 'var(--radius-sm)';
  searchBox.style.fontSize = '12px';
  searchBox.appendChild(iconEl('search', 12));
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Поиск по тексту вопроса';
  search.value = state.search;
  search.style.flex = '1';
  search.style.border = 'none';
  search.style.background = 'transparent';
  search.style.outline = 'none';
  search.style.font = '13px Inter';
  search.style.color = 'var(--ink)';
  search.addEventListener('input', function () {
    state.search = search.value;
    renderSidebar(state);
  });
  searchBox.appendChild(search);
  host.appendChild(searchBox);

  // Counts.
  const counts = {
    all: questions.length,
    flagged: questions.filter(function (q) { return q.flag; }).length,
    formula: questions.filter(function (q) { return hasFormulaInQuestion(q); }).length,
  };

  // Filter chips.
  const chipsRow = document.createElement('div');
  chipsRow.style.display = 'flex';
  chipsRow.style.gap = '4px';
  chipsRow.style.flexWrap = 'wrap';
  ['all', 'flagged', 'formula'].forEach(function (f) {
    const label = f === 'all' ? 'все' : f === 'flagged' ? '⚑' : 'с формулой';
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip--small' + (state.filter === f ? ' chip--active' : '');
    chip.textContent = label + ' · ' + counts[f];
    chip.addEventListener('click', function () {
      state.filter = f;
      renderSidebar(state);
    });
    chipsRow.appendChild(chip);
  });
  host.appendChild(chipsRow);

  // Add-question button.
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn';
  addBtn.style.width = '100%';
  addBtn.style.borderStyle = 'dashed';
  addBtn.style.borderColor = 'var(--accent)';
  addBtn.style.color = 'var(--accent)';
  addBtn.style.background = 'transparent';
  addBtn.appendChild(iconEl('plus', 13));
  const addLbl = document.createElement('span');
  addLbl.textContent = ' Добавить вопрос';
  addBtn.appendChild(addLbl);
  addBtn.addEventListener('click', function () { startAddQuestion(state); });
  host.appendChild(addBtn);

  // List.
  const list = document.createElement('div');
  list.className = 'qe-q-list';
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '6px';
  list.style.maxHeight = '62vh';
  list.style.overflow = 'auto';
  host.appendChild(list);

  const filtered = questions.filter(function (q) {
    if (state.filter === 'flagged' && !q.flag) return false;
    if (state.filter === 'formula' && !hasFormulaInQuestion(q)) return false;
    if (state.search) {
      const txt = (blocksToFlatText(q.question) || '').toLowerCase();
      if (txt.indexOf(state.search.toLowerCase()) < 0) return false;
    }
    return true;
  });

  filtered.forEach(function (q) {
    const n = questions.indexOf(q) + 1;
    const isSel = q.id === state.selId;
    const row = document.createElement('div');
    row.style.borderRadius = 'var(--radius-sm)';
    row.style.padding = '9px 12px';
    row.style.cursor = 'pointer';
    row.style.border = '1.5px solid ' + (isSel ? 'var(--accent)' : 'var(--ink)');
    row.style.background = isSel ? 'var(--accent-soft)' : 'var(--paper)';

    const headRow = document.createElement('div');
    headRow.style.display = 'flex';
    headRow.style.alignItems = 'center';
    headRow.style.justifyContent = 'space-between';
    headRow.style.marginBottom = '3px';
    const cap = document.createElement('span');
    cap.className = 'caps mono';
    cap.style.fontSize = '10px';
    cap.style.color = 'var(--ink-tertiary)';
    cap.textContent = 'Q' + n + (q.topic ? ' · ' + q.topic : '');
    headRow.appendChild(cap);
    const brokenSet = scan.brokenByQid[q.id];
    if (brokenSet && brokenSet.size) {
      const warn = document.createElement('span');
      warn.title = 'Битые ссылки: ' + Array.from(brokenSet).join(', ');
      warn.style.marginLeft = '6px';
      warn.style.marginRight = 'auto';
      warn.style.fontSize = '11px';
      warn.style.color = 'var(--warning)';
      warn.textContent = '⚠';
      headRow.appendChild(warn);
    }
    if (state.canEdit) {
      const del = document.createElement('button');
      del.type = 'button';
      del.style.padding = '2px';
      del.style.color = 'var(--ink-tertiary)';
      del.style.background = 'none';
      del.style.border = 'none';
      del.style.cursor = 'pointer';
      del.appendChild(iconEl('trash', 12));
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        requestDeleteQuestion(state, q, n);
      });
      headRow.appendChild(del);
    }
    row.appendChild(headRow);

    const txt = document.createElement('div');
    txt.style.fontSize = '12px';
    txt.style.lineHeight = '1.4';
    txt.style.overflow = 'hidden';
    txt.style.textOverflow = 'ellipsis';
    txt.style.display = '-webkit-box';
    txt.style.webkitLineClamp = '2';
    txt.style.webkitBoxOrient = 'vertical';
    txt.textContent = blocksToFlatText(q.question) || '(пустой вопрос)';
    row.appendChild(txt);

    row.addEventListener('click', function () {
      state.selId = q.id;
      state.mode = 'preview';
      state.draft = null;
      renderAll(state);
    });
    list.appendChild(row);
  });

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.style.padding = '24px';
    empty.style.textAlign = 'center';
    empty.style.fontSize = '12px';
    empty.style.color = 'var(--ink-tertiary)';
    empty.textContent = 'Ничего по фильтру';
    list.appendChild(empty);
  }

  // Restore scroll AFTER rows are appended — setting scrollTop on an
  // empty container is a no-op, so this must run last.
  if (prevScroll) list.scrollTop = prevScroll;
}

// ── Detail ─────────────────────────────────────────────────────────

function renderDetail(state) {
  const host = state.detailEl;
  host.innerHTML = '';
  const questions = state.test.questions || [];
  const sel = questions.find(function (q) { return q.id === state.selId; });

  if (!sel) {
    const empty = document.createElement('div');
    empty.style.display = 'flex';
    empty.style.flexDirection = 'column';
    empty.style.alignItems = 'center';
    empty.style.justifyContent = 'center';
    empty.style.padding = '48px';
    empty.style.color = 'var(--ink-tertiary)';
    empty.style.border = '1px dashed var(--ink-soft)';
    empty.style.borderRadius = 'var(--radius-md)';
    empty.style.textAlign = 'center';
    const big = document.createElement('div');
    big.style.fontSize = '36px';
    big.style.marginBottom = '14px';
    big.style.opacity = '0.4';
    big.textContent = '✎';
    empty.appendChild(big);
    const ttl = document.createElement('div');
    ttl.style.fontSize = '14px';
    ttl.style.fontWeight = '600';
    ttl.style.color = 'var(--ink-secondary)';
    ttl.textContent = 'Выберите вопрос слева';
    empty.appendChild(ttl);
    host.appendChild(empty);
    return;
  }

  const card = document.createElement('div');
  card.style.border = '1.5px solid var(--ink)';
  card.style.borderRadius = 'var(--radius-md)';
  card.style.background = 'var(--paper)';
  card.style.boxShadow = 'var(--shadow-sm)';
  card.style.overflow = 'hidden';
  host.appendChild(card);

  // Header bar.
  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  head.style.padding = '12px 16px';
  head.style.borderBottom = '1px solid var(--ink-soft)';

  const headLeft = document.createElement('div');
  headLeft.style.display = 'flex';
  headLeft.style.alignItems = 'center';
  headLeft.style.gap = '8px';
  const n = questions.indexOf(sel) + 1;
  const cap = document.createElement('span');
  cap.className = 'caps mono';
  cap.style.fontSize = '11px';
  cap.style.fontWeight = '600';
  cap.style.color = 'var(--ink-tertiary)';
  cap.textContent = 'Q' + n + (sel.topic ? ' · ' + sel.topic : '');
  headLeft.appendChild(cap);
  const tag = document.createElement('span');
  if (state.mode === 'edit') { tag.className = 'tag tag--warning'; tag.textContent = 'черновик'; }
  else                       { tag.className = 'tag tag--success'; tag.textContent = 'сохранено'; }
  headLeft.appendChild(tag);
  const brokenSet = state._scan && state._scan.brokenByQid[sel.id];
  if (brokenSet && brokenSet.size) {
    const warnTag = document.createElement('span');
    warnTag.className = 'tag tag--warning';
    warnTag.title = 'Битые ссылки: ' + Array.from(brokenSet).join(', ');
    warnTag.textContent = '⚠ ' + brokenSet.size + ' битых ссылок';
    headLeft.appendChild(warnTag);
  }
  head.appendChild(headLeft);

  if (state.mode === 'preview' && state.canEdit) {
    const headRight = document.createElement('div');
    headRight.style.marginLeft = 'auto';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn--small btn--danger';
    del.appendChild(iconEl('trash', 13));
    del.addEventListener('click', function () { requestDeleteQuestion(state, sel, n); });
    headRight.appendChild(del);
    head.appendChild(headRight);
  }
  card.appendChild(head);

  if (state.mode === 'preview') {
    card.appendChild(buildPreviewBody(state, sel, n));
  } else {
    card.appendChild(buildEditBody(state, sel, n));
  }
}

// ── Preview body ────────────────────────────────────────────────────

function buildPreviewBody(state, sel, n) {
  const body = document.createElement('div');
  body.style.padding = '20px 22px';

  const caps = document.createElement('div');
  caps.className = 'caps';
  caps.style.marginBottom = '6px';
  caps.textContent = 'Так увидит пользователь';
  body.appendChild(caps);

  // Question text (rendered).
  const qBox = document.createElement('div');
  qBox.style.font = '600 19px/1.45 Inter';
  qBox.style.letterSpacing = '-.005em';
  qBox.style.margin = '8px 0 18px';
  const qHtml = renderContent(sel.question, state.assetsBase);
  qBox.innerHTML = qHtml || '<i style="color:var(--ink-tertiary);">(пустой вопрос)</i>';
  if (hasFormulas(qHtml)) typesetMath(qBox);
  body.appendChild(qBox);

  // Options.
  const opts = sel.options || [];
  const correctIdx = findCorrectIndex(opts);
  const optsWrap = document.createElement('div');
  optsWrap.style.display = 'grid';
  optsWrap.style.gridTemplateColumns = opts.length > 2 ? '1fr 1fr' : '1fr';
  optsWrap.style.gap = '8px';
  optsWrap.style.marginBottom = '18px';
  opts.forEach(function (opt, i) {
    const isCorrect = i === correctIdx;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.alignItems = 'flex-start';
    row.style.padding = '10px 12px';
    row.style.border = '1.5px solid ' + (isCorrect ? 'var(--accent)' : 'var(--ink)');
    row.style.background = isCorrect ? 'var(--accent-soft)' : 'var(--paper)';
    row.style.borderRadius = 'var(--radius-md)';
    row.style.fontSize = '13px';

    const key = document.createElement('span');
    key.style.width = '22px';
    key.style.height = '22px';
    key.style.borderRadius = '999px';
    key.style.flexShrink = '0';
    key.style.display = 'flex';
    key.style.alignItems = 'center';
    key.style.justifyContent = 'center';
    key.style.fontSize = '11px';
    key.style.fontWeight = '700';
    if (isCorrect) {
      key.style.background = 'var(--accent)';
      key.style.color = '#fff';
    } else {
      key.style.border = '1.5px solid var(--ink)';
      key.style.background = 'var(--paper)';
      key.style.color = 'var(--ink)';
    }
    key.textContent = LETTERS[i] || (i + 1);
    row.appendChild(key);

    const text = document.createElement('span');
    text.style.flex = '1';
    text.style.fontWeight = '500';
    const optHtml = renderContent(opt.content, state.assetsBase);
    text.innerHTML = optHtml || '<i style="color:var(--ink-tertiary);">(пусто)</i>';
    if (hasFormulas(optHtml)) typesetMath(text);
    row.appendChild(text);

    if (isCorrect) {
      const t = document.createElement('span');
      t.className = 'tag tag--success';
      t.textContent = 'правильный';
      row.appendChild(t);
    }
    optsWrap.appendChild(row);
  });
  body.appendChild(optsWrap);

  // Metadata + accuracy two-col.
  const meta = document.createElement('div');
  meta.style.display = 'grid';
  meta.style.gridTemplateColumns = '1fr 1fr';
  meta.style.gap = '14px';
  meta.style.paddingTop = '14px';
  meta.style.borderTop = '1px solid var(--ink-soft)';
  meta.style.fontSize = '12px';

  const metaLeft = document.createElement('div');
  metaLeft.appendChild(makeCaps('Метаданные'));
  const ml = document.createElement('div');
  ml.style.color = 'var(--ink-tertiary)';
  ml.style.lineHeight = '1.7';
  ml.appendChild(metaLine('Тема', sel.topic || '—'));
  ml.appendChild(metaLine('В тесте', 'Q' + n + ' из ' + (state.test.questions || []).length));
  ml.appendChild(metaLine('Тип', 'один правильный'));
  metaLeft.appendChild(ml);
  meta.appendChild(metaLeft);

  const metaRight = document.createElement('div');
  metaRight.appendChild(makeCaps('Точность'));
  const mr = document.createElement('div');
  mr.style.color = 'var(--ink-tertiary)';
  mr.style.lineHeight = '1.7';
  const stats = sel.stats || {};
  const accPct = stats.correctRate != null ? Math.round(stats.correctRate) + '%' : '—';
  const accDur = stats.avgDurationMs != null ? Math.round(stats.avgDurationMs / 1000) + 's' : '—';
  mr.appendChild(metaLine('Средняя', accPct));
  mr.appendChild(metaLine('Среднее время', accDur));
  metaRight.appendChild(mr);
  meta.appendChild(metaRight);
  body.appendChild(meta);

  // Actions.
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  actions.style.marginTop = '18px';

  if (state.canEdit) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn--primary';
    editBtn.appendChild(iconEl('edit', 13));
    const lbl = document.createElement('span');
    lbl.textContent = ' Редактировать';
    editBtn.appendChild(lbl);
    editBtn.addEventListener('click', function () { startEdit(state, sel); });
    actions.appendChild(editBtn);
  }
  const crBtn = document.createElement('button');
  crBtn.type = 'button';
  crBtn.className = state.canEdit ? 'btn' : 'btn btn--primary';
  crBtn.appendChild(iconEl('edit', 13));
  const crLbl = document.createElement('span');
  crLbl.textContent = ' Предложить изменение';
  crBtn.appendChild(crLbl);
  crBtn.addEventListener('click', function () { startEdit(state, sel, true); });
  actions.appendChild(crBtn);

  body.appendChild(actions);
  return body;
}

// ── Edit body ───────────────────────────────────────────────────────

function buildEditBody(state, sel, n) {
  const body = document.createElement('div');
  body.style.padding = '20px 22px';
  const draft = state.draft;
  const asCR = !!draft.asCR;

  // Question text.
  body.appendChild(makeCaps('Текст вопроса'));
  body.appendChild(makeTokenToolbar(state, function (token) {
    insertAtCursor(qTA, token);
    draft.question = qTA.value;
    refreshPreview();
  }));
  const qTA = makeTextarea(draft.question, function (v) { draft.question = v; refreshPreview(); }, 3);
  body.appendChild(qTA);

  // Preview of question.
  const qPrevCaps = makeCaps('Предпросмотр');
  qPrevCaps.style.marginTop = '10px';
  body.appendChild(qPrevCaps);
  const qPrev = document.createElement('div');
  qPrev.style.padding = '8px 12px';
  qPrev.style.border = '1px dashed var(--ink-soft)';
  qPrev.style.borderRadius = '6px';
  qPrev.style.marginBottom = '14px';
  body.appendChild(qPrev);

  // Options.
  body.appendChild(makeCaps('Варианты ответа · отметьте правильный'));
  const optsHost = document.createElement('div');
  body.appendChild(optsHost);
  const optPrevs = [];

  function renderOpts() {
    optsHost.innerHTML = '';
    optPrevs.length = 0;
    draft.options.forEach(function (opt, i) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.marginBottom = '6px';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'qe-correct';
      radio.checked = !!opt.isCorrect;
      radio.style.accentColor = 'var(--accent)';
      radio.addEventListener('change', function () {
        draft.options.forEach(function (o) { o.isCorrect = false; });
        opt.isCorrect = true;
      });
      row.appendChild(radio);

      const letter = document.createElement('span');
      letter.className = 'mono';
      letter.style.width = '20px';
      letter.style.fontSize = '11px';
      letter.style.fontWeight = '700';
      letter.style.color = 'var(--ink-tertiary)';
      letter.style.textAlign = 'center';
      letter.textContent = LETTERS[i] || (i + 1);
      row.appendChild(letter);

      const wrap = document.createElement('div');
      wrap.style.flex = '1';
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.gap = '4px';

      const ta = makeTextarea(opt.text, function (v) { opt.text = v; refreshPreview(); }, 1);
      ta.style.background = opt.isCorrect ? 'var(--accent-soft)' : 'var(--paper)';
      ta.style.borderColor = opt.isCorrect ? 'var(--accent)' : 'var(--ink)';
      wrap.appendChild(ta);

      const toolbar = makeTokenToolbar(state, function (token) {
        insertAtCursor(ta, token);
        opt.text = ta.value;
        refreshPreview();
      });
      toolbar.style.marginBottom = '0';
      wrap.appendChild(toolbar);

      const prev = document.createElement('div');
      prev.style.fontSize = '12px';
      prev.style.padding = '4px 8px';
      prev.style.border = '1px dashed var(--ink-soft)';
      prev.style.borderRadius = '4px';
      prev.style.minHeight = '18px';
      wrap.appendChild(prev);
      optPrevs.push(prev);

      row.appendChild(wrap);

      if (draft.options.length > 2) {
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.style.padding = '4px';
        rm.style.background = 'none';
        rm.style.border = 'none';
        rm.style.color = 'var(--ink-tertiary)';
        rm.style.cursor = 'pointer';
        rm.appendChild(iconEl('trash', 12));
        rm.addEventListener('click', function () {
          draft.options.splice(i, 1);
          if (!draft.options.some(function (o) { return o.isCorrect; }) && draft.options[0]) {
            draft.options[0].isCorrect = true;
          }
          renderOpts();
          refreshPreview();
        });
        row.appendChild(rm);
      }
      optsHost.appendChild(row);
    });
  }
  renderOpts();

  const addOptBtn = document.createElement('button');
  addOptBtn.type = 'button';
  addOptBtn.className = 'btn btn--small';
  addOptBtn.style.marginTop = '4px';
  addOptBtn.style.borderStyle = 'dashed';
  addOptBtn.style.color = 'var(--accent)';
  addOptBtn.style.borderColor = 'var(--accent)';
  addOptBtn.appendChild(iconEl('plus', 11));
  const aLbl = document.createElement('span');
  aLbl.textContent = ' Вариант';
  addOptBtn.appendChild(aLbl);
  addOptBtn.addEventListener('click', function () {
    if (draft.options.length >= 6) return;
    draft.options.push({ text: 'Новый вариант', isCorrect: false });
    renderOpts();
    refreshPreview();
  });
  body.appendChild(addOptBtn);

  // Тема.
  const topicCaps = makeCaps('Тема');
  topicCaps.style.margin = '18px 0 6px';
  body.appendChild(topicCaps);
  const topicInput = document.createElement('input');
  topicInput.type = 'text';
  topicInput.className = 'input';
  topicInput.style.maxWidth = '300px';
  topicInput.style.width = '100%';
  topicInput.value = draft.topic || '';
  topicInput.placeholder = 'например, «сортировки»';
  topicInput.addEventListener('input', function () { draft.topic = topicInput.value; });
  body.appendChild(topicInput);

  // CR comment (non-owner only).
  let commentInput = null;
  if (asCR) {
    const cCaps = makeCaps('Комментарий к предложению (необязательно)');
    cCaps.style.margin = '18px 0 6px';
    body.appendChild(cCaps);
    commentInput = document.createElement('input');
    commentInput.type = 'text';
    commentInput.className = 'input';
    commentInput.style.width = '100%';
    commentInput.placeholder = 'Что вы предлагаете изменить и почему';
    body.appendChild(commentInput);
  }

  // Footer.
  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.gap = '8px';
  footer.style.marginTop = '22px';
  footer.style.paddingTop = '14px';
  footer.style.borderTop = '1px solid var(--ink-soft)';

  if (state.canEdit) {
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn--danger';
    delBtn.style.marginRight = 'auto';
    delBtn.appendChild(iconEl('trash', 13));
    const dLbl = document.createElement('span');
    dLbl.textContent = ' Удалить';
    delBtn.appendChild(dLbl);
    delBtn.addEventListener('click', function () { requestDeleteQuestion(state, sel, n); });
    footer.appendChild(delBtn);
  }

  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  footer.appendChild(spacer);

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = 'Отмена';
  cancel.addEventListener('click', function () {
    state.mode = 'preview';
    state.draft = null;
    renderDetail(state);
  });
  footer.appendChild(cancel);

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn btn--primary';
  save.textContent = asCR ? 'Отправить предложение' : 'Сохранить';
  save.addEventListener('click', function () { submitEdit(state, sel, save, commentInput && commentInput.value); });
  footer.appendChild(save);

  body.appendChild(footer);
  refreshPreview();
  return body;

  function refreshPreview() {
    const idMap = state.materialsById || {};
    const qHtml = renderContent(tokensToBlocks(draft.question, idMap), state.assetsBase);
    qPrev.innerHTML = qHtml || '<i style="color:var(--ink-tertiary);">пусто</i>';
    if (hasFormulas(qHtml)) typesetMath(qPrev);
    draft.options.forEach(function (opt, i) {
      const html = renderContent(tokensToBlocks(opt.text, idMap), state.assetsBase);
      if (!optPrevs[i]) return;
      optPrevs[i].innerHTML = html || '<i style="color:var(--ink-tertiary);">пусто</i>';
      if (hasFormulas(html)) typesetMath(optPrevs[i]);
    });
  }
}

// ── State actions ───────────────────────────────────────────────────

function startEdit(state, sel, asCR) {
  state.mode = 'edit';
  const mathmlMap = state.materialsByMathml || {};
  state.draft = {
    question: blocksToTokens(sel.question, mathmlMap),
    options: (sel.options || []).map(function (o) {
      return { text: blocksToTokens(o.content, mathmlMap), isCorrect: !!o.isCorrect };
    }),
    topic: sel.topic || '',
    asCR: !!asCR || !state.canEdit,
  };
  if (!state.draft.options.some(function (o) { return o.isCorrect; }) && state.draft.options[0]) {
    state.draft.options[0].isCorrect = true;
  }
  renderDetail(state);
}

async function submitEdit(state, sel, btn, comment) {
  const draft = state.draft;
  if (!draft) return;
  if (!draft.question.trim()) {
    toast('Текст вопроса не может быть пустым', { tone: 'error' });
    return;
  }
  const correctIdx = draft.options.findIndex(function (o) { return o.isCorrect; });
  if (correctIdx < 0) {
    toast('Отметьте правильный вариант', { tone: 'error' });
    return;
  }
  const idMap = state.materialsById || {};
  const questionBlocks = tokensToBlocks(draft.question, idMap);
  const optionsPayload = draft.options.map(function (o) {
    return { content: tokensToBlocks(o.text, idMap), isCorrect: !!o.isCorrect };
  });

  btn.disabled = true;
  try {
    if (draft.asCR) {
      await createChangeRequest(state.test.id, {
        request_type: 'edit_question',
        question_id: String(sel.id),
        payload: {
          question: questionBlocks,
          options: optionsPayload,
          correct_index: correctIdx,
          topic: draft.topic || null,
          comment: comment || '',
        },
      });
      toast('Предложение отправлено владельцу', { tone: 'success' });
    } else {
      const updated = { question: questionBlocks, options: optionsPayload };
      if (draft.topic) updated.topic = draft.topic;
      await updateQuestion(state.test.id, sel.id, updated);
      toast('Вопрос сохранён', { tone: 'success' });
    }
    state.mode = 'preview';
    state.draft = null;
    state.onChange();
  } catch (e) {
    toast((e && e.message) || 'Не удалось сохранить', { tone: 'error' });
  } finally {
    btn.disabled = false;
  }
}

async function startAddQuestion(state) {
  if (state.canEdit) {
    try {
      const blank = {
        question: { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Новый вопрос' }] }] },
        options: [
          { content: { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Вариант A' }] }] }, isCorrect: true },
          { content: { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Вариант B' }] }] }, isCorrect: false },
        ],
      };
      const res = await addQuestion(state.test.id, blank);
      const newQ = res && res.question;
      toast('Вопрос добавлен', { tone: 'success' });
      if (newQ) state.selId = newQ.id;
      state.mode = 'preview';
      state.draft = null;
      state.onChange();
    } catch (e) {
      toast((e && e.message) || 'Не удалось добавить', { tone: 'error' });
    }
  } else {
    // Non-owner: propose add via CR.
    try {
      await createChangeRequest(state.test.id, {
        request_type: 'add_question',
        payload: {
          question: { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Новый вопрос (предложен)' }] }] },
          options: [
            { content: { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Вариант A' }] }] }, isCorrect: true },
            { content: { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Вариант B' }] }] }, isCorrect: false },
          ],
          correct_index: 0,
        },
      });
      toast('Предложение нового вопроса отправлено', { tone: 'success' });
    } catch (e) {
      toast((e && e.message) || 'Не удалось отправить', { tone: 'error' });
    }
  }
}

async function requestDeleteQuestion(state, q, n) {
  const ok = await confirmDialog({
    title: 'Удалить Q' + n + '?',
    message: state.canEdit
      ? 'Будет удалён вопрос и связанные ответы в незавершённых попытках.'
      : 'Предложение удаления уйдёт владельцу.',
    danger: true,
    confirmLabel: 'Удалить',
  });
  if (!ok) return;
  try {
    if (state.canEdit) {
      await deleteQuestion(state.test.id, q.id);
      toast('Вопрос удалён', { tone: 'success' });
    } else {
      await createChangeRequest(state.test.id, {
        request_type: 'delete_question',
        question_id: String(q.id),
        payload: { question_id: q.id },
      });
      toast('Предложение удаления отправлено', { tone: 'success' });
    }
    state.onChange();
  } catch (e) {
    toast((e && e.message) || 'Не удалось обработать', { tone: 'error' });
  }
}

// ── Token toolbar ───────────────────────────────────────────────────

function makeTokenToolbar(state, onInsert) {
  const bar = document.createElement('div');
  bar.style.display = 'flex';
  bar.style.gap = '4px';
  bar.style.marginBottom = '4px';
  bar.style.flexWrap = 'wrap';

  // Upload image — owners only; non-owners pick from existing via panel.
  const img = makeToolbarBtn('Картинка', 'upload', async function () {
    if (!state.canEdit) {
      openMaterialsPanel({
        testId: state.test.id, canEdit: false,
        onInsert: function (token) { onInsert(token); },
      });
      return;
    }
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      const res = await uploadMaterial(state.test.id, file);
      await refreshMaterials(state);
      onInsert('[[img:' + res.id + ']]');
      toast('Картинка загружена · ID ' + res.id, { tone: 'success' });
    } catch (e) {
      toast((e && e.message) || 'Не удалось загрузить картинку', { tone: 'error' });
    }
  });
  bar.appendChild(img);

  // LaTeX formula — inline text, no upload needed.
  bar.appendChild(makeToolbarBtn('Формула', 'edit', function () {
    const latex = prompt('Введите формулу (LaTeX):', '');
    if (latex) onInsert('[[math:' + latex + ']]');
  }));

  // MathML — file picker only, server validates the XML.
  bar.appendChild(makeToolbarBtn('MathML файл', 'upload', async function () {
    if (!state.canEdit) {
      openMaterialsPanel({
        testId: state.test.id, canEdit: false,
        onInsert: function (token) { onInsert(token); },
      });
      return;
    }
    const file = await pickFile('.mml,.xml,.mathml,application/xml,text/xml');
    if (!file) return;
    try {
      const res = await uploadMaterial(state.test.id, file);
      await refreshMaterials(state);
      onInsert('[[mathml:' + res.id + ']]');
      toast('Формула загружена · ID ' + res.id, { tone: 'success' });
    } catch (e) {
      toast((e && e.message) || 'Не удалось загрузить формулу', { tone: 'error' });
    }
  }));

  // Materials browser.
  bar.appendChild(makeToolbarBtn('📚 Материалы', 'doc', function () {
    openMaterialsPanel({
      testId: state.test.id,
      canEdit: state.canEdit,
      onInsert: function (token) { onInsert(token); },
      onUpload: async function () { await refreshMaterials(state); renderAll(state); },
      onDelete: async function () {
        await refreshMaterials(state);
        // After a delete, refs may now be broken — rebuild scan + UI so
        // the ⚠ badges appear immediately.
        renderAll(state);
        state.onChange();
      },
      refCount: function (id) {
        const scan = state._scan || scanReferences(state);
        return (scan.refCounts && scan.refCounts[id]) || 0;
      },
    });
  }));

  return bar;
}

function makeToolbarBtn(label, icon, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn--ghost btn--small';
  b.appendChild(iconEl(icon, 12));
  const sp = document.createElement('span');
  sp.textContent = ' ' + label;
  b.appendChild(sp);
  b.addEventListener('click', onClick);
  return b;
}

function pickFile(accept) {
  return new Promise(function (resolve) {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.onchange = function () { resolve(input.files && input.files[0]); };
    input.click();
  });
}

// ── Misc helpers ────────────────────────────────────────────────────

function makeCaps(text) {
  const el = document.createElement('div');
  el.className = 'caps';
  el.style.marginBottom = '6px';
  el.textContent = text;
  return el;
}

function metaLine(label, value) {
  const div = document.createElement('div');
  div.textContent = label + ' — ';
  const b = document.createElement('b');
  b.style.color = 'var(--ink)';
  b.textContent = value;
  div.appendChild(b);
  return div;
}

function makeTextarea(value, onInput, rows) {
  const ta = document.createElement('textarea');
  ta.value = value || '';
  ta.className = 'input';
  ta.rows = rows || 3;
  ta.style.width = '100%';
  ta.style.fontFamily = 'inherit';
  ta.style.fontSize = '13px';
  ta.style.lineHeight = '1.5';
  ta.style.resize = 'vertical';
  ta.style.minHeight = (rows && rows > 1) ? '70px' : '36px';
  ta.addEventListener('input', function () { onInput(ta.value); });
  return ta;
}

function insertAtCursor(ta, text) {
  const start = ta.selectionStart || 0;
  const end = ta.selectionEnd || 0;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  const pos = start + text.length;
  ta.selectionStart = ta.selectionEnd = pos;
  ta.focus();
  ta.dispatchEvent(new Event('input'));
}

function findCorrectIndex(options) {
  for (let i = 0; i < options.length; i++) {
    if (options[i] && options[i].isCorrect) return i;
  }
  return -1;
}

function blocksToFlatText(content) {
  if (!content) return '';
  const blocks = Array.isArray(content) ? content : (content.blocks || []);
  const out = [];
  for (const b of blocks) {
    if (b?.type !== 'paragraph') continue;
    for (const inl of b.inlines || []) {
      if (inl?.type === 'text') out.push(inl.text);
      else if (inl?.type === 'image') out.push('[img]');
      else if (inl?.type === 'formula') out.push('[f]');
    }
  }
  return out.join(' ').trim().slice(0, 80);
}

function hasFormulaInQuestion(q) {
  function check(content) {
    if (!content) return false;
    const blocks = Array.isArray(content) ? content : (content.blocks || []);
    for (const b of blocks) {
      for (const inl of (b && b.inlines) || []) {
        if (inl && inl.type === 'formula') return true;
      }
    }
    return false;
  }
  if (check(q.question)) return true;
  for (const o of q.options || []) {
    if (check(o.content)) return true;
  }
  return false;
}
