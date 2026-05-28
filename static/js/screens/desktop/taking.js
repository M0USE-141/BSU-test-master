/**
 * screens/desktop/taking.js — Pre-test modal + test taking screen
 *
 * Flow: load test → show pre-test modal → start attempt → take test → finish → navigate to results
 */
import { getTest } from '../../api/tests.js';
import { startAttempt, recordAnswer, finishAttempt, abandonAttempt } from '../../api/attempts.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { renderContent, typesetMath } from '../../utils/render-blocks.js';
import { escHtml } from '../../utils/escape.js';
import { getClientId } from '../../utils/client-id.js';
import { formatSeconds as formatTime } from '../../utils/format.js';

// ── Module state ──────────────────────────────────────────────
/** @type {HTMLElement|null} */
let _root = null;

const _s = {
  phase: 'loading', // 'loading' | 'pretest' | 'taking' | 'finishing' | 'review'
  testId: /** @type {string|null} */ (null),
  test: /** @type {any} */ (null),
  allQuestions: /** @type {any[]} */ ([]),
  questions: /** @type {any[]} */ ([]),
  settings: {
    count: 20,
    order: 'random', // 'random' | 'sequential'
    timeLimitMin: 0,
    showAnswers: true,
    allowSkip: true,
    showProgress: true,
    shuffleOptions: false,
  },
  attemptId: /** @type {string|null} */ (null),
  clientId: /** @type {string|null} */ (null),
  currentIdx: 0,
  /** @type {{ [qId: number]: { optionIdx: number, isCorrect: boolean } }} */
  answers: {},
  flagged: /** @type {Set<number>} */ (new Set()),
  // Review mode
  reviewSnap: /** @type {any} */ (null),
  startTime: /** @type {number|null} */ (null),
  timeLeft: /** @type {number|null} */ (null),
  timerHandle: /** @type {any} */ (null),
  advanceTimer: /** @type {any} */ (null),
};

// ── Utilities ─────────────────────────────────────────────────

// renderBlocks: alias to shared utility (keeps call-sites unchanged)
function renderBlocks(blocks, assetsBaseUrl) {
  return renderContent({ blocks }, assetsBaseUrl);
}

function blocksToText(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.flatMap(b =>
    (b.inlines || []).filter(i => i.type === 'text').map(i => i.text || '')
  ).join(' ').trim().slice(0, 90);
}

// ── Pre-test modal ────────────────────────────────────────────

