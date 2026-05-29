/**
 * screens/mobile/taking.js — Mobile test taking screen
 *
 * Flow: load test → pretest setup → taking → results
 * No side rail (unlike desktop). Pre-test is a full screen (not modal).
 */
import { getTest } from '../../api/tests.js';
import { startAttempt, recordAnswer, finishAttempt, abandonAttempt } from '../../api/attempts.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { renderContent, typesetMath, attachAssets } from '../../utils/render-blocks.js';
import { escHtml as esc } from '../../utils/escape.js';
import { newUuid } from '../../utils/client-id.js';
import { formatSeconds as formatTime } from '../../utils/format.js';

// ── Module state ──────────────────────────────────────────────
/** @type {HTMLElement|null} */
let _root = null;

const _s = {
  phase: 'loading', // 'loading' | 'pretest' | 'taking' | 'finishing'
  testId: /** @type {string|null} */ (null),
  test: /** @type {any} */ (null),
  allQuestions: /** @type {any[]} */ ([]),
  questions:    /** @type {any[]} */ ([]),
  settings: {
    count: 20,
    order: 'random',   // 'random' | 'sequential'
    timeLimitMin: 0,
    showAnswers: true,
  },
  attemptId: /** @type {string|null} */ (null),
  currentIdx: 0,
  /** @type {{ [qId: number]: { optionIdx: number, isCorrect: boolean } }} */
  answers: {},
  flagged:    /** @type {Set<number>} */ (new Set()),
  drawerOpen: false,
  startTime:    /** @type {number|null} */ (null),
  timeLeft:     /** @type {number|null} */ (null),
  timerHandle:  /** @type {any} */ (null),
  advanceTimer: /** @type {any} */ (null),
};

// ── Block renderer (shared utility with MathJax support) ─────

function renderBlocks(blocks, assetsBase) {
  return renderContent({ blocks }, assetsBase);
}

function blocksToText(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .flatMap(b => (b.inlines || []).filter(i => i.type === 'text').map(i => i.text || ''))
    .join(' ').trim().slice(0, 90);
}

// ── Begin attempt ─────────────────────────────────────────────

async function beginAttempt() {
  const total = _s.allQuestions.length;
  let pool = [..._s.allQuestions];

  if (_s.settings.order === 'random') {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }

  _s.questions   = pool.slice(0, Math.min(_s.settings.count, total));

  // Per-question option shuffling. Stamp each option with `__origIdx`
  // (its position in the canonical/server order) so the click handler
  // can translate the shuffled position → canonical index before sending
  // it to /answer. The server stores answers in canonical order; without
  // the translation server-side `isCorrect` would be computed against
  // the wrong option after a shuffle.
  if (_s.settings.shuffleOptions) {
    _s.questions = _s.questions.map(q => {
      const opts = (Array.isArray(q.options) ? q.options : [])
        .map((o, originalIdx) => ({ ...o, __origIdx: originalIdx }));
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
      return { ...q, options: opts };
    });
  }
  _s.currentIdx  = 0;
  _s.answers     = {};
  _s.flagged     = new Set();
  _s.attemptId   = newUuid();
  _s.startTime   = Date.now();
  _s.timeLeft    = _s.settings.timeLimitMin > 0 ? _s.settings.timeLimitMin * 60 : null;

  startAttempt({
    attemptId: _s.attemptId,
    testId: _s.testId,
    settings: {
      count: _s.questions.length,
      order: _s.settings.order,
      timeLimitSeconds: _s.settings.timeLimitMin > 0 ? _s.settings.timeLimitMin * 60 : null,
      showAnswersImmediately: _s.settings.showAnswers,
    },
    // Always send the CANONICAL option order to the server so its
    // `correct_option_index` matches the canonical answer-index that
    // `onOptionClick` will translate to. If the question was shuffled,
    // each option still carries the `__origIdx` stamp — sort by it
    // to restore canonical order. Strip `__origIdx` from the payload
    // since the server doesn't need it.
    questions: _s.questions.map(q => {
      const opts = Array.isArray(q.options) ? [...q.options] : [];
      const canonical = opts.every(o => Number.isInteger(o.__origIdx))
        ? [...opts].sort((a, b) => a.__origIdx - b.__origIdx)
            .map(({ __origIdx, ...rest }) => rest)
        : opts;
      return {
        questionId: Number(q.id),
        question: { question: q.question, options: canonical },
      };
    }),
  }).catch(e => console.warn('[mob-taking] startAttempt:', e));

  sessionStorage.setItem(`att:${_s.attemptId}:testId`, _s.testId || '');

  _s.phase = 'taking';
  _mount();

  if (_s.timeLeft !== null) {
    _s.timerHandle = setInterval(() => {
      if (_s.timeLeft === null) return;
      _s.timeLeft = Math.max(0, _s.timeLeft - 1);
      const timerText = _root?.querySelector('.mob-tk__timer-text');
      if (timerText) timerText.textContent = formatTime(_s.timeLeft);
      if (_s.timeLeft <= 60) timerText?.closest('.mob-tk__timer')?.classList.add('mob-tk__timer--warn');
      if (_s.timeLeft === 0) {
        clearInterval(_s.timerHandle);
        _s.timerHandle = null;
        finishUp(true);
      }
    }, 1000);
  }
}

