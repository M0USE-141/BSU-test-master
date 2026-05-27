/**
 * screens/desktop/change-requests.js — CR mail-client (Phase 5d).
 *
 * Route: /change-requests/:testId
 *
 * Layout: AppShell + MailLayout.
 *   Sidebar (300px):
 *     - Header caps + status filter chips (Pending / Approved /
 *       Rejected / All) with live counts.
 *     - List of CRs: author, status badge, request type, time.
 *   Detail:
 *     - Header: status tag + caps "CR #N · {test}" + h2 title +
 *       author row. Action buttons for the owner on pending requests.
 *     - Body — side-by-side question diff card. The "before" side
 *       uses the current question text from the loaded test (no
 *       backend change needed); the "after" side renders the
 *       proposed payload fields (question, options, correct, etc.).
 *     - Optional review comment card.
 *
 * Backend: existing listChangeRequests / approveChangeRequest /
 * rejectChangeRequest endpoints. No schema change — the diff "before"
 * is reconstructed client-side from the loaded test payload.
 */
import {
  listChangeRequests,
  approveChangeRequest,
  rejectChangeRequest,
} from '../../api/change-requests.js';
import { getTest } from '../../api/tests.js';
import { navigate } from '../../router.js';
import { mountAppShell } from '../../components/app-shell.js';
import { buildMailLayout, buildListRow } from '../../components/mail-layout.js';
import { confirm as confirmDialog } from '../../components/confirm-dialog.js';
import { toast } from '../../components/toast.js';
import { iconEl } from '../../icons.js';
import { getState } from '../../state.js';
import { t } from '../../utils/locale.js';

let _renderToken = 0;

export default async function render(root, params) {
  params = params || {};
  const token = ++_renderToken;
  const stale = function () { return _renderToken !== token; };

  const main = mountAppShell(root);
  main.innerHTML = '';

  const testId = params.testId;
  if (!testId) { navigate('/home'); return; }

  // Skeleton.
  const skel = document.createElement('div');
  skel.className = 'skeleton';
  skel.style.height = '60%';
  skel.style.minHeight = '300px';
  skel.style.margin = '24px';
  skel.style.borderRadius = 'var(--radius-md)';
  main.appendChild(skel);

  // Load test + initial pending CRs in parallel.
  const [test, initialCRs] = await Promise.all([
    getTest(testId).catch(function () { return null; }),
    loadCRs(testId, 'pending'),
  ]);
  if (stale()) return;

  if (!test) {
    main.innerHTML = '';
    main.appendChild(emptyState('Тест не найден', ''));
    return;
  }

  main.innerHTML = '';

  // Build question index for the "before" side of the diff.
  const questionsById = {};
  (test.questions || []).forEach(function (q) { questionsById[q.id] = q; });

  const state = {
    testId: testId,
    test: test,
    questionsById: questionsById,
    isOwner: !!(test.is_owner || (getState().user && test.owner_id === getState().user.id)),
    status: params.status || 'pending',  // pending | approved | rejected | all
    items: initialCRs,
    counts: { pending: 0, approved: 0, rejected: 0 },
    selectedId: null,
  };
  // We also need the counts for the other filters — fire-and-forget,
  // refresh once the chips render.
  refreshCounts(state, function () { renderSidebar(built.sidebar, built.detail, state); });

  // Default selection: first row of the active filter.
  if (state.items.length) state.selectedId = state.items[0].id;

  const built = buildMailLayout(main, { sidebarWidth: 320 });
  renderSidebar(built.sidebar, built.detail, state);
  renderDetail(built.detail, state);
}

// ─── Sidebar ─────────────────────────────────────────────────

