/*
## 核心功能

提供服务层通用能力：obsidian fetch adapter。

## 输入

接收上游视图、转换器、同步服务或工具脚本传入的数据。

## 输出

输出 `parseJsonResponseText`、`isJsonParseFailure`、`createObsidianFetchAdapter`，供项目内其他模块复用。

## 定位

位于 services/，是共享服务模块；保持输入输出清晰，避免引入 UI 状态耦合。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/**
 * @typedef {Record<string, unknown>} UnknownRecord
 * @typedef {Record<string, string>} HeaderRecord
 * @typedef {{ aborted?: boolean, addEventListener?: (type: string, listener: () => void, options?: unknown) => void, removeEventListener?: (type: string, listener: () => void) => void }} AbortSignalLike
 * @typedef {{ url: string, method: string, headers?: HeaderRecord, body?: unknown, contentType?: string, throw: boolean }} RequestOptions
 * @typedef {(options: RequestOptions) => Promise<unknown> | unknown} RequestImpl
 * @typedef {{ requestUrl?: RequestImpl, request?: RequestImpl }} RequestSourceObject
 * @typedef {{ status: number, text?: unknown, json?: unknown, headers?: unknown }} ObsidianResponse
 */

/**
 * @param {unknown} value
 * @returns {value is UnknownRecord}
 */
function isRecord(value) {
  return !!value && typeof value === 'object';
}

/**
 * @param {unknown} value
 * @returns {UnknownRecord}
 */
function asRecord(value) {
  return isRecord(value) ? /** @type {UnknownRecord} */ (value) : {};
}

function createAbortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

/**
 * @param {unknown} headers
 * @returns {HeaderRecord | undefined}
 */
function normalizeHeaders(headers) {
  if (!headers) return undefined;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return /** @type {HeaderRecord} */ (Object.fromEntries(headers.entries()));
  }
  if (Array.isArray(headers)) {
    /** @type {HeaderRecord} */
    const result = {};
    for (const entry of headers) {
      const pair = Array.isArray(entry) ? entry : [];
      const key = String(pair[0] || '');
      if (key) result[key] = String(pair[1] || '');
    }
    return result;
  }
  const source = asRecord(headers);
  return /** @type {HeaderRecord} */ (Object.fromEntries(Object.entries(source).map(([key, value]) => [key, String(value)])));
}

/**
 * @param {unknown} headers
 * @param {unknown} name
 * @returns {string | undefined}
 */
function getHeaderValue(headers, name) {
  const normalized = normalizeHeaders(headers);
  if (!normalized) return undefined;
  const target = String(name || '').toLowerCase();
  const match = Object.keys(normalized).find((key) => key.toLowerCase() === target);
  return match ? String(normalized[match]) : undefined;
}

/** @param {unknown} text */
function findFirstJsonContainer(text) {
  const source = String(text || '');
  const objectStart = source.indexOf('{');
  const arrayStart = source.indexOf('[');
  if (objectStart === -1) return arrayStart;
  if (arrayStart === -1) return objectStart;
  return Math.min(objectStart, arrayStart);
}

/**
 * @param {unknown} text
 * @param {number} startIndex
 */
function findJsonContainerEnd(text, startIndex) {
  const source = String(text || '');
  const firstChar = source[startIndex];
  const stack = firstChar === '{' ? ['}'] : firstChar === '[' ? [']'] : [];
  if (!stack.length) return -1;

  let inString = false;
  let escaped = false;

  for (let index = startIndex + 1; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      stack.push('}');
      continue;
    }

    if (char === '[') {
      stack.push(']');
      continue;
    }

    const expectedClose = stack[stack.length - 1];
    if (char === expectedClose) {
      stack.pop();
      if (!stack.length) return index + 1;
    }
  }

  return -1;
}

