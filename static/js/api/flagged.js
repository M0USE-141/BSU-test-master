/**
 * api/flagged.js — per-user question flags.
 */
import { api } from './_fetch.js';

/**
 * List the caller's flagged question_ids for a test.
 * @param {string} testId
 * @returns {Promise<{testId: string, flagged: number[]}>}
 */
export function listFlagged(testId) {
  return api.get(`/api/tests/${encodeURIComponent(testId)}/questions/flagged`);
}

/**
 * Toggle a flag on a question.
 * @param {string} testId
 * @param {number} questionId
 * @param {boolean} flagged
 */
export function setFlag(testId, questionId, flagged) {
  const method = flagged ? 'POST' : 'DELETE';
  const path = `/api/tests/${encodeURIComponent(testId)}/questions/${questionId}/flag`;
  return method === 'POST' ? api.post(path) : api.delete(path);
}
