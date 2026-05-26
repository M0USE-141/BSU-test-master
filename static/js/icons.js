/**
 * icons.js — inline SVG icon factory
 * Usage: icon('plus', 18, 'currentColor') → SVG string
 *        iconEl('plus', 18) → HTMLElement
 */

const PATHS = {
  plus:   '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  star:   '<path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8z"/>',
  cog:    '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  play:   '<path d="M7 5l12 7-12 7z"/>',
  check:  '<path d="M5 12l4 4 10-10"/>',
  x:      '<path d="M6 6l12 12M18 6L6 18"/>',
  edit:   '<path d="M4 20l4-1L19 8l-3-3L5 16zM14 6l4 4"/>',
  trash:  '<path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"/>',
  upload: '<path d="M12 4v12M7 9l5-5 5 5M4 20h16"/>',
  home:   '<path d="M4 11l8-7 8 7v9H4z"/>',
  chart:  '<path d="M4 20V8M10 20V4M16 20v-9M22 20H2"/>',
  user:   '<circle cx="12" cy="9" r="4"/><path d="M4 20c1-4 5-6 8-6s7 2 8 6"/>',
  doc:    '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/>',
  clock:  '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
  flame:  '<path d="M12 3s5 4 5 9a5 5 0 11-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
  chevR:  '<path d="M9 6l6 6-6 6"/>',
  chevL:  '<path d="M15 6l-6 6 6 6"/>',
  bell:   '<path d="M6 17h12l-2-2v-4a4 4 0 00-8 0v4z"/><path d="M10 20a2 2 0 004 0"/>',
  menu:   '<path d="M4 7h16M4 12h16M4 17h16"/>',
  globe:  '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  lock:   '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  eye:    '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.5 10.5A3 3 0 0013.5 13.5M6.3 6.3C4.3 7.7 2.9 9.8 2 12c1.7 4 5.7 7 10 7 1.8 0 3.5-.5 5-.4M9.9 5.2C10.6 5.1 11.3 5 12 5c4.3 0 8.3 3 10 7-.6 1.5-1.5 2.8-2.6 3.9"/>',
  flag:   '<path d="M4 3v18"/><path d="M4 3h13l-3 6 3 6H4"/>',
  redo:   '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0115-6.7L21 13"/>',
  share:  '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  sun:    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  moon:   '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
  monitor:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  arrowL: '<path d="M19 12H5M12 5l-7 7 7 7"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  info:   '<circle cx="12" cy="12" r="9"/><path d="M12 8v1M12 12v5"/>',
};

/**
 * Returns an SVG string for the given icon kind.
 * @param {string} kind
 * @param {number} size
 * @param {string} color
 * @returns {string}
 */
export function icon(kind, size = 18, color = 'currentColor') {
  // If a fresher version was preloaded (via versioned URL), delegate to it
  if (typeof window !== 'undefined' && window.__iconsFresh && window.__iconsFresh !== icon) {
    return window.__iconsFresh.icon(kind, size, color);
  }
  const paths = PATHS[kind];
  if (!paths) {
    console.warn(`[icons] unknown icon: "${kind}"`);
    return '';
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

/**
 * Returns an HTMLElement (span wrapper) containing the SVG icon.
 * @param {string} kind
 * @param {number} size
 * @param {string} color
 * @returns {HTMLElement}
 */
export function iconEl(kind, size = 18, color = 'currentColor') {
  const span = document.createElement('span');
  span.style.display = 'inline-flex';
  span.style.alignItems = 'center';
  span.style.justifyContent = 'center';
  span.style.lineHeight = '0';
  span.innerHTML = icon(kind, size, color);
  return span;
}
