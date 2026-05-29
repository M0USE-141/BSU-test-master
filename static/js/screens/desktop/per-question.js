/**
 * screens/desktop/per-question.js — per-question review drill-down (Phase 4).
 *
 * Route: #/test/:id/results/:attemptId/q/:n   (n is 1-based question index)
 *
 * Layout (mail-client):
 *   - Sidebar: 5-column grid of question status cells + prev/next buttons.
 *   - Detail: question text, all options with correct/user/wrong markers,
 *             explanation hint, action buttons (Flag, Open CR placeholder,
 *             Add-to-review placeholder).
 *
 * Hotkeys: ← / → to step prev/next, Esc to go back to result.
 *
 * Data sources, in order of preference:
 *   1. sessionStorage "att:<attemptId>:result" — full snap saved by
 *      taking.js when the attempt finishes (cheapest path).
 *   2. /api/attempts/{attemptId}?client_id=<clientId> + /api/tests/{id} —
 *      reconstructs the snap for direct deep-links.
 */
import { getTest } from '../../api/tests.js';
import { getAttempt } from '../../api/statistics.js';
import { setFlag, listFlagged } from '../../api/flagged.js';
import { navigate } from '../../router.js';
import { mountAppShell } from '../../components/app-shell.js';
import { buildMailLayout } from '../../components/mail-layout.js';
import { toast } from '../../components/toast.js';
import { iconEl } from '../../icons.js';
import { t } from '../../utils/locale.js';

export default async function render(root, params) {
  params = params || {};
  const main = mountAppShell(root);
  main.innerHTML = '';

  const skel = document.createElement('div');
  skel.className = 'skeleton';
  skel.style.height = '320px';
  skel.style.margin = '24px';
  skel.style.borderRadius = 'var(--radius-md)';
  main.appendChild(skel);

  const testId = params.id;
  const attemptId = params.attemptId;
  let qIdx = Math.max(0, (parseInt(params.n, 10) || 1) - 1);

  // Load.
  let data;
  try {
    data = await loadAttempt(testId, attemptId);
  } catch (e) {
    main.innerHTML = '';
    main.appendChild(emptyState('Не удалось загрузить разбор', (e && e.message) || ''));
    return;
  }

  // Pre-load flagged ids so we can show the ⚑ button state correctly.
  let flaggedIds = new Set();
  try {
    const resp = await listFlagged(testId);
    flaggedIds = new Set((resp && resp.flagged) || []);
  } catch (_) { /* best-effort */ }

  main.innerHTML = '';
  if (qIdx >= data.questions.length) qIdx = 0;

  // Build mail-layout: narrow sidebar (220px) for the question grid.
  const built = buildMailLayout(main, { sidebarWidth: 240 });

  function step(newIdx) {
    qIdx = newIdx;
    history.replaceState({}, '', `#/test/${encodeURIComponent(testId)}/results/${encodeURIComponent(attemptId)}/q/${qIdx + 1}`);
    renderSidebar(built.sidebar, data, qIdx, step);
    renderDetail(built.detail, data, qIdx, flaggedIds, testId);
  }

  renderSidebar(built.sidebar, data, qIdx, step);
  renderDetail(built.detail, data, qIdx, flaggedIds, testId);

  // Hotkeys.
  function onKey(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft'  && qIdx > 0) {
      e.preventDefault();
      step(qIdx - 1);
    } else if (e.key === 'ArrowRight' && qIdx < data.questions.length - 1) {
      e.preventDefault();
      step(qIdx + 1);
    } else if (e.key === 'Escape') {
      navigate(`/test/${encodeURIComponent(testId)}/results/${encodeURIComponent(attemptId)}`);
    }
  }
  window.addEventListener('keydown', onKey);
  // Clean up on navigation away — the router clears _root content but
  // doesn't notify; we leak this listener otherwise.
  const onHashChange = () => {
    if (!location.hash.includes('/results/')) {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHashChange);
    }
  };
  window.addEventListener('hashchange', onHashChange);
}

// ── Data loading ─────────────────────────────────────────────