/** @param {unknown} text */
export function parseJsonResponseText(text) {
  const source = String(text || '');
  if (!source.trim()) return null;

  try {
    return /** @type {unknown} */ (JSON.parse(source));
  } catch (error) {
    const startIndex = findFirstJsonContainer(source);
    if (startIndex === -1) throw error;

    const endIndex = findJsonContainerEnd(source, startIndex);
    if (endIndex === -1) throw error;

    try {
      return /** @type {unknown} */ (JSON.parse(source.slice(startIndex, endIndex)));
    } catch {
      throw error;
    }
  }
}

/**
 * @param {unknown} requestSource
 * @returns {{ requestUrlImpl: RequestImpl | null, requestTextImpl: RequestImpl | null }}
 */
function resolveRequestImplementations(requestSource) {
  if (typeof requestSource === 'function') {
    return {
      requestUrlImpl: /** @type {RequestImpl} */ (requestSource),
      requestTextImpl: null,
    };
  }
  const source = /** @type {RequestSourceObject} */ (asRecord(requestSource));
  return {
    requestUrlImpl: typeof source.requestUrl === 'function' ? source.requestUrl : null,
    requestTextImpl: typeof source.request === 'function' ? source.request : null,
  };
}

/** @param {unknown} error */
export function isJsonParseFailure(error) {
  if (error instanceof SyntaxError) return true;
  const source = asRecord(error);
  const message = String(source.message || error || '');
  return /json|unexpected non-whitespace|unexpected token|parse/i.test(message);
}

/**
 * @param {unknown} response
 * @returns {ObsidianResponse}
 */
function normalizeResponse(response) {
  const source = asRecord(response);
  return {
    status: Number.isFinite(Number(source.status)) ? Number(source.status) : 0,
    text: source.text,
    json: source.json,
    headers: source.headers || {},
  };
}

/**
 * @param {unknown} requestSource
 * @returns {(url: string, options?: { signal?: AbortSignalLike, headers?: unknown, method?: string, body?: unknown }) => Promise<{
 *   ok: boolean,
 *   status: number,
 *   statusText: string,
 *   headers: unknown,
 *   text: () => Promise<string>,
 *   json: () => Promise<unknown>,
 * }>}
 */
export function createObsidianFetchAdapter(requestSource) {
  const { requestUrlImpl, requestTextImpl } = resolveRequestImplementations(requestSource);
  if (typeof requestUrlImpl !== 'function') {
    throw new Error('Obsidian requestUrl is not available');
  }

  return async function obsidianFetchAdapter(url, options = {}) {
    const signal = options.signal;
    if (signal?.aborted) {
      throw createAbortError();
    }

    /** @type {(() => void) | null} */
    let abortHandler = null;
    const abortPromise = signal
      ? new Promise((_, reject) => {
        abortHandler = () => reject(createAbortError());
        signal.addEventListener?.('abort', abortHandler, { once: true });
      })
      : null;

    try {
      const headers = normalizeHeaders(options.headers);
      const requestOptions = {
        url: String(url || ''),
        method: options.method || 'GET',
        headers,
        body: options.body,
        contentType: getHeaderValue(headers, 'content-type'),
        throw: false,
      };
      /** @param {Promise<unknown>} promise */
      const withAbort = (promise) => (abortPromise ? Promise.race([promise, abortPromise]) : promise);
      /** @type {ObsidianResponse} */
      let response;
      try {
        response = normalizeResponse(await withAbort(Promise.resolve(requestUrlImpl(requestOptions))));
      } catch (error) {
        if (typeof requestTextImpl !== 'function' || !isJsonParseFailure(error)) {
          throw error;
        }
        const text = String(await withAbort(Promise.resolve(requestTextImpl(requestOptions))) || '');
        response = {
          status: 200,
          text,
          headers: {},
        };
      }
      const responseText = response?.text !== undefined
        ? String(response.text)
        : (response?.json !== undefined ? JSON.stringify(response.json) : '');

      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        statusText: String(response.status || ''),
        headers: response.headers || {},
        text: async () => responseText,
        json: async () => {
          if (response?.json !== undefined) return /** @type {unknown} */ (response.json);
          return parseJsonResponseText(responseText);
        },
      };
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener?.('abort', abortHandler);
      }
    }
  };
}
