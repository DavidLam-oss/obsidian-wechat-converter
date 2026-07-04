import { isRecord, parseJsonRecord, toOptionalNumber, toOptionalText, toRecord } from './record-utils.js';

/**
 * @param {unknown} response
 * @returns {{ status: number, json?: unknown, text: string, arrayBuffer?: () => Promise<ArrayBuffer>, headers: Record<string, string> }}
 */
function normalizeRequestUrlResponse(response) {
  const record = toRecord(response);
  const status = toOptionalNumber(record.status) ?? 200;
  const headers = /** @type {Record<string, string>} */ (toRecord(record.headers));
  return {
    status,
    json: record.json,
    text: toOptionalText(record.text),
    arrayBuffer: typeof record.arrayBuffer === 'function' ? /** @type {() => Promise<ArrayBuffer>} */ (record.arrayBuffer.bind(response)) : undefined,
    headers,
  };
}

/**
 * @param {{ json?: unknown }} response
 * @returns {Record<string, unknown>}
 */
function getResponseJsonRecord(response) {
  return toRecord(response.json);
}

/**
 * @param {{ status: number, json?: unknown, text: string }} response
 * @returns {string}
 */
function getProxyErrorMessage(response) {
  const body = isRecord(response.json) ? response.json : parseJsonRecord(response.text);
  const bodyError = body.error;
  if (typeof bodyError === 'string' && bodyError) return bodyError;
  return response.text || `Request failed, status ${response.status}`;
}

/**
 * @param {string} message
 * @param {boolean} isAuthFailure
 * @returns {Error & { isProxyAuth?: boolean, isFatal?: boolean }}
 */
function createProxyError(message, isAuthFailure) {
  const error = /** @type {Error & { isProxyAuth?: boolean, isFatal?: boolean }} */ (new Error(message));
  if (isAuthFailure) {
    error.isProxyAuth = true;
    error.isFatal = true;
  }
  return error;
}

export {
  normalizeRequestUrlResponse,
  getResponseJsonRecord,
  getProxyErrorMessage,
  createProxyError,
};