function renderSidebar(sidebar, detail, state) {
  sidebar.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'mail-layout__sidebar-head';

  const headRow = document.createElement('div');
  headRow.style.display = 'flex';
  headRow.style.justifyContent = 'space-between';
  headRow.style.alignItems = 'center';
  const caps = document.createElement('div');
  caps.className = 'caps';
  caps.textContent = (t('test.change_requests') || 'Change Requests') + ' · ' + (state.test.title || state.testId);
  headRow.appendChild(caps);

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn--icon';
  backBtn.setAttribute('aria-label', 'Назад');
  backBtn.appendChild(iconEl('chevL', 14));
  backBtn.addEventListener('click', function () {
    navigate('/home?id=' + encodeURIComponent(state.testId));
  });
  headRow.appendChild(backBtn);
  head.appendChild(headRow);

  const filterRow = document.createElement('div');
  filterRow.style.display = 'flex';
  filterRow.style.gap = '4px';
  filterRow.style.marginTop = '8px';
  filterRow.style.flexWrap = 'wrap';

  const filters = [
    ['pending',  'Pending',  state.counts.pending],
    ['approved', 'Approved', state.counts.approved],
    ['rejected', 'Rejected', state.counts.rejected],
    ['all',      'Все',      null],
  ];
  filters.forEach(function (f) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip--small' + (state.status === f[0] ? ' chip--active' : '');
    chip.textContent = f[1] + (f[2] !== null ? (' · ' + f[2]) : '');
    chip.addEventListener('click', async function () {
      state.status = f[0];
      state.items = await loadCRs(state.testId, f[0]);
      state.selectedId = state.items.length ? state.items[0].id : null;
      renderSidebar(sidebar, detail, state);
      renderDetail(detail, state);
    });
    filterRow.appendChild(chip);
  });
  head.appendChild(filterRow);
  sidebar.appendChild(head);

  // List.
  const listWrap = document.createElement('div');
  listWrap.style.flex = '1';
  listWrap.style.overflowY = 'auto';
  sidebar.appendChild(listWrap);

  if (state.items.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '32px 16px';
    empty.style.textAlign = 'center';
    empty.style.fontSize = '13px';
    empty.style.color = 'var(--ink-tertiary)';
    empty.textContent = 'Пусто';
    listWrap.appendChild(empty);
    return;
  }

  state.items.forEach(function (cr) {
    const row = buildListRow({
      title: humanType(cr.request_type, cr.question_id),
      sub: '@' + (cr.username || 'user') + ' · ' + relative(cr.created_at),
      right: statusGlyph(cr.status),
      active: cr.id === state.selectedId,
      onClick: function () {
        state.selectedId = cr.id;
        renderSidebar(sidebar, detail, state);
        renderDetail(detail, state);
      },
    });
    row.dataset.id = cr.id;
    // Author avatar.
    const av = document.createElement('span');
    av.className = 'avatar avatar--sm';
    av.style.marginRight = '4px';
    av.style.alignSelf = 'center';
    av.textContent = (cr.username || '?').slice(0, 2).toUpperCase();
    row.insertBefore(av, row.firstChild);
    listWrap.appendChild(row);
  });
}

// ─── Detail ──────────────────────────────────────────────────

