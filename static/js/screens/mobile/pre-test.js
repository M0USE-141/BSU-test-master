/**
 * mobile/pre-test.js — Mobile pre-test setup (M4 redesign).
 *
 * Standalone screen for `/test/:id/start`. Persists the chosen
 * settings under `sessionStorage['pretest:<testId>']` and navigates
 * to `/test/:id/take`, where the taking screen reads the same key.
 *
 * Settings exposed (parity with desktop/pre-test.js):
 *   - mode (training / timed / exam)
 *   - count (1..N range slider)
 *   - source (all / weak / new / flagged)
 *   - shuffleQuestions (random question order)
 *   - shuffleAnswers (random option order per question)
 *   - revealImmediately (show right answer after each)
 *   - timeLimitMin (0=none, or 5/10/20/40/60/custom)
 *
 * Exam mode locking (mirrors desktop): forces shuffleQuestions=true
 * (disabled), revealImmediately=false (disabled), disables the "Без"
 * timer chip (timed/exam require a hard time limit).
 */
import { getTest } from '../../api/tests.js';
import { getMyQuestionStats } from '../../api/statistics.js';
import { navigate } from '../../router.js';
import { t } from '../../utils/locale.js';
import {
  topBar, mShell, mCard, mChip, mBtn, mSticky, mSeg, caps,
} from '../../components/mobile-atoms.js';

let _renderToken = 0;

function buildToggleRow(label, value, onChange, opts = {}) {
  const { first = false, disabled = false } = opts;
  const row = document.createElement('label');
  Object.assign(row.style, {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '8px 0',
    borderTop: first ? 'none' : '1px solid var(--ink-soft)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? '0.55' : '1',
  });
  const lbl = document.createElement('span');
  Object.assign(lbl.style, { flex: '1', fontSize: '13px' });
  lbl.textContent = label;
  row.appendChild(lbl);

  // Custom switch (CSS-in-JS, mirrors the prototype's pill style).
  const track = document.createElement('span');
  Object.assign(track.style, {
    width: '36px', height: '20px', borderRadius: '999px',
    position: 'relative', flexShrink: '0',
    background: value ? 'var(--accent)' : 'var(--ink-soft)',
    border: `1.5px solid ${value ? 'var(--accent)' : 'var(--ink)'}`,
    transition: 'background .15s, border-color .15s',
  });
  const knob = document.createElement('span');
  Object.assign(knob.style, {
    position: 'absolute', top: '1px',
    left: value ? '17px' : '1px',
    width: '14px', height: '14px', borderRadius: '50%',
    background: '#fff', transition: 'left .15s',
  });
  track.appendChild(knob);
  row.appendChild(track);

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!value;
  cb.disabled = disabled;
  cb.style.display = 'none';
  cb.addEventListener('change', (e) => {
    const v = e.target.checked;
    track.style.background = v ? 'var(--accent)' : 'var(--ink-soft)';
    track.style.borderColor = v ? 'var(--accent)' : 'var(--ink)';
    knob.style.left = v ? '17px' : '1px';
    onChange?.(v);
  });
  row.addEventListener('click', (e) => {
    if (e.target === cb) return;
    if (disabled) { e.preventDefault(); return; }
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
    e.preventDefault();
  });
  row.appendChild(cb);
  return row;
}

