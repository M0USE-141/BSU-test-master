/**
 * mobile/per-question.js — single-question review (M4 redesign).
 *
 * Reached from the question grid on the results screen. Shows the
 * question text, every option, marks the correct answer in accent and
 * the user's wrong choice (if any) in error red. Sticky bar at bottom
 * carries Prev / Next; both buttons disable at the bounds.
 *
 * Backend: tries the sessionStorage snapshot first (written by taking.js
 * on submit), falls back to `getAttempt`. The same shape both produce
 * — `{ questionCount, questions, answers, answersLocal, ... }` — is
 * handled by `pickQuestion()`.
 */
import { getAttempt } from '../../api/attempts.js';
import { getTest } from '../../api/tests.js';
import { setFlag, listFlagged } from '../../api/flagged.js';
import { getMyQuestionStats } from '../../api/statistics.js';
import { accuracyBadge } from '../../utils/charts.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import {
  topBar, mShell, mBtn, mSticky, caps,
} from '../../components/mobile-atoms.js';
import { toast } from '../../components/toast.js';
import { iconEl } from '../../icons.js';

let _keyHandler = null;

let _renderToken = 0;

// Module-level cache keyed by attemptId. Per-question navigation re-runs
// this whole render function on every Prev/Next, which previously refetched
// getAttempt + getTest + getMyQuestionStats + listFlagged on every step —
// the user perceived this as a "loading flash" between questions. We now
// fetch once on first entry and reuse the cached blob for subsequent
// navigations within the same attempt.
const _cache = new Map(); // attemptId -> { snap, testPayload, kdByQ, flaggedSet }

async function loadAttemptBundle(testId, attemptId) {
  const cached = _cache.get(attemptId);
  if (cached) return cached;

  let snap = readSnap(attemptId);
  if (!snap) {
    try { snap = await getAttempt(attemptId); }
    catch { return null; }
  }
  if (!snap) return null;

  let testPayload = null;
  try { testPayload = await getTest(testId); } catch { /* graceful fallback */ }

  let kdByQ = {};
  try {
    const ks = await getMyQuestionStats(testId);
    for (const qStat of (ks.questions || [])) kdByQ[String(qStat.questionId)] = qStat;
  } catch (_) { kdByQ = {}; }

  let flaggedSet = new Set();
  try {
    const resp = await listFlagged(testId);
    flaggedSet = new Set((resp && resp.flagged) || []);
  } catch { /* not signed in or offline — leave empty */ }

  const bundle = { snap, testPayload, kdByQ, flaggedSet };
  _cache.set(attemptId, bundle);
  return bundle;
}

// Invalidate caches that don't belong to this attempt — keeps memory bounded
// to one attempt at a time. Called on first render of a new attemptId.
function pruneCache(currentAttemptId) {
  for (const k of _cache.keys()) {
    if (k !== currentAttemptId) _cache.delete(k);
  }
}