function renderDetail(detail, state) {
  detail.innerHTML = '';
  const cr = state.items.find(function (c) { return c.id === state.selectedId; });
  if (!cr) {
    const empty = document.createElement('div');
    empty.className = 'mail-detail__empty';
    empty.textContent = 'Выберите CR';
    detail.appendChild(empty);
    return;
  }

  const wrap = document.createElement('div');
  wrap.style.padding = '22px 28px';
  wrap.style.maxWidth = '780px';
  detail.appendChild(wrap);

  // Header.
  const headRow = document.createElement('div');
  headRow.style.display = 'flex';
  headRow.style.justifyContent = 'space-between';
  headRow.style.alignItems = 'flex-start';
  headRow.style.marginBottom = '18px';

  const left = document.createElement('div');

  const badgeRow = document.createElement('div');
  badgeRow.style.display = 'flex';
  badgeRow.style.alignItems = 'center';
  badgeRow.style.gap = '8px';
  badgeRow.style.marginBottom = '6px';
  badgeRow.appendChild(statusTag(cr.status));
  const idCaps = document.createElement('span');
  idCaps.className = 'caps';
  idCaps.textContent = 'CR #' + cr.id + ' · ' + (state.test.title || state.testId);
  badgeRow.appendChild(idCaps);
  left.appendChild(badgeRow);

  const title = document.createElement('h2');
  title.style.fontSize = '20px';
  title.style.margin = '0';
  title.style.letterSpacing = '-0.01em';
  title.style.fontWeight = 'var(--fw-bold)';
  title.textContent = humanType(cr.request_type, cr.question_id);
  left.appendChild(title);

  const authorRow = document.createElement('div');
  authorRow.style.display = 'flex';
  authorRow.style.gap = '10px';
  authorRow.style.alignItems = 'center';
  authorRow.style.marginTop = '8px';
  authorRow.style.fontSize = '12px';
  authorRow.style.color = 'var(--ink-secondary)';
  const av = document.createElement('span');
  av.className = 'avatar avatar--sm';
  av.textContent = (cr.username || '?').slice(0, 2).toUpperCase();
  authorRow.appendChild(av);
  const who = document.createElement('span');
  const b = document.createElement('b');
  b.style.color = 'var(--ink)';
  b.textContent = '@' + (cr.username || 'user');
  who.appendChild(b);
  who.appendChild(document.createTextNode(' · ' + relative(cr.created_at)));
  authorRow.appendChild(who);
  left.appendChild(authorRow);

  headRow.appendChild(left);

  // Actions (owner only, pending only).
  if (state.isOwner && cr.status === 'pending') {
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '6px';

    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'btn btn--danger';
    reject.appendChild(iconEl('x', 14));
    const rL = document.createElement('span');
    rL.textContent = ' Отклонить';
    reject.appendChild(rL);
    reject.addEventListener('click', function () { decideOnCR(state, cr, 'reject', detail); });
    actions.appendChild(reject);

    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'btn btn--primary';
    approve.appendChild(iconEl('check', 14));
    const aL = document.createElement('span');
    aL.textContent = ' Принять';
    approve.appendChild(aL);
    approve.addEventListener('click', function () { decideOnCR(state, cr, 'approve', detail); });
    actions.appendChild(approve);

    headRow.appendChild(actions);
  }

  wrap.appendChild(headRow);

  // Diff card.
  const diffCard = buildCard('Изменения');
  diffCard.body.appendChild(renderDiff(state, cr));
  wrap.appendChild(diffCard.el);

  // Reviewer comment.
  if (cr.review_comment) {
    const cmt = buildCard('Комментарий рецензента');
    cmt.el.style.marginTop = '14px';
    const txt = document.createElement('div');
    txt.style.fontSize = '13px';
    txt.style.color = 'var(--ink-secondary)';
    txt.style.lineHeight = '1.6';
    txt.textContent = cr.review_comment;
    cmt.body.appendChild(txt);
    wrap.appendChild(cmt.el);
  }

  // Raw payload — collapsible (useful for debugging non-text edits).
  const details = document.createElement('details');
  details.style.marginTop = '14px';
  const summary = document.createElement('summary');
  summary.style.fontSize = '12px';
  summary.style.color = 'var(--ink-tertiary)';
  summary.style.cursor = 'pointer';
  summary.textContent = 'Raw payload';
  details.appendChild(summary);
  const pre = document.createElement('pre');
  pre.className = 'mono';
  pre.style.marginTop = '8px';
  pre.style.padding = '12px';
  pre.style.background = 'var(--ink-soft)';
  pre.style.borderRadius = 'var(--radius-md)';
  pre.style.fontSize = '11px';
  pre.style.lineHeight = '1.5';
  pre.style.overflowX = 'auto';
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-word';
  pre.textContent = JSON.stringify(cr.payload || {}, null, 2);
  details.appendChild(pre);
  wrap.appendChild(details);
}

// ─── Diff renderer ───────────────────────────────────────────