// ── Answer selection ──────────────────────────────────────────

function onOptionClick(question, optionIdx) {
  if (_s.answers[question.id] !== undefined && _s.settings.showAnswers) return;

  const opt = question.options[optionIdx];
  const isCorrect = opt?.isCorrect === true;
  // Translate the on-screen (possibly shuffled) position back to the
  // canonical index that the server uses. Falls back to `optionIdx` when
  // the question wasn't shuffled (no `__origIdx`).
  const canonical = (opt && Number.isInteger(opt.__origIdx)) ? opt.__origIdx : optionIdx;
  _s.answers[question.id] = { optionIdx, canonical, isCorrect };

  const elapsed = Date.now() - (_s.startTime || Date.now());
  recordAnswer(_s.attemptId, {
    testId: _s.testId,
    questionId: question.id,
    // answerIndex MUST be in canonical order — the server validates
    // `options[answer_index].isCorrect` against the persisted question.
    answerIndex: canonical,
    canonicalAnswerIndex: canonical,
    isCorrect,
    durationMs: elapsed,
    isSkipped: false,
  }).catch(e => console.warn('[mob-taking] recordAnswer:', e));

  _mount();

  if (_s.settings.showAnswers && _s.currentIdx < _s.questions.length - 1) {
    clearTimeout(_s.advanceTimer);
    _s.advanceTimer = setTimeout(() => { _s.currentIdx++; _mount(); }, 700);
  }
}

// ── Finish ────────────────────────────────────────────────────

async function finishUp(timedOut) {
  clearInterval(_s.timerHandle);
  clearTimeout(_s.advanceTimer);
  _s.timerHandle = null;
  _s.phase = 'finishing';
  _mount();

  const totalMs = Date.now() - (_s.startTime || Date.now());
  const attemptId = _s.attemptId;
  const testId = _s.testId;

  try {
    const result = await finishAttempt(attemptId, {
      testId,
      totalDurationMs: totalMs,
    });
    sessionStorage.setItem(`att:${attemptId}:result`, JSON.stringify({
      ...result,
      // Ensure questionCount is present for the results screen even if
      // the finishAttempt response shape varies.
      questionCount: result?.questionCount ?? _s.questions.length,
      testTitle: _s.test?.title || result?.testTitle,
      questions: _s.questions.map(q => ({
        id: q.id,
        text: blocksToText(q.question?.blocks),
      })),
      answersLocal: _s.answers,
      flaggedIds: [..._s.flagged],
      timedOut,
    }));
  } catch (e) {
    console.error('[mob-taking] finishAttempt:', e);
    sessionStorage.setItem(`att:${attemptId}:result`, JSON.stringify({
      attemptId, testId, percentCorrect: null,
      questionCount: _s.questions.length,
      testTitle: _s.test?.title,
      questions: _s.questions.map(q => ({ id: q.id, text: blocksToText(q.question?.blocks) })),
      answersLocal: _s.answers,
      flaggedIds: [..._s.flagged],
      timedOut,
    }));
  }

  navigate(`/test/${testId}/results/${attemptId}`);
}

