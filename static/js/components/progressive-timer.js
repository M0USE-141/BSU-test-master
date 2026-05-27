/**
 * components/progressive-timer.js — bar-based countdown timer (audit 4.8).
 *
 * Visual progression:
 *   - >25% remaining → neutral ink
 *   - 10–25%         → warning yellow
 *   - <10%           → error red + pulse
 *
 *   const timer = createProgressiveTimer({
 *     total: 600, // seconds
 *     onTick: (remaining) => labelEl.textContent = fmt(remaining),
 *     onExpire: () => submit(),
 *   });
 *   container.appendChild(timer.el);
 *   timer.start();
 *   timer.stop();
 */

/**
 * @param {object} opts
 * @param {number} opts.total — total seconds
 * @param {(remaining: number) => void} [opts.onTick]
 * @param {() => void}                  [opts.onExpire]
 * @returns {{ el: HTMLElement, labelEl: HTMLElement, start: () => void, stop: () => void, reset: (total?: number) => void, getRemaining: () => number }}
 */
export function createProgressiveTimer({ total, onTick, onExpire }) {
  const wrap = document.createElement('div');
  wrap.className = 'ptimer';

  const labelEl = document.createElement('span');
  labelEl.className = 'mono ptimer__label';

  const barWrap = document.createElement('div');
  barWrap.className = 'bar bar--timer bar--thin';
  const fill = document.createElement('div');
  fill.className = 'bar__fill';
  fill.style.width = '100%';
  barWrap.appendChild(fill);

  wrap.appendChild(labelEl);
  wrap.appendChild(barWrap);

  let totalSec = total;
  let remaining = total;
  let intervalId = null;
  let lastTickAt = 0;

  function update() {
    const pct = totalSec > 0 ? remaining / totalSec : 0;
    fill.style.width = (pct * 100).toFixed(2) + '%';
    if (pct < 0.10)      barWrap.dataset.warn = '2';
    else if (pct < 0.25) barWrap.dataset.warn = '1';
    else                 barWrap.dataset.warn = '0';
    onTick && onTick(Math.max(0, Math.ceil(remaining)));
  }

  function tick() {
    const now = Date.now();
    const dt = (now - lastTickAt) / 1000;
    lastTickAt = now;
    remaining = Math.max(0, remaining - dt);
    update();
    if (remaining <= 0) {
      stop();
      onExpire && onExpire();
    }
  }

  function start() {
    if (intervalId !== null) return;
    lastTickAt = Date.now();
    intervalId = setInterval(tick, 250);
    update();
  }

  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function reset(newTotal) {
    if (typeof newTotal === 'number') totalSec = newTotal;
    remaining = totalSec;
    update();
  }

  update();
  return {
    el: wrap,
    labelEl,
    start,
    stop,
    reset,
    getRemaining: () => Math.max(0, Math.ceil(remaining)),
  };
}

// Inject component-local styles once
(function injectStyles() {
  if (document.getElementById('__ptimer_styles')) return;
  const style = document.createElement('style');
  style.id = '__ptimer_styles';
  style.textContent = `
    .ptimer { display: inline-flex; align-items: center; gap: var(--sp-2); min-width: 120px; }
    .ptimer__label {
      font-size: var(--fs-sm);
      font-weight: var(--fw-semibold);
      font-variant-numeric: tabular-nums;
      min-width: 52px;
      color: var(--ink);
    }
    .ptimer .bar { flex: 1; min-width: 60px; }
  `;
  document.head.appendChild(style);
})();