function buildPretestModal() {
  const total = _s.allQuestions.length;
  const cfg = _s.settings;

  const bg = document.createElement('div');
  bg.className = 'pretest-bg';

  const modal = document.createElement('div');
  modal.className = 'pretest-modal';

  // Head
  const head = document.createElement('div');
  head.className = 'pretest-modal__head';

  const headLeft = document.createElement('div');
  const capEl = document.createElement('div');
  capEl.className = 'pretest-modal__cap';
  capEl.textContent = t('taking.before_start') || 'before you start';
  const titleEl = document.createElement('div');
  titleEl.className = 'pretest-modal__title';
  titleEl.textContent = `${_s.test?.title || ''} · ${total} ${t('test.questions') || 'questions'}`;
  headLeft.append(capEl, titleEl);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--ghost btn--icon';
  closeBtn.appendChild(iconEl('x', 18));
  closeBtn.addEventListener('click', () => navigate('/home'));
  head.append(headLeft, closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'pretest-modal__body';

  // ── Count field ──
  const countSteps = [10, 20, 30].filter(n => n < total);
  countSteps.push(total);
  if (!countSteps.includes(cfg.count)) cfg.count = countSteps[Math.min(1, countSteps.length - 1)];
  let customCount = false; // true when user typed a custom number

  const countField = document.createElement('div');
  countField.className = 'pretest-field';
  const countLabel = document.createElement('div');
  countLabel.className = 'pretest-field__label';
  countLabel.textContent = t('taking.question_count') || 'Question count';

  const countRow = document.createElement('div');
  countRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

  const countChips = document.createElement('div');
  countChips.className = 'pretest-chips';

  // Custom count input
  const customInput = document.createElement('input');
  customInput.type = 'number';
  customInput.min = '1';
  customInput.max = String(total);
  customInput.placeholder = t('taking.custom') || 'Custom';
  customInput.style.cssText = 'width:80px;padding:5px 8px;border:var(--border);border-radius:var(--radius-sm);font:400 13px Inter,sans-serif;color:var(--ink);background:var(--paper);';

  function renderCountChips() {
    countChips.innerHTML = '';
    for (const n of countSteps) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip--small' + (!customCount && n === cfg.count ? ' chip--active' : '');
      chip.textContent = (n === total) ? `${t('common.all') || 'All'} ${total}` : String(n);
      chip.addEventListener('click', () => {
        cfg.count = n; customCount = false;
        customInput.value = '';
        renderCountChips(); updateStartBtn();
      });
      countChips.appendChild(chip);
    }
  }
  renderCountChips();

  customInput.addEventListener('input', () => {
    const v = parseInt(customInput.value, 10);
    if (!isNaN(v) && v >= 1 && v <= total) {
      cfg.count = v; customCount = true;
      renderCountChips(); updateStartBtn();
    }
  });

  countRow.append(countChips, customInput);
  countField.append(countLabel, countRow);

  // ── Order field ──
  const orderField = document.createElement('div');
  orderField.className = 'pretest-field';
  const orderLabel = document.createElement('div');
  orderLabel.className = 'pretest-field__label';
  orderLabel.textContent = t('taking.order') || 'Order';
  const orderChips = document.createElement('div');
  orderChips.className = 'pretest-chips';

  const orderOptions = [
    ['random',     t('taking.random')     || 'Random'],
    ['sequential', t('taking.sequential') || 'Sequential'],
  ];

  function renderOrderChips() {
    orderChips.innerHTML = '';
    for (const [id, label] of orderOptions) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip--small' + (id === cfg.order ? ' chip--active' : '');
      chip.textContent = label;
      chip.addEventListener('click', () => { cfg.order = id; renderOrderChips(); });
      orderChips.appendChild(chip);
    }
  }
  renderOrderChips();
  orderField.append(orderLabel, orderChips);

  // ── Time limit ──
  const timeField = document.createElement('div');
  timeField.className = 'pretest-field';
  const timeLabelEl = document.createElement('div');
  timeLabelEl.className = 'pretest-field__label';
  timeLabelEl.textContent = t('taking.time_limit') || 'Time limit';

  const timeRow = document.createElement('div');
  timeRow.className = 'pretest-time__row';
  const timeCapSpan = document.createElement('span');
  timeCapSpan.style.cssText = 'font-size:12px;color:var(--ink-mute);';
  timeCapSpan.textContent = t('taking.time_limit') || 'Time limit';
  const timeValSpan = document.createElement('span');
  timeValSpan.className = 'pretest-time__val';

  function updateTimeVal() {
    timeValSpan.textContent = cfg.timeLimitMin === 0
      ? (t('taking.no_limit') || 'No limit')
      : `${cfg.timeLimitMin} min`;
  }
  updateTimeVal();
  timeRow.append(timeCapSpan, timeValSpan);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'pretest-slider';
  slider.min = '0'; slider.max = '60'; slider.step = '5';
  slider.value = String(cfg.timeLimitMin);
  slider.addEventListener('input', () => { cfg.timeLimitMin = parseInt(slider.value, 10); updateTimeVal(); });
  timeField.append(timeLabelEl, timeRow, slider);

  // ── Options ──
  const checksField = document.createElement('div');
  checksField.className = 'pretest-field';
  const checksLabel = document.createElement('div');
  checksLabel.className = 'pretest-field__label';
  checksLabel.textContent = t('taking.options') || 'Options';
  const checksRow = document.createElement('div');
  checksRow.className = 'pretest-checks';

  const checkDefs = [
    ['showAnswers',    t('taking.show_answers')    || 'Feedback after answer',
     t('taking.show_answers_tip')    || 'Shows ✓/✗ immediately after you pick an option'],
    ['allowSkip',      t('taking.allow_skip')      || 'Allow skip',
     t('taking.allow_skip_tip')      || 'Adds a Skip button so you can come back later'],
    ['showProgress',   t('taking.show_progress')   || 'Progress bar',
     t('taking.show_progress_tip')   || 'Displays a progress bar at the top'],
    ['shuffleOptions', t('taking.shuffle_options') || 'Shuffle answer options',
     t('taking.shuffle_options_tip') || 'Randomises A/B/C/D order for each question'],
  ];

  for (const [key, label, tip] of checkDefs) {
    const wrap = document.createElement('label');
    wrap.className = 'pretest-check';
    wrap.title = tip;
    const box = document.createElement('div');
    box.className = 'pretest-check__box' + (cfg[key] ? ' pretest-check__box--checked' : '');
    const cIcon = iconEl('check', 12);
    cIcon.style.display = cfg[key] ? 'flex' : 'none';
    box.appendChild(cIcon);
    const span = document.createElement('span');
    span.textContent = label;
    wrap.append(box, span);
    wrap.addEventListener('click', e => {
      e.preventDefault();
      cfg[key] = !cfg[key];
      box.className = 'pretest-check__box' + (cfg[key] ? ' pretest-check__box--checked' : '');
      cIcon.style.display = cfg[key] ? 'flex' : 'none';
    });
    checksRow.appendChild(wrap);
  }
  checksField.append(checksLabel, checksRow);

  body.append(countField, orderField, timeField, checksField);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'pretest-modal__footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--ghost';
  cancelBtn.style.flex = '1';
  cancelBtn.textContent = t('common.cancel') || 'Cancel';
  cancelBtn.addEventListener('click', () => navigate('/home'));

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn btn--primary';
  startBtn.style.flex = '2';

  function updateStartBtn() {
    startBtn.innerHTML = '';
    startBtn.appendChild(iconEl('play', 15));
    const sp = document.createElement('span');
    sp.textContent = ` ${t('taking.start_n') || 'Start'} ${cfg.count} ${t('test.questions') || 'questions'}`;
    startBtn.appendChild(sp);
  }
  updateStartBtn();
  startBtn.addEventListener('click', () => beginAttempt());
  footer.append(cancelBtn, startBtn);

  modal.append(head, body, footer);
  bg.appendChild(modal);
  return bg;
}

