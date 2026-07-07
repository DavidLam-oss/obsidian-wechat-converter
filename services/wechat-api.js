/*
## 核心功能

实现微信公众号同步链路的 wechat api 服务能力。

## 输入

接收插件设置、账号凭证、文章 HTML、图片资源、frontmatter 元数据和微信 API 响应。

## 输出

输出 `WechatAPI`、`toReadableError`、`formatWechatApiError`、`default export`，用于草稿创建/更新、素材上传、清洗、缓存或错误呈现。

## 定位

位于 services/，属于微信发布服务层；不直接操作设置页 DOM。

## 依赖

关键依赖：`./obsidian-compat.js`、`./concurrency.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { getObsidianRequestUrl } from './obsidian-compat.js';
import { sleep } from './concurrency.js';

function toReadableError(error) {
  if (error instanceof Error) return /** @type {ReadableErrorLike} */ (error);
  if (error && typeof error === 'object') {
    const record = /** @type {{ message?: unknown, isFatal?: unknown, isProxyAuth?: unknown }} */ (error);
    return {
      message: typeof record.message === 'string' ? record.message : String(error),
      isFatal: record.isFatal === true,
      isProxyAuth: record.isProxyAuth === true,
    };
  }
  return { message: String(error || '') };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */

function toRecord(value) {
  return isRecord(value) ? value : {};
}

/**
 * @param {unknown} value
 * @returns {AiLayoutStateLike | null}
 */