function renderDiff(state, cr) {
  const wrap = document.createElement('div');
  const payload = cr.payload || {};
  const type = cr.request_type;
  // Map the existing question (for "before") when this CR targets an
  // existing question_id.
  const existing = cr.question_id ? state.questionsById[Number(cr.question_id)] : null;

  if (type === 'edit_question' && existing) {
    // Side-by-side: current question vs proposed payload.question.
    appendCaptionedDiff(
      wrap,
      'Условие',
      blockToText(existing.question) || '',
      payload.question != null ? blockToText(payload.question) : null,
    );
    // Options.
    const existingOpts = (existing.options || []).map(blockToText);
    const proposedOpts = (payload.options || []).map(function (o) {
      // Options might be raw blocks or { content: blocks }.
      return blockToText(o && o.content ? o.content : o);
    });
    if (existingOpts.length || proposedOpts.length) {
      appendCaptionedDiff(
        wrap,
        'Варианты',
        existingOpts.map(function (o, i) { return String.fromCharCode(65 + i) + ') ' + o; }).join('\n'),
        payload.options != null
          ? proposedOpts.map(function (o, i) { return String.fromCharCode(65 + i) + ') ' + o; }).join('\n')
          : null,
      );
    }
    // Correct.
    if (payload.correct_index !== undefined) {
      const existingCorrect = (existing.options || []).findIndex(function (o) { return o && o.isCorrect; });
      appendCaptionedDiff(
        wrap,
        'Правильный ответ',
        existingCorrect >= 0 ? String.fromCharCode(65 + existingCorrect) : '—',
        String.fromCharCode(65 + Number(payload.correct_index)),
      );
    }
    return wrap;
  }

  if (type === 'add_question') {
    const cap = document.createElement('div');
    cap.className = 'caps';
    cap.style.marginBottom = '6px';
    cap.textContent = 'Новый вопрос';
    wrap.appendChild(cap);

    const block = document.createElement('div');
    block.style.background = 'var(--success-soft)';
    block.style.border = '1px solid var(--success)';
    block.style.borderRadius = '6px';
    block.style.padding = '10px 12px';
    block.style.fontSize = '13px';
    block.style.lineHeight = '1.5';
    block.textContent = blockToText(payload.question) || '(пустой вопрос)';
    wrap.appendChild(block);

    if (Array.isArray(payload.options) && payload.options.length) {
      const optsLabel = document.createElement('div');
      optsLabel.className = 'caps';
      optsLabel.style.marginTop = '12px';
      optsLabel.style.marginBottom = '6px';
      optsLabel.textContent = 'Варианты';
      wrap.appendChild(optsLabel);
      payload.options.forEach(function (o, i) {
        const row = document.createElement('div');
        row.style.padding = '6px 12px';
        row.style.borderRadius = '6px';
        row.style.marginBottom = '4px';
        row.style.fontSize = '13px';
        const isCorrect = (payload.correct_index !== undefined && Number(payload.correct_index) === i) || (o && o.isCorrect);
        if (isCorrect) {
          row.style.background = 'var(--success-soft)';
          row.style.border = '1px solid var(--success)';
        } else {
          row.style.border = '1px solid var(--ink-soft)';
        }
        row.textContent = String.fromCharCode(65 + i) + ') ' + blockToText(o && o.content ? o.content : o);
        wrap.appendChild(row);
      });
    }
    return wrap;
  }

  if (type === 'delete_question' && existing) {
    const cap = document.createElement('div');
    cap.className = 'caps';
    cap.style.marginBottom = '6px';
    cap.textContent = 'Удалить вопрос';
    wrap.appendChild(cap);
    const block = document.createElement('div');
    block.style.background = 'var(--error-soft)';
    block.style.border = '1px solid var(--error)';
    block.style.borderRadius = '6px';
    block.style.padding = '10px 12px';
    block.style.fontSize = '13px';
    block.style.lineHeight = '1.5';
    block.style.textDecoration = 'line-through';
    block.textContent = blockToText(existing.question) || '';
    wrap.appendChild(block);
    return wrap;
  }

  // Fallback — render payload as JSON.
  const cap = document.createElement('div');
  cap.className = 'caps';
  cap.style.marginBottom = '6px';
  cap.textContent = 'Предложенные изменения';
  wrap.appendChild(cap);
  const pre = document.createElement('pre');
  pre.className = 'mono';
  pre.style.fontSize = '11px';
  pre.style.lineHeight = '1.5';
  pre.style.background = 'var(--ink-soft)';
  pre.style.padding = '12px';
  pre.style.borderRadius = '6px';
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-word';
  pre.textContent = JSON.stringify(payload, null, 2);
  wrap.appendChild(pre);
  return wrap;
}

