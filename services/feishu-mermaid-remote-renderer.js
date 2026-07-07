/*
## 核心功能

实现飞书云文档同步链路的 feishu mermaid remote renderer 服务能力。

## 输入

接收飞书设置、Markdown/HTML 内容、本地图片、Mermaid 图和飞书 API 响应。

## 输出

输出 `DEFAULT_KROKI_MAX_IMAGE_BYTES`、`DEFAULT_KROKI_MERMAID_PNG_ENDPOINT`、`normalizeKrokiEndpoint`、`renderMermaidWithKroki`，用于文档创建/更新、媒体上传、块写入或错误恢复。

## 定位

位于 services/，属于飞书发布服务层；不承载微信专属逻辑。

## 依赖

关键依赖：`./dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { getActiveWindowValue } from './dom-utils.js';

/**
 * @typedef {(options: Record<string, unknown>) => Promise<unknown> | unknown} RequestUrlLike
 * @typedef {{ from: (bytes: Uint8Array) => { toString: (encoding: string) => string } }} BufferLike
 * @typedef {{ arrayBuffer?: () => Promise<unknown> | unknown, raw?: unknown, buffer?: unknown, status?: unknown, headers?: unknown }} ResponseLike
 * @typedef {{ requestUrl?: RequestUrlLike | null, endpoint?: string, timeoutMs?: number, maxImageBytes?: number }} KrokiRenderOptions
 */

const DEFAULT_KROKI_MERMAID_PNG_ENDPOINT = 'https://kroki.io/mermaid/png';
const DEFAULT_KROKI_TIMEOUT_MS = 15000;
const DEFAULT_KROKI_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * @param {unknown} binary
 * @returns {Uint8Array}
 */
function toUint8Array(binary) {
  if (binary instanceof Uint8Array) return binary;
  if (binary instanceof ArrayBuffer) return new Uint8Array(binary);
  if (ArrayBuffer.isView(binary)) {
    return new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
  }
  return new Uint8Array(0);
}

/**
 * @param {unknown} value
 * @returns {value is BufferLike}
 */
function isBufferLike(value) {
  if (!value || typeof value !== 'object') return false;
  const from = /** @type {{ from?: unknown }} */ (value).from;
  return typeof from === 'function';
}

/**
 * @returns {BufferLike | null}
 */
function getBufferConstructor() {
  const bufferCtor = getActiveWindowValue('Buffer');
  return isBufferLike(bufferCtor) ? bufferCtor : null;
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64(bytes) {
  const BufferCtor = getBufferConstructor();
  if (BufferCtor) {
    return BufferCtor.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

/**
 * @param {unknown} value
 * @returns {ResponseLike}
 */
function toResponseLike(value) {
  return value && typeof value === 'object'
    ? /** @type {ResponseLike} */ (value)
    : {};
}

/**
 * @param {unknown} response
 * @returns {Promise<Uint8Array>}
 */
async function readResponseBytes(response) {
  const record = toResponseLike(response);
  const readArrayBuffer = record.arrayBuffer;
  if (typeof readArrayBuffer === 'function') {
    return toUint8Array(await readArrayBuffer());
  }
  return toUint8Array(record.arrayBuffer || record.raw || record.buffer);
}

/**
 * @param {unknown} headers
 * @param {string} name
 * @returns {string}
 */
function getHeaderValue(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const target = String(name || '').toLowerCase();
  const source = /** @type {Record<string, unknown>} */ (headers);
  const key = Object.keys(source).find((item) => item.toLowerCase() === target);
  return key ? String(source[key] || '') : '';
}

/**
 * @param {unknown} endpoint
 * @returns {string}
 */
function normalizeKrokiEndpoint(endpoint) {
  const value = String(endpoint || DEFAULT_KROKI_MERMAID_PNG_ENDPOINT).trim();
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      throw new Error('Kroki 渲染服务必须使用 HTTPS');
    }
    return url.toString();
  } catch (error) {
    if (error instanceof Error && error.message === 'Kroki 渲染服务必须使用 HTTPS') throw error;
    throw new Error('Kroki 渲染服务地址无效');
  }
}

/**
 * @param {unknown} source
 * @param {KrokiRenderOptions} [options]
 * @returns {Promise<string>}
 */
async function renderMermaidWithKroki(source, options = {}) {
  const mermaidSource = String(source || '').trim();
  if (!mermaidSource) return '';
  const requestUrl = options.requestUrl;
  if (typeof requestUrl !== 'function') {
    throw new Error('当前环境缺少 requestUrl，无法远端渲染 Mermaid');
  }

  const endpoint = normalizeKrokiEndpoint(options.endpoint);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_KROKI_TIMEOUT_MS;
  const maxImageBytes = Number(options.maxImageBytes) > 0
    ? Number(options.maxImageBytes)
    : DEFAULT_KROKI_MAX_IMAGE_BYTES;
  let timeoutId = 0;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error('Kroki Mermaid 渲染超时'));
    }, timeoutMs);
  });

  try {
    const response = await requestKrokiWithTimeout(requestUrl, {
      url: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'image/png',
      },
      body: JSON.stringify({
        diagram_source: mermaidSource,
      }),
      throw: false,
    }, timeoutPromise);
    const responseRecord = toResponseLike(response);
    const status = Number(responseRecord.status || 0);
    if (status >= 400) {
      throw new Error(`Kroki Mermaid 渲染失败 (${status})`);
    }
    const bytes = await readResponseBytes(response);
    if (!bytes.byteLength) {
      throw new Error('Kroki Mermaid 渲染失败 (empty body)');
    }
    if (bytes.byteLength > maxImageBytes) {
      throw new Error(`Kroki Mermaid 渲染图片过大 (${bytes.byteLength} bytes)`);
    }
    const contentType = getHeaderValue(responseRecord.headers, 'content-type') || 'image/png';
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error('Kroki Mermaid 渲染返回了非图片内容');
    }
    return `data:image/png;base64,${bytesToBase64(bytes)}`;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

/**
 * @param {RequestUrlLike} requestUrl
 * @param {Record<string, unknown>} options
 * @param {Promise<unknown>} timeoutPromise
 * @returns {Promise<unknown>}
 */
function requestKrokiWithTimeout(requestUrl, options, timeoutPromise) {
  const requestPromise = Promise.resolve(requestUrl(options));
  return Promise.race([requestPromise, timeoutPromise]);
}

export {
  DEFAULT_KROKI_MAX_IMAGE_BYTES,
  DEFAULT_KROKI_MERMAID_PNG_ENDPOINT,
  normalizeKrokiEndpoint,
  renderMermaidWithKroki,
};
