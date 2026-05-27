/**
 * screens/desktop/pre-test.js — configure-then-launch screen.
 *
 * Route: hash "#/test/:id/start"
 *
 * Hands off to "/test/:id/take" by writing chosen settings to sessionStorage
 * under the key "pretest:<testId>" — taking.js consumes that to skip its
 * built-in modal. If a user opens "/take" directly, the existing in-screen
 * modal still works as a fallback.
 *
 * Field set (per user feedback, replacing the original slider design):
 *   - Mode chips    (training / timed / exam)
 *   - Count         (preset chips: 10/20/30/All + a custom numeric input)
 *   - Source        (all / weak / flagged / untaken — chips with live counts)
 *   - Time limit    (chip presets + custom minutes input)
 *   - Options       (shuffle questions / shuffle answers / reveal correct)
 *
 * Everything plumbs into taking.js via the handoff JSON, including
 * `shuffleAnswers` which maps to `_s.settings.shuffleOptions` (already
 * applied by the rendering layer at runtime).
 */
import { getTest } from '../../api/tests.js';
import { listFlagged } from '../../api/flagged.js';
import { getWeakQuestions } from '../../api/statistics.js';
import { navigate } from '../../router.js';
import { mountAppShell } from '../../components/app-shell.js';
import { iconEl } from '../../icons.js';
import { t } from '../../utils/locale.js';
import { toast } from '../../components/toast.js';

function makeState(totalQs) {
  return {
    mode: 'training',
    source: 'all',
    // Counts: preset (incl. "all") or a custom number.
    count: Math.min(20, totalQs),
    countMode: 'preset',  // 'preset' | 'custom'
    // Options.
    shuffleQuestions: true,
    shuffleAnswers: false,
    revealImmediately: false,
    // Time limit (minutes; 0 = no limit).
    timeLimitMin: 0,
    timeMode: 'preset',  // 'preset' | 'custom'
  };
}

export default async function render(root, params) {
  params = params || {};
  const main = mountAppShell(root);
  main.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.style.flex = '1';
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'flex-start';
  wrap.style.justifyContent = 'center';
  wrap.style.padding = 'var(--sp-5)';
  wrap.style.overflowY = 'auto';
  main.appendChild(wrap);

  const card = document.createElement('div');
  card.style.width = '100%';
  card.style.maxWidth = '560px';
  card.style.background = 'var(--paper)';
  card.style.border = 'var(--border)';
  card.style.borderRadius = 'var(--radius-lg)';
  card.style.boxShadow = 'var(--shadow-md)';
  card.style.padding = 'var(--sp-5)';
  wrap.appendChild(card);

  const skel = document.createElement('div');
  skel.className = 'skeleton';
  skel.style.width = '100%';
  skel.style.height = '240px';
  skel.style.borderRadius = 'var(--radius-md)';
  card.appendChild(skel);

  let test;
  try {
    test = await getTest(params.id);
  } catch (e) {
    if (e && e.status === 403) {
      navigate('/error/403?testId=' + encodeURIComponent(params.id));
      return;
    }
    card.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'empty';
    err.textContent = (e && e.message) || 'Не удалось загрузить тест';
    card.appendChild(err);
    return;
  }

  const totalQs = (test.questions || []).length;
  if (totalQs === 0) {
    card.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty';
    const title = document.createElement('div');
    title.className = 'empty__title';
    title.textContent = 'В тесте нет вопросов';
    empty.appendChild(title);
    card.appendChild(empty);
    return;
  }

  const flaggedResp = await listFlagged(params.id).catch(function () { return { flagged: [] }; });
  const weakResp    = await getWeakQuestions(params.id).catch(function () { return { questions: [] }; });
  const flaggedIds = new Set(flaggedResp.flagged || []);
  const weakIds    = new Set(extractIds(weakResp));

  const counts = { total: totalQs, weak: weakIds.size, flagged: flaggedIds.size };
  const state  = makeState(totalQs);

  card.innerHTML = '';

  const headCaps = document.createElement('div');
  headCaps.className = 'caps';
  headCaps.textContent = (test.title || params.id) + ' · ' + totalQs + ' ' + (t('test.questions') || 'вопросов');
  card.appendChild(headCaps);

  const title = document.createElement('h1');
  title.style.margin = '6px 0 var(--sp-4)';
  title.style.fontSize = '22px';
  title.style.fontWeight = 'var(--fw-bold)';
  title.style.letterSpacing = '-0.01em';
  title.textContent = t('pretest.title') || 'Запустить тест';
  card.appendChild(title);

  // ── Mode ──
  card.appendChild(section('pretest.mode', 'Режим', renderModeChips(state)));

  // ── Count (preset chips + custom number input) ──
  const countCtl = renderCountField(state, totalQs);
  card.appendChild(section('pretest.count', 'Сколько вопросов', countCtl.el));

  // ── Source (chips with live counts) ──
  const sourceCtl = renderSourceChips(state, counts, function () {
    countCtl.setPoolMax(poolMax(state, counts));
    refreshHint();
  });
  card.appendChild(section('pretest.source', 'Источник вопросов', sourceCtl));

  // ── Time limit (preset chips + custom input) ──
  const timeCtl = renderTimeField(state);
  card.appendChild(section('pretest.time_limit', 'Ограничение времени', timeCtl.el));

  // ── Options (3 toggles) ──
  card.appendChild(section('pretest.options', 'Опции', renderOptions(state)));

  // ── Estimate hint ──
  const hint = document.createElement('div');
  hint.style.background = 'var(--ink-soft)';
  hint.style.padding = '10px 12px';
  hint.style.borderRadius = 'var(--radius-sm)';
  hint.style.fontSize = 'var(--fs-sm)';
  hint.style.color = 'var(--ink-secondary)';
  hint.style.marginTop = 'var(--sp-3)';
  function refreshHint() {
    const mins = Math.max(1, Math.round(state.count * 0.35));
    hint.innerHTML = '';
    hint.appendChild(document.createTextNode((t('pretest.estimate') || 'Ориентировочно — ') + ' '));
    const b = document.createElement('b');
    b.style.color = 'var(--ink)';
    b.textContent = '~' + mins + ' мин';
    hint.appendChild(b);
    hint.appendChild(document.createTextNode(' для ' + state.count + ' вопросов'));
  }
  refreshHint();
  countCtl.onChange = refreshHint;
  card.appendChild(hint);

  // ── Action buttons ──
  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = 'var(--sp-2)';
  btnRow.style.marginTop = 'var(--sp-5)';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn';
  cancelBtn.textContent = '← ' + (t('common.back') || 'Назад');
  cancelBtn.addEventListener('click', function () { navigate('/home'); });
  btnRow.appendChild(cancelBtn);

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn btn--primary';
  startBtn.style.flex = '1';
  startBtn.appendChild(iconEl('play', 15));
  const startLabel = document.createElement('span');
  startLabel.textContent = ' ' + (t('pretest.start') || 'Начать тест');
  startBtn.appendChild(startLabel);
  startBtn.addEventListener('click', function () {
    handleStart(params.id, state, flaggedIds, weakIds);
  });
  btnRow.appendChild(startBtn);

  card.appendChild(btnRow);
}