function appendCaptionedDiff(wrap, label, before, after) {
  const block = document.createElement('div');
  block.style.marginBottom = '14px';

  const cap = document.createElement('div');
  cap.className = 'caps';
  cap.style.marginBottom = '6px';
  cap.textContent = label;
  block.appendChild(cap);

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = '10px';

  // "Before" — always rendered (even when CR didn't propose this field,
  // for readability).
  const beforeBox = document.createElement('div');
  beforeBox.style.background = 'var(--error-soft)';
  beforeBox.style.border = '1px solid var(--error)';
  beforeBox.style.borderRadius = '6px';
  beforeBox.style.padding = '10px 12px';
  const beforeTag = document.createElement('span');
  beforeTag.className = 'tag tag--error';
  beforeTag.textContent = 'было';
  beforeBox.appendChild(beforeTag);
  const beforeText = document.createElement('div');
  beforeText.style.fontSize = '13px';
  beforeText.style.marginTop = '8px';
  beforeText.style.lineHeight = '1.55';
  beforeText.style.whiteSpace = 'pre-wrap';
  beforeText.textContent = String(before || '');
  beforeBox.appendChild(beforeText);
  grid.appendChild(beforeBox);

  // "After" — render only when proposed, else "(без изменений)".
  const afterBox = document.createElement('div');
  if (after != null) {
    afterBox.style.background = 'var(--success-soft)';
    afterBox.style.border = '1px solid var(--success)';
  } else {
    afterBox.style.background = 'var(--ink-soft)';
    afterBox.style.border = '1px solid var(--ink-soft)';
  }
  afterBox.style.borderRadius = '6px';
  afterBox.style.padding = '10px 12px';
  const afterTag = document.createElement('span');
  afterTag.className = 'tag ' + (after != null ? 'tag--success' : '');
  afterTag.textContent = after != null ? 'стало' : 'без изменений';
  afterBox.appendChild(afterTag);
  if (after != null) {
    const afterText = document.createElement('div');
    afterText.style.fontSize = '13px';
    afterText.style.marginTop = '8px';
    afterText.style.lineHeight = '1.55';
    afterText.style.whiteSpace = 'pre-wrap';
    afterText.textContent = String(after);
    afterBox.appendChild(afterText);
  }
  grid.appendChild(afterBox);

  block.appendChild(grid);
  wrap.appendChild(block);
}

// ─── Decide handler ──────────────────────────────────────────

async function decideOnCR(state, cr, decision, detail) {
  const confirmLabel = decision === 'approve' ? 'Принять CR' : 'Отклонить CR';
  const message = decision === 'approve'
    ? 'Изменения будут применены к тесту и автор будет уведомлён.'
    : 'CR будет помечен как отклонённый. Автор получит уведомление.';
  const ok = await confirmDialog({
    title: confirmLabel + '?',
    message: message,
    danger: decision === 'reject',
    confirmLabel: confirmLabel,
  });
  if (!ok) return;

  try {
    if (decision === 'approve') await approveChangeRequest(state.testId, cr.id);
    else                        await rejectChangeRequest(state.testId, cr.id);
    toast(decision === 'approve' ? 'CR принят' : 'CR отклонён', { tone: 'success' });
    // Refresh items + counts.
    state.items = await loadCRs(state.testId, state.status);
    state.selectedId = state.items.length ? state.items[0].id : null;
    refreshCounts(state, function () {
      const sidebar = detail.parentElement.querySelector('.mail-layout__sidebar');
      if (sidebar) renderSidebar(sidebar, detail, state);
    });
    const sidebar = detail.parentElement.querySelector('.mail-layout__sidebar');
    if (sidebar) renderSidebar(sidebar, detail, state);
    renderDetail(detail, state);
  } catch (e) {
    toast((e && e.message) || 'Не удалось обработать CR', { tone: 'error' });
  }
}

