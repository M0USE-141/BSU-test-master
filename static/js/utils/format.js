/**
 * format.js — formatting utilities
 */

/**
 * Format an ISO date string as a relative string ("2 часа назад")
 * or an absolute date for old dates (> 7 days).
 * @param {string} iso
 * @returns {string}
 */
export function formatDate(iso) {
  const date = new Date(iso);
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);

  if (seconds < 60)  return 'только что';
  if (minutes < 60)  return `${minutes} ${pluralize(minutes, 'минуту', 'минуты', 'минут')} назад`;
  if (hours < 24)    return `${hours} ${pluralize(hours, 'час', 'часа', 'часов')} назад`;
  if (days < 7)      return `${days} ${pluralize(days, 'день', 'дня', 'дней')} назад`;

  return date.toLocaleDateString('ru-RU', {
    day:   'numeric',
    month: 'short',
    year:  date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Format a duration in milliseconds as "Xm Ys".
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (ms < 1000) return '< 1s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Format a fraction (0–1) as a percentage string.
 * @param {number} n — 0 to 1
 * @returns {string}
 */
export function formatPercent(n) {
  return `${Math.round(n * 100)}%`;
}

/**
 * Format a score as "correct/total".
 * @param {number} correct
 * @param {number} total
 * @returns {string}
 */
export function formatScore(correct, total) {
  return `${correct}/${total}`;
}

/**
 * Format a duration in whole seconds as "M:SS" (for countdown timers / activity feeds).
 * @param {number} seconds
 * @returns {string}
 */
export function formatSeconds(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Russian pluralization.
 * @param {number} n
 * @param {string} one  — 1 день
 * @param {string} few  — 2–4 дня
 * @param {string} many — 5+ дней
 * @returns {string}
 */
export function pluralize(n, one, few, many) {
  const abs = Math.abs(n);
  const mod10  = abs % 10;
  const mod100 = abs % 100;

  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
