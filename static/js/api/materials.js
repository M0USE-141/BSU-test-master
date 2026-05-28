/**
 * materials.js — Test materials (images + MathML formulas) API wrapper.
 *
 * Each material has a 7-char content-hash short ID; the editor refers
 * to them via [[img:abc1234]] / [[mathml:abc1234]] tokens.
 */
import { apiFetch } from './_fetch.js';

/**
 * List every material attached to a test.
 *
 * Returns { items: [{ id, src, name, kind, mathml? }] }.
 *   kind ∈ "image" | "formula"
 *   mathml is included only for formulas (raw XML text).
 *
 * @param {string} testId
 */
export async function listMaterials(testId) {
  return apiFetch('GET', `/api/tests/${testId}/assets/materials`);
}

/**
 * Upload an image or MathML file.
 *
 * Server rejects malformed MathML (400) — caller should surface the
 * error to the user.
 *
 * @param {string} testId
 * @param {File} file
 * @returns {Promise<{id:string, src:string, kind:string, mathml?:string, name:string}>}
 */
export async function uploadMaterial(testId, file) {
  const fd = new FormData();
  fd.append('file', file);
  return apiFetch('POST', `/api/tests/${testId}/assets`, fd);
}

/**
 * Delete a material by its short ID. Existing question references are
 * NOT rewritten — the caller should refresh the question list and
 * surface a broken-references warning to the owner.
 *
 * @param {string} testId
 * @param {string} assetId
 */
export async function deleteMaterial(testId, assetId) {
  return apiFetch('DELETE', `/api/tests/${testId}/assets/${encodeURIComponent(assetId)}`);
}