// ─── Field constructors ─────────────────────────────────────

function extractIds(resp) {
  let arr;
  if (resp && Array.isArray(resp.questions)) arr = resp.questions;
  else if (resp && Array.isArray(resp.weak_questions)) arr = resp.weak_questions;
  else if (Array.isArray(resp)) arr = resp;
  else arr = [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const q = arr[i];
    if (typeof q === 'number') { out.push(q); continue; }
    if (q && q.questionId !== undefined  && Number.isFinite(q.questionId))  out.push(q.questionId);
    else if (q && q.question_id !== undefined && Number.isFinite(q.question_id)) out.push(q.question_id);
    else if (q && q.id !== undefined && Number.isFinite(q.id)) out.push(q.id);
  }
  return out;
}

function section(key, fallback, body) {
  const wrap = document.createElement('div');
  wrap.style.marginBottom = 'var(--sp-3)';
  const cap = document.createElement('div');
  cap.className = 'caps';
  cap.style.marginBottom = '6px';
  cap.textContent = t(key) || fallback;
  wrap.appendChild(cap);
  wrap.appendChild(body);
  return wrap;
}

function renderModeChips(state) {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '6px';
  const modes = [
    { key: 'training', label: 'Тренировка' },
    { key: 'timed',    label: 'На время'   },
    { key: 'exam',     label: 'Экзамен'    },
  ];
  modes.forEach(function (m) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (state.mode === m.key ? ' chip--active' : '');
    chip.dataset.mode = m.key;
    chip.textContent = m.label;
    chip.addEventListener('click', function () {
      state.mode = m.key;
      row.querySelectorAll('.chip').forEach(function (c) {
        c.classList.toggle('chip--active', c.dataset.mode === m.key);
      });
      // Mode-driven defaults: 'exam' enforces no reveal + shuffled;
      // 'timed' bumps the timer if none was chosen.
      if (m.key === 'exam') {
        state.revealImmediately = false;
        state.shuffleQuestions = true;
      }
      if (m.key === 'timed' && state.timeLimitMin === 0) {
        state.timeLimitMin = 20;
      }
    });
    row.appendChild(chip);
  });
  return row;
}