// ── Begin attempt ─────────────────────────────────────────────

async function beginAttempt() {
  const total = _s.allQuestions.length;
  const count = Math.min(_s.settings.count, total);
  let pool = [..._s.allQuestions];

  if (_s.settings.order === 'random') {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }

  _s.questions = pool.slice(0, count);
  _s.currentIdx = 0;
  _s.answers = {};
  _s.flagged = new Set();
  _s.attemptId = crypto.randomUUID();
  _s.clientId = getClientId();
  _s.startTime = Date.now();
  _s.timeLeft = _s.settings.timeLimitMin > 0 ? _s.settings.timeLimitMin * 60 : null;

  startAttempt({
    attemptId: _s.attemptId,
    testId: _s.testId,
    clientId: _s.clientId,
    settings: {
      // mode is required server-side — drives validation of the rest.
      mode: _s.settings.mode || 'training',
      count: _s.questions.length,
      order: _s.settings.order,
      timeLimitSeconds: _s.settings.timeLimitMin > 0 ? _s.settings.timeLimitMin * 60 : null,
      showAnswersImmediately: _s.settings.showAnswers,
      shuffleOptions: !!_s.settings.shuffleOptions,
      allowSkip: _s.settings.allowSkip,
    },
    questions: _s.questions.map(q => ({
      questionId: Number(q.id),
      question: { question: q.question, options: q.options },
    })),
  }).catch(e => console.warn('[taking] startAttempt:', e));

  sessionStorage.setItem(`att:${_s.attemptId}:client`, _s.clientId);
  sessionStorage.setItem(`att:${_s.attemptId}:testId`, _s.testId || '');

  _s.phase = 'taking';
  _mount();

  if (_s.timeLeft !== null) {
    _s.timerHandle = setInterval(() => {
      if (_s.timeLeft === null) return;
      _s.timeLeft = Math.max(0, _s.timeLeft - 1);
      const timerText = _root?.querySelector('.tk-topbar__timer-text');
      if (timerText) timerText.textContent = formatTime(_s.timeLeft);
      if (_s.timeLeft <= 60) timerText?.closest('.tk-topbar__timer')?.classList.add('tk-topbar__timer--warn');
      if (_s.timeLeft === 0) {
        clearInterval(_s.timerHandle); _s.timerHandle = null;
        // Mode-aware expiry:
        //   - exam:     hard auto-submit (existing behaviour)
        //   - timed:    soft cap — keep the screen open in error state,
        //               user must click "Сдать" manually
        //   - training: no timer set at all, this branch unreachable
        if (_s.settings.mode === 'exam') {
          finishUp(true);
        }
        // For 'timed' we leave the user in place — taking screen keeps
        // working; the topbar timer just stays at 00:00 in warn state.
      }
    }, 1000);
  }
}

// ── Taking screen ─────────────────────────────────────────────

function buildTakingScreen() {
  const tk = document.createElement('div');
  tk.className = 'tk';
  tk.appendChild(buildTopBar());

  const body = document.createElement('div');
  body.className = 'tk__body';
  body.appendChild(buildQuestionArea());
  body.appendChild(buildRail());
  tk.appendChild(body);
  tk.appendChild(buildBottomBar());
  return tk;
}

