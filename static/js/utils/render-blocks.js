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
      return `<img src="${escHtml(src)}" alt="${escHtml(inline.alt || '')}" class="rb-image" loading="lazy">`;
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
      return `<p class="rb-para">${inner || '&nbsp;'}</p>`;
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