async function loadAttempt(testId, attemptId) {
  // Path 1: result snap stashed by taking.js right after finish.
  let snap = null;
  try {
    const raw = sessionStorage.getItem(`att:${attemptId}:result`);
    if (raw) snap = JSON.parse(raw);
  } catch (_) {}

  // Path 2: rebuild from API (deep-link case).
  let answersMap = {};       // qId → { isCorrect, isSkipped, answerIndex }
  let questionsOrdered = []; // ordered by question_index in the attempt
  if (snap && Array.isArray(snap.questions) && snap.questions.length) {
    // We have full questions[] from snap — but its option text might be
    // just blocksToText snippets. Pull richer content from /api/tests.
    const test = await getTest(testId);
    const testById = {};
    (test.questions || []).forEach(function (q) { testById[q.id] = q; });
    questionsOrdered = snap.questions
      .map(function (q) { return testById[q.id] || q; })
      .filter(Boolean);
    if (snap.answersLocal) {
      Object.entries(snap.answersLocal).forEach(function (e) {
        answersMap[Number(e[0])] = e[1];
      });
    }
    if (Array.isArray(snap.answers)) {
      snap.answers.forEach(function (a) {
        if (!answersMap[a.questionId]) answersMap[a.questionId] = a;
      });
    }
    return {
      testTitle: snap.testTitle || test.title || testId,
      questions: questionsOrdered,
      answers: answersMap,
      attemptId: attemptId,
      finishedAt: snap.finishedAt,
    };
  }

  // Path 2 (true deep-link): fetch both attempt + test. Auth-only; the
  // server validates ownership of the attempt against the bearer user.
  const [attempt, test] = await Promise.all([
    getAttempt(attemptId).catch(function () { return null; }),
    getTest(testId).catch(function () { return null; }),
  ]);
  if (!attempt || !test) {
    const msg = !attempt ? 'Попытка не найдена' : 'Тест не найден';
    const err = new Error(msg);
    err.userMessage = msg;
    throw err;
  }
  const testById = {};
  (test.questions || []).forEach(function (q) { testById[q.id] = q; });
  // Order by question_index from the attempt; fall back to test order.
  const ordered = (attempt.answers || [])
    .slice()
    .sort(function (a, b) { return (a.questionIndex || 0) - (b.questionIndex || 0); })
    .map(function (a) { return testById[a.questionId]; })
    .filter(Boolean);
  (attempt.answers || []).forEach(function (a) {
    answersMap[a.questionId] = {
      answerIndex: a.answerIndex,
      isCorrect: a.isCorrect,
      isSkipped: a.isSkipped,
    };
  });
  return {
    testTitle: test.title || testId,
    questions: ordered.length ? ordered : (test.questions || []),
    answers: answersMap,
    attemptId: attemptId,
    finishedAt: attempt.finishedAt,
  };
}

// ── Sidebar (question grid) ──────────────────────────────────

function renderSidebar(sidebar, data, currentIdx, onStep) {
  sidebar.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'mail-layout__sidebar-head';

  const caps = document.createElement('div');
  caps.className = 'caps';
  caps.textContent = `Q${currentIdx + 1} из ${data.questions.length}`;
  head.appendChild(caps);

  const navRow = document.createElement('div');
  navRow.style.display = 'flex';
  navRow.style.gap = '6px';
  navRow.style.marginTop = '6px';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn--small';
  prevBtn.textContent = '← Пред.';
  prevBtn.disabled = currentIdx === 0;
  prevBtn.addEventListener('click', function () { if (currentIdx > 0) onStep(currentIdx - 1); });
  navRow.appendChild(prevBtn);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn--small';
  nextBtn.textContent = 'След. →';
  nextBtn.disabled = currentIdx >= data.questions.length - 1;
  nextBtn.addEventListener('click', function () { if (currentIdx < data.questions.length - 1) onStep(currentIdx + 1); });
  navRow.appendChild(nextBtn);

  head.appendChild(navRow);
  sidebar.appendChild(head);

  // Grid of question cells.
  const grid = document.createElement('div');
  grid.style.padding = '10px 12px';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
  grid.style.gap = '4px';

  data.questions.forEach(function (q, i) {
    const ans = data.answers[q.id] || {};
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.style.aspectRatio = '1';
    cell.style.borderRadius = '4px';
    cell.style.font = '600 10px/1 Inter';
    cell.style.display = 'flex';
    cell.style.alignItems = 'center';
    cell.style.justifyContent = 'center';
    cell.style.cursor = 'pointer';
    cell.textContent = String(i + 1);

    // Status colouring (semantic, not accent).
    let bg, fg, bd;
    if (i === currentIdx)             { bg = 'var(--ink)';         fg = 'var(--paper)';   bd = 'var(--ink)'; }
    else if (ans.isSkipped)           { bg = 'var(--ink-soft)';    fg = 'var(--ink-tertiary)'; bd = 'var(--ink-soft)'; }
    else if (ans.isCorrect === true)  { bg = 'var(--success-soft)'; fg = 'var(--success)'; bd = 'var(--success)'; }
    else if (ans.isCorrect === false) { bg = 'var(--error-soft)';   fg = 'var(--error)';   bd = 'var(--error)'; }
    else                              { bg = 'var(--paper)';        fg = 'var(--ink-tertiary)'; bd = 'var(--ink-soft)'; }
    cell.style.background = bg;
    cell.style.color = fg;
    cell.style.border = '1px solid ' + bd;

    cell.addEventListener('click', function () { onStep(i); });
    grid.appendChild(cell);
  });

  sidebar.appendChild(grid);
}

