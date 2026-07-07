/*
## 核心功能

提供服务层通用能力：request utils。

## 输入

接收上游视图、转换器、同步服务或工具脚本传入的数据。

## 输出

输出 `normalizeRequestUrlResponse`、`getResponseJsonRecord`、`getProxyErrorMessage`、`createProxyError`，供项目内其他模块复用。

## 定位

位于 services/，是共享服务模块；保持输入输出清晰，避免引入 UI 状态耦合。

## 依赖

关键依赖：`./record-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

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
