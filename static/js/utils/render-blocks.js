/**
 * render-blocks.js — shared rich-content renderer
 *
 * Converts backend block JSON → HTML string, then calls MathJax if formulas present.
 *
 * Block format (from core/serialization.py):
 *   { type: "paragraph", inlines: [ { type: "text"|"image"|"formula"|"line_break", ... } ] }
 *
 * Formula inline:
 *   { type: "formula", mathml: "<math...>" }   ← inline MathML (legacy/fallback)
 *   { type: "formula", latex: "x^2+y^2" }      ← plain LaTeX
 *   { type: "formula", id: "abc1234" }         ← refers to materials/<id>.mml
 *                                                (resolved by attachAssets)
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
      if (inline.id) {
        // Referenced MathML — actual XML lives at
        // `<assetsBaseUrl>/<id>.mml`. We can't inline it here
        // (renderInline is sync), so emit a placeholder span that
        // `attachAssets` will fill in after an auth'd fetch.
        const url = assetsBaseUrl
          ? `${assetsBaseUrl}/${inline.id}.mml`
          : `${inline.id}.mml`;
        return `<span class="rb-formula rb-formula--ref" data-mml-url="${escHtml(url)}"></span>`;
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
 * Resolve auth-gated assets in `container`: swap `img.rb-image` src to
 * blob URLs, and fill `span.rb-formula--ref` placeholders with their
 * fetched MathML XML.
 *
 * Asset endpoints (`/api/tests/<id>/assets/<path>`) require Bearer auth —
 * plain `<img>` tags can't carry an Authorization header, so they 403.
 * We fetch each unique URL once via `fetch()`, convert images to blob
 * URLs, and inject MathML text into formula placeholder spans.
 *
 * Idempotent — already-resolved nodes are skipped. Safe to call
 * multiple times against the same container. The caller should invoke
 * `typesetMath()` afterwards if formula refs may be present.
 *
 * @param {Element} container Any DOM element. All `img.rb-image` and
 *   `span.rb-formula--ref[data-mml-url]` under it are processed.
 * @returns {Promise<void>}
 */
export async function attachAssets(container) {
  if (!container) return;
  const tok = getAccessToken();
  if (!tok) return;

  // ---- Images ----
  const imgs = Array.from(container.querySelectorAll('img.rb-image'));
  const imgCache = new Map();
  for (const img of imgs) {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('blob:')) continue;
    if (!imgCache.has(src)) {
      imgCache.set(src, fetch(src, {
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
    const url = await imgCache.get(src);
    if (url) {
      img.src = url;
      img.style.display = '';
    }
  }

  // ---- Referenced formulas (MathML or LaTeX) ----
  // Spans emitted by renderInline as <span class="rb-formula rb-formula--ref"
  // data-mml-url="…/<id>.mml">. The payload ref is id-only, so we don't know
  // upfront whether the material is `.mml` (MathML) or `.tex` (LaTeX). We
  // probe `.mml` first; on 404 we fall back to `.tex` and render it as a
  // MathJax `\(...\)` source string. The caller runs typesetMath() afterwards.
  const refs = Array.from(container.querySelectorAll('span.rb-formula--ref[data-mml-url]'));
  if (refs.length) {
    const headers = { Authorization: 'Bearer ' + tok };
    // Cache per mml-url → { kind: 'mathml'|'latex', text } | null.
    const cache = new Map();
    const resolveRef = async (mmlUrl) => {
      // 1. Try MathML.
      try {
        const r = await fetch(mmlUrl, { headers, credentials: 'include' });
        if (r.ok) return { kind: 'mathml', text: await r.text() };
      } catch (_) { /* fall through to LaTeX probe */ }
      // 2. Fall back to LaTeX at the same id with a .tex extension.
      const texUrl = mmlUrl.replace(/\.mml($|\?)/, '.tex$1');
      if (texUrl === mmlUrl) return null;
      try {
        const r = await fetch(texUrl, { headers, credentials: 'include' });
        if (r.ok) return { kind: 'latex', text: await r.text() };
      } catch (_) { /* give up */ }
      return null;
    };
    for (const span of refs) {
      const url = span.getAttribute('data-mml-url');
      if (!url || span.dataset.resolved === '1') continue;
      if (!cache.has(url)) cache.set(url, resolveRef(url));
    }
    for (const span of refs) {
      const url = span.getAttribute('data-mml-url');
      if (!url || span.dataset.resolved === '1') continue;
      const res = await cache.get(url);
      if (!res) continue;
      if (res.kind === 'latex') {
        // Raw LaTeX → MathJax source. textContent (not innerHTML) keeps it
        // inert; typesetMath() turns the \(...\) delimiters into math.
        span.textContent = '\\(' + res.text + '\\)';
        span.dataset.resolved = '1';
        continue;
      }
      // MathML: parse as XML so we get a proper <math> element, not raw HTML.
      // This avoids innerHTML-based XSS: DOMParser in "application/xml" mode
      // does not execute scripts or event handlers. We then import the root
      // node and append it — no innerHTML touching the HTML parser.
      try {
        const doc = new DOMParser().parseFromString(res.text, 'application/xml');
        const root = doc.documentElement;
        if (root && root.nodeName !== 'parsererror') {
          span.appendChild(document.importNode(root, true));
          span.dataset.resolved = '1';
        }
      } catch (_) {
        // Malformed XML — leave the placeholder empty rather than crashing.
      }
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