// ── Build pretest screen ──────────────────────────────────────

function buildPretest() {
  const total = _s.allQuestions.length;
  const cfg   = _s.settings;
  const countSteps = [10, 20, 30].filter(n => n < total);
  countSteps.push(total);
  if (!countSteps.includes(cfg.count)) cfg.count = countSteps[Math.min(1, countSteps.length - 1)];

  const screen = document.createElement('div');
  screen.className = 'mob';
  screen.innerHTML = `
    <div class="mob-topbar" style="flex-shrink:0;">
      <button class="mob-topbar__back mob-pretest-back">${iconEl('chevL', 16)?.outerHTML || '←'}</button>
      <span class="mob-topbar__title">${esc(_s.test?.title || 'Test')}</span>
    </div>
    <div class="mob__content" style="padding:16px;padding-bottom:96px;">

      <div style="font:400 11px/1 Inter,sans-serif;color:var(--ink-mute);text-transform:uppercase;
                  letter-spacing:.06em;margin-bottom:18px;">
        ${t('taking.before_start') || 'before you start'}
      </div>

      <!-- Collection summary -->
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;
                  border:var(--border);border-radius:var(--radius-md);margin-bottom:20px;
                  background:var(--ink-soft);">
        ${iconEl('doc', 20)?.outerHTML || ''}
        <div>
          <div style="font:600 14px/1 Inter,sans-serif;color:var(--ink);">${esc(_s.test?.title || '')}</div>
          <div style="font:400 12px/1 Inter,sans-serif;color:var(--ink-mute);margin-top:3px;">
            ${total} ${t('test.questions') || 'questions'}
          </div>
        </div>
      </div>

      <!-- Question count -->
      <div style="margin-bottom:20px;">
        <div style="font:600 13px/1 Inter,sans-serif;color:var(--ink);margin-bottom:8px;">
          ${t('taking.question_count') || 'Question count'}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${countSteps.map(n => `
            <button data-count="${n}" class="chip chip--small ${n === cfg.count ? 'chip--active' : ''}">
              ${n === total ? `${t('common.all') || 'All'} ${total}` : String(n)}
            </button>`).join('')}
        </div>
      </div>

      <!-- Order -->
      <div style="margin-bottom:20px;">
        <div style="font:600 13px/1 Inter,sans-serif;color:var(--ink);margin-bottom:8px;">
          ${t('taking.order') || 'Order'}
        </div>
        <div style="display:flex;gap:6px;">
          <button data-order="random" class="chip chip--small ${cfg.order === 'random' ? 'chip--active' : ''}">
            ${t('taking.random') || 'Random'}
          </button>
          <button data-order="sequential" class="chip chip--small ${cfg.order === 'sequential' ? 'chip--active' : ''}">
            ${t('taking.sequential') || 'Sequential'}
          </button>
        </div>
      </div>

      <!-- Show answers toggle -->
      <div style="margin-bottom:20px;">
        <div style="font:600 13px/1 Inter,sans-serif;color:var(--ink);margin-bottom:4px;">
          ${t('taking.show_answers') || 'Feedback after answer'}
        </div>
        <div style="font:400 11px/1.4 Inter,sans-serif;color:var(--ink-mute);margin-bottom:8px;">
          ${t('taking.show_answers_tip') || 'Shows ✓/✗ immediately after you pick an option'}
        </div>
        <div style="display:flex;gap:6px;">
          <button data-show="true"  class="chip chip--small ${cfg.showAnswers  ? 'chip--active' : ''}">
            ${t('common.yes') || 'Yes'}
          </button>
          <button data-show="false" class="chip chip--small ${!cfg.showAnswers ? 'chip--active' : ''}">
            ${t('common.no') || 'No'}
          </button>
        </div>
      </div>

      <!-- Time limit -->
      <div style="margin-bottom:20px;">
        <div style="font:600 13px/1 Inter,sans-serif;color:var(--ink);margin-bottom:8px;">
          ${t('taking.time_limit') || 'Time limit'}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${[0, 5, 10, 15, 20, 30].map(n => `
            <button data-timelimit="${n}" class="chip chip--small ${n === cfg.timeLimitMin ? 'chip--active' : ''}">
              ${n === 0
                ? (t('taking.no_limit') || 'None')
                : `${n} ${t('stats.min_short') || 'min'}`}
            </button>`).join('')}
        </div>
      </div>
    </div>

    <!-- Fixed start button -->
    <div style="position:fixed;bottom:0;left:0;right:0;padding:12px 16px;
                background:var(--paper);border-top:var(--border);z-index:10;
                padding-bottom:calc(12px + env(safe-area-inset-bottom, 0px));">
      <button id="mob-start-btn" class="btn btn--primary" style="width:100%;justify-content:center;gap:6px;">
        ${iconEl('play', 15)?.outerHTML || ''}
        <span id="mob-start-label">${t('taking.start_n') || 'Start'} ${cfg.count} ${t('test.questions') || 'questions'}</span>
      </button>
    </div>
  `;

  screen.querySelector('.mob-pretest-back')?.addEventListener('click', () => history.back());

  screen.querySelectorAll('[data-count]').forEach(btn => {
    btn.addEventListener('click', () => {
      cfg.count = parseInt(btn.dataset.count, 10);
      screen.querySelectorAll('[data-count]').forEach(b => {
        b.classList.toggle('chip--active', parseInt(b.dataset.count, 10) === cfg.count);
      });
      const label = screen.querySelector('#mob-start-label');
      if (label) label.textContent = `${t('taking.start_n') || 'Start'} ${cfg.count} ${t('test.questions') || 'questions'}`;
    });
  });

  screen.querySelectorAll('[data-order]').forEach(btn => {
    btn.addEventListener('click', () => {
      cfg.order = btn.dataset.order;
      screen.querySelectorAll('[data-order]').forEach(b => {
        b.classList.toggle('chip--active', b.dataset.order === cfg.order);
      });
    });
  });

  screen.querySelectorAll('[data-show]').forEach(btn => {
    btn.addEventListener('click', () => {
      cfg.showAnswers = btn.dataset.show === 'true';
      screen.querySelectorAll('[data-show]').forEach(b => {
        b.classList.toggle('chip--active', b.dataset.show === String(cfg.showAnswers));
      });
    });
  });

  screen.querySelectorAll('[data-timelimit]').forEach(btn => {
    btn.addEventListener('click', () => {
      cfg.timeLimitMin = parseInt(btn.dataset.timelimit, 10);
      screen.querySelectorAll('[data-timelimit]').forEach(b => {
        b.classList.toggle('chip--active', parseInt(b.dataset.timelimit, 10) === cfg.timeLimitMin);
      });
    });
  });

  screen.querySelector('#mob-start-btn')?.addEventListener('click', () => beginAttempt());
  return screen;
}

