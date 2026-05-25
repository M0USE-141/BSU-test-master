/**
 * tests.js — tests API wrapper
 */
import { apiFetch } from './_fetch.js';

/**
 * @param {{ filter?: string, search?: string, page?: number, limit?: number }} [params]
 */
export async function listTests(params) {
  const qs = params ? '?' + new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  ) : '';
  return apiFetch('GET', `/api/tests${qs}`);
}

/**
 * @param {string} id
 */
export async function getTest(id) {
  return apiFetch('GET', `/api/tests/${id}`);
}

/**
 * @param {{ title?: string, description?: string }} data
 */
export async function createTest(data) {
  return apiFetch('POST', '/api/tests', data);
}

/**
 * @param {string} id
 * @param {{ title?: string, description?: string }} data
 */
export async function updateTest(id, data) {
  return apiFetch('PATCH', `/api/tests/${id}`, data);
}

/**
 * @param {string} id
 */
export async function deleteTest(id) {
  return apiFetch('DELETE', `/api/tests/${id}`);
}

/**
 * Upload a .docx file to create/import a test.
 * @param {File} file
 * @param {{ title?: string }} [params]
 */
export async function uploadTestDocx(file, params) {
  const form = new FormData();
  form.append('file', file);
  if (params?.title) form.append('title', params.title);
  return apiFetch('POST', '/api/tests/upload', form);
}