function buildTopBar() {
  const bar = document.createElement('div');
  bar.className = 'tk__topbar';

  // Left
  const left = document.createElement('div');
  left.className = 'tk-topbar__left';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--ghost btn--icon';
  closeBtn.appendChild(iconEl('x', 18));
  closeBtn.addEventListener('click', () => {
    if (confirm(t('taking.confirm_abandon') || 'Abandon this attempt?')) {
      clearInterval(_s.timerHandle);
      clearTimeout(_s.advanceTimer);
      if (_s.attemptId) abandonAttempt(_s.attemptId).catch(() => {});
      navigate('/home');
    }
  });
  const titleEl = document.createElement('div');
  titleEl.className = 'tk-topbar__title';
  titleEl.textContent = _s.test?.title || '';
  left.append(closeBtn, titleEl);

  // Progress
  const progress = document.createElement('div');
  progress.className = 'tk-topbar__progress';
  const progressText = document.createElement('div');
  progressText.className = 'tk-topbar__progress-text';
  progressText.textContent = `${_s.currentIdx + 1} / ${_s.questions.length}`;
  progress.appendChild(progressText);
  if (_s.settings.showProgress) {
    const pbar = document.createElement('div');
    pbar.className = 'tk-progress-bar';
    const fill = document.createElement('div');
    fill.className = 'tk-progress-bar__fill';
    fill.style.width = `${(_s.currentIdx / _s.questions.length) * 100}%`;
    pbar.appendChild(fill);
    progress.appendChild(pbar);
  }

  // Right
  const right = document.createElement('div');
  right.className = 'tk-topbar__right';

  if (_s.timeLeft !== null) {
    const timer = document.createElement('div');
    timer.className = 'tk-topbar__timer';
    timer.appendChild(iconEl('clock', 13));
    const timeText = document.createElement('span');
    timeText.className = 'tk-topbar__timer-text';
    timeText.textContent = formatTime(_s.timeLeft);
    timer.appendChild(timeText);
    right.appendChild(timer);
  }

  const currentQ = _s.questions[_s.currentIdx];
  const isFlagged = currentQ && _s.flagged.has(currentQ.id);

  // Exam mode: flags are not allowed. Skip the button entirely so users
  // can't even see the affordance.
  const examMode = _s.settings.mode === 'exam';
  const flagBtn = document.createElement('button');
  flagBtn.type = 'button';
  flagBtn.className = 'btn btn--small btn--ghost';
  if (isFlagged) { flagBtn.style.color = 'var(--accent)'; flagBtn.style.borderColor = 'var(--accent)'; }
  flagBtn.appendChild(iconEl('flag', 13));
  const flagSpan = document.createElement('span');
  flagSpan.textContent = ` ${t('taking.flag') || 'Flag'}`;
  flagBtn.appendChild(flagSpan);
  flagBtn.addEventListener('click', () => {
    if (!currentQ) return;
    if (_s.flagged.has(currentQ.id)) _s.flagged.delete(currentQ.id);
    else _s.flagged.add(currentQ.id);
    _mount();
  });
  if (!examMode) right.appendChild(flagBtn);

  bar.append(left, progress, right);
  return bar;
}

