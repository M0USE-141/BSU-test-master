/**
 * auth.js — authentication API wrapper
 */
import { apiFetch, setToken, clearToken } from './_fetch.js';

/**
 * Login with username or email + password.
 * Returns access token and saves it.
 * @param {string} usernameOrEmail
 * @param {string} password
 */
export async function login(usernameOrEmail, password) {
  // FastAPI's OAuth2PasswordRequestForm expects form-encoded body
  const form = new FormData();
  form.append('username', usernameOrEmail);
  form.append('password', password);
  const data = await apiFetch('POST', '/api/auth/login', form);
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
 * Logout — clears stored token.
 */
export function logout() {
  clearToken();
}

/**
 * Get the currently authenticated user's profile.
 */
export async function getMe() {
  return apiFetch('GET', '/api/auth/me');
}

/**
 * Refresh the access token.
 */
export async function refreshToken() {
  const data = await apiFetch('POST', '/api/auth/refresh');
  if (data?.access_token) {
    setToken(data.access_token);
  }
  return data;
}
