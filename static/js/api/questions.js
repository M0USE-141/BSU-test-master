/**
 * questions.js — test questions API wrapper
 */
import { apiFetch } from './_fetch.js';

/**
 * @param {string} testId
 * @param {{ text: string, options: any[], correct: number|number[] }} data
 */
export async function addQuestion(testId, data) {
  return apiFetch('POST', `/api/tests/${testId}/questions`, data);
}

/**
 * @param {string} testId
 * @param {string} questionId
 * @param {Partial<{ text: string, options: any[], correct: number|number[] }>} data
 */
export async function updateQuestion(testId, questionId, data) {
  return apiFetch('PATCH', `/api/tests/${testId}/questions/${questionId}`, data);
}

/**
 * @param {string} testId
 * @param {string} questionId
 */
export async function deleteQuestion(testId, questionId) {
  return apiFetch('DELETE', `/api/tests/${testId}/questions/${questionId}`);
}