function buildQuestionArea() {
  const wrap = document.createElement('div');
  wrap.className = 'tk__question-wrap';

  const q = document.createElement('div');
  q.className = 'tk__question';

  const currentQ = _s.questions[_s.currentIdx];
  if (!currentQ) { wrap.appendChild(q); return wrap; }

  const cap = document.createElement('div');
  cap.className = 'tk-q-cap';
  cap.textContent = `${t('test.question') || 'Question'} ${_s.currentIdx + 1} ${t('common.of') || 'of'} ${_s.questions.length}`;

  const qText = document.createElement('div');
  qText.className = 'tk-q-text';
  qText.innerHTML = renderBlocks(currentQ.question?.blocks, _s.test?.assetsBaseUrl)
    || escHtml(String(currentQ.text || ''));

  // Build options array; shuffle if enabled (use stable per-question seed via cache)
  const rawOpts = currentQ.options || [];
  let opts = rawOpts.map((opt, origIdx) => ({ opt, origIdx }));
  if (_s.settings.shuffleOptions) {
    // Cache shuffle order per question so it's stable across re-renders
    const cacheKey = `shuf:${currentQ.id}`;
    if (!_s._shuffleCache) _s._shuffleCache = {};
    if (!_s._shuffleCache[cacheKey]) {
      const arr = opts.map((_, i) => i);
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      _s._shuffleCache[cacheKey] = arr;
    }
    opts = _s._shuffleCache[cacheKey].map(i => opts[i]);
  }

  const optsWrap = document.createElement('div');
  optsWrap.className = 'tk-options' + (opts.length <= 2 ? ' tk-options--single' : '');

  const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const savedAnswer = _s.answers[currentQ.id];

  for (let i = 0; i < opts.length; i++) {
    const { opt, origIdx } = opts[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tk-option';

    if (savedAnswer !== undefined) {
      if (savedAnswer.optionIdx === origIdx) btn.classList.add('tk-option--selected');
      // Show correct/wrong when answer is locked and showAnswers is on
      if (_s.settings.showAnswers) {
        if (opt.isCorrect) btn.classList.add('tk-option--correct');
        if (savedAnswer.optionIdx === origIdx && !opt.isCorrect) btn.classList.add('tk-option--wrong');
      }
    }

    const keyEl = document.createElement('div');
    keyEl.className = 'tk-option__key';
    keyEl.textContent = KEYS[i] || String(i + 1);

    const textEl = document.createElement('div');
    textEl.className = 'tk-option__text';
    textEl.innerHTML = renderBlocks(opt.content?.blocks, _s.test?.assetsBaseUrl)
      || escHtml(String(opt.text || `Option ${i + 1}`));

    btn.append(keyEl, textEl);
    btn.addEventListener('click', () => onOptionClick(currentQ, origIdx));
    optsWrap.appendChild(btn);
  }

  q.append(cap, qText, optsWrap);
  wrap.appendChild(q);
  return wrap;
}

function buildRail() {
  const rail = document.createElement('div');
  rail.className = 'tk__rail';

  const titleEl = document.createElement('div');
  titleEl.className = 'tk-rail__title';
  titleEl.textContent = t('test.questions') || 'Questions';

  const pad = document.createElement('div');
  pad.className = 'tk-pad';

  // Exam mode locks navigation forward-only — pad cells become read-only
  // status indicators rather than jump-to controls.
  const examMode = _s.settings.mode === 'exam';
  for (let i = 0; i < _s.questions.length; i++) {
    const q = _s.questions[i];
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'tk-pad__cell';
    cell.textContent = String(i + 1);
    if (i === _s.currentIdx) cell.classList.add('tk-pad__cell--current');
    else if (_s.answers[q.id] !== undefined) cell.classList.add('tk-pad__cell--done');
    if (_s.flagged.has(q.id) && i !== _s.currentIdx) cell.classList.add('tk-pad__cell--flagged');
    if (examMode) {
      cell.style.cursor = 'default';
      cell.style.opacity = i <= _s.currentIdx ? '1' : '0.55';
      cell.title = 'В режиме экзамена нельзя возвращаться к предыдущим вопросам';
    } else {
      cell.addEventListener('click', () => { _s.currentIdx = i; _mount(); });
    }
    pad.appendChild(cell);
  }

  const answeredCount = Object.keys(_s.answers).length;
  const flaggedCount = _s.flagged.size;

  const legend = document.createElement('div');
  legend.className = 'tk-pad__legend';
  legend.innerHTML = `
    <div class="tk-pad__legend-item">
      <div class="tk-pad__dot tk-pad__dot--done"></div>
      <span>${t('taking.answered') || 'answered'} · ${answeredCount}</span>
    </div>
    <div class="tk-pad__legend-item">
      <div class="tk-pad__dot tk-pad__dot--current"></div>
      <span>${t('taking.current') || 'current'}</span>
    </div>
    <div class="tk-pad__legend-item">
      <div class="tk-pad__dot tk-pad__dot--flagged"></div>
      <span>${t('taking.flagged') || 'flagged'} · ${flaggedCount}</span>
    </div>`;

  rail.append(titleEl, pad, legend);
  return rail;
}

function buildBottomBar() {
  const bar = document.createElement('div');
  bar.className = 'tk__bottombar';

  // Exam mode: no looking back.
  const examMode = _s.settings.mode === 'exam';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn--ghost';
  prevBtn.disabled = _s.currentIdx === 0 || examMode;
  if (examMode) {
    prevBtn.title = 'В режиме экзамена нельзя возвращаться к предыдущим вопросам';
  }
  prevBtn.append(iconEl('chevL', 14), document.createTextNode(` ${t('taking.previous') || 'Previous'}`));
  prevBtn.addEventListener('click', () => {
    if (examMode) return;
    if (_s.currentIdx > 0) { _s.currentIdx--; _mount(); }
  });

  const isLast = _s.currentIdx >= _s.questions.length - 1;
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn--primary';

  if (isLast) {
    nextBtn.append(iconEl('check', 14), document.createTextNode(` ${t('taking.finish') || 'Finish'}`));
    nextBtn.addEventListener('click', () => finishUp(false));
  } else {
    nextBtn.append(document.createTextNode(`${t('taking.next') || 'Next'} `), iconEl('chevR', 14));
    nextBtn.addEventListener('click', () => { _s.currentIdx++; _mount(); });
  }

  bar.append(prevBtn, nextBtn);
  return bar;
}

// ── Answer selection ──────────────────────────────────────────

function onOptionClick(question, optionIdx) {
  if (_s.answers[question.id] !== undefined && _s.settings.showAnswers) return;

  const isCorrect = question.options[optionIdx]?.isCorrect === true;
  _s.answers[question.id] = { optionIdx, isCorrect };

  const elapsed = Date.now() - (_s.startTime || Date.now());
  recordAnswer(_s.attemptId, {
    testId: _s.testId,
    clientId: _s.clientId,
    questionId: question.id,
    answerIndex: optionIdx,
    canonicalAnswerIndex: optionIdx,
    isCorrect,
    durationMs: elapsed,
    isSkipped: false,
  }).catch(e => console.warn('[taking] recordAnswer:', e));

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
      clientId: _s.clientId,
      totalDurationMs: totalMs,
    });

    sessionStorage.setItem(`att:${attemptId}:result`, JSON.stringify({
      ...result,
      testId,
      questions: _s.questions.map(q => ({
        id: q.id,
        text: blocksToText(q.question?.blocks),
      })),
      answersLocal: _s.answers,
      flaggedIds: [..._s.flagged],
      timedOut,
    }));
  } catch (e) {
    console.error('[taking] finishAttempt:', e);
    sessionStorage.setItem(`att:${attemptId}:result`, JSON.stringify({
      attemptId, testId, percentCorrect: null,
      questions: _s.questions.map(q => ({ id: q.id, text: blocksToText(q.question?.blocks) })),
      answersLocal: _s.answers,
      flaggedIds: [..._s.flagged],
      timedOut,
    }));
  }

  navigate(`/test/${testId}/results/${attemptId}`);
}

