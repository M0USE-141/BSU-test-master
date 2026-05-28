/**
 * change-requests.js — change requests API wrapper
 */
import { apiFetch } from './_fetch.js';

/**
 * @param {string} testId
 */
export async function canProposeChangeRequest(testId) {
  return apiFetch('GET', `/api/tests/${testId}/change-requests/can-propose`);
}

/**
 * @param {string} testId
 * @param {{ type: string, payload: any, message?: string }} data
 */
export async function createChangeRequest(testId, data) {
  return apiFetch('POST', `/api/tests/${testId}/change-requests`, data);
}

/**
 * @param {string} testId
 * @param {{ status?: string, page?: number, limit?: number }} [params]
 */
export async function listChangeRequests(testId, params) {
  const qs = params ? '?' + new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  ) : '';
  return apiFetch('GET', `/api/tests/${testId}/change-requests${qs}`);
}

/**
 * @param {string} testId
 */
export async function getChangeRequestStats(testId) {
  return apiFetch('GET', `/api/tests/${testId}/change-requests/stats`);
}

/**
 * @param {string} testId
 * @param {string} crId
 */
export async function approveChangeRequest(testId, crId, comment) {
  return apiFetch('POST', `/api/tests/${testId}/change-requests/${crId}/approve`, { comment: comment || '' });
}

/**
 * @param {string} testId
 * @param {string} crId
 */
export async function rejectChangeRequest(testId, crId, comment) {
  return apiFetch('POST', `/api/tests/${testId}/change-requests/${crId}/reject`, { comment: comment || '' });
}
