/**
 * tests.js — tests API wrapper
 */
import { apiFetch } from './_fetch.js';
import { getAccessToken } from '../state.js';

/**
 * @param {{ filter?: string, search?: string, page?: number, limit?: number,
 *           with_stats?: boolean, sort?: 'new'|'popular'|'best' }} [params]
 *
 * When `with_stats` is true (or `sort` is set), each returned test
 * carries `attempts_count` and `avg_score` so the caller can render
 * discover-style cards or sort client-side after the fact.
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
 * @param {{ title?: string, description?: string, access_level?: 'private'|'shared'|'public', symbol?: string }} [params]
 */
export async function uploadTestDocx(file, params) {
  const form = new FormData();
  form.append('file', file);
  if (params?.title)        form.append('title', params.title);
  if (params?.description)  form.append('description', params.description);
  if (params?.access_level) form.append('access_level', params.access_level);
  if (params?.symbol)       form.append('symbol', params.symbol);
  return apiFetch('POST', '/api/tests/upload', form);
}

/**
 * Same upload but with progress + extraction-phase callbacks. Uses XHR
 * directly so we can observe both the upload bytes and the moment the
 * server flips from receiving to parsing.
 *
 * @param {File} file
 * @param {Object} params { title, description, access_level, symbol }
 * @param {Object} hooks  { onUploadProgress(pct), onUploadComplete(), onExtractStart(), signal }
 */
export function uploadTestDocxWithProgress(file, params, hooks) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    if (params?.title)        form.append('title', params.title);
    if (params?.description)  form.append('description', params.description);
    if (params?.access_level) form.append('access_level', params.access_level);
    if (params?.symbol)       form.append('symbol', params.symbol);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/tests/upload', true);
    xhr.withCredentials = true;

    // Attach in-memory bearer token (same path apiFetch takes).
    const tok = getAccessToken();
    if (tok) xhr.setRequestHeader('Authorization', 'Bearer ' + tok);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && hooks?.onUploadProgress) {
        hooks.onUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.upload.addEventListener('load', () => {
      hooks?.onUploadComplete?.();
      // Once bytes are in we know the server is in the parse phase.
      hooks?.onExtractStart?.();
    });
    xhr.addEventListener('load', () => {
      let body;
      try { body = JSON.parse(xhr.responseText); }
      catch { body = { detail: xhr.responseText }; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(Object.assign(new Error(body?.detail || `HTTP ${xhr.status}`), {
        status: xhr.status, payload: body,
      }));
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
    hooks?.signal?.addEventListener?.('abort', () => xhr.abort());

    xhr.send(form);
  });
}