// ── Review screen ────────────────────────────────────────────

function buildReviewScreen() {
  const snap = _s.reviewSnap;
  const questions = _s.questions;        // array with full question objects
  const answersLocal = snap?.answersLocal || {};
  const testId = _s.testId;
  const attemptId = _s.attemptId;
  const assetsBase = _s.test?.assetsBaseUrl || '';

  const rv = document.createElement('div');
  rv.className = 'tk';

  // ── Topbar ──
  const topbar = document.createElement('div');
  topbar.className = 'tk__topbar';
  const left = document.createElement('div');
  left.className = 'tk-topbar__left';
  const backBtn = document.createElement('button');
  backBtn.type = 'button'; backBtn.className = 'btn btn--ghost btn--icon';
  backBtn.appendChild(iconEl('chevL', 18));
  backBtn.addEventListener('click', () => {
    if (attemptId) navigate(`/test/${testId}/results/${attemptId}`);
    else navigate('/home');
  });
  const titleEl = document.createElement('div');
  titleEl.className = 'tk-topbar__title';
  titleEl.textContent = `${t('results.review') || 'Review'} — ${_s.test?.title || ''}`;
  const badge = document.createElement('span');
  badge.style.cssText = 'font-size:12px;color:var(--ink-mute);margin-left:8px;';
  badge.textContent = `${_s.currentIdx + 1} / ${questions.length}`;
  left.append(backBtn, titleEl, badge);
  topbar.appendChild(left);
  rv.appendChild(topbar);

  // ── Body ──
  const body = document.createElement('div');
  body.className = 'tk__body';

  // Question area
  const qWrap = document.createElement('div');
  qWrap.className = 'tk__question-wrap';
  const qEl = document.createElement('div');
  qEl.className = 'tk__question';

  const q = questions[_s.currentIdx];
  if (q) {
    const cap = document.createElement('div');
    cap.className = 'tk-q-cap';
    cap.textContent = `${t('test.question') || 'Question'} ${_s.currentIdx + 1} ${t('common.of') || 'of'} ${questions.length}`;

    const qText = document.createElement('div');
    qText.className = 'tk-q-text';
    qText.innerHTML = renderBlocks(q.question?.blocks, assetsBase) || escHtml(String(q.text || ''));

    const opts = q.options || [];
    const savedAns = answersLocal[q.id];
    const optsWrap = document.createElement('div');
    optsWrap.className = 'tk-options' + (opts.length <= 2 ? ' tk-options--single' : '');
    const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      const btn = document.createElement('div');   // div, not button — read-only
      btn.className = 'tk-option tk-option--readonly';
      if (opt.isCorrect) btn.classList.add('tk-option--correct');
      if (savedAns?.optionIdx === i && !opt.isCorrect) btn.classList.add('tk-option--wrong');
      if (savedAns?.optionIdx === i)  btn.classList.add('tk-option--selected');

      const keyEl = document.createElement('div');
      keyEl.className = 'tk-option__key';
      keyEl.textContent = KEYS[i] || String(i + 1);

      const textEl = document.createElement('div');
      textEl.className = 'tk-option__text';
      textEl.innerHTML = renderBlocks(opt.content?.blocks, assetsBase)
        || escHtml(String(opt.text || `Option ${i + 1}`));

      btn.append(keyEl, textEl);
      optsWrap.appendChild(btn);
    }

    qEl.append(cap, qText, optsWrap);
  }
  qWrap.appendChild(qEl);

  // Sidebar pad
  const rail = document.createElement('div');
  rail.className = 'tk__rail';
  const railTitle = document.createElement('div');
  railTitle.className = 'tk-rail__title';
  railTitle.textContent = t('results.q_by_q') || 'Questions';
  const pad = document.createElement('div');
  pad.className = 'tk-pad';

  for (let i = 0; i < questions.length; i++) {
    const qq = questions[i];
    const ans = answersLocal[qq.id];
    const cell = document.createElement('button');
    cell.type = 'button'; cell.className = 'tk-pad__cell';
    if (i === _s.currentIdx) cell.classList.add('tk-pad__cell--current');
    else if (ans?.isCorrect === true)  cell.classList.add('tk-pad__cell--correct');
    else if (ans?.isCorrect === false) cell.classList.add('tk-pad__cell--wrong');
    cell.textContent = String(i + 1);
    cell.addEventListener('click', () => { _s.currentIdx = i; _mount(); });
    pad.appendChild(cell);
  }
  rail.append(railTitle, pad);
  body.append(qWrap, rail);
  rv.appendChild(body);

  // Bottom bar
  const bar = document.createElement('div');
  bar.className = 'tk__bottombar';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button'; prevBtn.className = 'btn btn--ghost';
  prevBtn.disabled = _s.currentIdx === 0;
  prevBtn.append(iconEl('chevL', 14), document.createTextNode(` ${t('taking.previous') || 'Previous'}`));
  prevBtn.addEventListener('click', () => { if (_s.currentIdx > 0) { _s.currentIdx--; _mount(); } });

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button'; nextBtn.className = 'btn btn--primary';
  if (_s.currentIdx < questions.length - 1) {
    nextBtn.append(document.createTextNode(`${t('taking.next') || 'Next'} `), iconEl('chevR', 14));
    nextBtn.addEventListener('click', () => { _s.currentIdx++; _mount(); });
  } else {
    nextBtn.textContent = t('results.done') || 'Done';
    nextBtn.addEventListener('click', () => {
      if (attemptId) navigate(`/test/${testId}/results/${attemptId}`);
      else navigate('/home');
    });
  }
  bar.append(prevBtn, nextBtn);
  rv.appendChild(bar);
  return rv;
}

