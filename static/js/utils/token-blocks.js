/**
 * token-blocks.js — Two-way conversion between block JSON and a
 * lightweight token-text representation used in the question editor.
 *
 * Token syntax:
 *   [[img:relative/path.png]]   → { type:'image', src:'relative/path.png' }
 *   [[math:x^2+y^2]]            → { type:'formula', latex:'x^2+y^2' }
 *   [[mathml:<math>…</math>]]   → { type:'formula', mathml:'…' }
 *   plain text                  → { type:'text', text:'…' }
 *   a single \n                 → { type:'line_break' }
 *   a blank line (\n\n)         → new paragraph
 *
 * The conversion is intentionally lossy — formatting beyond text/image/
 * formula is dropped. That's fine for the editor's purpose (proposing
 * or saving question changes).
 */

const TOKEN_RE = /\[\[(img|math|mathml):([\s\S]+?)\]\]/g;

/**
 * Convert block content → editable token-text.
 *
 * Accepts either an array of blocks or a content object with .blocks.
 *
 * When ``materialsByMathml`` is provided (a map of mathml-string →
 * short-id), formula blocks whose XML matches a known material are
 * emitted as ``[[mathml:id]]`` instead of inlining the raw XML — keeps
 * the textarea readable. Image src like "abc1234.png" becomes
 * ``[[img:abc1234]]`` (extension stripped).
 *
 * @param {Array|{blocks: Array}} content
 * @param {Object<string,string>} [materialsByMathml]
 * @returns {string}
 */
export function blocksToTokens(content, materialsByMathml) {
  if (!content) return '';
  const blocks = Array.isArray(content) ? content : (content.blocks || []);
  const paraTexts = [];
  for (const block of blocks) {
    if (!block || block.type !== 'paragraph') continue;
    const parts = [];
    for (const inl of block.inlines || []) {
      switch (inl?.type) {
        case 'text':
          parts.push(inl.text || '');
          break;
        case 'line_break':
          parts.push('\n');
          break;
        case 'image':
          parts.push(`[[img:${stripExt(inl.src || '')}]]`);
          break;
        case 'formula':
          if (inl.latex) {
            parts.push(`[[math:${inl.latex}]]`);
          } else if (inl.mathml) {
            const knownId = materialsByMathml && materialsByMathml[inl.mathml];
            if (knownId) parts.push(`[[mathml:${knownId}]]`);
            else         parts.push(`[[mathml:${inl.mathml}]]`);
          }
          break;
      }
    }
    paraTexts.push(parts.join(''));
  }
  return paraTexts.join('\n\n');
}

function stripExt(src) {
  // Strip any leading path + the trailing extension. "abc1234.png" → "abc1234".
  const last = String(src).split('/').pop() || '';
  const dot = last.lastIndexOf('.');
  return dot > 0 ? last.slice(0, dot) : last;
}

/**
 * Parse editable token-text → block content.
 *
 * Returns the same `{ blocks: [...] }` shape the backend expects.
 *
 * When ``materialsById`` is provided, `[[img:abc]]` and `[[mathml:abc]]`
 * tokens resolve via that map → real ``src`` / inlined MathML XML. If a
 * referenced ID is missing from the map the token is preserved as-is
 * (img treated as raw src, mathml treated as raw XML — backward compat
 * with hand-typed tokens).
 *
 * @param {string} text
 * @param {Object<string, {src?: string, mathml?: string}>} [materialsById]
 * @returns {{ blocks: Array }}
 */
export function tokensToBlocks(text, materialsById) {
  const src = String(text == null ? '' : text);
  const paragraphs = src.split(/\n{2,}/);
  const blocks = paragraphs.map(function (para) {
    return { type: 'paragraph', inlines: paragraphToInlines(para, materialsById) };
  });
  return { blocks: blocks.length ? blocks : [{ type: 'paragraph', inlines: [] }] };
}

/** Returns an array of inline items from one paragraph string. */
function paragraphToInlines(para, materialsById) {
  const inlines = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(para)) !== null) {
    if (m.index > last) {
      pushText(inlines, para.slice(last, m.index));
    }
    const kind = m[1];
    const body = m[2];
    if (kind === 'img') {
      const mat = materialsById && materialsById[body];
      // Resolve short-id → real filename. Fall back to body-as-src so
      // legacy [[img:full/path.png]] tokens still work.
      inlines.push({ type: 'image', src: (mat && mat.src) || body });
    } else if (kind === 'math') {
      inlines.push({ type: 'formula', latex: body });
    } else if (kind === 'mathml') {
      const mat = materialsById && materialsById[body];
      // Resolve short-id → raw MathML XML. Body may also be the raw XML
      // itself (e.g. user pasted a [[mathml:<math>…]] token directly).
      inlines.push({ type: 'formula', mathml: (mat && mat.mathml) || body });
    }
    last = m.index + m[0].length;
  }
  if (last < para.length) pushText(inlines, para.slice(last));
  return inlines;
}

/** Push text, splitting single \n into line_break inlines. */
function pushText(inlines, text) {
  if (!text) return;
  const parts = text.split('\n');
  parts.forEach(function (p, i) {
    if (p) inlines.push({ type: 'text', text: p });
    if (i < parts.length - 1) inlines.push({ type: 'line_break' });
  });
}
