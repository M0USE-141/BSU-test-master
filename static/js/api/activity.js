/**
 * api/activity.js — global activity timeline.
 */
import { api } from './_fetch.js';

/**
 * List activity events for the current user.
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @param {string} [opts.eventType]
 * @param {string} [opts.testId]
 * @returns {Promise<{events: object[], total: number, offset: number, limit: number}>}
 */
export function listActivity(opts = {}) {
  const qs = new URLSearchParams();
  if (opts.limit !== undefined)  qs.set('limit',  String(opts.limit));
  if (opts.offset !== undefined) qs.set('offset', String(opts.offset));
  if (opts.eventType) qs.set('eventType', opts.eventType);
  if (opts.testId)    qs.set('testId',    opts.testId);
  const q = qs.toString();
  return api.get('/api/activity' + (q ? '?' + q : ''));
}