/**
 * Count field — chip presets (10, 20, 30, …, Все N) + a custom numeric input.
 * Replaces the slider. Returns:
 *   { el, setPoolMax(n), onChange }   ← caller wires onChange to refresh hint
 */
function renderCountField(state, total) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '8px';
  wrap.style.flexWrap = 'wrap';

  const chipsWrap = document.createElement('div');
  chipsWrap.style.display = 'flex';
  chipsWrap.style.gap = '4px';
  chipsWrap.style.flexWrap = 'wrap';

  const customInput = document.createElement('input');
  customInput.type = 'number';
  customInput.min = '1';
  customInput.placeholder = t('taking.custom') || 'Своё';
  customInput.style.width = '80px';
  customInput.style.padding = '5px 8px';
  customInput.style.border = 'var(--border)';
  customInput.style.borderRadius = 'var(--radius-sm)';
  customInput.style.font = '400 13px Inter, sans-serif';
  customInput.style.color = 'var(--ink)';
  customInput.style.background = 'var(--paper)';

  let poolMax = total;
  const api = { el: wrap, onChange: null };

  function presets() {
    // Standard ladder, plus the "all" pseudo-step capped to the active pool.
    const steps = [10, 20, 30, 50].filter(function (n) { return n < poolMax; });
    steps.push(poolMax);
    // Deduplicate while preserving order.
    return Array.from(new Set(steps));
  }

  function renderChips() {
    chipsWrap.innerHTML = '';
    const ps = presets();
    customInput.max = String(poolMax);
    ps.forEach(function (n) {
      const chip = document.createElement('button');
      chip.type = 'button';
      const isActive = state.countMode === 'preset' && state.count === n;
      chip.className = 'chip chip--small' + (isActive ? ' chip--active' : '');
      chip.textContent = (n === poolMax) ? ((t('common.all') || 'Все') + ' ' + poolMax) : String(n);
      chip.addEventListener('click', function () {
        state.count = n;
        state.countMode = 'preset';
        customInput.value = '';
        renderChips();
        if (typeof api.onChange === 'function') api.onChange();
      });
      chipsWrap.appendChild(chip);
    });
  }
  renderChips();

  customInput.addEventListener('input', function () {
    const v = parseInt(customInput.value, 10);
    if (!isNaN(v) && v >= 1 && v <= poolMax) {
      state.count = v;
      state.countMode = 'custom';
      renderChips();
      if (typeof api.onChange === 'function') api.onChange();
    }
  });

  api.setPoolMax = function (newMax) {
    poolMax = Math.max(1, newMax);
    customInput.max = String(poolMax);
    if (state.count > poolMax) {
      state.count = poolMax;
      state.countMode = 'preset';
      customInput.value = '';
    }
    renderChips();
    if (typeof api.onChange === 'function') api.onChange();
  };

  wrap.appendChild(chipsWrap);
  wrap.appendChild(customInput);
  return api;
}

function renderSourceChips(state, counts, onChange) {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '6px';
  row.style.flexWrap = 'wrap';

  const sources = [
    { key: 'all',     label: 'Все темы',         count: counts.total },
    { key: 'weak',    label: 'Только слабые',    count: counts.weak },
    { key: 'flagged', label: '⚑ Отмеченные',    count: counts.flagged },
    { key: 'untaken', label: 'Не пройденные',    count: null },
  ];

  sources.forEach(function (s) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.dataset.source = s.key;
    chip.className = 'chip' + (state.source === s.key ? ' chip--active' : '');
    chip.textContent = s.label + (s.count !== null ? (' · ' + s.count) : '');
    if (s.count === 0 && s.key !== 'untaken') {
      chip.disabled = true;
      chip.style.opacity = '0.4';
      chip.style.cursor = 'not-allowed';
    }
    chip.addEventListener('click', function () {
      if (chip.disabled) return;
      state.source = s.key;
      row.querySelectorAll('.chip').forEach(function (c) {
        c.classList.toggle('chip--active', c.dataset.source === s.key);
      });
      onChange();
    });
    row.appendChild(chip);
  });

  return row;
}

function poolMax(state, counts) {
  if (state.source === 'weak')    return Math.max(counts.weak, 1);
  if (state.source === 'flagged') return Math.max(counts.flagged, 1);
  return counts.total;
}

