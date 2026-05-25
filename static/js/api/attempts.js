/**
 * attempts.js — test attempts API wrapper
 */
import { apiFetch } from './_fetch.js';

/**
 * Start a new attempt.
 * @param {{ test_id: string, client_id?: string }} data
 */
export async function startAttempt(data) {
  return apiFetch('POST', '/api/attempts/start', data);
}

/**
 * Record an answer for a question in an attempt.
 * @param {string} attemptId
 * @param {{ question_id: string, selected: number|number[] }} data
 */
export async function recordAnswer(attemptId, data) {
  return apiFetch('POST', `/api/attempts/${attemptId}/answer`, data);
}

/**
 * Finish an attempt.
 * @param {string} attemptId
 */
export async function finishAttempt(attemptId) {
  return apiFetch('POST', `/api/attempts/${attemptId}/finish`);
}

/**
 * Abandon (give up) an attempt.
 * @param {string} attemptId
 */
export async function abandonAttempt(attemptId) {
  return apiFetch('POST', `/api/attempts/${attemptId}/abandon`);
}

/**
 * Get a specific attempt's details.
 * @param {string} attemptId
 * @param {string} [clientId]
 */
export async function getAttempt(attemptId, clientId) {
  const qs = clientId ? `?client_id=${encodeURIComponent(clientId)}` : '';
  return apiFetch('GET', `/api/attempts/${attemptId}${qs}`);
}
