/**
 * screens/desktop/results.js — Test results screen
 *
 * Reads attempt data from sessionStorage (stored by taking.js after finish)
 * or fetches from the API as fallback.
 */
import { getAttempt } from '../../api/attempts.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { icon, iconEl } from '../../icons.js';
import { escHtml } from '../../utils/escape.js';
import { formatDuration } from '../../utils/format.js';

function formatRelative(dateStr) {
  if (!dateStr) return '';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('results.just_now') || 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(dateStr).toLocaleDateString();
  } catch { return ''; }
}

// ── SVG Ring ──────────────────────────────────────────────────

function buildRingSvg(pct) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const color = pct >= 70 ? 'var(--accent)' : '#c4554a';
  const rounded = Math.round(pct);
  return `
  <svg width="144" height="144" viewBox="0 0 144 144" role="img" aria-label="${rounded}%">
    <circle cx="72" cy="72" r="${r}" fill="none" stroke="var(--ink-soft)" stroke-width="7"/>
    <circle cx="72" cy="72" r="${r}" fill="none"
      stroke="${color}" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
      transform="rotate(-90 72 72)"
      style="transition:stroke-dashoffset 800ms ease"/>
    <text x="72" y="68" text-anchor="middle" font-family="Inter,sans-serif"
          font-size="34" font-weight="700" fill="var(--ink)">${rounded}%</text>
    <text x="72" y="90" text-anchor="middle" font-family="JetBrains Mono,monospace"
          font-size="12" fill="var(--ink-mute)">${t('results.score_label') || 'score'}</text>
  </svg>`;
}

// ── Sparkline ─────────────────────────────────────────────────

