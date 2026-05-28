/**
 * assets.js — test assets API wrapper
 */
import { apiFetch } from './_fetch.js';

/**
 * Returns the URL for a test asset (image, etc.).
 * No fetch — just builds the URL string.
 * @param {string} testId
 * @param {string} assetPath — filename or sub-path within the test's assets dir
 * @returns {string}
 */
export function getAssetUrl(testId, assetPath) {
  return `/api/tests/${testId}/assets/${encodeURIComponent(assetPath)}`;
}

/**
 * Upload an asset file for a test.
 * @param {string} testId
 * @param {File} file
 */
export async function uploadAsset(testId, file) {
  const form = new FormData();
  form.append('file', file);
  return apiFetch('POST', `/api/tests/${testId}/assets`, form);
}