// ── Detail (single question) ─────────────────────────────────

function renderDetail(detail, data, qIdx, flaggedIds, testId) {
  detail.innerHTML = '';
  const q = data.questions[qIdx];
  if (!q) {
    detail.appendChild(emptyState('Вопрос не найден', ''));
    return;
  }
  const ans = data.answers[q.id] || {};
  const userIdx = (typeof ans.answerIndex === 'number') ? ans.answerIndex : (typeof ans.optionIdx === 'number' ? ans.optionIdx : -1);

  const wrap = document.createElement('div');
  wrap.style.padding = '22px 28px';
  wrap.style.maxWidth = '760px';
  detail.appendChild(wrap);

  // Tag + meta line.
  const tagRow = document.createElement('div');
  tagRow.style.display = 'flex';
  tagRow.style.gap = '8px';
  tagRow.style.alignItems = 'center';
  tagRow.style.marginBottom = '8px';

  const statusTag = document.createElement('span');
  statusTag.className = 'tag ' + (ans.isSkipped ? '' : ans.isCorrect === true ? 'tag--success' : ans.isCorrect === false ? 'tag--error' : '');
  statusTag.textContent = ans.isSkipped ? 'Пропущено' : ans.isCorrect === true ? 'Верно' : ans.isCorrect === false ? 'Неверно' : '—';
  tagRow.appendChild(statusTag);

  const meta = document.createElement('span');
  meta.className = 'mono';
  meta.style.fontSize = 'var(--fs-xs)';
  meta.style.color = 'var(--ink-tertiary)';
  meta.textContent = `Q${qIdx + 1} · ваш ответ: ${userIdx >= 0 ? String.fromCharCode(65 + userIdx) : '—'}`;
  tagRow.appendChild(meta);

  wrap.appendChild(tagRow);

  // Question text.
  const qText = document.createElement('h2');
  qText.style.font = '600 18px/1.4 Inter';
  qText.style.letterSpacing = '-0.005em';
  qText.style.margin = '0 0 18px';
  qText.textContent = extractPlainText(q.question) || '(пустой вопрос)';
  wrap.appendChild(qText);

  // Options.
  const opts = q.options || q.opts || [];
  const correctIdx = (function () {
    if (typeof q.correct === 'number') return q.correct;
    for (let i = 0; i < opts.length; i++) {
      if (opts[i] && opts[i].isCorrect) return i;
    }
    return -1;
  })();

  const optWrap = document.createElement('div');
  optWrap.style.display = 'flex';
  optWrap.style.flexDirection = 'column';
  optWrap.style.gap = '8px';
  optWrap.style.marginBottom = '18px';
  wrap.appendChild(optWrap);

  opts.forEach(function (opt, i) {
    const isCorrect = i === correctIdx;
    const isUser    = i === userIdx;
    const isSkippedHere = ans.isSkipped && isUser;

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.padding = '10px 12px';
    row.style.borderRadius = '8px';
    row.style.border = '1.5px solid var(--ink-soft)';
    row.style.background = 'var(--paper)';

    if (isCorrect) {
      row.style.border = '1.5px solid var(--success)';
      row.style.background = 'var(--success-soft)';
    } else if (isUser && !isCorrect && !isSkippedHere) {
      row.style.border = '1.5px solid var(--error)';
      row.style.background = 'var(--error-soft)';
    }

    const key = document.createElement('span');
    key.style.width = '22px';
    key.style.height = '22px';
    key.style.borderRadius = '999px';
    key.style.display = 'flex';
    key.style.alignItems = 'center';
    key.style.justifyContent = 'center';
    key.style.fontSize = '11px';
    key.style.fontWeight = 'var(--fw-bold)';
    key.style.flexShrink = '0';
    key.textContent = String.fromCharCode(65 + i);
    if (isCorrect) {
      key.style.background = 'var(--success)';
      key.style.color = '#fff';
    } else if (isUser && !isCorrect) {
      key.style.background = 'var(--error)';
      key.style.color = '#fff';
    } else {
      key.style.border = '1.5px solid var(--ink)';
      key.style.color = 'var(--ink)';
    }
    row.appendChild(key);

    const text = document.createElement('span');
    text.style.flex = '1';
    text.textContent = extractPlainText(opt.content || opt.text || opt) || '';
    row.appendChild(text);

    if (isCorrect) {
      const tag = document.createElement('span');
      tag.className = 'tag tag--success';
      tag.textContent = 'правильный';
      row.appendChild(tag);
    } else if (isUser && !isCorrect) {
      const tag = document.createElement('span');
      tag.className = 'tag tag--error';
      tag.textContent = 'ваш ответ';
      row.appendChild(tag);
    }

    optWrap.appendChild(row);
  });

  // Optional explanation box.
  const explanation = extractPlainText(q.explanation || q.discussion || '');
  if (explanation) {
    const box = document.createElement('div');
    box.style.background = 'var(--info-soft)';
    box.style.borderLeft = '3px solid var(--info)';
    box.style.padding = '10px 14px';
    box.style.borderRadius = '0 8px 8px 0';
    const cap = document.createElement('div');
    cap.className = 'caps';
    cap.style.color = 'var(--info)';
    cap.style.marginBottom = '4px';
    cap.textContent = 'Разбор';
    box.appendChild(cap);
    const txt = document.createElement('div');
    txt.style.fontSize = 'var(--fs-sm)';
    txt.style.color = 'var(--ink-secondary)';
    txt.style.lineHeight = '1.6';
    txt.textContent = explanation;
    box.appendChild(txt);
    wrap.appendChild(box);
  }

  // Action buttons.
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '6px';
  actions.style.marginTop = '14px';

  const flagBtn = document.createElement('button');
  flagBtn.type = 'button';
  flagBtn.className = 'btn btn--small';
  function paintFlag() {
    flagBtn.innerHTML = '';
    flagBtn.appendChild(iconEl('flag', 12));
    const span = document.createElement('span');
    span.textContent = flaggedIds.has(q.id) ? ' Снять отметку' : ' Отметить';
    flagBtn.appendChild(span);
  }
  paintFlag();
  flagBtn.addEventListener('click', async function () {
    const willFlag = !flaggedIds.has(q.id);
    flagBtn.disabled = true;
    try {
      await setFlag(testId, q.id, willFlag);
      if (willFlag) flaggedIds.add(q.id); else flaggedIds.delete(q.id);
      paintFlag();
      toast(willFlag ? 'Вопрос отмечен' : 'Отметка снята', { tone: 'success' });
    } catch (e) {
      toast('Не удалось обновить отметку', { tone: 'error' });
    } finally {
      flagBtn.disabled = false;
    }
  });
  actions.appendChild(flagBtn);

  wrap.appendChild(actions);

  // Footer nav (mirror sidebar prev/next).
  const footerNav = document.createElement('div');
  footerNav.style.display = 'flex';
  footerNav.style.gap = '8px';
  footerNav.style.marginTop = '24px';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn';
  backBtn.textContent = '← К результатам';
  backBtn.addEventListener('click', function () {
    navigate(`/test/${encodeURIComponent(testId)}/results/${encodeURIComponent(data.attemptId)}`);
  });
  footerNav.appendChild(backBtn);
  wrap.appendChild(footerNav);
}

// ── Helpers ──────────────────────────────────────────────────

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

function extractPlainText(blocks) {
  if (!blocks) return '';
  if (typeof blocks === 'string') return blocks;
  if (blocks.blocks) blocks = blocks.blocks;
  if (!Array.isArray(blocks)) return '';
  const out = [];
  blocks.forEach(function (block) {
    if (block.type === 'paragraph' && Array.isArray(block.inlines)) {
      block.inlines.forEach(function (inl) {
        if (inl.type === 'text' && inl.text) out.push(inl.text);
      });
    }
  });
  return out.join(' ').trim();
}
