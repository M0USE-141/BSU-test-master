/**
 * api/access-requests.js — submit + manage access requests from the 403 page.
 */
import { api } from './_fetch.js';

/**
 * Request access to a test. Always returns 200 (idempotent + does not
 * reveal existence to the caller). Owner gets a notification.
 * @param {string} testId
 * @param {string} [message]
 */
export function requestAccess(testId, message) {
  return api.post(`/api/tests/${encodeURIComponent(testId)}/request-access`, { message: message || null });
}

/**
 * List access requests for a test (owner only).
 * @param {string} testId
 * @param {{status?: string}} [opts]
 */
export function listAccessRequests(testId, opts = {}) {
  const q = opts.status ? `?status=${encodeURIComponent(opts.status)}` : '';
  return api.get(`/api/tests/${encodeURIComponent(testId)}/access-requests${q}`);
}

/**
 * Approve or reject an access request (owner only).
 * @param {string} testId
 * @param {number} requestId
 * @param {'approve'|'reject'} decision
 */
export function decideAccessRequest(testId, requestId, decision) {
  return api.post(
    `/api/tests/${encodeURIComponent(testId)}/access-requests/${requestId}/decide`,
    { decision }
  );
}