// ─── Loaders ─────────────────────────────────────────────────

async function loadCRs(testId, status) {
  try {
    const opts = status && status !== 'all' ? { status: status } : {};
    const resp = await listChangeRequests(testId, opts);
    return (resp && (resp.change_requests || resp.items || resp)) || [];
  } catch (_) {
    return [];
  }
}

function refreshCounts(state, after) {
  Promise.all([
    loadCRs(state.testId, 'pending'),
    loadCRs(state.testId, 'approved'),
    loadCRs(state.testId, 'rejected'),
  ]).then(function (r) {
    state.counts = {
      pending:  r[0].length,
      approved: r[1].length,
      rejected: r[2].length,
    };
    if (after) after();
  }).catch(function () { /* leave 0s in place */ });
}

// ─── Building blocks ─────────────────────────────────────────

function buildCard(title) {
  const el = document.createElement('div');
  el.className = 'card';
  el.style.padding = '0';
  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  head.style.justifyContent = 'space-between';
  head.style.padding = '12px 14px';
  head.style.borderBottom = '1px solid var(--ink-soft)';
  const titleEl = document.createElement('div');
  titleEl.className = 'card__title';
  titleEl.style.fontSize = '13px';
  titleEl.style.fontWeight = 'var(--fw-semibold)';
  titleEl.textContent = title;
  head.appendChild(titleEl);
  el.appendChild(head);
  const body = document.createElement('div');
  body.style.padding = '14px';
  el.appendChild(body);
  return { el: el, head: head, body: body };
}

function emptyState(title, desc) {
  const el = document.createElement('div');
  el.className = 'empty';
  const t = document.createElement('div');
  t.className = 'empty__title';
  t.textContent = title;
  el.appendChild(t);
  if (desc) {
    const d = document.createElement('div');
    d.className = 'empty__desc';
    d.textContent = desc;
    el.appendChild(d);
  }
  return el;
}

function humanType(reqType, qid) {
  switch (reqType) {
    case 'add_question':    return 'Новый вопрос';
    case 'edit_question':   return 'Правка вопроса · Q' + (qid || '');
    case 'delete_question': return 'Удалить вопрос · Q' + (qid || '');
    case 'edit_settings':   return 'Изменения в настройках';
    default:                return reqType || 'Изменение';
  }
}

function statusTag(status) {
  const tag = document.createElement('span');
  tag.className = 'tag tag--' + (status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'warning');
  tag.textContent = status;
  return tag;
}

function statusGlyph(status) {
  // For the sidebar "right" column.
  if (status === 'approved') return '✓';
  if (status === 'rejected') return '✗';
  return '•';
}

function blockToText(blocks) {
  // Accepts: string | { blocks: [...] } | array of blocks.
  if (!blocks) return '';
  if (typeof blocks === 'string') return blocks;
  if (blocks.blocks) blocks = blocks.blocks;
  if (!Array.isArray(blocks)) return '';
  const out = [];
  blocks.forEach(function (block) {
    if (block && block.type === 'paragraph' && Array.isArray(block.inlines)) {
      block.inlines.forEach(function (inl) {
        if (inl && inl.type === 'text' && inl.text) out.push(inl.text);
      });
    }
  });
  return out.join(' ').trim();
}

function relative(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diff = Math.max(0, Date.now() - d.getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1)  return 'только что';
    if (min < 60) return min + ' мин';
    const h = Math.floor(min / 60);
    if (h < 24)   return h + ' ч';
    const dDays = Math.floor(h / 24);
    if (dDays < 30) return dDays + ' дн';
    return d.toLocaleDateString('ru', { day: '2-digit', month: 'short' });
  } catch (_) { return ''; }
}
