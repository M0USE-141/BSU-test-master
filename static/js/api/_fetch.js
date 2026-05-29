/**
 * _fetch.js — base fetch wrapper for API calls.
 *
 * Token model (Phase A: HttpOnly refresh + in-memory access):
 *   - Access token (15 min) lives in JS memory via `state.js`. Sent as
 *     `Authorization: Bearer <token>` on every call.
 *   - Refresh token (7 days) lives in an HttpOnly cookie scoped to
 *     `/api/auth`. JS can never read it; `credentials: 'include'` makes
 *     the browser attach it to /api/auth/refresh requests automatically.
 *   - On 401: we make ONE attempt to refresh, then retry the original
 *     request. A single in-flight refresh is shared across parallel
 *     callers via `_refreshInFlight` so the server isn't hammered.
 */

import { getAccessToken, setAccessToken, clearAccessToken } from '../state.js';

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

// ── Legacy compat — token helpers redirect to state.js ──────────────────
// Old code paths called `setToken`/`clearToken`; keep them so we don't break
// imports during the refactor. They now poke the in-memory store.

/** @returns {string|null} */
function getToken() { return getAccessToken(); }
export function setToken(token) { setAccessToken(token); }
export function clearToken() { clearAccessToken(); }

// ── Refresh logic ───────────────────────────────────────────────────────

let _refreshInFlight = null;

/**
 * POST /api/auth/refresh. Returns the new access token on success, or
 * throws ApiError(401) on failure. Concurrent callers share one in-flight
 * promise so we only hit the server once.
 *
 * @returns {Promise<string>} new access token
 */
export async function attemptRefresh() {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      clearAccessToken();
      throw new ApiError(res.status, 'refresh failed');
    }
    const data = await res.json();
    const token = data?.access_token;
    if (!token) {
      clearAccessToken();
      throw new ApiError(500, 'malformed refresh response');
    }
    setAccessToken(token);
    return token;
  })().finally(() => { _refreshInFlight = null; });
  return _refreshInFlight;
}

// ── Core fetch wrapper ─────────────────────────────────────────────────

/**
 * Core fetch wrapper. Throws ApiError on non-2xx responses.
 *
 * @param {'GET'|'POST'|'PATCH'|'PUT'|'DELETE'} method
 * @param {string} path — e.g. '/api/auth/login'
 * @param {any} [body] — JSON body (will be serialized) or FormData
 * @param {RequestInit & {_isRetry?: boolean}} [opts] — extra fetch options
 * @returns {Promise<any>} parsed JSON response
 */
export async function apiFetch(method, path, body, opts = {}) {
  // Don't auto-refresh on the refresh endpoint itself (would loop).
  const isAuthRefresh = path === '/api/auth/refresh';
  // Mark whether this is the retry attempt so 401-on-retry just throws.
  const isRetry = !!opts._isRetry;

  const res = await _doFetch(method, path, body, opts);

  // 401 from a protected endpoint → try silent refresh+retry once.
  if (res.status === 401 && !isAuthRefresh && !isRetry) {
    try {
      await attemptRefresh();
    } catch {
      // Refresh failed — propagate the original 401.
      return _throwFromResponse(res);
    }
    // Retry with the new token.
    return apiFetch(method, path, body, { ...opts, _isRetry: true });
  }

  if (!res.ok) return _throwFromResponse(res);

  return _parseBody(res);
}

async function _doFetch(method, path, body, opts) {
  const headers = { ...(opts.headers || {}) };

  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let fetchBody;
  if (body instanceof FormData) {
    fetchBody = body;
    // Don't set Content-Type — browser will set it with boundary
  } else if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  try {
    return await fetch(path, {
      ...opts,
      method,
      headers,
      body: fetchBody,
      // credentials:'include' so the browser ships the refresh cookie
      // along on /api/auth/refresh (and is harmless on same-origin
      // calls without cookies set).
      credentials: 'include',
    });
  } catch (e) {
    throw new ApiError(0, 'Network error: ' + (e.message || 'unknown'));
  }
}

async function _parseBody(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  try { return await res.json(); } catch { return null; }
}

async function _throwFromResponse(res) {
  const data = await _parseBody(res);
  let detail;
  if (typeof data === 'object' && data !== null) {
    const d = data.detail ?? data.message;
    if (d && typeof d === 'object') {
      detail = d.message || JSON.stringify(d);
    } else {
      detail = d || JSON.stringify(data);
    }
  } else {
    detail = `HTTP ${res.status}`;
  }
  const err = new ApiError(res.status, detail);
  if (data && typeof data === 'object') err.payload = data.detail ?? data;
  throw err;
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