// ── Question navigation drawer ────────────────────────────────

function buildNavDrawer() {
  const total = _s.questions.length;

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:200;',
    'display:flex;flex-direction:column;justify-content:flex-end;',
  ].join('');

  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.45);';
  backdrop.addEventListener('click', () => { _s.drawerOpen = false; _mount(); });

  const sheet = document.createElement('div');
  sheet.style.cssText = [
    'position:relative;background:var(--paper);',
    'border-radius:var(--radius-lg) var(--radius-lg) 0 0;',
    'padding:12px 16px 16px;max-height:65vh;overflow-y:auto;',
    'padding-bottom:calc(16px + env(safe-area-inset-bottom,0px));',
  ].join('');

  // Handle
  const handle = document.createElement('div');
  handle.style.cssText = [
    'width:36px;height:4px;border-radius:2px;',
    'background:var(--ink-soft);margin:0 auto 12px;',
  ].join('');

  // Title row
  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';

  const title = document.createElement('span');
  title.style.cssText = 'font:600 13px/1 Inter,sans-serif;color:var(--ink);';
  title.textContent = t('taking.jump_to') || 'Jump to question';

  const legend = document.createElement('div');
  legend.style.cssText = 'display:flex;gap:10px;font:400 10px/1 Inter,sans-serif;color:var(--ink-mute);';
  legend.innerHTML = `
    <span style="display:flex;align-items:center;gap:3px;">
      <span style="width:10px;height:10px;border-radius:2px;background:var(--accent-soft);
                   border:1px solid var(--accent);display:inline-block;"></span>✓
    </span>
    <span style="display:flex;align-items:center;gap:3px;">
      <span style="width:10px;height:10px;border-radius:2px;
                   background:rgba(196,85,74,.10);border:1px solid #c4554a;display:inline-block;"></span>✗
    </span>`;
  titleRow.append(title, legend);

  // Grid of question cells
  const grid = document.createElement('div');
  grid.className = 'rs-qgrid';

  for (let i = 0; i < total; i++) {
    const q       = _s.questions[i];
    const saved   = q ? _s.answers[q.id] : undefined;
    const flagged = q && _s.flagged.has(q.id);
    const current = i === _s.currentIdx;

    let cls = 'rs-qcell';
    let icon = '';
    if (saved !== undefined) {
      if (_s.settings.showAnswers) {
        cls  += saved.isCorrect ? ' rs-qcell--correct' : ' rs-qcell--wrong';
        icon  = saved.isCorrect ? '✓' : '✗';
      } else {
        cls  += ' rs-qcell--correct';  // answered, but correctness unknown yet
        icon  = '·';
      }
    }
    if (flagged) cls += ' rs-qcell--flagged';

    const cell = document.createElement('div');
    cell.className = cls;
    if (current) cell.style.cssText = 'outline:2px solid var(--accent);outline-offset:2px;cursor:pointer;';
    else          cell.style.cssText = 'cursor:pointer;';

    cell.innerHTML = `
      <span class="rs-qcell__num">${i + 1}</span>
      <span class="rs-qcell__icon">${icon}</span>`;

    cell.addEventListener('click', () => {
      // Exam mode: forward-only navigation.
      if (_s.settings.forwardOnly && i < _s.currentIdx) return;
      _s.currentIdx  = i;
      _s.drawerOpen  = false;
      _mount();
    });
    grid.appendChild(cell);
  }

  sheet.append(handle, titleRow, grid);
  overlay.append(backdrop, sheet);
  return overlay;
}

