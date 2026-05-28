/**
 * _fetch.js — base fetch wrapper for API calls
 */

/**
 * Custom error class for API errors.
 */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} detail
   */
  constructor(status, detail) {
    super(detail || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.message = detail || `HTTP ${status}`;
  }
}

/**
 * Get the stored JWT access token.
 * @returns {string|null}
 */
function getToken() {
  return localStorage.getItem('access_token');
}

/**
 * Save the JWT access token.
 * @param {string} token
 */
export function setToken(token) {
  localStorage.setItem('access_token', token);
}

/**
 * Remove the stored JWT access token.
 */
export function clearToken() {
  localStorage.removeItem('access_token');
}

/**
 * Core fetch wrapper. Throws ApiError on non-2xx responses.
 *
 * @param {'GET'|'POST'|'PATCH'|'PUT'|'DELETE'} method
 * @param {string} path — e.g. '/api/auth/login'
 * @param {any} [body] — JSON body (will be serialized) or FormData
 * @param {RequestInit} [opts] — extra fetch options
 * @returns {Promise<any>} parsed JSON response
 */
export async function apiFetch(method, path, body, opts = {}) {
  const headers = { ...(opts.headers || {}) };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let fetchBody;
  if (body instanceof FormData) {
    fetchBody = body;
    // Don't set Content-Type — browser will set it with boundary
  } else if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, {
      ...opts,       // base caller options (e.g. signal for abort)
      method,        // always our method
      headers,       // always our headers (with Authorization)
      body: fetchBody,
    });
  } catch (e) {
    throw new ApiError(0, 'Network error: ' + (e.message || 'unknown'));
  }

  // Try to parse JSON response
  let data;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = null;
  }

  if (!res.ok) {
    const detail =
      (typeof data === 'object' && data !== null)
        ? (data.detail || data.message || JSON.stringify(data))
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, detail);
  }

  return data;
}

/**
 * Convenience helpers for common HTTP methods.
 */
export const api = {
  get:    (path, opts)        => apiFetch('GET',    path, undefined, opts),
  post:   (path, body, opts)  => apiFetch('POST',   path, body,      opts),
  patch:  (path, body, opts)  => apiFetch('PATCH',  path, body,      opts),
  put:    (path, body, opts)  => apiFetch('PUT',    path, body,      opts),
  delete: (path, opts)        => apiFetch('DELETE', path, undefined, opts),
};