function buildSparkline(values, width = 280, height = 100) {
  if (!values || values.length < 2) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle"
            font-size="12" fill="var(--ink-mute)">${t('stats.no_data') || 'No data'}</text>
    </svg>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 6;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const xs = values.map((_, i) => pad + (i / (values.length - 1)) * w);
  const ys = values.map(v => pad + h - ((v - min) / range) * h);
  const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible">
    <defs>
      <linearGradient id="rs-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="M${xs[0].toFixed(1)},${height - pad} ${xs.map((x, i) => `L${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')} L${xs[xs.length - 1].toFixed(1)},${height - pad} Z" fill="url(#rs-grad)"/>
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
    ${xs.map((x, i) => `<circle cx="${x.toFixed(1)}" cy="${ys[i].toFixed(1)}" r="3.5"
      fill="var(--accent)" stroke="var(--paper)" stroke-width="2"/>`).join('')}
  </svg>`;
}

// ── Main screen builder ───────────────────────────────────────

function buildResultsScreen(snap) {
  const pct = snap.percentCorrect ?? snap.percent_correct ?? 0;
  const correct = snap.correctCount ?? snap.correct_count ?? 0;
  const total = snap.questionCount ?? snap.question_count ?? 0;
  const durationMs = snap.totalDurationMs ?? snap.total_duration_ms ?? 0;
  const answers = snap.answers || [];                   // from API
  const answersLocal = snap.answersLocal || {};         // from sessionStorage
  const questions = snap.questions || [];               // text snippets
  const flaggedIds = new Set(snap.flaggedIds || []);
  const timedOut = snap.timedOut || false;

  const testId = snap.testId ?? snap.test_id ?? '';
  const attemptId = snap.attemptId ?? snap.attempt_id ?? '';
  const finishedAt = snap.finishedAt ?? snap.finished_at ?? '';

  const rs = document.createElement('div');
  rs.className = 'rs';

  // ── TopBar ──
  const topbar = document.createElement('div');
  topbar.className = 'rs__topbar';

  const topLeft = document.createElement('div');
  topLeft.className = 'rs-topbar__left';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn--ghost btn--icon';
  backBtn.appendChild(iconEl('chevL', 18));
  backBtn.addEventListener('click', () => navigate('/home'));

  const topTitle = document.createElement('div');
  topTitle.className = 'rs-topbar__title';
  topTitle.textContent = `${t('results.title') || 'Results'}`;

  const topWhen = document.createElement('div');
  topWhen.className = 'rs-topbar__when';
  topWhen.textContent = finishedAt ? formatRelative(finishedAt) : (timedOut ? (t('results.timed_out') || 'time up') : '');

  topLeft.append(backBtn, topTitle, topWhen);

  const topActions = document.createElement('div');
  topActions.className = 'rs-topbar__actions';

  const reviewBtn = document.createElement('button');
  reviewBtn.type = 'button';
  reviewBtn.className = 'btn btn--small btn--ghost';
  reviewBtn.textContent = t('results.review') || 'Разобрать ответы';
  reviewBtn.addEventListener('click', () => {
    // First wrong (or first question) → per-question drilldown.
    const firstWrongIdx = (() => {
      for (let i = 0; i < questions.length; i++) {
        const qid = questions[i].id;
        const ans = answersLocal[qid] || (answers.find(a => a.questionId === qid) || {});
        if (ans.isCorrect === false) return i;
      }
      return 0;
    })();
    navigate(`/test/${testId}/results/${attemptId}/q/${firstWrongIdx + 1}`);
  });

  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'btn btn--small btn--ghost';
  retryBtn.appendChild(iconEl('redo', 14));
  retryBtn.appendChild(document.createTextNode(` ${t('results.try_again') || 'Пройти снова'}`));
  retryBtn.addEventListener('click', () => navigate(`/test/${testId}/start`));

  // ── "Только ошибки · N" — launch a mistake-review attempt ──
  // Counts wrong answers from the snap and seeds the pre-test handoff
  // so taking.js's pretest-handoff branch (phase 4) starts an attempt
  // pre-filtered to those question ids.
  const wrongIds = [];
  if (answers && answers.length) {
    for (const a of answers) if (a.isCorrect === false && !a.isSkipped) wrongIds.push(a.questionId);
  } else {
    for (const [qId, ans] of Object.entries(answersLocal)) {
      if (ans && ans.isCorrect === false) wrongIds.push(Number(qId));
    }
  }
  const mistakeBtn = document.createElement('button');
  mistakeBtn.type = 'button';
  mistakeBtn.className = 'btn btn--small btn--primary';
  mistakeBtn.textContent = `${t('results.only_mistakes') || 'Только ошибки'} · ${wrongIds.length}`;
  if (wrongIds.length === 0) {
    mistakeBtn.disabled = true;
    mistakeBtn.title = t('results.no_mistakes') || 'Все ответы верные';
  }
  mistakeBtn.addEventListener('click', () => {
    try {
      sessionStorage.setItem(`pretest:${testId}`, JSON.stringify({
        mode: 'mistake_review',
        count: wrongIds.length,
        shuffle: false,
        source: 'mistake_review',
        revealImmediately: true,    // mistake review = anki-style instant feedback
        timeLimitMin: 0,
        filterIds: wrongIds,
        mistakeSourceAttemptId: attemptId,
      }));
    } catch {}
    navigate(`/test/${testId}/take`);
  });

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'btn btn--small btn--ghost';
  doneBtn.textContent = t('results.done') || 'Готово';
  doneBtn.addEventListener('click', () => navigate('/home'));

  topActions.append(reviewBtn, retryBtn, mistakeBtn, doneBtn);
  topbar.append(topLeft, topActions);
  rs.appendChild(topbar);

  // ── Body ──
  const body = document.createElement('div');
  body.className = 'rs__body';
  const content = document.createElement('div');
  content.className = 'rs__content';

  // ── Hero card ──
  const heroCard = document.createElement('div');
  heroCard.className = 'card card--elevated rs-hero';

  const ringWrap = document.createElement('div');
  ringWrap.className = 'rs-ring';
  ringWrap.innerHTML = buildRingSvg(pct);

  const metaWrap = document.createElement('div');
  metaWrap.className = 'rs-hero__meta';

  const verdict = document.createElement('div');
  verdict.className = 'rs-hero__verdict';
  verdict.textContent = pct >= 80
    ? (t('results.well_done') || 'nice work 🎉')
    : pct >= 60 ? (t('results.good_effort') || 'good effort')
    : (t('results.needs_work') || 'keep practicing');

  const headline = document.createElement('div');
  headline.className = 'rs-hero__headline';
  headline.textContent = timedOut
    ? (t('results.timed_out_msg') || 'Time ran out')
    : `${correct} / ${total} ${t('results.correct') || 'correct'}`;

  const statsRow = document.createElement('div');
  statsRow.className = 'rs-hero__stats';

  const avgPerQ = total > 0 && durationMs > 0
    ? formatDuration(Math.round(durationMs / total))
    : '—';

  const statDefs = [
    [formatDuration(durationMs), t('results.time') || 'total time'],
    [avgPerQ, t('results.avg_per_q') || 'avg / question'],
    [`${flaggedIds.size}`, t('results.flagged') || 'flagged'],
  ];
  for (const [val, lbl] of statDefs) {
    const stat = document.createElement('div');
    stat.className = 'rs-stat';
    stat.innerHTML = `<div class="rs-stat__val">${escHtml(String(val))}</div>
                      <div class="rs-stat__label">${escHtml(lbl)}</div>`;
    statsRow.appendChild(stat);
  }

  metaWrap.append(verdict, headline, statsRow);
  heroCard.append(ringWrap, metaWrap);
  content.appendChild(heroCard);

  // ── Q-by-Q grid ──
  const qgridCard = document.createElement('div');
  qgridCard.className = 'card rs-qgrid-wrap';

  const qgridHead = document.createElement('div');
  qgridHead.className = 'rs-qgrid-head';
  const qgridTitle = document.createElement('span');
  qgridTitle.textContent = t('results.q_by_q') || 'Question by question';
  const qgridSub = document.createElement('span');
  qgridSub.style.cssText = 'font-size:12px;color:var(--ink-mute);font-weight:400;';
  qgridSub.textContent = t('results.tap_review') || 'click to review';
  qgridHead.append(qgridTitle, qgridSub);

  const qgrid = document.createElement('div');
  qgrid.className = 'rs-qgrid';

  // Build per-question correctness map
  // Use answers from API if available, else from local snapshot
  const correctMap = {};
  const skippedMap = {};

  if (answers.length > 0) {
    for (const a of answers) {
      correctMap[a.questionId] = a.isCorrect;
      skippedMap[a.questionId] = a.isSkipped;
    }
  } else {
    for (const [qId, ans] of Object.entries(answersLocal)) {
      correctMap[Number(qId)] = ans.isCorrect;
    }
  }

  // Render cells for each question in order
  const questionIds = questions.map(q => q.id);
  const cellCount = questionIds.length || total || 0;

  for (let i = 0; i < cellCount; i++) {
    const qId = questionIds[i] ?? i + 1;
    const isCorrect = correctMap[qId];
    const isSkipped = skippedMap[qId];
    const isFlagged = flaggedIds.has(qId);

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'rs-qcell';
    if (isSkipped) cell.classList.add('rs-qcell--skipped');
    else if (isCorrect === true) cell.classList.add('rs-qcell--correct');
    else if (isCorrect === false) cell.classList.add('rs-qcell--wrong');
    if (isFlagged) cell.classList.add('rs-qcell--flagged');

    // Top: question number; Bottom: status icon
    cell.innerHTML = `
      <span class="rs-qcell__num">${i + 1}</span>
      <span class="rs-qcell__icon">${
        isSkipped ? '–' : isCorrect === true ? icon('check', 10) : isCorrect === false ? icon('x', 10) : ''
      }</span>`;
    cell.title = `Q${i + 1}`;

    // Click → drill into per-question review (Phase 4).
    if (testId && attemptId) {
      cell.addEventListener('click', () =>
        navigate(`/test/${testId}/results/${attemptId}/q/${i + 1}`));
    }
    qgrid.appendChild(cell);
  }

  qgridCard.append(qgridHead, qgrid);
  content.appendChild(qgridCard);

  // ── Lower row: Slip list + Trend ──
  const lower = document.createElement('div');
  lower.className = 'rs-lower';

  // Where you slipped
  const slipCard = document.createElement('div');
  slipCard.className = 'card rs-slip-wrap';
  const slipTitle = document.createElement('div');
  slipTitle.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:10px;';
  slipTitle.textContent = t('results.where_slipped') || 'Where you slipped';
  slipCard.appendChild(slipTitle);

  const wrongQIds = questions
    .filter(q => correctMap[q.id] === false)
    .slice(0, 6);

  if (wrongQIds.length === 0) {
    const noSlips = document.createElement('p');
    noSlips.style.cssText = 'font-size:13px;color:var(--ink-mute);';
    noSlips.textContent = correct === total
      ? (t('results.perfect') || 'Perfect score! 🎉')
      : (t('results.no_slips') || 'No question data available.');
    slipCard.appendChild(noSlips);
  } else {
    for (const q of wrongQIds) {
      const item = document.createElement('div');
      item.className = 'rs-slip-item';
      item.innerHTML = `
        <span class="rs-slip-item__num">#${q.id}</span>
        <span class="rs-slip-item__text">${escHtml(q.text || `Question ${q.id}`)}</span>
        <span class="rs-slip-item__link">${t('results.review_q') || 'review →'}</span>`;
      slipCard.appendChild(item);
    }
  }

  lower.appendChild(slipCard);

  // Trend (sparkline) — use local answer scores as a visual proxy
  const trendCard = document.createElement('div');
  trendCard.className = 'card rs-trend-wrap';
  const trendTitle = document.createElement('div');
  trendTitle.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:10px;';
  trendTitle.textContent = t('results.trend') || 'Score trend';

  const trendPlaceholder = document.createElement('div');
  trendPlaceholder.style.cssText = 'color:var(--ink-mute);font-size:12px;margin-top:8px;';
  trendPlaceholder.textContent = t('results.trend_coming') || 'Complete more attempts to see your trend.';

  trendCard.append(trendTitle, trendPlaceholder);
  lower.appendChild(trendCard);

  content.appendChild(lower);
  body.appendChild(content);
  rs.appendChild(body);
  return rs;
}

// ── Entry point ───────────────────────────────────────────────

export default async function render(root, params = {}) {
  const attemptId = params.attemptId;

  root.innerHTML = `
    <div class="rs" style="align-items:center;justify-content:center;">
      <div class="skeleton" style="width:200px;height:14px;"></div>
    </div>`;

  // Try sessionStorage first
  const snapRaw = attemptId ? sessionStorage.getItem(`att:${attemptId}:result`) : null;
  if (snapRaw) {
    try {
      const snap = JSON.parse(snapRaw);
      // Backfill testId from separate key (older snapshots may not have it)
      if (!snap.testId && !snap.test_id && attemptId) {
        const fallbackTestId = sessionStorage.getItem(`att:${attemptId}:testId`);
        if (fallbackTestId) snap.testId = fallbackTestId;
      }
      root.innerHTML = '';
      root.appendChild(buildResultsScreen(snap));
      return;
    } catch (e) {
      console.warn('[results] bad sessionStorage snap:', e);
    }
  }

  // Fallback: load from API
  const clientId = attemptId ? sessionStorage.getItem(`att:${attemptId}:client`) : null;
  if (!attemptId || !clientId) {
    root.innerHTML = `
      <div class="rs" style="align-items:center;justify-content:center;gap:12px;padding:var(--pad);">
        <p style="font-weight:600;">${t('common.error') || 'Error'}</p>
        <p style="font-size:13px;color:var(--ink-mute);">Attempt not found</p>
        <a href="#/home" class="btn btn--ghost btn--small">${icon('chevL', 14)} ${t('common.back') || 'Back'}</a>
      </div>`;
    return;
  }

  try {
    const data = await getAttempt(attemptId, clientId);
    root.innerHTML = '';
    root.appendChild(buildResultsScreen(data));
  } catch (e) {
    console.error('[results] load attempt error:', e);
    root.innerHTML = `
      <div class="rs" style="align-items:center;justify-content:center;gap:12px;padding:var(--pad);">
        <p style="font-weight:600;color:#c4554a;">${t('common.error') || 'Error'}</p>
        <p style="font-size:13px;color:var(--ink-mute);">Could not load results</p>
        <a href="#/home" class="btn btn--ghost btn--small">${icon('chevL', 14)} ${t('common.back') || 'Back'}</a>
      </div>`;
  }
}