function toOptionalText(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * @param {unknown} value
 * @returns {HTMLImageElement[]}
 */

function toOptionalNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */

function parseJsonRecord(value) {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    return toRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

/**
 * @param {unknown} response
 * @returns {RequestUrlResponseLike}
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
 * @param {RequestUrlResponseLike} response
 * @returns {Record<string, unknown>}
 */

function getResponseJsonRecord(response) {
  return toRecord(response.json);
}

/**
 * @param {RequestUrlResponseLike} response
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

/**
 * @param {Record<string, unknown>} data
 * @returns {string}
 */

function formatWechatApiError(data) {
  const errmsg = typeof data.errmsg === 'string' ? data.errmsg : JSON.stringify(data);
  const errcode = data.errcode ?? 'N/A';
  return `${errmsg} (${errcode})`;
}

/**
 * @param {Record<string, unknown>} data
 * @returns {boolean}
 */

function hasWechatUploadResult(data) {
  return typeof data.media_id === 'string' || typeof data.url === 'string';
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */

function readBlobAsBase64Payload(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file data'));
    reader.readAsDataURL(blob);
  });
}


export class WechatAPI {
  /**
   * @param {string} appId
   * @param {string} appSecret
   * @param {string} [proxyUrl]
   * @param {string} [clientId]
   */
  constructor(appId, appSecret, proxyUrl = '', clientId = '') {
    /** @type {string} */
    this.appId = appId;
    /** @type {string} */
    this.appSecret = appSecret;
    /** @type {string} */
    this.proxyUrl = proxyUrl;
    /** @type {string} */
    this.clientId = clientId;
    /** @type {string} */
    this.accessToken = '';
    /** @type {number} */
    this.expireTime = 0;
  }

  /**
   * @template T
   * 通用重试机制 (仅处理网络层面的不稳定性)
   * 不再处理 Token 逻辑，专注于网络波动和配置错误
   * @param {() => Promise<T>} operation
   * @param {number} [maxRetries]
   * @returns {Promise<T>}
   */
  async requestWithRetry(operation, maxRetries = 3) {
    /** @type {() => Promise<unknown>} */
    const operationFn = operation;
    /** @type {unknown} */
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operationFn();
      } catch (error) {
        const readableError = toReadableError(error);
        lastError = error;

        // 0. 通用熔断：如果错误已被标记为致命，直接抛出
        if (readableError.isFatal) throw error;

        // 识别配置错误 (AppID/Secret 错误)，直接失败
        const isConfigError = readableError.message && (
            readableError.message.includes('(40013)') || // invalid appid
            readableError.message.includes('(40125)') || // invalid appsecret
            readableError.message.includes('invalid appid')
        );

        if (isConfigError) {
           console.warn(`[WechatAPI] Configuration error detected, aborting retry: ${readableError.message}`);
           throw error;
        }

        // 熔断机制：识别致命错误 (配额超限/素材满)，立即停止重试并向上抛出
        // 45009: 接口调用频次达到上限 (日限额)
        if (readableError.message && (readableError.message.includes('45009') || readableError.message.includes('reach max api daily quota limit'))) {
            const fatalError = new Error('微信接口今日额度已用完 (45009)，请明天再试或切换账号。');
            fatalError.isFatal = true;
            throw fatalError;
        }

        // 45001: 素材数量达到上限或图片大小超限
        if (readableError.message && (readableError.message.includes('45001') || readableError.message.includes('media size out of limit'))) {
            const fatalError = new Error('微信上传失败 (45001)。可能原因：\n1. 素材库已满 - 请登录微信公众平台 -> 素材管理，删除旧图片释放空间\n2. 图片太大 - 请检查封面或正文图片是否过大');
            fatalError.isFatal = true;
            throw fatalError;
        }

        // 识别 Token 过期错误，直接失败，交由上层 actionWithTokenRetry 处理刷新
        const isTokenError = readableError.message && (
            readableError.message.includes('40001') ||
            readableError.message.includes('42001') ||
            readableError.message.includes('40014')
        );

        if (isTokenError) {
            // console.warn(`[WechatAPI] Token error detected in retry layer, bubbling up: ${error.message}`);
            throw error;
        }

        // 识别业务层明确错误 (已收到微信响应但报错)，直接失败，避免无意义重试
        // 排除 -1 (系统繁忙) 这种情况可以重试
        const isBusinessError = readableError.message && readableError.message.includes('微信API报错') && !readableError.message.includes('(-1)');
        if (isBusinessError) {
             console.warn(`[WechatAPI] Business logic error detected, aborting retry: ${readableError.message}`);
             throw error;
        }

        console.warn(`[WechatAPI] Network request failed (attempt ${i + 1}/${maxRetries}): ${readableError.message}`);

        if (i < maxRetries - 1) {
          await sleep(1000 * (i + 1)); // 线性退避: 1s, 2s, 3s
        }
      }
    }
    throw lastError;
  }

  /**
   * @template T
   * 高阶函数：执行带 Token 生命周期管理的操作
   * 负责：获取 Token -> 执行操作 -> 捕获 Token 过期错误 -> 刷新 Token -> 重试
   * @param {(token: string) => Promise<T>} action
   * @returns {Promise<T>}
   */
  async actionWithTokenRetry(action) {
    /** @type {(token: string) => Promise<unknown>} */
    const actionFn = action;
    let retryCount = 0;
    const maxRetries = 1; // Token 过期只重试一次

    while (true) {
      try {
        const token = await this.getAccessToken();
        return await actionFn(token);
      } catch (error) {
        const readableError = toReadableError(error);
        // 检查是否是 Token 过期 (40001, 42001, 40014)
        const isTokenExpired = readableError.message && (
          readableError.message.includes('40001') ||
          readableError.message.includes('42001') ||
          readableError.message.includes('40014')
        );

        if (isTokenExpired && retryCount < maxRetries) {
          console.warn(`[WechatAPI] Token expired (${readableError.message}), refreshing and retrying...`);
          this.accessToken = ''; // 1. 清除本地缓存
          retryCount++;
          continue; // 2. 重新循环：再次调用 getAccessToken (会触发新请求) -> 执行 action (使用新 Token 拼接 URL)
        }

        throw error; // 其他错误或重试次数耗尽，向上抛出
      }
    }
  }

  /**
   * 验证代理 URL 安全性 (必须使用 HTTPS)
   */
  validateProxyUrl(proxyUrl) {
    const normalizedProxyUrl = String(proxyUrl || '');
    if (normalizedProxyUrl && !normalizedProxyUrl.toLowerCase().startsWith('https://')) {
      const error = new Error('Security Error: Insecure HTTP proxy blocked. Proxy URL must use HTTPS.');
      error.isFatal = true; // 禁止重试
      throw error;
    }
  }

  /**
   * 发送请求（如果配置了代理，通过代理发送）
   * 纯粹的 HTTP 请求封装，不包含重试逻辑
   * @param {string} url
   * @param {RequestUrlOptionsLike} [options]
   * @returns {Promise<Record<string, unknown>>}
   */
  async sendRequest(url, options = {}) {

    if (this.proxyUrl) {
      this.validateProxyUrl(this.proxyUrl);

      // 通过代理发送
      const headers = { 'Content-Type': 'application/json' };
      if (this.clientId) {
        headers['X-Client-Id'] = this.clientId;
      }

      const requestBody = options.body ? parseJsonRecord(options.body) : undefined;
      const proxyResponse = normalizeRequestUrlResponse(await getObsidianRequestUrl()({
        url: this.proxyUrl,
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          url: url,
          method: options.method || 'GET',
          data: requestBody
        }),
        contentType: 'application/json',
        throw: false
      }));

      if (proxyResponse.status < 200 || proxyResponse.status >= 300) {
        throw createProxyError(getProxyErrorMessage(proxyResponse), proxyResponse.status === 403 || proxyResponse.status === 401);
      }

      return /** @type {Record<string, unknown>} */ (getResponseJsonRecord(proxyResponse));
    } else {
      // 直连
      const response = normalizeRequestUrlResponse(await getObsidianRequestUrl()({ url, ...options }));
      return /** @type {Record<string, unknown>} */ (getResponseJsonRecord(response));
    }
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.expireTime - 300000) {
      return this.accessToken;
    }

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`;
    // 网络重试包裹
    const data = /** @type {Record<string, unknown>} */ (await this.requestWithRetry(() => this.sendRequest(url)));

    const accessToken = toOptionalText(data.access_token);
    if (accessToken) {
      this.accessToken = accessToken;
      this.expireTime = Date.now() + ((toOptionalNumber(data.expires_in) ?? 7200) * 1000);
      return this.accessToken;
    } else {
      throw new Error(`获取 Token 失败: ${data.errmsg || '未知错误'} (${data.errcode || '??'})`);
    }
  }

  /**
   * @param {Blob} blob
   * @returns {Promise<Record<string, unknown>>}
   */
  async uploadCover(blob) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=image`;
      return await this.uploadMultipart(url, blob, 'media');
    });
  }

  /**
   * @param {Blob} blob
   * @returns {Promise<Record<string, unknown>>}
   */
  async uploadImage(blob) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${token}`;
      return await this.uploadMultipart(url, blob, 'media');
    });
  }

  /**
   * @param {string} type
   * @param {number} [offset]
   * @param {number} [count]
   * @returns {Promise<WechatMaterialPageLike>}
   */
  async batchGetMaterials(type, offset = 0, count = 20) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token=${token}`;
      const data = /** @type {Record<string, unknown>} */ (await this.requestWithRetry(() => this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ type, offset, count })
      })));
      if (Array.isArray(data.item) || data.item_count !== undefined || data.total_count !== undefined) {
        return /** @type {Record<string, unknown>} */ (data);
      }
      throw new Error(`微信API报错: ${formatWechatApiError(data)}`);
    });
  }

  /**
   * @param {Record<string, unknown>} article
   * @returns {Promise<Record<string, unknown>>}
   */
  async createDraft(article) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;

      // ⚠️ 关键修正: createDraft 非幂等，不使用 requestWithRetry 自动重试网络超时，
      // 避免在"请求成功但响应丢失"的情况下创建重复草稿。
      // 失败后由用户手动点击同步更安全。
      const data = /** @type {Record<string, unknown>} */ (await this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ articles: [article] })
      }));

      if (typeof data.media_id === 'string' && data.media_id) {
        return data;
      }
      throw new Error(`创建草稿失败: ${formatWechatApiError(data)}`);
    });
  }

  /**
   * @returns {Promise<Record<string, unknown>>}
   */
  async getDraftCount() {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/count?access_token=${token}`;
      return /** @type {Record<string, unknown>} */ (await this.requestWithRetry(() => this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({})
      })));
    });
  }

  /**
   * @param {number} [offset]
   * @param {number} [count]
   * @param {number} [noContent]
   * @returns {Promise<Record<string, unknown>>}
   */
  async batchGetDrafts(offset = 0, count = 20, noContent = 1) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/batchget?access_token=${token}`;
      return /** @type {Record<string, unknown>} */ (await this.requestWithRetry(() => this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ offset, count, no_content: noContent })
      })));
    });
  }

  /**
   * @param {string} mediaId
   * @returns {Promise<Record<string, unknown>>}
   */
  async getDraft(mediaId) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/get?access_token=${token}`;
      return /** @type {Record<string, unknown>} */ (await this.requestWithRetry(() => this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ media_id: mediaId })
      })));
    });
  }

  /**
   * @param {string} mediaId
   * @param {number} index
   * @param {Record<string, unknown>} article
   * @returns {Promise<Record<string, unknown>>}
   */
  async updateDraft(mediaId, index, article) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/update?access_token=${token}`;
      const data = /** @type {Record<string, unknown>} */ (await this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ media_id: mediaId, index, articles: article })
      }));
      if (data.errcode === 0 || data.errmsg === 'ok') {
        return { media_id: mediaId };
      }
      throw new Error(`更新草稿失败: ${formatWechatApiError(data)}`);
    });
  }

  /**
   * @param {string} url
   * @param {Blob} blob
   * @param {string} fieldName
   * @returns {Promise<Record<string, unknown>>}
   */
  async uploadMultipart(url, blob, fieldName) {
    return this.requestWithRetry(async () => {

      // 获取真实的 MIME 类型和文件扩展名
      const mimeType = blob.type || 'image/jpeg';
      const ext = mimeType.includes('gif') ? 'gif' : mimeType.includes('png') ? 'png' : 'jpg';

      if (this.proxyUrl) {
        this.validateProxyUrl(this.proxyUrl);

        // 通过代理发送：将文件转为 base64 (使用 FileReader 提升性能)
        const base64Data = await readBlobAsBase64Payload(blob);

        const headers = { 'Content-Type': 'application/json' };
        if (this.clientId) {
          headers['X-Client-Id'] = this.clientId;
        }

        const proxyResponse = normalizeRequestUrlResponse(await getObsidianRequestUrl()({
          url: this.proxyUrl,
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            url: url,
            method: 'UPLOAD',  // 特殊标记，告诉代理这是文件上传
            fileData: base64Data,
            fileName: `image.${ext}`,
            mimeType: mimeType,
            fieldName: fieldName
          }),
          contentType: 'application/json',
          throw: false
        }));

        if (proxyResponse.status < 200 || proxyResponse.status >= 300) {
          throw createProxyError(getProxyErrorMessage(proxyResponse), proxyResponse.status === 403 || proxyResponse.status === 401);
        }

        const data = /** @type {Record<string, unknown>} */ (getResponseJsonRecord(proxyResponse));
        if (hasWechatUploadResult(data)) {
          return data;
        } else {
          throw new Error(`微信API报错: ${formatWechatApiError(data)}`);
        }
      } else {
        // 直连：原有逻辑
        const boundary = '----ObsidianWechatConverterBoundary' + Math.random().toString(36).substring(2);
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        let header = `--${boundary}\r\n`;
        header += `Content-Disposition: form-data; name="${fieldName}"; filename="image.${ext}"\r\n`;
        header += `Content-Type: ${mimeType}\r\n\r\n`;
        const footer = `\r\n--${boundary}--\r\n`;

        const headerBytes = new TextEncoder().encode(header);
        const footerBytes = new TextEncoder().encode(footer);

        const bodyBytes = new Uint8Array(headerBytes.length + bytes.length + footerBytes.length);
        bodyBytes.set(headerBytes, 0);
        bodyBytes.set(bytes, headerBytes.length);
        bodyBytes.set(footerBytes, headerBytes.length + bytes.length);

        try {
          const response = normalizeRequestUrlResponse(await getObsidianRequestUrl()({
            url: url,
            method: 'POST',
            body: bodyBytes.buffer,
            headers: {
              'Content-Type': `multipart/form-data; boundary=${boundary}`
            }
          }));

          const data = /** @type {Record<string, unknown>} */ (getResponseJsonRecord(response));
          if (hasWechatUploadResult(data)) {
            return data;
          } else {
            throw new Error(`微信API报错: ${formatWechatApiError(data)}`);
          }
        } catch (error) {
          console.error('Upload Error:', error);
          throw new Error(`网络请求失败: ${toReadableError(error).message}`);
        }
      }
    });
  }
}

export default WechatAPI;
export { toReadableError, formatWechatApiError };
