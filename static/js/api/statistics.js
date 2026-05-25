/**
 * statistics.js — statistics API wrapper
 */
import { apiFetch } from './_fetch.js';

function qs(params) {
  if (!params) return '';
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  return filtered.length ? '?' + new URLSearchParams(filtered) : '';
}

/**
 * List attempts (paginated).
 * @param {{ page?: number, limit?: number, test_id?: string }} [params]
 */
export async function listAttempts(params) {
  return apiFetch('GET', `/api/attempts${qs(params)}`);
}

/**
 * Get statistics for a specific attempt.
 * @param {string} attemptId
 * @param {string} [clientId]
 */
export async function getAttemptStats(attemptId, clientId) {
  return apiFetch('GET', `/api/attempts/${attemptId}/stats${clientId ? '?client_id=' + encodeURIComponent(clientId) : ''}`);
}

/**
 * Get aggregate stats for all users (admin).
 * @param {{ page?: number, limit?: number }} [params]
 */
export async function getAggregate(params) {
  return apiFetch('GET', `/api/statistics/aggregate${qs(params)}`);
}

/**
 * Get aggregate stats for the current user.
 * @param {{ days?: number }} [params]
 */
export async function getMyAggregate(params) {
  return apiFetch('GET', `/api/statistics/me${qs(params)}`);
}

/**
 * Get activity heatmap data.
 * @param {number} [weeks=16]
 */
export async function getHeatmap(weeks = 16) {
  return apiFetch('GET', `/api/statistics/heatmap?weeks=${weeks}`);
}

/**
 * Get current streak info.
 */
export async function getStreak() {
  return apiFetch('GET', '/api/statistics/streak');
}

/**
 * Get weak questions for a test (questions with low correct rate).
 * @param {string} testId
 */
export async function getWeakQuestions(testId) {
  return apiFetch('GET', `/api/tests/${testId}/statistics/weak-questions`);
}

/**
 * Get detailed statistics for a specific test.
 * @param {string} testId
 * @param {{ page?: number, limit?: number }} [params]
 */
export async function getTestStatistics(testId, params) {
  return apiFetch('GET', `/api/tests/${testId}/statistics${qs(params)}`);
}

/**
 * Get owner analytics for a test.
 * @param {string} testId
 */
export async function getOwnerAnalytics(testId) {
  return apiFetch('GET', `/api/tests/${testId}/statistics/owner`);
}

/**
 * Get my trend over N days.
 * @param {number} [days=30]
 */
export async function getMyTrend(days = 30) {
  return apiFetch('GET', `/api/statistics/trend?days=${days}`);
}
