/**
 * screens/mobile/results.js — Mobile test results screen
 *
 * Reads attempt data from sessionStorage (written by taking.js)
 * or falls back to fetching from the API.
 */
import { getAttempt } from '../../api/attempts.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { escHtml as esc } from '../../utils/escape.js';
import { formatDuration } from '../../utils/format.js';

// ── SVG Score Ring ────────────────────────────────────────────

function buildRingSvg(pct) {
  const r      = 48;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const color  = pct >= 70 ? 'var(--accent)' : '#c4554a';
  const rounded = Math.round(pct);
  return `
  <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label="${rounded}%">
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--ink-soft)" stroke-width="7"/>
    <circle cx="65" cy="65" r="${r}" fill="none"
      stroke="${color}" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
      transform="rotate(-90 65 65)"
      style="transition:stroke-dashoffset 800ms ease"/>
    <text x="65" y="59" text-anchor="middle" font-family="Inter,sans-serif"
          font-size="30" font-weight="700" fill="var(--ink)">${rounded}%</text>
    <text x="65" y="80" text-anchor="middle" font-family="JetBrains Mono,monospace"
          font-size="11" fill="var(--ink-mute)">${t('results.score_label') || 'score'}</text>
  </svg>`;
}

// ── Build screen ──────────────────────────────────────────────

