/**
 * mobile/results.js — Mobile result summary (M4 redesign).
 *
 * Big Ring + KPI 3-cell grid + per-question status grid (8 cols).
 * Reads the attempt snapshot from sessionStorage (written by taking.js
 * right after submit), falls back to `getAttempt` if the user navigated
 * here from a deep link.
 *
 * Sticky bar: Repeat + (Only mistakes · N) if there are wrong answers.
 */
import { getAttempt } from '../../api/attempts.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import {
  topBar, mShell, mCard, mBtn, mSticky, caps,
} from '../../components/mobile-atoms.js';
import { formatDuration } from '../../utils/format.js';

let _renderToken = 0;

// ── Score ring ──────────────────────────────────────────────────

function buildRingSvg(pct) {
  const NS = 'http://www.w3.org/2000/svg';
  const r = 48;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const color = pct >= 70 ? 'var(--accent)' : 'var(--error)';
  const rounded = Math.round(pct);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '130');
  svg.setAttribute('height', '130');
  svg.setAttribute('viewBox', '0 0 130 130');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${rounded}%`);

  const bg = document.createElementNS(NS, 'circle');
  bg.setAttribute('cx', '65'); bg.setAttribute('cy', '65');
  bg.setAttribute('r', String(r));
  bg.setAttribute('fill', 'none');
  bg.setAttribute('stroke', 'var(--ink-soft)');
  bg.setAttribute('stroke-width', '7');
  svg.appendChild(bg);

  const fg = document.createElementNS(NS, 'circle');
  fg.setAttribute('cx', '65'); fg.setAttribute('cy', '65');
  fg.setAttribute('r', String(r));
  fg.setAttribute('fill', 'none');
  fg.setAttribute('stroke', color);
  fg.setAttribute('stroke-width', '7');
  fg.setAttribute('stroke-linecap', 'round');
  fg.setAttribute('stroke-dasharray', circ.toFixed(2));
  fg.setAttribute('stroke-dashoffset', offset.toFixed(2));
  fg.setAttribute('transform', 'rotate(-90 65 65)');
  fg.style.transition = 'stroke-dashoffset 800ms ease';
  svg.appendChild(fg);

  const pctText = document.createElementNS(NS, 'text');
  pctText.setAttribute('x', '65'); pctText.setAttribute('y', '60');
  pctText.setAttribute('text-anchor', 'middle');
  pctText.setAttribute('font-family', 'Inter, sans-serif');
  pctText.setAttribute('font-size', '30');
  pctText.setAttribute('font-weight', '700');
  pctText.setAttribute('fill', 'var(--ink)');
  pctText.textContent = `${rounded}%`;
  svg.appendChild(pctText);

  const subText = document.createElementNS(NS, 'text');
  subText.setAttribute('x', '65'); subText.setAttribute('y', '82');
  subText.setAttribute('text-anchor', 'middle');
  subText.setAttribute('font-family', 'JetBrains Mono, monospace');
  subText.setAttribute('font-size', '11');
  subText.setAttribute('fill', 'var(--ink-mute)');
  subText.textContent = t('results.score_label') || 'score';
  svg.appendChild(subText);

  return svg;
}

function kpiCell(label, value) {
  const cell = document.createElement('div');
  Object.assign(cell.style, {
    border: '1.5px solid var(--ink)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 12px',
    background: 'var(--paper)',
    boxShadow: 'var(--shadow-sm)',
    textAlign: 'center',
  });
  cell.appendChild(caps(label));
  const v = document.createElement('div');
  Object.assign(v.style, {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '20px', fontWeight: '700',
    color: 'var(--ink)', marginTop: '4px',
  });
  v.textContent = value;
  cell.appendChild(v);
  return cell;
}

function buildQuestionGrid(snap, testId, attemptId) {
  const total = snap.questionCount ?? snap.question_count ?? 0;
  const answersLocal = snap.answersLocal || {};
  const snapQs = Array.isArray(snap.questions) ? snap.questions : [];
  const apiAnswers = Array.isArray(snap.answers) ? snap.answers : [];

  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '4px',
  });
  for (let i = 0; i < total; i++) {
    const n = i + 1;
    let status = 'skip';
    // Look up `_s.answers` by the question.id at this position
    // (snapQs[i].id). `answersLocal` is keyed by question.id, NOT by
    // 0/1-based grid position — a positional fallback would falsely
    // match unrelated answers whose qId happens to equal `i` or `n`.
    const qIdAtPos = snapQs[i]?.id;
    const aiLocal = qIdAtPos != null ? answersLocal[qIdAtPos] : null;
    if (aiLocal) {
      if (aiLocal.isCorrect === true) status = 'ok';
      else if (aiLocal.optionIdx != null) status = 'wrong';
    } else if (apiAnswers[i]) {
      const a = apiAnswers[i];
      const picked = a.optionIndex ?? a.optionIdx ?? a.answerIndex;
      if (a.isCorrect === true) status = 'ok';
      else if (picked != null && !a.isSkipped) status = 'wrong';
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    const palette = {
      ok:    { border: 'var(--accent)',   bg: 'var(--accent-soft)', fg: 'var(--accent)' },
      wrong: { border: 'var(--error)',    bg: 'var(--error-soft)',  fg: 'var(--error)' },
      skip:  { border: 'var(--ink-mute)', bg: 'var(--ink-soft)',    fg: 'var(--ink-mute)' },
    }[status];
    Object.assign(btn.style, {
      aspectRatio: '1', borderRadius: '4px',
      border: `1px solid ${palette.border}`,
      background: palette.bg, color: palette.fg,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '10px', fontWeight: '600', cursor: 'pointer',
      padding: '0',
    });
    btn.textContent = String(n);
    btn.addEventListener('click', () => {
      navigate(`/test/${testId}/results/${attemptId}/q/${n}`);
    });
    grid.appendChild(btn);
  }
  return grid;
}

// ── Main render ─────────────────────────────────────────────────

export default async function render(root, params = {}) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  const testId = params.id;
  const attemptId = params.attemptId;
  if (!testId || !attemptId) { navigate('/home'); return; }

  // Try the snapshot first — taking.js stores it under `att:<id>:result`
  // before navigating here. Fall back to the API otherwise.
  let snap = null;
  try {
    const raw = sessionStorage.getItem(`att:${attemptId}:result`);
    if (raw) snap = JSON.parse(raw);
  } catch { /* empty */ }

  // Skeleton placeholder.
  const skeleton = document.createElement('div');
  skeleton.style.padding = '20px 16px';
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('div');
    s.className = 'skeleton';
    Object.assign(s.style, {
      height: '60px', borderRadius: 'var(--radius-md)', marginBottom: '8px',
    });
    skeleton.appendChild(s);
  }
  mShell({
    root,
    topbar: topBar({
      title: t('results.title') || 'Результат',
      // Pass an explicit handler instead of relying on history.back(), which
      // would walk us back into the taking screen we just finished.
      back: () => navigate('/home'),
    }),
    body: skeleton, hideNav: true,
  });

  if (!snap) {
    try {
      const fetched = await getAttempt(attemptId);
      if (stale()) return;
      snap = fetched;
    } catch {
      navigate('/error/404');
      return;
    }
  }
  if (stale()) return;
  if (!snap) { navigate('/error/404'); return; }

  const total = snap.questionCount ?? snap.question_count ?? 0;
  const durationMs = snap.totalDurationMs ?? snap.total_duration_ms ?? 0;
  const answersLocal = snap.answersLocal || {};
  const apiAnswersAll = Array.isArray(snap.answers) ? snap.answers : [];
  const localCorrect = Object.values(answersLocal).filter(a => a.isCorrect === true).length;
  const apiCorrect = apiAnswersAll.filter(a => a.isCorrect === true).length;
  const correct = snap.correctCount ?? snap.correct_count
    ?? (localCorrect || apiCorrect);
  const pct = snap.percentCorrect ?? snap.percent_correct
    ?? (total > 0 ? Math.round(((localCorrect || apiCorrect) / total) * 100) : 0);
  const snapQs = Array.isArray(snap.questions) ? snap.questions : [];
  const mistakeIds = [];
  for (let i = 0; i < total; i++) {
    // Look up by question.id only (see grid-color note above).
    const qIdAtPos = snapQs[i]?.id;
    const a = qIdAtPos != null ? answersLocal[qIdAtPos] : null;
    if (a && a.isCorrect === false) { mistakeIds.push(i + 1); continue; }
    // Fall back to API answers when sessionStorage snapshot is gone.
    if (!a && apiAnswersAll[i]) {
      const api = apiAnswersAll[i];
      const picked = api.optionIndex ?? api.optionIdx ?? api.answerIndex;
      if (picked != null && !api.isSkipped && api.isCorrect === false) {
        mistakeIds.push(i + 1);
      }
    }
  }

  // ── Body ────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.padding = '20px 16px 16px';

  // Header: Ring + verdict + collection title.
  const head = document.createElement('div');
  Object.assign(head.style, {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '8px', marginBottom: '16px',
  });
  head.appendChild(buildRingSvg(pct));
  const verdict = document.createElement('div');
  Object.assign(verdict.style, {
    font: "700 22px/1 Inter, sans-serif",
    letterSpacing: '-.01em',
  });
  verdict.textContent = `${correct} ${t('results.of') || 'из'} ${total}`;
  head.appendChild(verdict);

  // Verdict text by score band (parity with desktop).
  const band = pct >= 90 ? 'excellent'
              : pct >= 75 ? 'good'
              : pct >= 60 ? 'pass'
              : pct >= 40 ? 'weak'
              : 'fail';
  const bandText = {
    excellent: t('results.band.excellent') || 'Отличный результат!',
    good:      t('results.band.good')      || 'Хорошо, есть к чему стремиться',
    pass:      t('results.band.pass')      || 'Зачётный минимум',
    weak:      t('results.band.weak')      || 'Слабый результат — стоит повторить',
    fail:      t('results.band.fail')      || 'Требуется серьёзная подготовка',
  }[band];
  const bandColor = pct >= 75 ? 'var(--accent)'
                  : pct >= 60 ? 'var(--ink)'
                  : 'var(--error)';
  const verdictText = document.createElement('div');
  Object.assign(verdictText.style, {
    fontSize: '12px', fontWeight: '600',
    color: bandColor, textAlign: 'center',
  });
  verdictText.textContent = bandText;
  head.appendChild(verdictText);

  const meta = document.createElement('div');
  Object.assign(meta.style, { fontSize: '12px', color: 'var(--ink-fade)' });
  meta.textContent = snap.testTitle || snap.title || '';
  head.appendChild(meta);
  body.appendChild(head);

  // KPI grid — 3 cells.
  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px',
    marginBottom: '14px',
  });
  grid.appendChild(kpiCell(t('results.kpi.correct') || 'Верно', `${correct}/${total}`));
  grid.appendChild(kpiCell(t('results.kpi.time')    || 'Время', formatDuration(durationMs)));
  grid.appendChild(kpiCell(t('results.kpi.score')   || 'Балл',  `${Math.round(pct)}%`));
  body.appendChild(grid);

  // Per-question status grid card.
  const gridHint = document.createElement('span');
  Object.assign(gridHint.style, {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px', color: 'var(--ink-mute)',
  });
  gridHint.textContent = t('results.tap_to_review') || 'тап → разбор';
  body.appendChild(mCard(
    { title: t('results.by_question') || 'По вопросам', action: gridHint },
    buildQuestionGrid(snap, testId, attemptId),
  ));

  // "Where you slipped" — quick-jump list of wrong questions (parity).
  if (mistakeIds.length > 0) {
    const slipBody = document.createElement('div');
    Object.assign(slipBody.style, {
      display: 'flex', flexDirection: 'column', gap: '6px',
    });
    const snapQs = Array.isArray(snap.questions) ? snap.questions : [];
    for (const n of mistakeIds.slice(0, 8)) {
      const sq = snapQs[n - 1];
      const text = (() => {
        if (!sq) return `Q${n}`;
        const blocks = sq.question?.blocks || sq.questionText?.blocks || [];
        if (blocks.length) {
          const inlines = blocks[0].inlines || [];
          return inlines.map(i => i.text || '').join('').trim().slice(0, 70) || `Q${n}`;
        }
        if (typeof sq.text === 'string') return sq.text.slice(0, 70);
        if (typeof sq.question === 'string') return sq.question.slice(0, 70);
        return `Q${n}`;
      })();
      const row = document.createElement('button');
      row.type = 'button';
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '8px 10px', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--error-soft)',
        background: 'var(--paper)',
        textAlign: 'left', cursor: 'pointer', width: '100%',
        font: 'inherit', color: 'var(--ink)',
      });
      const num = document.createElement('span');
      Object.assign(num.style, {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '11px', fontWeight: '700',
        color: 'var(--error)', flexShrink: '0',
        minWidth: '24px',
      });
      num.textContent = `Q${n}`;
      row.appendChild(num);
      const txt = document.createElement('span');
      Object.assign(txt.style, {
        flex: '1', fontSize: '12px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      });
      txt.textContent = text;
      row.appendChild(txt);
      const arrow = document.createElement('span');
      Object.assign(arrow.style, { color: 'var(--ink-mute)', fontSize: '14px' });
      arrow.textContent = '→';
      row.appendChild(arrow);
      row.addEventListener('click', () => {
        navigate(`/test/${testId}/results/${attemptId}/q/${n}`);
      });
      slipBody.appendChild(row);
    }
    if (mistakeIds.length > 8) {
      const more = document.createElement('div');
      Object.assign(more.style, {
        fontSize: '11px', color: 'var(--ink-mute)',
        textAlign: 'center', marginTop: '4px',
      });
      more.textContent = `+${mistakeIds.length - 8} ${t('results.more') || 'ещё'}`;
      slipBody.appendChild(more);
    }
    body.appendChild(mCard(
      { title: t('results.where_slipped') || 'Где ошиблись' },
      slipBody,
    ));
  }

  // Sticky CTA.
  const repeatBtn = mBtn({
    full: true,
    onClick: () => navigate(`/test/${testId}/start`),
  }, t('results.repeat') || 'Повторить');

  const stickyChildren = [repeatBtn];
  if (mistakeIds.length > 0) {
    stickyChildren.push(mBtn({
      primary: true, full: true,
      onClick: () => {
        try {
          sessionStorage.setItem(`pretest:${testId}`, JSON.stringify({
            mode: 'training', count: mistakeIds.length,
            source: 'mistakes', shuffle: false, revealImmediately: true,
            onlyMistakes: mistakeIds,
          }));
        } catch { /* private mode */ }
        navigate(`/test/${testId}/start`);
      },
    }, `${t('results.only_mistakes') || 'Только ошибки'} · ${mistakeIds.length}`));
  }
  const sticky = mSticky(...stickyChildren);

  mShell({
    root,
    topbar: topBar({
      title: t('results.title') || 'Результат',
      back: () => navigate('/home'),
    }),
    body, sticky, hideNav: true,
  });
}
