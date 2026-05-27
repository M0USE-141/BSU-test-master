/**
 * utils/client-id.js — Persistent anonymous client UUID
 *
 * Used for anonymous attempt tracking. Stored in localStorage.
 */

/**
 * Get or create a persistent client ID.
 * @returns {string}
 */
export function getClientId() {
  let id = localStorage.getItem('client_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('client_id', id);
  }
  return id;
}