/**
 * Time-limit field — preset chips (Без / 5 / 10 / 20 / 40 / 60 min) + a
 * custom minutes input. Matches the count-field UX.
 */
function renderTimeField(state) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '8px';
  wrap.style.flexWrap = 'wrap';

  const chipsWrap = document.createElement('div');
  chipsWrap.style.display = 'flex';
  chipsWrap.style.gap = '4px';
  chipsWrap.style.flexWrap = 'wrap';

  const customInput = document.createElement('input');
  customInput.type = 'number';
  customInput.min = '1';
  customInput.max = '600';
  customInput.placeholder = 'мин';
  customInput.style.width = '70px';
  customInput.style.padding = '5px 8px';
  customInput.style.border = 'var(--border)';
  customInput.style.borderRadius = 'var(--radius-sm)';
  customInput.style.font = '400 13px Inter, sans-serif';
  customInput.style.color = 'var(--ink)';
  customInput.style.background = 'var(--paper)';

  const presets = [
    { value: 0,  label: 'Без' },
    { value: 5,  label: '5'   },
    { value: 10, label: '10'  },
    { value: 20, label: '20'  },
    { value: 40, label: '40'  },
    { value: 60, label: '60'  },
  ];

  function renderChips() {
    chipsWrap.innerHTML = '';
    presets.forEach(function (p) {
      const chip = document.createElement('button');
      chip.type = 'button';
      const isActive = state.timeMode === 'preset' && state.timeLimitMin === p.value;
      chip.className = 'chip chip--small' + (isActive ? ' chip--active' : '');
      chip.textContent = p.label;
      chip.addEventListener('click', function () {
        state.timeLimitMin = p.value;
        state.timeMode = 'preset';
        customInput.value = '';
        renderChips();
      });
      chipsWrap.appendChild(chip);
    });
  }
  renderChips();

  customInput.addEventListener('input', function () {
    const v = parseInt(customInput.value, 10);
    if (!isNaN(v) && v >= 1 && v <= 600) {
      state.timeLimitMin = v;
      state.timeMode = 'custom';
      renderChips();
    }
  });

  wrap.appendChild(chipsWrap);
  wrap.appendChild(customInput);

  return { el: wrap };
}

/**
 * Options — three toggles per the spec:
 *   - Случайный порядок вопросов  → shuffleQuestions  → handoff.shuffle
 *   - Случайный порядок ответов   → shuffleAnswers    → handoff.shuffleAnswers
 *                                                       → _s.settings.shuffleOptions
 *   - Показывать правильный ответ → revealImmediately → handoff.revealImmediately
 */
function renderOptions(state) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '8px';
  wrap.appendChild(buildToggle('Случайный порядок вопросов', state, 'shuffleQuestions'));
  wrap.appendChild(buildToggle('Случайный порядок ответов', state, 'shuffleAnswers'));
  wrap.appendChild(buildToggle('Показывать правильный ответ', state, 'revealImmediately'));
  return wrap;
}

function buildToggle(label, state, key) {
  const row = document.createElement('label');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '10px';
  row.style.fontSize = 'var(--fs-sm)';
  row.style.cursor = 'pointer';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!state[key];
  cb.style.width = '18px';
  cb.style.height = '18px';
  cb.style.accentColor = 'var(--accent)';
  cb.style.cursor = 'pointer';
  cb.addEventListener('change', function () { state[key] = cb.checked; });
  const txt = document.createElement('span');
  txt.textContent = label;
  row.appendChild(cb);
  row.appendChild(txt);
  return row;
}

function handleStart(testId, state, flaggedIds, weakIds) {
  const filterIds = state.source === 'weak'    ? Array.from(weakIds)
                  : state.source === 'flagged' ? Array.from(flaggedIds)
                  : [];

  if (state.source !== 'all' && state.source !== 'untaken' && filterIds.length === 0) {
    toast('Нет доступных вопросов в выбранном источнике', { tone: 'warning' });
    return;
  }

  const handoff = {
    mode: state.mode,
    count: state.count,
    shuffle: state.shuffleQuestions,
    shuffleAnswers: state.shuffleAnswers,
    source: state.source,
    revealImmediately: state.revealImmediately,
    // Honour the explicit user choice rather than auto-forcing on mode —
    // the user might pick "Тренировка" with a custom 5-minute cap, etc.
    timeLimitMin: state.timeLimitMin,
    filterIds: filterIds,
  };

  try {
    sessionStorage.setItem('pretest:' + testId, JSON.stringify(handoff));
  } catch (_) { /* private mode etc — taking.js falls back to its own modal */ }

  navigate('/test/' + encodeURIComponent(testId) + '/take');
}