// ── Mount ─────────────────────────────────────────────────────

async function _mount() {
  if (!_root) return;
  _root.innerHTML = '';

  if (_s.phase === 'loading') {
    _root.innerHTML = `
      <div class="tk" style="align-items:center;justify-content:center;">
        <div class="skeleton" style="width:200px;height:14px;"></div>
      </div>`;
    return;
  }

  if (_s.phase === 'finishing') {
    _root.innerHTML = `
      <div class="tk" style="align-items:center;justify-content:center;gap:14px;">
        <div class="skeleton" style="width:160px;height:14px;"></div>
        <p style="font-size:13px;color:var(--ink-mute);">${t('taking.saving') || 'Saving results…'}</p>
      </div>`;
    return;
  }

  if (_s.phase === 'pretest') { _root.appendChild(buildPretestModal()); return; }
  if (_s.phase === 'taking')  {
    _root.appendChild(buildTakingScreen());
    await typesetMath(_root);
    return;
  }
  if (_s.phase === 'review') {
    _root.appendChild(buildReviewScreen());
    await typesetMath(_root);
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
    phase: 'loading', test: null,
    allQuestions: [], questions: [],
    currentIdx: 0, answers: {}, flagged: new Set(),
    startTime: null, timeLeft: null,
    timerHandle: null, advanceTimer: null,
    attemptId: params.attemptId || null, clientId: null,
    reviewSnap: null, _shuffleCache: {},
  });
  _mount();

  if (!params.id) {
    _root.innerHTML = `<div class="tk" style="align-items:center;justify-content:center;gap:12px;">
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
    console.error('[taking] load test error:', e);
    _root.innerHTML = `
      <div class="tk" style="align-items:center;justify-content:center;gap:12px;padding:var(--pad);">
        <p style="font-weight:600;color:#c4554a;">${t('common.error') || 'Error'}</p>
        <p style="font-size:13px;color:var(--ink-mute);">Could not load test</p>
        <a href="#/home" class="btn btn--ghost btn--small">← ${t('common.back') || 'Back'}</a>
      </div>`;
    return;
  }

  // ── Review mode: restore snapshot from sessionStorage ────────
  if (params.review === 'true' && params.attemptId) {
    const snapRaw = sessionStorage.getItem(`att:${params.attemptId}:result`);
    if (snapRaw) {
      try {
        const snap = JSON.parse(snapRaw);
        _s.reviewSnap = snap;
        _s.attemptId = params.attemptId;
        // Use full question objects from test (not just text snippets from snap)
        const snapQIds = (snap.questions || []).map(q => q.id);
        // Preserve order from attempt
        const qMap = {};
        for (const q of _s.allQuestions) qMap[q.id] = q;
        _s.questions = snapQIds.length > 0
          ? snapQIds.map(id => qMap[id]).filter(Boolean)
          : _s.allQuestions;
        _s.answers = snap.answersLocal || {};
        _s.currentIdx = Math.max(0, Math.min(parseInt(params.startIdx || '0', 10), _s.questions.length - 1));
        _s.phase = 'review';
        _mount();
        return;
      } catch (e) {
        console.warn('[taking] could not restore review snap:', e);
      }
    }
  }

  // ── Pre-test handoff: when the user launched from the new pre-test
  //    screen (/test/:id/start) we have settings + an optional filter
  //    id-set sitting in sessionStorage under "pretest:<testId>".
  //    Consume it once → skip the in-screen pretest modal and go
  //    straight into the attempt. Falls back to the modal for direct
  //    /take deep-links (where the storage key isn't set).
  try {
    const handoffKey = `pretest:${params.id}`;
    const handoffRaw = sessionStorage.getItem(handoffKey);
    if (handoffRaw) {
      sessionStorage.removeItem(handoffKey); // single-use
      const hand = JSON.parse(handoffRaw);
      // Apply settings.
      _s.settings.count = Math.max(1, parseInt(hand.count, 10) || _s.settings.count);
      _s.settings.order = hand.shuffle ? 'random' : 'sequential';
      _s.settings.timeLimitMin = parseInt(hand.timeLimitMin, 10) || 0;
      _s.settings.showAnswers = !!hand.revealImmediately;
      // The render layer reads `shuffleOptions` — accept the explicit handoff
      // value when present, otherwise leave the default.
      if (typeof hand.shuffleAnswers === 'boolean') {
        _s.settings.shuffleOptions = hand.shuffleAnswers;
      }
      _s.settings.allowSkip = true;
      _s.settings.mode = hand.mode || 'training';
      _s.settings.source = hand.source || 'all';
      // Filter the question pool if a source produced an id list.
      if (Array.isArray(hand.filterIds) && hand.filterIds.length > 0) {
        const allow = new Set(hand.filterIds.map(Number));
        const filtered = _s.allQuestions.filter(q => allow.has(Number(q.id)));
        if (filtered.length > 0) {
          _s.allQuestions = filtered;
          // Re-clamp count to filtered pool size.
          _s.settings.count = Math.min(_s.settings.count, filtered.length);
        }
      }
      // Stash mistake-review source attempt for the topbar variant + later API metadata.
      if (hand.mode === 'mistake_review' && hand.mistakeSourceAttemptId) {
        _s.mistakeSourceAttemptId = hand.mistakeSourceAttemptId;
      }
      await beginAttempt();
      return;
    }
  } catch (e) {
    console.warn('[taking] pretest handoff failed, falling back to modal:', e);
  }

  _s.phase = 'pretest';
  _mount();
}
