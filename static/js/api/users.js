/**
 * users.js — user profile API wrapper
 */
import { apiFetch } from './_fetch.js';

export async function getMyProfile() {
  return apiFetch('GET', '/api/users/me');
}

/**
 * @param {{ username?: string, email?: string, bio?: string }} data
 */
export async function updateProfile(data) {
  return apiFetch('PATCH', '/api/users/me', data);
}

/**
 * @param {File} file
 */
export async function uploadAvatar(file) {
  const form = new FormData();
  form.append('file', file);
  return apiFetch('POST', '/api/users/me/avatar', form);
}

export async function deleteAvatar() {
  return apiFetch('DELETE', '/api/users/me/avatar');
}

/**
 * @param {number|string} id
 */
export async function getUserById(id) {
  return apiFetch('GET', `/api/users/${id}`);
}