// ── Build taking screen ───────────────────────────────────────

function buildTaking() {
  const q      = _s.questions[_s.currentIdx];
  const total  = _s.questions.length;
  const pct    = Math.round((_s.currentIdx / Math.max(total, 1)) * 100);
  const KEYS   = ['A', 'B', 'C', 'D', 'E', 'F'];
  const saved  = q ? _s.answers[q.id] : undefined;
  const isLast = _s.currentIdx >= total - 1;

  const screen = document.createElement('div');
  screen.className = 'mob';

  // ── Topbar ──
  const topbar = document.createElement('div');
  topbar.style.cssText = `
    flex-shrink:0;display:flex;align-items:center;gap:10px;
    padding:0 12px;height:52px;border-bottom:var(--border);background:var(--paper);`;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--ghost btn--icon';
  closeBtn.style.flexShrink = '0';
  closeBtn.appendChild(iconEl('x', 18));
  closeBtn.addEventListener('click', () => {
    if (confirm(t('taking.confirm_abandon') || 'Abandon this attempt?')) {
      clearInterval(_s.timerHandle);
      clearTimeout(_s.advanceTimer);
      if (_s.attemptId) abandonAttempt(_s.attemptId).catch(() => {});
      navigate('/home');
    }
  });

  const progressWrap = document.createElement('div');
  progressWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:3px;min-width:0;';

  // Counter — plain label. Grid button next to it opens the
  // navigation drawer (icon makes the affordance obvious).
  const counterLabel = document.createElement('span');
  counterLabel.style.cssText = [
    'font:400 11px/1 Inter,sans-serif;color:var(--ink-mute);',
  ].join('');
  counterLabel.textContent = `${_s.currentIdx + 1} / ${total}`;

  const gridBtn = document.createElement('button');
  gridBtn.type = 'button';
  gridBtn.style.cssText = [
    'display:inline-flex;align-items:center;justify-content:center;',
    'width:24px;height:24px;padding:0;background:none;',
    'border:1px solid var(--ink-soft);border-radius:6px;cursor:pointer;',
    'color:var(--ink-mute);',
  ].join('');
  gridBtn.setAttribute('aria-label', t('taking.jump_to') || 'Open question grid');
  gridBtn.title = t('taking.jump_to') || 'Перейти к вопросу';
  gridBtn.appendChild(iconEl('grid', 13));
  gridBtn.addEventListener('click', () => { _s.drawerOpen = !_s.drawerOpen; _mount(); });

  const counterWrap = document.createElement('div');
  counterWrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';
  counterWrap.append(counterLabel, gridBtn);

  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
  topRow.appendChild(counterWrap);
  if (_s.timeLeft !== null) {
    const timerEl = document.createElement('span');
    timerEl.className = 'mob-tk__timer';
    timerEl.style.cssText = 'display:flex;align-items:center;gap:3px;';
    timerEl.innerHTML = `${iconEl('clock', 11)?.outerHTML || ''}
      <span class="mob-tk__timer-text">${formatTime(_s.timeLeft)}</span>`;
    topRow.appendChild(timerEl);
  }

  const progressBar = document.createElement('div');
  progressBar.style.cssText = 'height:4px;background:var(--ink-soft);border-radius:999px;overflow:hidden;';
  progressBar.innerHTML = `<div style="width:${pct}%;height:100%;background:var(--accent);
    border-radius:999px;transition:width 200ms ease;"></div>`;

  progressWrap.append(topRow, progressBar);

  const flagBtn = document.createElement('button');
  flagBtn.type = 'button';
  flagBtn.style.cssText = `
    flex-shrink:0;background:none;border:none;cursor:pointer;padding:4px;
    color:${q && _s.flagged.has(q.id) ? 'var(--accent)' : 'var(--ink-mute)'};`;
  flagBtn.appendChild(iconEl('flag', 18));
  flagBtn.addEventListener('click', () => {
    if (!q) return;
    if (_s.flagged.has(q.id)) _s.flagged.delete(q.id);
    else _s.flagged.add(q.id);
    _mount();
  });

  topbar.append(closeBtn, progressWrap, flagBtn);

  // ── Question area ──
  const qArea = document.createElement('div');
  qArea.style.cssText = 'flex:1;overflow-y:auto;padding:16px 16px 0;';

  if (q) {
    const cap = document.createElement('div');
    cap.style.cssText = `
      font:400 11px/1 Inter,sans-serif;color:var(--ink-mute);
      text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;`;
    cap.textContent = `${t('test.question') || 'Question'} ${_s.currentIdx + 1}`;

    const qText = document.createElement('div');
    qText.style.cssText = 'font:600 17px/1.4 Inter,sans-serif;color:var(--ink);margin-bottom:16px;';
    qText.innerHTML = renderBlocks(q.question?.blocks, _s.test?.assetsBaseUrl)
      || esc(String(q.text || ''));

    const optsWrap = document.createElement('div');
    optsWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding-bottom:16px;';

    const opts = q.options || [];
    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      const btn = document.createElement('button');
      btn.type = 'button';

      let borderColor = 'var(--ink-soft)';
      let bg = 'transparent';

      if (saved !== undefined) {
        if (saved.optionIdx === i) {
          if (_s.settings.showAnswers) {
            borderColor = saved.isCorrect ? 'var(--accent)' : '#c4554a';
            bg = saved.isCorrect ? 'var(--accent-soft)' : 'rgba(196,85,74,.08)';
          } else {
            borderColor = 'var(--accent)';
            bg = 'var(--accent-soft)';
          }
        } else if (_s.settings.showAnswers && opt.isCorrect && !saved.isCorrect) {
          borderColor = 'var(--accent)';
          bg = 'var(--accent-soft)';
        }
      }

      btn.style.cssText = `
        display:flex;align-items:flex-start;gap:10px;padding:12px;
        border:1.5px solid ${borderColor};border-radius:var(--radius-md);
        background:${bg};cursor:pointer;text-align:left;width:100%;`;

      const keyEl = document.createElement('div');
      keyEl.style.cssText = `
        width:22px;height:22px;border-radius:50%;border:1.5px solid var(--ink-soft);
        display:flex;align-items:center;justify-content:center;
        font:600 11px/1 'JetBrains Mono',monospace;color:var(--ink-mute);
        flex-shrink:0;margin-top:1px;`;
      keyEl.textContent = KEYS[i] || String(i + 1);

      const textEl = document.createElement('div');
      textEl.style.cssText = 'font:400 14px/1.4 Inter,sans-serif;color:var(--ink);flex:1;';
      textEl.innerHTML = renderBlocks(opt.content?.blocks, _s.test?.assetsBaseUrl)
        || esc(String(opt.text || `Option ${i + 1}`));

      btn.append(keyEl, textEl);
      btn.addEventListener('click', () => onOptionClick(q, i));
      optsWrap.appendChild(btn);
    }

    qArea.append(cap, qText, optsWrap);
  }

  // ── Bottom bar ──
  const bottomBar = document.createElement('div');
  bottomBar.style.cssText = `
    flex-shrink:0;display:flex;gap:8px;padding:10px 16px;
    border-top:var(--border);background:var(--paper);
    padding-bottom:calc(10px + env(safe-area-inset-bottom, 0px));`;

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn--ghost';
  prevBtn.style.cssText = 'flex:1;justify-content:center;';
  prevBtn.disabled = _s.currentIdx === 0 || !!_s.settings.forwardOnly;
  prevBtn.append(iconEl('chevL', 14), document.createTextNode(` ${t('taking.previous') || 'Prev'}`));
  prevBtn.addEventListener('click', () => {
    if (_s.currentIdx > 0) { _s.currentIdx--; _mount(); }
  });

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn--primary';
  nextBtn.style.cssText = 'flex:2;justify-content:center;';
  if (isLast) {
    nextBtn.append(iconEl('check', 14), document.createTextNode(` ${t('taking.finish') || 'Finish'}`));
    nextBtn.addEventListener('click', () => finishUp(false));
  } else {
    nextBtn.append(document.createTextNode(`${t('taking.next') || 'Next'} `), iconEl('chevR', 14));
    nextBtn.addEventListener('click', () => { _s.currentIdx++; _mount(); });
  }

  bottomBar.append(prevBtn, nextBtn);
  screen.append(topbar, qArea, bottomBar);

  // Attach navigation drawer overlay (outside normal flow)
  if (_s.drawerOpen) {
    screen.appendChild(buildNavDrawer());
  }

  return screen;
}

