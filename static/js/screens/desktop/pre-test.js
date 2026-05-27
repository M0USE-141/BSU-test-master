/**
 * screens/desktop/pre-test.js — configure-then-launch screen.
 *
 * Route: hash "#/test/:id/start"
 *
 * Hands off to "/test/:id/take" by writing chosen settings to sessionStorage
 * under the key "pretest:<testId>" — taking.js consumes that to skip its
 * built-in modal. If a user opens "/take" directly, the existing in-screen
 * modal still works as a fallback.
 */
import { getTest } from '../../api/tests.js';
import { listFlagged } from '../../api/flagged.js';
import { getWeakQuestions } from '../../api/statistics.js';
import { navigate } from '../../router.js';
import { mountAppShell } from '../../components/app-shell.js';
import { iconEl } from '../../icons.js';
import { t } from '../../utils/locale.js';
import { toast } from '../../components/toast.js';

// State per render instance (closed over by handlers).
function makeState(totalQs) {
  return {
    mode: 'training',
    source: 'all',
    shuffle: true,
    revealImmediately: false,
    timeLimitMin: 0,
    count: Math.min(20, totalQs),
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

  // Header
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

  // Sections
  const modeRow = renderModeChips(state);
  card.appendChild(section('pretest.mode', 'Режим', modeRow));

  const slider = renderSlider(state, totalQs);
  card.appendChild(section('pretest.count', 'Сколько вопросов', slider.el));

  const sourceRow = renderSourceChips(state, counts, function () {
    slider.setMax(poolMax(state, counts));
    if (state.count > parseInt(slider.input.max, 10)) {
      state.count = parseInt(slider.input.max, 10);
      slider.refresh();
    }
    refreshHint();
  });
  card.appendChild(section('pretest.source', 'Источник вопросов', sourceRow));

  card.appendChild(section('pretest.options', 'Опции', renderOptions(state)));

  // Time estimate
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
  slider.onChange = refreshHint;
  card.appendChild(hint);

  // Buttons
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

// ── Helpers ─────────────────────────────────────────────────────

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
      if (m.key === 'exam') {
        state.revealImmediately = false;
        state.shuffle = true;
      }
      if (m.key === 'timed' && state.timeLimitMin === 0) {
        state.timeLimitMin = 20;
      }
    });
    row.appendChild(chip);
  });
  return row;
}

function renderSlider(state, total) {
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';

  const labels = document.createElement('div');
  labels.style.display = 'flex';
  labels.style.justifyContent = 'space-between';
  labels.style.fontSize = 'var(--fs-sm)';
  labels.style.marginBottom = '6px';
  const lo = document.createElement('span');
  lo.style.color = 'var(--ink-tertiary)';
  lo.textContent = String(Math.min(5, total));
  const mid = document.createElement('span');
  mid.className = 'mono';
  mid.style.fontWeight = 'var(--fw-semibold)';
  const hi = document.createElement('span');
  hi.style.color = 'var(--ink-tertiary)';
  hi.textContent = String(total);
  labels.appendChild(lo);
  labels.appendChild(mid);
  labels.appendChild(hi);
  wrap.appendChild(labels);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(Math.min(5, total));
  input.max = String(total);
  input.value = String(state.count);
  input.style.width = '100%';
  input.style.accentColor = 'var(--accent)';
  wrap.appendChild(input);

  const api = { el: wrap, input: input, onChange: null };

  function setMid() {
    mid.textContent = state.count + ' из ' + input.max;
  }
  api.refresh = function () {
    input.value = String(state.count);
    setMid();
  };
  api.setMax = function (newMax) {
    // Range inputs misbehave when min > max — re-floor min so the slider
    // can actually move when a tiny source pool (e.g. one flagged question)
    // is selected.
    const safeMin = Math.min(Math.min(5, total), newMax);
    input.min = String(safeMin);
    lo.textContent = String(safeMin);
    input.max = String(newMax);
    hi.textContent = String(newMax);
    if (parseInt(input.value, 10) > newMax) {
      input.value = String(newMax);
      state.count = newMax;
    } else if (parseInt(input.value, 10) < safeMin) {
      input.value = String(safeMin);
      state.count = safeMin;
    }
    setMid();
  };

  input.addEventListener('input', function () {
    state.count = parseInt(input.value, 10);
    setMid();
    if (typeof api.onChange === 'function') api.onChange();
  });

  setMid();
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

function renderOptions(state) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '8px';
  wrap.appendChild(buildToggle('Случайный порядок вопросов', state, 'shuffle'));
  wrap.appendChild(buildToggle('Показывать правильный ответ сразу', state, 'revealImmediately'));
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
    shuffle: state.shuffle,
    source: state.source,
    revealImmediately: state.revealImmediately,
    timeLimitMin: (state.mode === 'timed' || state.mode === 'exam')
      ? (state.timeLimitMin || 20)
      : 0,
    filterIds: filterIds,
  };

  try {
    sessionStorage.setItem('pretest:' + testId, JSON.stringify(handoff));
  } catch (_) { /* private mode etc — taking.js falls back to its own modal */ }

  navigate('/test/' + encodeURIComponent(testId) + '/take');
}