function buildScreen(snap) {
  const pct        = snap.percentCorrect ?? snap.percent_correct ?? 0;
  const correct    = snap.correctCount   ?? snap.correct_count   ?? 0;
  const total      = snap.questionCount  ?? snap.question_count  ?? 0;
  const durationMs = snap.totalDurationMs ?? snap.total_duration_ms ?? 0;
  const answers    = snap.answers        || [];       // from API
  const answersLocal = snap.answersLocal || {};        // from sessionStorage
  const questions  = snap.questions      || [];
  const flaggedIds = new Set(snap.flaggedIds || []);
  const timedOut   = snap.timedOut       || false;
  const testId     = snap.testId ?? snap.test_id ?? '';

  const verdict = pct >= 80
    ? (t('results.well_done')   || 'nice work 🎉')
    : pct >= 60
      ? (t('results.good_effort') || 'good effort')
      : (t('results.needs_work')  || 'keep practicing');

  // Build correctness map
  const correctMap = {};
  if (answers.length > 0) {
    for (const a of answers) correctMap[a.questionId] = a.isCorrect;
  } else {
    for (const [qId, ans] of Object.entries(answersLocal)) {
      correctMap[Number(qId)] = ans.isCorrect;
    }
  }

  const avgPerQ = total > 0 && durationMs > 0
    ? formatDuration(Math.round(durationMs / total))
    : '—';

  const cellCount = Math.max(questions.length, total, 0);

  const screen = document.createElement('div');
  screen.className = 'mob';
  screen.innerHTML = `
    <div class="mob-topbar" style="flex-shrink:0;">
      <button class="mob-topbar__back mob-rs-back">${iconEl('chevL', 16)?.outerHTML || '←'}</button>
      <span class="mob-topbar__title">${t('results.title') || 'Results'}</span>
    </div>
    <div class="mob__content" style="padding-bottom:24px;">

      <!-- Score ring + verdict -->
      <div style="display:flex;flex-direction:column;align-items:center;padding:20px 16px 12px;gap:6px;">
        <div style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);
                    text-transform:uppercase;letter-spacing:.06em;">${esc(verdict)}</div>
        ${buildRingSvg(pct)}
        <div style="font:700 18px/1.2 Inter,sans-serif;color:var(--ink);letter-spacing:-.01em;">
          ${timedOut
            ? esc(t('results.timed_out_msg') || 'Time ran out')
            : `${correct} / ${total} ${esc(t('results.correct') || 'correct')}`
          }
        </div>
      </div>

      <!-- Stats 3-col -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:0 16px;margin-bottom:16px;">
        <div class="mob-kpi" style="text-align:center;">
          <div class="mob-kpi__val" style="font-size:16px;">${esc(formatDuration(durationMs))}</div>
          <div class="mob-kpi__label">${t('results.time') || 'time'}</div>
        </div>
        <div class="mob-kpi" style="text-align:center;">
          <div class="mob-kpi__val" style="font-size:16px;">${esc(avgPerQ)}</div>
          <div class="mob-kpi__label">${t('results.avg_per_q') || 'avg/q'}</div>
        </div>
        <div class="mob-kpi" style="text-align:center;">
          <div class="mob-kpi__val" style="font-size:16px;">${flaggedIds.size}</div>
          <div class="mob-kpi__label">${t('results.flagged') || 'flagged'}</div>
        </div>
      </div>

      <!-- Q-by-Q grid -->
      <div style="margin:0 16px;border:var(--border);border-radius:var(--radius-md);
                  padding:12px 14px;margin-bottom:16px;">
        <div style="font:600 13px/1 Inter,sans-serif;color:var(--ink);margin-bottom:10px;">
          ${t('results.q_by_q') || 'Question by question'}
        </div>
        <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:4px;">
          ${Array.from({ length: cellCount }, (_, i) => {
            const qId = questions[i]?.id ?? (i + 1);
            const isCorrect = correctMap[qId];
            const isFlagged = flaggedIds.has(qId);
            let cls = 'rs-qcell';
            if (isCorrect === true)  cls += ' rs-qcell--correct';
            else if (isCorrect === false) cls += ' rs-qcell--wrong';
            if (isFlagged) cls += ' rs-qcell--flagged';
            return `<div class="${cls}" title="Q${i + 1}">
              ${isCorrect === true ? '✓' : isCorrect === false ? '✗' : String(i + 1)}
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Action buttons -->
      <div style="display:flex;gap:8px;padding:0 16px;">
        <a href="#/test/${esc(testId)}/take" class="btn btn--ghost" style="flex:1;justify-content:center;">
          ${iconEl('redo', 14)?.outerHTML || ''}
          ${t('results.try_again') || 'Try again'}
        </a>
        <button class="btn btn--primary mob-rs-done" style="flex:1;justify-content:center;">
          ${t('results.done') || 'Done'}
        </button>
      </div>
    </div>
  `;

  screen.querySelector('.mob-rs-back')?.addEventListener('click', () => navigate('/home'));
  screen.querySelector('.mob-rs-done')?.addEventListener('click', () => navigate('/home'));
  return screen;
}

// ── Entry point ───────────────────────────────────────────────

export default async function render(root, params = {}) {
  const attemptId = params.attemptId;

  root.innerHTML = `
    <div class="mob" style="align-items:center;justify-content:center;">
      <div class="skeleton" style="width:200px;height:14px;"></div>
    </div>`;

  // Try sessionStorage first (fastest, written by taking.js)
  const snapRaw = attemptId ? sessionStorage.getItem(`att:${attemptId}:result`) : null;
  if (snapRaw) {
    try {
      const snap = JSON.parse(snapRaw);
      root.innerHTML = '';
      root.appendChild(buildScreen(snap));
      return;
    } catch (e) {
      console.warn('[mob-results] bad sessionStorage snap:', e);
    }
  }

  // Fallback: fetch from API
  const clientId = attemptId ? sessionStorage.getItem(`att:${attemptId}:client`) : null;
  if (!attemptId || !clientId) {
    root.innerHTML = `
      <div class="mob" style="align-items:center;justify-content:center;gap:12px;padding:var(--pad);">
        <p style="font-weight:600;">${t('common.error') || 'Error'}</p>
        <p style="font-size:13px;color:var(--ink-mute);">Attempt not found</p>
        <a href="#/home" class="btn btn--ghost btn--small">← ${t('common.back') || 'Back'}</a>
      </div>`;
    return;
  }

  try {
    const data = await getAttempt(attemptId, clientId);
    root.innerHTML = '';
    root.appendChild(buildScreen(data));
  } catch (e) {
    console.error('[mob-results] load attempt:', e);
    root.innerHTML = `
      <div class="mob" style="align-items:center;justify-content:center;gap:12px;padding:var(--pad);">
        <p style="font-weight:600;color:#c4554a;">${t('common.error') || 'Error'}</p>
        <p style="font-size:13px;color:var(--ink-mute);">Could not load results</p>
        <a href="#/home" class="btn btn--ghost btn--small">← ${t('common.back') || 'Back'}</a>
      </div>`;
  }
}
