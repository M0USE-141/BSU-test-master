/**
 * access.js — test access control API wrapper
 */
import { apiFetch } from './_fetch.js';

/**
 * @param {string} testId
 */
export async function getTestAccess(testId) {
  return apiFetch('GET', `/api/tests/${testId}/access`);
}

/**
 * @param {string} testId
 * @param {'private'|'public'|'shared'} accessLevel
 */
export async function updateTestAccess(testId, accessLevel) {
  return apiFetch('PATCH', `/api/tests/${testId}/access`, { access_level: accessLevel });
}

/**
 * @param {string} testId
 */
export async function getTestShares(testId) {
  return apiFetch('GET', `/api/tests/${testId}/shares`);
}

/**
 * @param {string} testId
 * @param {string} username
 */
export async function addShare(testId, username) {
  return apiFetch('POST', `/api/tests/${testId}/shares`, { username });
}

/**
 * @param {string} testId
 * @param {number|string} userId
 */
export async function removeShare(testId, userId) {
  return apiFetch('DELETE', `/api/tests/${testId}/shares/${userId}`);
}
