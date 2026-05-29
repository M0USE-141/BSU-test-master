/**
 * auth.js — authentication API wrapper.
 *
 * Token model: see `_fetch.js`. Access token in JS memory (state.js),
 * refresh token in HttpOnly cookie. `login()` and `bootRefresh()` save
 * the access token; `logout()` and a failing refresh clear it.
 */
import { apiFetch, attemptRefresh, setToken, clearToken } from './_fetch.js';

/**
 * Login with username or email + password.
 * Returns access token and saves it.
 * @param {string} usernameOrEmail
 * @param {string} password
 */
export async function login(usernameOrEmail, password) {
  const data = await apiFetch('POST', '/api/auth/login', { username: usernameOrEmail, password });
  if (data?.access_token) {
    setToken(data.access_token);
  }
  return data;
}

/**
 * Register a new user account.
 * @param {string} username
 * @param {string} email
 * @param {string} password
 */
export async function register(username, email, password) {
  return apiFetch('POST', '/api/auth/register', { username, email, password });
}

/**
 * Logout — calls the server (so the session row is invalidated and the
 * HttpOnly cookie is cleared by the server response) and drops the
 * in-memory access token. Best-effort: ignores network/auth errors so
 * the local cleanup always runs.
 */
export async function logout() {
  try {
    await apiFetch('POST', '/api/auth/logout');
  } catch { /* even on error, drop the token below */ }
  clearToken();
}

/**
 * Get the currently authenticated user's profile.
 */
export async function getMe() {
  return apiFetch('GET', '/api/auth/me');
}

/**
 * Refresh the access token using the refresh-cookie.
 * Returns the new token on success; throws ApiError otherwise.
 */
export async function refreshToken() {
  return attemptRefresh();
}

/**
 * Boot-time silent refresh. Called by `main.js` on page load.
 * Returns true if the user is still authenticated (cookie was valid),
 * false otherwise. Never throws.
 */
export async function bootRefresh() {
  try {
    await attemptRefresh();
    return true;
  } catch { return false; }
}

/**
 * Get public password rules (min length, require digit, require upper).
 * Used by Register/Reset screens to render a live checklist.
 * @returns {Promise<{min_length:number, require_digit:boolean, require_upper:boolean}>}
 */
export async function getPasswordRules() {
  return apiFetch('GET', '/api/auth/password-rules');
}

/**
 * Request a password-reset link for an email address.
 * Always succeeds (200) regardless of whether the email exists, to avoid
 * user enumeration. The link is emailed or — when SMTP isn't configured —
 * logged on the server.
 * @param {string} email
 */
export async function forgotPassword(email) {
  return apiFetch('POST', '/api/auth/forgot-password', { email });
}

/**
 * Consume a reset token and set a new password.
 * @param {string} token
 * @param {string} newPassword
 */
export async function resetPassword(token, newPassword) {
  return apiFetch('POST', '/api/auth/reset-password', { token, new_password: newPassword });
}

/**
 * Change the current user's password. Requires authentication.
 * @param {string} currentPassword
 * @param {string} newPassword
 */
export async function changePassword(currentPassword, newPassword) {
  return apiFetch('POST', '/api/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