export default async function render(root, params = {}) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  const testId = params.id;
  if (!testId) { navigate('/home'); return; }

  // Skeleton.
  const skeleton = document.createElement('div');
  skeleton.style.padding = '14px 16px';
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('div');
    s.className = 'skeleton';
    Object.assign(s.style, { height: '70px', borderRadius: 'var(--radius-md)', marginBottom: '8px' });
    skeleton.appendChild(s);
  }
  mShell({
    root,
    topbar: topBar({ title: t('pretest.title') || 'Запуск теста', back: true, backHref: `#/test/${testId}` }),
    body: skeleton,
    hideNav: true,
  });

  // Fetch.
  let test = null;
  try {
    test = await getTest(testId);
  } catch { /* fall through */ }
  if (stale()) return;
  if (!test) { navigate('/error/404'); return; }

  const qCount = (test.questions || []).length;
  if (qCount === 0) {
    const empty = document.createElement('div');
    Object.assign(empty.style, {
      padding: '48px 24px', textAlign: 'center',
      color: 'var(--ink-mute)', fontSize: '14px', lineHeight: '1.5',
    });
    empty.textContent = t('pretest.no_questions')
      || 'В коллекции нет вопросов. Добавьте их в редакторе.';
    mShell({
      root,
      topbar: topBar({ title: t('pretest.title') || 'Запуск теста', back: true, backHref: `#/test/${testId}` }),
      body: empty,
      hideNav: true,
    });
    return;
  }

  // ── Accuracy stats for weak/untaken sources ─────────────────────
  const kdResp = await getMyQuestionStats(testId).catch(function () { return { questions: [] }; });
  if (stale()) return;
  const kdList = kdResp.questions || [];
  // Weak = answered at least once (total>0) and not yet mastered (accuracy<90%).
  // Never-answered questions belong to the separate "untaken" source.
  // Order weakest-first: lower accuracy, then more wrong answers, then more
  // attempts, then slower average time as tie-breakers.
  const weakOrdered = kdList
    .filter(function (q) { return q.total > 0 && q.accuracy < 90; })
    .slice()
    .sort(function (a, b) {
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      var aw = a.total - a.correct, bw = b.total - b.correct;
      if (aw !== bw) return bw - aw;
      if (a.total !== b.total) return b.total - a.total;
      return (b.avgDurationMs || 0) - (a.avgDurationMs || 0);
    })
    .map(function (q) { return q.questionId; });
  const untakenIds = kdList.filter(function (q) { return q.total === 0; }).map(function (q) { return q.questionId; });
  const untakenSet = new Set(untakenIds);
  const kdCounts = { weak: weakOrdered.length, untaken: untakenSet.size };

  // ── State ────────────────────────────────────────────────────────
  const stored = (() => {
    try { return JSON.parse(sessionStorage.getItem(`pretest:${testId}`) || '{}'); }
    catch { return {}; }
  })();
  let mode             = stored.mode || 'training';
  let count            = Math.max(1, Math.min(qCount, stored.count ?? Math.min(20, qCount)));
  let source           = stored.source || 'all';
  // Back-compat: old key `shuffle` mapped to both toggles.
  let shuffleQuestions = stored.shuffleQuestions ?? stored.shuffle ?? true;
  let shuffleAnswers   = stored.shuffleAnswers   ?? stored.shuffle ?? false;
  let reveal           = stored.revealImmediately ?? false;
  let timeLimitMin     = Math.max(0, Math.min(600, Number(stored.timeLimitMin) || 0));

  // ── Build body ───────────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.padding = '14px 16px 24px';

  // Header: collection title + count hint.
  body.appendChild(caps(test.title || '—'));
  const hint = document.createElement('div');
  Object.assign(hint.style, {
    fontSize: '11px', color: 'var(--ink-mute)', marginBottom: '14px',
  });
  hint.textContent = `${qCount} ${t('test.questions_in_collection') || 'вопросов в коллекции'}`;
  body.appendChild(hint);

  // Mode picker.
  body.appendChild(caps(t('pretest.mode') || 'Режим', { marginBottom: '6px' }));
  const modeSeg = mSeg({
    value: mode,
    onChange: (v) => { mode = v; applyMode(); renderModeHint(); },
    items: [
      { key: 'training', label: t('pretest.mode.training') || 'Тренировка' },
      { key: 'timed',    label: t('pretest.mode.timed')    || 'На время' },
      { key: 'exam',     label: t('pretest.mode.exam')     || 'Экзамен' },
    ],
  });
  body.appendChild(modeSeg);

  const modeHint = document.createElement('div');
  Object.assign(modeHint.style, {
    fontSize: '11px', color: 'var(--ink-mute)',
    margin: '8px 0 14px', lineHeight: '1.5',
  });
  body.appendChild(modeHint);

  function renderModeHint() {
    const text = {
      training: t('pretest.hint.training') || 'Без таймера, флаги, возврат к ответам',
      timed:    t('pretest.hint.timed')    || 'Мягкий таймер, без авто-сдачи',
      exam:     t('pretest.hint.exam')     || 'Жёсткий таймер, без флагов',
    };
    modeHint.textContent = text[mode] || '';
  }
  renderModeHint();

  // Count slider card.
  const countCard = (() => {
    const cardBody = document.createElement('div');
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '1';
    range.max = String(qCount);
    range.value = String(count);
    Object.assign(range.style, { width: '100%', accentColor: 'var(--accent)' });
    range.addEventListener('input', (e) => {
      count = Number(e.target.value);
      titleEl.textContent = `${t('pretest.count') || 'Сколько вопросов'} · ${count}`;
      updateEstimate();
    });
    cardBody.appendChild(range);
    const ticks = document.createElement('div');
    Object.assign(ticks.style, {
      display: 'flex', justifyContent: 'space-between',
      fontSize: '11px', color: 'var(--ink-mute)', marginTop: '4px',
    });
    const min = document.createElement('span'); min.textContent = '1'; ticks.appendChild(min);
    const max = document.createElement('span'); max.textContent = String(qCount); ticks.appendChild(max);
    cardBody.appendChild(ticks);

    const cardWrap = document.createElement('div');
    const card = mCard({ title: `${t('pretest.count') || 'Сколько вопросов'} · ${count}` }, cardBody);
    cardWrap.appendChild(card);
    const titleEl = card.querySelector('div > div');
    return { card, titleEl };
  })();
  body.appendChild(countCard.card);

  // Source filter card.
  const sourceCard = (() => {
    const cardBody = document.createElement('div');
    Object.assign(cardBody.style, { display: 'flex', gap: '6px', flexWrap: 'wrap' });
    const opts = [
      { id: 'all',  label: t('pretest.src.all')  || 'Все темы',        count: qCount },
      { id: 'weak', label: t('pretest.src.weak') || 'Слабые',           count: kdCounts.weak },
      { id: 'new',  label: t('pretest.src.new')  || 'Не пройденные',   count: kdCounts.untaken },
      { id: 'flag', label: t('pretest.src.flag') || 'Отмеченные',      count: null },
    ];
    function rerender() {
      cardBody.replaceChildren();
      for (const o of opts) {
        const chipLabel = o.count !== null ? (o.label + ' · ' + o.count) : o.label;
        const disabled = o.count === 0;
        const chip = mChip({
          sm: true, active: source === o.id,
          onClick: () => {
            if (disabled) return;
            source = o.id;
            // Weak-mode forces shuffleQuestions off so the accuracy order
            // survives taking.js. Reflect that in the toggle row UI.
            if (source === 'weak') shuffleQuestions = false;
            rerender();
            optsCard.__rebuild?.();
          },
        }, chipLabel);
        if (disabled) {
          chip.style.opacity = '0.4';
          chip.style.cursor = 'not-allowed';
        }
        cardBody.appendChild(chip);
      }
    }
    rerender();
    return mCard({ title: t('pretest.source') || 'Источник' }, cardBody);
  })();
  body.appendChild(sourceCard);

  // Time-limit card (6 presets + custom input).
  let timeChipsRow, timeCustomInput;
  const timeCard = (() => {
    const cardBody = document.createElement('div');
    const chipsRow = document.createElement('div');
    Object.assign(chipsRow.style, { display: 'flex', gap: '6px', flexWrap: 'wrap' });
    timeChipsRow = chipsRow;
    const presets = [
      { v: 0,  label: t('pretest.time.none') || 'Без' },
      { v: 5,  label: '5' },
      { v: 10, label: '10' },
      { v: 20, label: '20' },
      { v: 40, label: '40' },
      { v: 60, label: '60' },
    ];
    function rerenderChips() {
      chipsRow.replaceChildren();
      const noTimerAllowed = mode === 'training';
      for (const p of presets) {
        const disabled = (p.v === 0 && !noTimerAllowed);
        const chip = mChip({
          sm: true,
          active: timeLimitMin === p.v,
          onClick: () => {
            if (disabled) return;
            timeLimitMin = p.v;
            if (timeCustomInput) timeCustomInput.value = p.v ? String(p.v) : '';
            rerenderChips();
            updateEstimate();
          },
        }, p.label);
        if (disabled) {
          chip.style.opacity = '0.4';
          chip.style.cursor = 'not-allowed';
        }
        chipsRow.appendChild(chip);
      }
    }
    rerenderChips();
    cardBody.appendChild(chipsRow);
    timeChipsRow.__rerender = rerenderChips;

    const customWrap = document.createElement('div');
    Object.assign(customWrap.style, {
      display: 'flex', alignItems: 'center', gap: '8px',
      marginTop: '10px',
    });
    const customLabel = document.createElement('span');
    Object.assign(customLabel.style, { fontSize: '12px', color: 'var(--ink-fade)' });
    customLabel.textContent = t('pretest.time.custom') || 'Свой (мин):';
    customWrap.appendChild(customLabel);
    const customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.min = '1';
    customInput.max = '600';
    customInput.value = timeLimitMin > 0 ? String(timeLimitMin) : '';
    Object.assign(customInput.style, {
      width: '80px', padding: '6px 8px',
      border: '1px solid var(--ink-soft)',
      borderRadius: 'var(--radius-sm)',
      fontSize: '13px', background: 'var(--paper)',
      color: 'var(--ink)',
    });
    customInput.addEventListener('input', (e) => {
      const raw = Number(e.target.value);
      if (!Number.isFinite(raw) || raw <= 0) {
        timeLimitMin = mode === 'training' ? 0 : 5;
      } else {
        // Cap mirrors desktop (training=600, timed=300, exam=180).
        const cap = mode === 'exam' ? 180 : mode === 'timed' ? 300 : 600;
        timeLimitMin = Math.max(1, Math.min(cap, Math.floor(raw)));
      }
      rerenderChips();
      updateEstimate();
    });
    timeCustomInput = customInput;
    customWrap.appendChild(customInput);
    cardBody.appendChild(customWrap);

    return mCard({ title: t('pretest.time') || 'Лимит времени' }, cardBody);
  })();
  body.appendChild(timeCard);

  // Options card (toggles).
  let optShuffleQ, optShuffleA, optReveal;
  const optsCard = (() => {
    const cardBody = document.createElement('div');
    function rebuild() {
      cardBody.replaceChildren();
      const examLocked = (mode === 'exam');
      const weakLocked = (source === 'weak');
      optShuffleQ = buildToggleRow(
        t('pretest.shuffle.questions') || 'Случайный порядок вопросов',
        shuffleQuestions,
        (v) => { shuffleQuestions = v; },
        { first: true, disabled: examLocked || weakLocked },
      );
      cardBody.appendChild(optShuffleQ);
      optShuffleA = buildToggleRow(
        t('pretest.shuffle.answers') || 'Перемешать варианты ответов',
        shuffleAnswers,
        (v) => { shuffleAnswers = v; },
      );
      cardBody.appendChild(optShuffleA);
      optReveal = buildToggleRow(
        t('pretest.reveal') || 'Показывать правильный ответ сразу',
        reveal,
        (v) => { reveal = v; },
        { disabled: examLocked },
      );
      cardBody.appendChild(optReveal);
      if (examLocked) {
        const note = document.createElement('div');
        Object.assign(note.style, {
          fontSize: '11px', color: 'var(--ink-mute)',
          marginTop: '8px', lineHeight: '1.5',
        });
        note.textContent = t('pretest.exam.note')
          || 'Экзамен: вопросы всегда перемешиваются, ответ не показывается до конца.';
        cardBody.appendChild(note);
      }
    }
    rebuild();
    const card = mCard({ title: t('pretest.options') || 'Опции' }, cardBody);
    card.__rebuild = rebuild;
    return card;
  })();
  body.appendChild(optsCard);

  // Exam-mode locking — mirrors desktop applyMode().
  function applyMode() {
    if (mode === 'exam') {
      shuffleQuestions = true;
      reveal = false;
      if (timeLimitMin <= 0) timeLimitMin = 20;
    } else if (mode === 'timed') {
      if (timeLimitMin <= 0) timeLimitMin = 20;
    }
    if (timeCustomInput) {
      timeCustomInput.value = timeLimitMin > 0 ? String(timeLimitMin) : '';
    }
    timeChipsRow?.__rerender?.();
    optsCard.__rebuild?.();
    updateEstimate?.();
  }

  // Estimate box (≈ minutes — heuristic, 35s/question default).
  const estimateBox = document.createElement('div');
  Object.assign(estimateBox.style, {
    background: 'var(--ink-soft)',
    padding: '10px 12px', borderRadius: 'var(--radius-sm)',
    fontSize: '12px', color: 'var(--ink-fade)',
  });
  body.appendChild(estimateBox);
  function updateEstimate() {
    const mins = Math.max(1, Math.round((count * 35) / 60));
    estimateBox.replaceChildren();
    estimateBox.appendChild(document.createTextNode(
      `${t('pretest.estimate.prefix') || 'По вашей средней скорости — '} ~`,
    ));
    const b = document.createElement('b');
    b.style.color = 'var(--ink)';
    b.textContent = `${mins} ${t('pretest.estimate.min') || 'мин'}`;
    estimateBox.appendChild(b);
    estimateBox.appendChild(document.createTextNode(
      ` ${t('pretest.estimate.on') || 'на'} ${count} ${t('pretest.estimate.questions') || 'вопросов'}.`,
    ));
  }
  updateEstimate();

  // Sticky CTA.
  const startBtn = mBtn({
    primary: true, full: true,
    style: { padding: '12px 14px', fontSize: '14px' },
    onClick: () => {
      // Final exam-mode safety pin (in case applyMode wasn't fired since
      // the user landed straight on stored=exam).
      if (mode === 'exam') {
        shuffleQuestions = true;
        reveal = false;
        if (timeLimitMin <= 0) timeLimitMin = 20;
      } else if (mode === 'timed' && timeLimitMin <= 0) {
        timeLimitMin = 20;
      }

      // Build filterIds for weak/untaken sources (taking.js uses these
      // when present to restrict the question pool).
      let filterIds = [];
      if (source === 'weak') {
        filterIds = weakOrdered.slice(0, count);
        // Weak-mode: preserve ascending-accuracy order. taking.js would otherwise
        // Fisher-Yates the pool and defeat the sort that made "weak" useful.
        shuffleQuestions = false;
      } else if (source === 'new') {
        filterIds = untakenIds.slice();
      }
      // Guard: if the selected source has no questions, skip navigation.
      if ((source === 'weak' || source === 'new') && filterIds.length === 0) {
        return; // chip is disabled so this is a safety net only
      }

      try {
        sessionStorage.setItem(`pretest:${testId}`, JSON.stringify({
          mode, count, source,
          shuffleQuestions, shuffleAnswers,
          revealImmediately: reveal,
          timeLimitMin,
          filterIds,
        }));
      } catch { /* private mode — proceed anyway */ }
      navigate(`/test/${testId}/take`);
    },
  }, t('pretest.start') || 'Начать');
  const sticky = mSticky(startBtn);

  mShell({
    root,
    topbar: topBar({
      title: t('pretest.title') || 'Запуск теста',
      back: true, backHref: `#/test/${testId}`,
    }),
    body, sticky, hideNav: true,
  });
}