function readSnap(attemptId) {
  // taking.js writes the snapshot under `att:<id>:result` on submit.
  try {
    const raw = sessionStorage.getItem(`att:${attemptId}:result`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function questionTextOf(q) {
  if (!q) return '';
  const blocks = q.question?.blocks || q.questionText?.blocks || [];
  if (blocks.length) {
    const inlines = blocks[0].inlines || [];
    return inlines.map(i => i.text || '').join('').trim();
  }
  if (typeof q.question === 'string') return q.question;
  if (typeof q.questionText === 'string') return q.questionText;
  return '';
}

function optionText(opt) {
  if (opt == null) return '';
  if (typeof opt === 'string') return opt;
  // Options come as { content: { blocks: [...] }, isCorrect } from the API.
  const blocks = opt.content?.blocks || [];
  if (blocks.length) {
    const inlines = blocks[0].inlines || [];
    return inlines.map(i => i.text || '').join('').trim();
  }
  return String(opt.text || '');
}

function correctOptionIndex(q) {
  if (q.correctOptionIndex != null) return q.correctOptionIndex;
  if (q.correct != null && typeof q.correct === 'number') return q.correct;
  const opts = q.options || q.opts || [];
  return opts.findIndex(o => o && (o.isCorrect === true));
}

function userOptionIndex(snap, n) {
  const answersLocal = snap.answersLocal || {};
  // answersLocal is keyed by question.id, not by 1/0-based position.
  // Resolve via snap.questions[n-1].id. Prefer `canonical` (the index
  // in the canonical/server order) over `optionIdx` (shuffled), because
  // the review screen renders options in canonical order.
  const snapQs = Array.isArray(snap.questions) ? snap.questions : [];
  const qId = snapQs[n - 1]?.id;
  const local = qId != null ? answersLocal[qId] : null;
  if (local) {
    if (Number.isInteger(local.canonical)) return local.canonical;
    if (local.optionIdx != null) return local.optionIdx;
  }
  const apiAnswers = Array.isArray(snap.answers) ? snap.answers : [];
  // Find by questionIndex (0-based) first, fall back to array index.
  let a = apiAnswers.find(x => (x.questionIndex ?? -1) === n - 1);
  if (!a) a = apiAnswers[n - 1];
  if (!a) return null;
  if (a.isSkipped) return null;
  return a.optionIndex ?? a.optionIdx ?? a.answerIndex ?? null;
}

function buildTag(text, tone) {
  const map = {
    ok:   { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
    bad:  { bg: 'var(--error-soft)',  fg: 'var(--error)' },
    skip: { bg: 'var(--ink-soft)',    fg: 'var(--ink-fade)' },
    user: { bg: 'var(--error-soft)',  fg: 'var(--error)' },
  };
  const { bg, fg } = map[tone] || map.skip;
  const span = document.createElement('span');
  Object.assign(span.style, {
    display: 'inline-flex', alignItems: 'center', gap: '3px',
    padding: '2px 8px', borderRadius: 'var(--radius-pill)',
    fontSize: '10px', fontWeight: '600',
    letterSpacing: '.04em', textTransform: 'uppercase',
    background: bg, color: fg,
  });
  span.textContent = text;
  return span;
}

function extractPlain(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  const blocks = val.blocks || (Array.isArray(val) ? val : []);
  if (!Array.isArray(blocks)) return '';
  return blocks
    .flatMap(b => (b.inlines || []).map(i => i.text || ''))
    .join(' ').trim();
}

export default async function render(root, params = {}) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  // Tear down any keydown listener installed by a previous render.
  if (_keyHandler) {
    window.removeEventListener('keydown', _keyHandler);
    _keyHandler = null;
  }

  const testId = params.id;
  const attemptId = params.attemptId;
  const n = Math.max(1, Number(params.n) || 1);
  if (!testId || !attemptId) { navigate('/home'); return; }

  // Loader skeleton.
  const skeleton = document.createElement('div');
  skeleton.style.padding = '14px 16px';
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('div');
    s.className = 'skeleton';
    Object.assign(s.style, { height: '60px', borderRadius: 'var(--radius-md)', marginBottom: '8px' });
    skeleton.appendChild(s);
  }
  mShell({
    root,
    topbar: topBar({
      title: '…',
      // Explicit function — topBar's default handler calls history.back()
      // whenever browser history is non-empty, which on per-question would
      // walk to the previous question (or the taking screen for q1)
      // instead of returning to the results grid.
      back: () => navigate(`/test/${testId}/results/${attemptId}`),
    }),
    body: skeleton, hideNav: true,
  });

  // Single bundle fetch (cached per attemptId — Prev/Next reuse it).
  pruneCache(attemptId);
  const bundle = await loadAttemptBundle(testId, attemptId);
  if (stale()) return;
  if (!bundle) { navigate('/error/404'); return; }
  const { snap, testPayload, kdByQ } = bundle;
  const allTestQs = testPayload?.questions || [];

  const questions = snap.questions || [];
  const apiAnswers = Array.isArray(snap.answers) ? snap.answers : [];
  const total = snap.questionCount ?? snap.question_count
    ?? questions.length
    ?? apiAnswers.length;

  // Resolve the question for position n. Priority:
  //   1. sessionStorage snapshot's questions[n-1] (richest, written by taking.js)
  //   2. API answer[n-1].questionId → test payload lookup
  //   3. test payload by position (fallback if the test wasn't reordered)
  let snapQ = questions[n - 1];
  if (!snapQ) {
    const apiAns = apiAnswers.find(x => (x.questionIndex ?? -1) === n - 1)
                ?? apiAnswers[n - 1];
    if (apiAns?.questionId != null) {
      snapQ = { id: apiAns.questionId };
    } else if (allTestQs[n - 1]) {
      snapQ = { id: allTestQs[n - 1].id };
    }
  }
  if (!snapQ) { navigate(`/test/${testId}/results/${attemptId}`); return; }

  // Match the snapshot question by id against the test payload (which
  // has options + correct index). Snapshot text takes precedence so we
  // still show something if the test was edited between attempts.
  const fullQ = allTestQs.find(x => x.id === snapQ.id)
             ?? allTestQs[n - 1]
             ?? {};
  const q = { ...fullQ, ...snapQ };

  const correctIdx = correctOptionIndex(q);
  const userIdx = userOptionIndex(snap, n);
  const skipped = userIdx == null;
  const isCorrect = !skipped && userIdx === correctIdx;
  const opts = q.options || q.opts || [];

  // ── Body ────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.padding = '14px 16px 16px';

  // Verdict + topic row.
  const verdictRow = document.createElement('div');
  Object.assign(verdictRow.style, {
    display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px',
  });
  if (skipped) {
    verdictRow.appendChild(buildTag(t('review.skipped') || 'Пропущено', 'skip'));
  } else if (isCorrect) {
    const tag = buildTag('', 'ok');
    tag.appendChild(iconEl('check', 12));
    tag.appendChild(document.createTextNode(' ' + (t('review.correct') || 'Верно')));
    verdictRow.appendChild(tag);
  } else {
    const tag = buildTag('', 'bad');
    tag.appendChild(iconEl('x', 12));
    tag.appendChild(document.createTextNode(' ' + (t('review.wrong') || 'Неверно')));
    verdictRow.appendChild(tag);
  }
  if (q.topic) {
    const topic = document.createElement('span');
    Object.assign(topic.style, {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '10px', color: 'var(--ink-mute)',
    });
    topic.textContent = q.topic;
    verdictRow.appendChild(topic);
  }

  // Accuracy badge — accuracyBadge() escapes all its inputs; safe as HTML.
  const _kd = kdByQ[String(q.id)];
  if (_kd) {
    const badgeWrap = document.createElement('span');
    badgeWrap.innerHTML = accuracyBadge(_kd.correct, _kd.total, _kd.accuracy, _kd.rank);
    verdictRow.appendChild(badgeWrap);
  }

  body.appendChild(verdictRow);

  // Question text.
  const heading = document.createElement('h2');
  Object.assign(heading.style, {
    font: "600 17px/1.45 Inter, sans-serif",
    margin: '0 0 14px',
  });
  heading.textContent = questionTextOf(q) || `Q${n}`;
  body.appendChild(heading);

  // Options.
  const optList = document.createElement('div');
  Object.assign(optList.style, { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' });
  opts.forEach((opt, i) => {
    const isAns = i === correctIdx;
    const isUser = i === userIdx;
    const row = document.createElement('div');
    const style = {
      padding: '10px 12px', borderRadius: '8px',
      display: 'flex', alignItems: 'center', gap: '10px',
      fontSize: '13px',
    };
    if (isAns) Object.assign(style, {
      border: '1.5px solid var(--accent)', background: 'var(--accent-soft)',
    });
    else if (isUser) Object.assign(style, {
      border: '1.5px solid var(--error)', background: 'var(--error-soft)',
    });
    else Object.assign(style, {
      border: '1.5px solid var(--ink-soft)', background: 'var(--paper)',
    });
    Object.assign(row.style, style);

    const letter = document.createElement('span');
    Object.assign(letter.style, {
      width: '28px', height: '28px', borderRadius: '999px',
      background: isAns ? 'var(--accent)' : isUser ? 'var(--error)' : 'transparent',
      border: (isAns || isUser) ? 'none' : '1.5px solid var(--ink)',
      color: (isAns || isUser) ? '#fff' : 'var(--ink)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '13px', fontWeight: '700', flexShrink: '0',
    });
    letter.textContent = String.fromCharCode(65 + i); // A, B, C…
    row.appendChild(letter);

    const txt = document.createElement('span');
    txt.style.flex = '1';
    txt.textContent = optionText(opt);
    row.appendChild(txt);

    if (isAns) row.appendChild(buildTag(t('review.answer_tag') || '✓', 'ok'));
    if (isUser && !isAns) row.appendChild(buildTag(t('review.your_tag') || 'ваш', 'user'));

    optList.appendChild(row);
  });
  body.appendChild(optList);

  // Hint/notes block when wrong + explanation block when present.
  if (!isCorrect && !skipped) {
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      background: 'var(--info-soft)',
      borderLeft: '3px solid var(--info)',
      padding: '10px 14px',
      borderRadius: '0 8px 8px 0',
      marginBottom: '12px',
    });
    hint.appendChild(caps(t('review.analysis') || 'Разбор', { color: 'var(--info)', marginBottom: '4px' }));
    const text = document.createElement('div');
    Object.assign(text.style, {
      fontSize: '12px', color: 'var(--ink-fade)', lineHeight: '1.55',
    });
    text.appendChild(document.createTextNode(t('review.correct_is') || 'Правильный — '));
    const b = document.createElement('b');
    b.style.color = 'var(--ink)';
    b.textContent = optionText(opts[correctIdx]);
    text.appendChild(b);
    text.appendChild(document.createTextNode('.'));
    hint.appendChild(text);
    body.appendChild(hint);
  }

  // Author-supplied explanation/discussion.
  const explanation = extractPlain(q.explanation || q.discussion);
  if (explanation) {
    const box = document.createElement('div');
    Object.assign(box.style, {
      background: 'var(--info-soft)',
      borderLeft: '3px solid var(--info)',
      padding: '10px 14px',
      borderRadius: '0 8px 8px 0',
      marginBottom: '12px',
    });
    box.appendChild(caps(t('review.explanation') || 'Пояснение', { color: 'var(--info)', marginBottom: '4px' }));
    const txt = document.createElement('div');
    Object.assign(txt.style, {
      fontSize: '12px', color: 'var(--ink-fade)', lineHeight: '1.6',
    });
    txt.textContent = explanation;
    box.appendChild(txt);
    body.appendChild(box);
  }

  // Flag/unflag action row — flaggedSet comes from the cached bundle and
  // is mutated in-place when the user flags/unflags, so the next navigation
  // reuses the updated state.
  const flaggedSet = bundle.flaggedSet;

  const flagRow = document.createElement('div');
  Object.assign(flagRow.style, {
    display: 'flex', gap: '8px', marginBottom: '12px',
  });
  const flagBtn = mBtn({
    sm: true,
    onClick: async () => {
      const willFlag = !flaggedSet.has(q.id);
      flagBtn.disabled = true;
      try {
        await setFlag(testId, q.id, willFlag);
        if (willFlag) flaggedSet.add(q.id);
        else flaggedSet.delete(q.id);
        paintFlag();
        toast(
          willFlag ? (t('review.flagged') || 'Вопрос отмечен')
                   : (t('review.unflagged') || 'Отметка снята'),
          { tone: 'success' },
        );
      } catch {
        toast(t('review.flag_error') || 'Не удалось обновить отметку', { tone: 'error' });
      } finally {
        flagBtn.disabled = false;
      }
    },
  });
  function paintFlag() {
    flagBtn.replaceChildren();
    flagBtn.appendChild(iconEl('flag', 12));
    const span = document.createElement('span');
    span.textContent = flaggedSet.has(q.id)
      ? ' ' + (t('review.unflag') || 'Снять отметку')
      : ' ' + (t('review.flag')   || 'Отметить');
    flagBtn.appendChild(span);
  }
  paintFlag();
  flagRow.appendChild(flagBtn);
  body.appendChild(flagRow);

  // Keyboard navigation (←/→) — parity with desktop.
  _keyHandler = (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'ArrowLeft' && n > 1) {
      e.preventDefault();
      navigate(`/test/${testId}/results/${attemptId}/q/${n - 1}`);
    } else if (e.key === 'ArrowRight' && n < total) {
      e.preventDefault();
      navigate(`/test/${testId}/results/${attemptId}/q/${n + 1}`);
    }
  };
  window.addEventListener('keydown', _keyHandler);

  // Sticky nav.
  const prevBtn = mBtn({
    full: true,
    onClick: () => navigate(`/test/${testId}/results/${attemptId}/q/${n - 1}`),
  }, '← ' + (t('common.prev') || 'Пред.'));
  prevBtn.disabled = n <= 1;
  if (prevBtn.disabled) Object.assign(prevBtn.style, { opacity: '0.5', cursor: 'not-allowed' });

  const nextBtn = mBtn({
    full: true,
    onClick: () => navigate(`/test/${testId}/results/${attemptId}/q/${n + 1}`),
  }, (t('common.next') || 'След.') + ' →');
  nextBtn.disabled = n >= total;
  if (nextBtn.disabled) Object.assign(nextBtn.style, { opacity: '0.5', cursor: 'not-allowed' });

  const sticky = mSticky(prevBtn, nextBtn);

  mShell({
    root,
    topbar: topBar({
      title: `Q${n} ${t('results.of') || 'из'} ${total}`,
      // Explicit function — see skeleton-topbar comment above.
      back: () => navigate(`/test/${testId}/results/${attemptId}`),
    }),
    body, sticky, hideNav: true,
  });
}
