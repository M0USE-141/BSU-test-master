/**
 * attempts.js — test attempts API wrapper.
 *
 * All endpoints require auth; `clientId` is gone. Each attempt belongs
 * to a single logged-in user, derived from the bearer token server-side.
 */
import { apiFetch } from './_fetch.js';

/**
 * Start a new attempt.
 * @param {{ attemptId: string, testId: string, settings?: object, questions?: object[] }} data
 */
export async function startAttempt(data) {
  return apiFetch('POST', '/api/attempts/start', data);
}

/**
 * Record an answer for a question in an attempt.
 * @param {string} attemptId
 * @param {{ testId: string, questionId: number, answerIndex?: number, canonicalAnswerIndex?: number, durationMs?: number, isSkipped?: boolean }} data
 */
export async function recordAnswer(attemptId, data) {
  return apiFetch('POST', `/api/attempts/${attemptId}/answer`, data);
}

/**
 * Finish an attempt.
 * @param {string} attemptId
 * @param {{ testId: string, totalDurationMs?: number }} data
 */
export async function finishAttempt(attemptId, data) {
  return apiFetch('POST', `/api/attempts/${attemptId}/finish`, data);
}

/**
 * Abandon (give up) an attempt.
 * @param {string} attemptId
 */
export async function abandonAttempt(attemptId) {
  return apiFetch('POST', `/api/attempts/${attemptId}/abandon`);
}

/**
 * Get a specific attempt's details (must belong to the current user).
 * @param {string} attemptId
 */
export async function getAttempt(attemptId) {
  return apiFetch('GET', `/api/attempts/${attemptId}`);
}
