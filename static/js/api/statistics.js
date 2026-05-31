/**
 * statistics.js — statistics API wrapper.
 *
 * All endpoints require auth. `clientId` query param is gone — the
 * server uses the bearer-token user.
 *
 * Actual backend routes (prefix="/api"):
 *   GET /api/stats/heatmap?weeks=N
 *   GET /api/stats/me/aggregate?testId=...
 *   GET /api/stats/streak
 *   GET /api/stats/attempts?testId=...
 *   GET /api/stats/attempts/{id}
 *   GET /api/tests/{id}/statistics        (owner only)
 *   GET /api/tests/{id}/weak-questions
 *   GET /api/tests/{id}/owner-analytics
 */
import { apiFetch } from './_fetch.js';

function qs(params) {
  if (!params) return '';
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  return filtered.length ? '?' + new URLSearchParams(filtered) : '';
}

/**
 * Get aggregate stats for the current user (optionally for a specific test).
 * @param {{ test_id?: string }} [params]
 */
export async function getMyAggregate(params) {
  const p = params?.test_id ? { testId: params.test_id } : undefined;
  return apiFetch('GET', `/api/stats/me/aggregate${qs(p)}`);
}

/**
 * Get activity heatmap data.
 * @param {number} [weeks=16]
 */
export async function getHeatmap(weeks = 16) {
  return apiFetch('GET', `/api/stats/heatmap?weeks=${weeks}`);
}

/**
 * Get current streak info.
 */
export async function getStreak() {
  return apiFetch('GET', '/api/stats/streak');
}

/**
 * Get weak questions for a test.
 * @param {string} testId
 */
export async function getWeakQuestions(testId) {
  return apiFetch('GET', `/api/tests/${testId}/weak-questions`);
}

/**
 * Get detailed statistics for a test (owner only).
 * @param {string} testId
 * @param {{ limit?: number, offset?: number }} [params]
 */
export async function getTestStatistics(testId, params) {
  return apiFetch('GET', `/api/tests/${testId}/statistics${qs(params)}`);
}

/**
 * Get owner analytics for a test.
 * @param {string} testId
 */
export async function getOwnerAnalytics(testId) {
  return apiFetch('GET', `/api/tests/${testId}/owner-analytics`);
}

/**
 * Get a single attempt by ID. Auth-only; the server validates that the
 * attempt belongs to the current user.
 * @param {string} attemptId
 */
export async function getAttempt(attemptId) {
  return apiFetch('GET', `/api/attempts/${attemptId}`);
}

/**
 * Get my trend over N days.
 * @param {number} [days=30]
 */
export async function getMyTrend(days = 30) {
  return apiFetch('GET', `/api/stats/me/trend?days=${days}`);
}

/**
 * List the current user's attempts.
 * @param {{ testId?: string, status?: string, limit?: number, offset?: number }} [params]
 */
export async function listAttempts(params) {
  return apiFetch('GET', `/api/stats/attempts${qs(params)}`);
}

/**
 * Personal per-question accuracy for every question of a test.
 * Returns { questions: [{ questionId, correct, total, accuracy, rank, avgDurationMs }] }.
 * `questionId` is the 1-based payload id (the same numeric id the frontend uses
 * for questions). rank ∈ "none" | "bronze" | "silver" | "gold".
 * @param {string} testId
 */
export async function getMyQuestionStats(testId) {
  return apiFetch('GET', `/api/tests/${testId}/my-question-stats`);
}