// ── Mount ─────────────────────────────────────────────────────

async function _mount() {
  if (!_root) return;
  _root.innerHTML = '';

  if (_s.phase === 'loading') {
    _root.innerHTML = `
      <div class="mob" style="align-items:center;justify-content:center;">
        <div class="skeleton" style="width:200px;height:14px;"></div>
      </div>`;
    return;
  }

  if (_s.phase === 'finishing') {
    _root.innerHTML = `
      <div class="mob" style="align-items:center;justify-content:center;gap:14px;">
        <div class="skeleton" style="width:160px;height:14px;"></div>
        <p style="font-size:13px;color:var(--ink-mute);">${t('taking.saving') || 'Saving results…'}</p>
      </div>`;
    return;
  }

  if (_s.phase === 'pretest') { _root.appendChild(buildPretest()); return; }
  if (_s.phase === 'taking')  {
    _root.appendChild(buildTaking());
    await typesetMath(_root);
    attachAssets(_root).catch(() => {});
    return;
  }
}

// ── Entry point ───────────────────────────────────────────────

export default async function render(root, params = {}) {
  _root = root;
  _s.testId = params.id || null;

  clearInterval(_s.timerHandle);
  clearTimeout(_s.advanceTimer);
  Object.assign(_s, {
    phase: 'loading', test: null, allQuestions: [], questions: [],
    currentIdx: 0, answers: {}, flagged: new Set(),
    drawerOpen: false,
    startTime: null, timeLeft: null,
    timerHandle: null, advanceTimer: null,
    attemptId: null,
  });
  _mount();

  if (!params.id) {
    _root.innerHTML = `
      <div class="mob" style="align-items:center;justify-content:center;gap:12px;padding:var(--pad);">
        <p style="color:var(--ink-mute);">No test ID provided</p>
        <a href="#/home" class="btn btn--ghost btn--small">← ${t('common.back') || 'Back'}</a>
      </div>`;
    return;
  }

  try {
    const data = await getTest(params.id);
    _s.test = data;
    _s.allQuestions = Array.isArray(data.questions) ? data.questions : [];
    const total = _s.allQuestions.length;
    _s.settings.count = total > 0 ? Math.min(_s.settings.count, total) : 0;
    if (_s.settings.count < 10 && total >= 10) _s.settings.count = 10;
    else if (_s.settings.count === 0 && total > 0) _s.settings.count = total;
  } catch (e) {
    console.error('[mob-taking] load test:', e);
    _root.innerHTML = `
      <div class="mob" style="align-items:center;justify-content:center;gap:12px;padding:var(--pad);">
        <p style="font-weight:600;color:#c4554a;">${t('common.error') || 'Error'}</p>
        <p style="font-size:13px;color:var(--ink-mute);">Could not load test</p>
        <a href="#/home" class="btn btn--ghost btn--small">← ${t('common.back') || 'Back'}</a>
      </div>`;
    return;
  }

  // Read settings written by mobile/pre-test.js. If none, fall back to
  // the in-file pretest screen so direct deep-links to /test/:id/take
  // still work (mostly a dev convenience now).
  let preset = null;
  try {
    const raw = sessionStorage.getItem(`pretest:${_s.testId}`);
    if (raw) preset = JSON.parse(raw);
  } catch { /* private mode — keep preset null */ }

  if (preset) {
    // Map mobile pre-test schema → taking.js settings shape.
    // Back-compat: old `shuffle` key maps to questions-shuffle.
    const total = _s.allQuestions.length;
    const requested = Math.max(1, Math.min(total, Number(preset.count) || total));
    const shuffleQ = preset.shuffleQuestions ?? preset.shuffle ?? false;
    const shuffleA = preset.shuffleAnswers   ?? false;
    const mode = preset.mode || 'training';
    _s.settings = {
      mode,
      count: requested,
      order: shuffleQ ? 'random' : 'sequential',
      shuffleOptions: !!shuffleA,
      timeLimitMin: preset.timeLimitMin || 0,
      showAnswers: mode === 'exam' ? false : !!preset.revealImmediately,
      forwardOnly: mode === 'exam',
    };
    beginAttempt();
    return;
  }

  _s.phase = 'pretest';
  _mount();
}
