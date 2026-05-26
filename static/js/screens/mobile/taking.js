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
import { renderContent, typesetMath } from '../../utils/render-blocks.js';

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
  clientId:  /** @type {string|null} */ (null),
  currentIdx: 0,
  /** @type {{ [qId: number]: { optionIdx: number, isCorrect: boolean } }} */
  answers: {},
  flagged: /** @type {Set<number>} */ (new Set()),
  startTime:    /** @type {number|null} */ (null),
  timeLeft:     /** @type {number|null} */ (null),
  timerHandle:  /** @type {any} */ (null),
  advanceTimer: /** @type {any} */ (null),
};

// ── Utilities ─────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getClientId() {
  let id = localStorage.getItem('client_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('client_id', id); }
  return id;
}

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
  _s.currentIdx  = 0;
  _s.answers     = {};
  _s.flagged     = new Set();
  _s.attemptId   = crypto.randomUUID();
  _s.clientId    = getClientId();
  _s.startTime   = Date.now();
  _s.timeLeft    = _s.settings.timeLimitMin > 0 ? _s.settings.timeLimitMin * 60 : null;

  startAttempt({
    attemptId: _s.attemptId,
    testId: _s.testId,
    clientId: _s.clientId,
    settings: {
      count: _s.questions.length,
      order: _s.settings.order,
      timeLimitSeconds: _s.settings.timeLimitMin > 0 ? _s.settings.timeLimitMin * 60 : null,
      showAnswersImmediately: _s.settings.showAnswers,
    },
    questions: _s.questions.map(q => ({ id: q.id })),
  }).catch(e => console.warn('[mob-taking] startAttempt:', e));

  sessionStorage.setItem(`att:${_s.attemptId}:client`, _s.clientId);
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
      clientId: _s.clientId,
      totalDurationMs: totalMs,
    });
    sessionStorage.setItem(`att:${attemptId}:result`, JSON.stringify({
      ...result,
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

  screen.querySelector('#mob-start-btn')?.addEventListener('click', () => beginAttempt());
  return screen;
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
  progressWrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;
                font:400 11px/1 Inter,sans-serif;color:var(--ink-mute);">
      <span>${_s.currentIdx + 1} / ${total}</span>
      ${_s.timeLeft !== null
        ? `<span class="mob-tk__timer" style="display:flex;align-items:center;gap:3px;">
             ${iconEl('clock', 11)?.outerHTML || ''}
             <span class="mob-tk__timer-text">${formatTime(_s.timeLeft)}</span>
           </span>`
        : ''
      }
    </div>
    <div style="height:4px;background:var(--ink-soft);border-radius:999px;overflow:hidden;">
      <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:999px;
                  transition:width 200ms ease;"></div>
    </div>`;

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
  prevBtn.disabled = _s.currentIdx === 0;
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
    startTime: null, timeLeft: null,
    timerHandle: null, advanceTimer: null,
    attemptId: null, clientId: null,
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

  _s.phase = 'pretest';
  _mount();
}
