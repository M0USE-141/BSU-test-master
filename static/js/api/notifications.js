/**
 * api/notifications.js — notifications endpoints.
 */
import { api } from './_fetch.js';

/**
 * List notifications for the current user.
 * @param {object} [opts]
 * @param {boolean} [opts.unread]   only unread
 * @param {string}  [opts.kind]     filter by kind
 * @param {number}  [opts.limit]
 * @param {number}  [opts.offset]
 * @returns {Promise<{items: any[], total: number, unread_count?: number}|any[]>}
 */
export function listNotifications(opts = {}) {
  const qs = new URLSearchParams();
  if (opts.unread) qs.set('unread', 'true');
  if (opts.kind)   qs.set('kind', opts.kind);
  if (opts.limit !== undefined)  qs.set('limit',  String(opts.limit));
  if (opts.offset !== undefined) qs.set('offset', String(opts.offset));
  const q = qs.toString();
  return api.get(`/api/notifications${q ? '?' + q : ''}`);
}

/**
 * Mark a notification as read.
 * @param {number|string} id
 */
export function markNotificationRead(id) {
  return api.post(`/api/notifications/${encodeURIComponent(id)}/read`);
}

/**
 * Mark all notifications as read.
 */
export function markAllNotificationsRead() {
  return api.post('/api/notifications/read-all');
}
