/**
 * charts.js — dependency-free inline-SVG chart helpers.
 *
 * Every function returns an HTML/SVG STRING (caller injects via innerHTML on a
 * trusted container). No API/state knowledge. Styling lives in
 * css/components/charts.css; colors use CSS vars so themes and accent color
 * apply without per-call config.
 *
 * SECURITY: all string inputs (labels, units, titles) are escaped with escHtml
 * before reaching markup; numeric inputs are coerced; `rank` is validated
 * against a closed set. Callers pass user text as strings (not pre-built HTML);
 * the helpers own the escaping.
 */
import { escHtml } from './escape.js';

function _clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function _num(n) { return Number.isFinite(+n) ? +n : 0; }

let _gradSeq = 0;

/**
 * Donut / ring KPI. `value`/`max` drive the arc; `label` is the caption.
 * @param {number} value
 * @param {number} max
 * @param {{label?:string, unit?:string, size?:number}} [opts]
 * @returns {string} SVG markup
 */
export function donut(value, max, opts = {}) {
  value = _num(value); max = _num(max);
  const size = _num(opts.size) || 96;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? _clamp(value / max, 0, 1) : 0;
  const dash = (pct * circ).toFixed(1);
  const display = opts.unit === '%' ? Math.round(pct * 100) + '%' : String(value);
  const safeDisplay = escHtml(display);
  const label = opts.label ? escHtml(String(opts.label)) : '';
  return `
<div class="chart-donut" role="img" aria-label="${safeDisplay}${label ? ' ' + label : ''}">
  <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle class="chart-donut__track" cx="${cx}" cy="${cy}" r="${r}" stroke-width="${stroke}" fill="none"/>
    <circle class="chart-donut__arc" cx="${cx}" cy="${cy}" r="${r}" stroke-width="${stroke}" fill="none"
      stroke-dasharray="${dash} ${(circ - dash).toFixed(1)}"
      stroke-dashoffset="${(circ / 4).toFixed(1)}" stroke-linecap="round"/>
    <text class="chart-donut__value" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central">${safeDisplay}</text>
  </svg>
  ${label ? `<div class="chart-donut__label">${label}</div>` : ''}
</div>`;
}

/**
 * Vertical bar histogram. `data` = [{label, value}], values >= 0.
 * @param {Array<{label:string,value:number}>} data
 * @param {{height?:number}} [opts]
 * @returns {string}
 */
export function barChart(data, opts = {}) {
  const h = _num(opts.height) || 120;
  if (!Array.isArray(data) || data.length === 0) {
    return `<div class="chart-bar chart-empty">—</div>`;
  }
  const max = Math.max(1, ...data.map(d => _num(d.value)));
  const bars = data.map(d => {
    const v = _num(d.value);
    const label = escHtml(String(d.label ?? ''));
    const bh = Math.round((v / max) * (h - 18));
    return `
    <div class="chart-bar__col" title="${label}: ${v}">
      <div class="chart-bar__fill" style="height:${bh}px"></div>
      <div class="chart-bar__label">${label}</div>
    </div>`;
  }).join('');
  return `<div class="chart-bar" style="--chart-h:${h}px">${bars}</div>`;
}

/**
 * Smoothed area line. `points` = [{y, label?}] — y values; index used as x.
 * @param {Array<{y:number,label?:string}>} points
 * @param {{width?:number,height?:number}} [opts]
 * @returns {string}
 */
export function areaLine(points, opts = {}) {
  const w = _num(opts.width) || 320, h = _num(opts.height) || 96, pad = 6;
  if (!Array.isArray(points) || points.length === 0) {
    return `<div class="chart-area chart-empty">—</div>`;
  }
  const ys = points.map(p => _num(p.y));
  const max = Math.max(1, ...ys), min = Math.min(0, ...ys);
  const span = (max - min) || 1;
  const n = points.length;
  const xAt = i => pad + (n === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (n - 1));
  const yAt = v => h - pad - ((v - min) / span) * (h - 2 * pad);
  const gradId = `chartAreaGrad${_gradSeq++}`;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(_num(p.y)).toFixed(1)}`).join(' ');
  const area = `${line} L ${xAt(n - 1).toFixed(1)} ${h - pad} L ${xAt(0).toFixed(1)} ${h - pad} Z`;
  const dots = points.map((p, i) => `<circle class="chart-area__dot" cx="${xAt(i).toFixed(1)}" cy="${yAt(_num(p.y)).toFixed(1)}" r="2.5"><title>${escHtml(String(p.label || ''))} ${_num(p.y)}</title></circle>`).join('');
  return `
<svg class="chart-area" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
  <defs><linearGradient id="${gradId}" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0%" class="chart-area__g0"/><stop offset="100%" class="chart-area__g1"/>
  </linearGradient></defs>
  <path class="chart-area__fill" fill="url(#${gradId})" d="${area}"/>
  <path class="chart-area__line" d="${line}" fill="none"/>
  ${dots}
</svg>`;
}

/**
 * Compact accuracy pill. Colors by `rank` (backend-computed, closed set):
 * gold >= 90%, silver 60-89%, bronze < 60%, none = never answered.
 * @param {number} correct
 * @param {number} total
 * @param {number} accuracy  personal accuracy percent (correct/total*100)
 * @param {"none"|"bronze"|"silver"|"gold"} rank
 * @returns {string}
 */
export function accuracyBadge(correct, total, accuracy, rank) {
  const safeRank = ['gold', 'silver', 'bronze', 'none'].includes(rank) ? rank : 'none';
  correct = _num(correct); total = _num(total); accuracy = _num(accuracy);
  if (safeRank === 'none') {
    return `<span class="acc-badge acc-badge--none" title="Точность">—</span>`;
  }
  return `<span class="acc-badge acc-badge--${safeRank}" title="${correct}/${total}">${Math.round(accuracy)}%</span>`;
}
