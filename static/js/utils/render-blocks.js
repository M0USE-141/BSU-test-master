/**
 * render-blocks.js — shared rich-content renderer
 *
 * Converts backend block JSON → HTML string, then calls MathJax if formulas present.
 *
 * Block format (from core/serialization.py):
 *   { type: "paragraph", inlines: [ { type: "text"|"image"|"formula"|"line_break", ... } ] }
 *
 * Formula inline:
 *   { type: "formula", mathml: "<math...>" }   ← from Word OMML
 *   { type: "formula", latex: "x^2+y^2" }      ← plain LaTeX
 */

import { escHtml } from './escape.js';
import { getAccessToken } from '../state.js';

/**
 * Render a single inline item to HTML string.
 * @param {object} inline
 * @param {string} [assetsBaseUrl]
 * @returns {string}
 */
function renderInline(inline, assetsBaseUrl) {
  switch (inline?.type) {
    case 'text':
      return escHtml(inline.text ?? '');
    case 'line_break':
      return '<br>';
    case 'image': {
      const src = assetsBaseUrl
        ? `${assetsBaseUrl}/${inline.src || ''}`
        : (inline.src || '');
      // onerror="this.style.display='none'" — broken refs (e.g. material
      // deleted after the question was authored) collapse silently
      // instead of leaving a broken-image icon in the middle of a
      // question.
      return `<img src="${escHtml(src)}" alt="${escHtml(inline.alt || '')}" class="rb-image" loading="lazy" onerror="this.style.display='none'">`;
    }
    case 'formula': {
      if (inline.mathml) {
        // MathML — pass raw XML; MathJax will process it
        // Wrap in <span> so MathJax doesn't skip it
        return `<span class="rb-formula">${inline.mathml}</span>`;
      }
      if (inline.latex) {
        // LaTeX — use MathJax delimiters \(...\)
        return `<span class="rb-formula">\\(${inline.latex}\\)</span>`;
      }
      return '';
    }
    default:
      return '';
  }
}

/**
 * Render an array of block objects to an HTML string.
 * @param {Array<object>} blocks
 * @param {string} [assetsBaseUrl]
 * @returns {string}
 */
export function blocksToHtml(blocks, assetsBaseUrl) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  return blocks.map(block => {
    if (block?.type === 'paragraph') {
      const inner = (block.inlines || [])
        .map(il => renderInline(il, assetsBaseUrl))
        .join('');
      // Render as inline <span> so paragraphs flow together with text,
      // images and formulas all on the same line where possible. CSS
      // turns .rb-para into display:inline; consecutive paragraphs are
      // separated by a single space via ::before.
      return `<span class="rb-para">${inner || '&nbsp;'}</span>`;
    }
    return '';
  }).join('');
}

/**
 * Render blocks from a content object ({ blocks: [...] } or blocks array).
 * @param {object|Array} content
 * @param {string} [assetsBaseUrl]
 * @returns {string}
 */
export function renderContent(content, assetsBaseUrl) {
  const blocks = Array.isArray(content)
    ? content
    : (content?.blocks ?? []);
  return blocksToHtml(blocks, assetsBaseUrl);
}

/**
 * Check if HTML string contains formula spans (needs MathJax typeset).
 * @param {string} html
 * @returns {boolean}
 */
export function hasFormulas(html) {
  return html.includes('rb-formula');
}

/**
 * Resolve `<img class="rb-image">` nodes by fetching them authenticated
 * and swapping `src` to a blob URL.
 *
 * Asset endpoints (`/api/tests/<id>/assets/<path>`) require the same
 * Bearer auth as the rest of the API — but plain `<img>` tags can't
 * attach an Authorization header, so they 403 and disappear. We fetch
 * each unique asset once via `fetch()` (which can carry the token from
 * `getAccessToken()`), convert the response to a blob, and use
 * `URL.createObjectURL` to produce a same-origin URL the browser will
 * happily render.
 *
 * Idempotent — already-swapped `blob:` URLs are skipped. Safe to call
 * multiple times against the same container.
 *
 * @param {Element} container Any DOM element. All `img.rb-image` under it are processed.
 * @returns {Promise<void>}
 */
export async function attachAssets(container) {
  if (!container) return;
  const imgs = Array.from(container.querySelectorAll('img.rb-image'));
  if (!imgs.length) return;
  const tok = getAccessToken();
  if (!tok) return;
  // Deduplicate by src so we don't issue concurrent requests for the
  // same asset (common when one material is reused across questions).
  const cache = new Map();
  for (const img of imgs) {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('blob:')) continue;
    if (!cache.has(src)) {
      cache.set(src, fetch(src, {
        headers: { Authorization: 'Bearer ' + tok },
        credentials: 'include',
      }).then(r => r.ok ? r.blob() : null)
        .then(b => b ? URL.createObjectURL(b) : null)
        .catch(() => null));
    }
  }
  for (const img of imgs) {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('blob:')) continue;
    const url = await cache.get(src);
    if (url) {
      img.src = url;
      // Reset the onerror-driven hide in case it already fired.
      img.style.display = '';
    }
  }
}

/**
 * Trigger MathJax typesetting on a DOM element (async, no-op if MathJax not loaded).
 * @param {Element} el
 * @returns {Promise<void>}
 */
export async function typesetMath(el) {
  if (typeof window === 'undefined') return;
  const MJ = window.MathJax;
  if (!MJ) return;
  try {
    if (MJ.typesetPromise) {
      await MJ.typesetPromise([el]);
    } else if (MJ.typeset) {
      MJ.typeset([el]);
    }
  } catch (e) {
    console.warn('[render-blocks] MathJax typeset error:', e);
  }
}
