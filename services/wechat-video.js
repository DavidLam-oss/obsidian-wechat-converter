/*
## 核心功能

实现微信公众号同步链路的视频素材上传（add_material?type=video）与正文草稿嵌入处理。
支持本地 MP4 视频与在线 MP4 视频，前置校验大小与格式，提供文件指纹缓存避免重复上传。

## 输入

接收文章 HTML、微信 API 实例、srcToBlob、上传缓存与进度回调。

## 输出

输出包含 `<mpvideo>` 嵌入标签的正文 HTML，或在失败时输出优雅占位提示。

## 定位

位于 services/，属于微信同步与媒体服务层；不直接操作设置页 DOM。

## 依赖

关键依赖：`./dom-utils.js`、`./obsidian-compat.js`、`./image-source-utils.js`、`./wechat-api-utils.js`。

## 维护规则

- 严格限制 10MB 和 MP4 格式，前置校验并提供明确中文错误提示。
- 在线视频先通过 HEAD 请求校验大小与格式，避免大文件无谓下载。
- 上传成功后将视频嵌入为 `<mpvideo data-pluginname="insertvideo" data-mediaid="..." data-title="..."></mpvideo>`。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: JS file handles dynamic DOM elements and WeChat API responses without strict typescript type annotations */

import { createHtmlContainer, getActiveDocument } from './dom-utils.js';
import { getObsidianRequestUrl } from './obsidian-compat.js';
import { readBlobAsBase64Payload } from './image-source-utils.js';
import { formatWechatApiError, hasWechatUploadResult } from './wechat-api-utils.js';

export const MAX_VIDEO_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const DISALLOWED_VIDEO_EXTENSIONS = new Set([
  'webm', 'mov', 'm3u8', 'avi', 'flv', 'mkv', 'wmv', 'rmvb', 'ts', 'ogg'
]);

/**
 * @typedef {{ media_id: string, url?: string }} WechatVideoUploadResult
 * @typedef {{ src: string, message: string }} FailedVideoInfo
 * @typedef {{ mediaId: string, fingerprint?: string, uploadedAt?: number }} VideoCacheEntry
 */

/**
 * 校验视频格式是否为 MP4
 * @param {string} pathOrName
 * @param {string} [mimeType]
 */
export function validateVideoFormat(pathOrName, mimeType = '') {
  const cleanPath = String(pathOrName || '').split('?')[0].split('#')[0];
  const ext = (cleanPath.split('.').pop() || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();

  if (ext && DISALLOWED_VIDEO_EXTENSIONS.has(ext)) {
    throw new Error(`仅支持 MP4 格式视频（检测到格式为 .${ext}，插件无转码能力）`);
  }
  if (mime && !mime.includes('mp4') && mime !== 'application/octet-stream' && mime !== 'video/*') {
    throw new Error(`仅支持 MP4 格式视频（检测到 MIME 为 ${mime}）`);
  }
  if (ext && ext !== 'mp4' && !mime.includes('mp4')) {
    throw new Error(`仅支持 MP4 格式视频（检测到文件为 .${ext}）`);
  }
}

/**
 * 校验视频文件大小
 * @param {number} sizeBytes
 */
export function validateVideoSize(sizeBytes) {
  if (typeof sizeBytes === 'number' && sizeBytes > MAX_VIDEO_SIZE_BYTES) {
    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
    throw new Error(`视频超过 10MB（大小约为 ${sizeMb}MB，微信接口上限为 10MB），请压缩后重试`);
  }
}

/**
 * 快速计算 FNV-1a Hash
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function hashBytesFNV1a(bytes) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 将 Blob 读取为 ArrayBuffer（兼顾浏览器与测试环境）
 * @param {Blob} blob
 * @returns {Promise<ArrayBuffer>}
 */
export async function blobToArrayBuffer(blob) {
  if (blob && typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {ArrayBuffer} */ (reader.result));
    reader.onerror = () => reject(reader.error || new Error('Failed to read Blob'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * 计算视频 Blob 的内容指纹
 * @param {Blob | null | undefined} blob
 * @returns {Promise<string>}
 */
export async function computeVideoFingerprint(blob) {
  if (!blob) return 'unknown';
  const buffer = await blobToArrayBuffer(blob);
  const bytes = new Uint8Array(buffer);
  const contentHash = hashBytesFNV1a(bytes);
  return `video/mp4:${bytes.length}:${contentHash}`;
}

/**
 * 从 URL 或路径中提取清晰的文件名称（不带扩展名）作为标题兜底
 * @param {string} src
 * @returns {string}
 */
export function extractVideoTitleFromSrc(src) {
  const clean = String(src || '').split('?')[0].split('#')[0];
  const fileName = clean.includes('/') ? clean.slice(clean.lastIndexOf('/') + 1) : clean;
  const title = fileName.replace(/\.[^/.]+$/, '').trim();
  return title || '视频';
}

/**
 * 安全拉取在线视频：先 HEAD 请求检查大小与格式，超限或非法格式提前阻断
 * @param {string} url
 * @param {Function} [customRequestUrl]
 * @returns {Promise<Blob>}
 */
export async function fetchOnlineVideo(url, customRequestUrl) {
  validateVideoFormat(url);

  const requestUrlFn = typeof customRequestUrl === 'function' ? customRequestUrl : getObsidianRequestUrl();
  if (typeof requestUrlFn !== 'function') {
    throw new Error('当前环境缺少 requestUrl，无法拉取在线视频');
  }

  // 1. 发起 HEAD 请求探测 Content-Length 与 Content-Type
  let headContentType = '';
  let headContentLength = 0;
  try {
    const headRes = await requestUrlFn({
      url,
      method: 'HEAD',
      throw: false,
    });

    if (headRes && typeof headRes === 'object') {
      const headers = /** @type {Record<string, string>} */ (headRes.headers || {});
      headContentType = headers['content-type'] || headers['Content-Type'] || '';
      const contentLengthHeader = headers['content-length'] || headers['Content-Length'];
      if (contentLengthHeader) {
        const lengthBytes = parseInt(contentLengthHeader, 10);
        if (Number.isFinite(lengthBytes) && lengthBytes > 0) {
          headContentLength = lengthBytes;
        }
      }
    }
  } catch (headErr) {
    // 若源站不支持 HEAD 请求（返回 405 等），记录并降级为 GET
    console.warn(`[wechat-video] 在线视频 HEAD 探测跳过: ${headErr?.message || headErr}`);
  }

  // HEAD 探测若发现超限或格式不符，提前阻断避免下载
  if (headContentType && !headContentType.includes('mp4') && !headContentType.includes('octet-stream')) {
    validateVideoFormat(url, headContentType);
  }
  if (headContentLength > 0) {
    validateVideoSize(headContentLength);
  }

  // 2. 发起 GET 请求拉取视频数据
  let response;
  try {
    response = await requestUrlFn({
      url,
      method: 'GET',
      throw: false,
    });
  } catch (err) {
    throw new Error(`拉取在线视频失败: ${err?.message || '网络连接异常'}`);
  }

  if (!response || response.status >= 400) {
    const status = response?.status || '异常';
    throw new Error(`拉取在线视频失败 (HTTP ${status}，可能是源站启用了防盗链): ${url}`);
  }

  const arrayBuffer = response.arrayBuffer;
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    throw new Error(`拉取在线视频失败：未获取到有效二进制数据: ${url}`);
  }

  validateVideoSize(arrayBuffer.byteLength);

  const headers = response.headers || {};
  const mimeType = headers['content-type'] || headers['Content-Type'] || 'video/mp4';
  validateVideoFormat(url, mimeType);

  return new Blob([arrayBuffer], { type: 'video/mp4' });
}

/**
 * 构造独立视频多部分表单上传（直连与代理双通道）
 * @param {object} params
 * @param {string} params.url 微信官方 API 地址
 * @param {Blob} params.blob 视频 Blob
 * @param {string} [params.proxyUrl] 可选代理地址
 * @param {string} [params.clientId] 可选客户端设备 ID
 * @param {string} [params.fileName='video.mp4']
 * @param {string} [params.title]
 * @param {string} [params.introduction]
 * @param {Function} params.requestWithRetry
 * @param {Function} [params.validateProxyUrl]
 * @param {Function} [params.requestUrl] 可选请求执行器
 * @returns {Promise<WechatVideoUploadResult>}
 */
export async function uploadVideoMultipartCore({
  url,
  blob,
  proxyUrl = '',
  clientId = '',
  fileName = 'video.mp4',
  title = '',
  introduction = '',
  requestWithRetry,
  validateProxyUrl,
  requestUrl: customRequestUrl,
}) {
  if (proxyUrl && typeof validateProxyUrl === 'function') {
    validateProxyUrl(proxyUrl);
  }

  return requestWithRetry(async () => {
    const videoTitle = String(title || fileName.replace(/\.[^/.]+$/, '') || 'video').trim().slice(0, 60);
    const videoIntro = String(introduction || videoTitle).trim().slice(0, 200);
    const description = JSON.stringify({
      title: videoTitle,
      introduction: videoIntro,
    });

    const requestUrlFn = customRequestUrl || getObsidianRequestUrl();

    if (proxyUrl) {
      const base64Data = await readBlobAsBase64Payload(blob);
      const headers = { 'Content-Type': 'application/json' };
      if (clientId) {
        headers['X-Client-Id'] = clientId;
      }

      const proxyResponse = await requestUrlFn({
        url: proxyUrl,
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          url: url,
          method: 'UPLOAD',
          fileData: base64Data,
          fileName: fileName,
          mimeType: 'video/mp4',
          fieldName: 'media',
          extraFields: {
            description,
          },
        }),
        contentType: 'application/json',
        throw: false,
      });

      if (proxyResponse.status < 200 || proxyResponse.status >= 300) {
        const body = typeof proxyResponse.json === 'object' && proxyResponse.json ? proxyResponse.json : {};
        const msg = body.error || proxyResponse.text || `Proxy request failed with status ${proxyResponse.status}`;
        const err = new Error(msg);
        if (proxyResponse.status === 401 || proxyResponse.status === 403) {
          err.isProxyAuth = true;
          err.isFatal = true;
        }
        throw err;
      }

      const data = typeof proxyResponse.json === 'object' && proxyResponse.json ? proxyResponse.json : {};
      if (hasWechatUploadResult(data)) {
        return { media_id: String(data.media_id || ''), url: typeof data.url === 'string' ? data.url : undefined };
      }
      throw new Error(`微信API报错: ${formatWechatApiError(data)}`);
    }

    // 直连通道 (通过 multipart boundary 组装表单数据)
    const boundary = '----ObsidianWechatConverterBoundary' + Math.random().toString(36).substring(2);
    const arrayBuffer = await blobToArrayBuffer(blob);
    const bytes = new Uint8Array(arrayBuffer);

    let header = `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="media"; filename="${fileName}"\r\n`;
    header += `Content-Type: video/mp4\r\n\r\n`;

    let descPart = `\r\n--${boundary}\r\n`;
    descPart += `Content-Disposition: form-data; name="description"\r\n\r\n`;
    descPart += description;

    const footer = `\r\n--${boundary}--\r\n`;

    const headerBytes = new TextEncoder().encode(header);
    const descBytes = new TextEncoder().encode(descPart);
    const footerBytes = new TextEncoder().encode(footer);

    const bodyBytes = new Uint8Array(headerBytes.length + bytes.length + descBytes.length + footerBytes.length);
    bodyBytes.set(headerBytes, 0);
    bodyBytes.set(bytes, headerBytes.length);
    bodyBytes.set(descBytes, headerBytes.length + bytes.length);
    bodyBytes.set(footerBytes, headerBytes.length + bytes.length + descBytes.length);

    try {
      const response = await requestUrlFn({
        url: url,
        method: 'POST',
        body: bodyBytes.buffer,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
      });

      const data = typeof response.json === 'object' && response.json ? response.json : {};
      if (hasWechatUploadResult(data)) {
        return { media_id: String(data.media_id || ''), url: typeof data.url === 'string' ? data.url : undefined };
      }
      throw new Error(`微信API报错: ${formatWechatApiError(data)}`);
    } catch (error) {
      console.error('[wechat-video] Video Upload Error:', error);
      throw new Error(`网络请求失败: ${error?.message || error}`);
    }
  });
}

/**
 * 扫描并上传正文中的所有视频，转换为微信 `<mpvideo>` 规范标签
 * @param {string} html
 * @param {any} api WechatAPI 实例
 * @param {(current: number, total: number) => void} [progressCallback]
 * @param {object} [options]
 * @param {string} [options.accountId='']
 * @param {Map<string, VideoCacheEntry>} [options.videoUploadCache]
 * @param {(src: string) => Promise<Blob>} [options.srcToBlob]
 * @param {(failures: FailedVideoInfo[]) => void} [options.onVideoFailure]
 * @param {Function} [options.requestUrl] 可选请求执行器
 * @returns {Promise<string>}
 */
export const processAllVideos = async (
  html,
  api,
  progressCallback,
  options = {}
) => {
  const activeDocument = getActiveDocument();
  const div = createHtmlContainer('div', html || '');
  if (!activeDocument || !div) return html;

  // 收集所有视频元素：<video> 或以 .mp4 结尾的 <img>
  const videoElements = [];
  Array.from(div.querySelectorAll('video')).forEach((el) => {
    videoElements.push({ el, type: 'video' });
  });

  Array.from(div.querySelectorAll('img')).forEach((img) => {
    const src = String(img.getAttribute('src') || '').trim();
    if (/\.mp4([?#]|$)/i.test(src)) {
      videoElements.push({ el: img, type: 'img-video' });
    }
  });

  if (videoElements.length === 0) {
    return html;
  }

  // 提取视频的真实源地址
  const getVideoSource = (el) => {
    let src = el.getAttribute('src') || el.src || '';
    if (!src && el.tagName === 'VIDEO') {
      const sourceTag = el.querySelector('source');
      if (sourceTag) {
        src = sourceTag.getAttribute('src') || '';
      }
    }
    return String(src || '').trim();
  };

  /** @type {Set<string>} */
  const uniqueSources = new Set();
  videoElements.forEach(({ el }) => {
    const src = getVideoSource(el);
    if (src) uniqueSources.add(src);
  });

  const total = uniqueSources.size;
  let completed = 0;
  /** @type {FailedVideoInfo[]} */
  const failedVideos = [];
  /** @type {Map<string, { mediaId: string, title: string }>} */
  const mediaMap = new Map();

  const cacheNamespace = options.accountId || '';
  const videoCache = options.videoUploadCache || null;
  const srcToBlobFn = options.srcToBlob;
  const requestUrlFn = options.requestUrl;

  for (const src of uniqueSources) {
    const videoTitle = extractVideoTitleFromSrc(src);
    const cacheKey = `${cacheNamespace}::video::${src}`;
    const cached = videoCache?.get(cacheKey);

    try {
      let blob;
      if (/^https?:\/\//i.test(src)) {
        blob = await fetchOnlineVideo(src, requestUrlFn);
      } else if (typeof srcToBlobFn === 'function') {
        blob = await srcToBlobFn(src);
      } else {
        throw new Error(`无法解析视频源: ${src}`);
      }

      validateVideoSize(blob.size);
      validateVideoFormat(src, blob.type);

      const fingerprint = await computeVideoFingerprint(blob);

      if (
        cached &&
        cached.fingerprint &&
        cached.fingerprint === fingerprint &&
        cached.mediaId
      ) {
        mediaMap.set(src, { mediaId: cached.mediaId, title: videoTitle });
        completed++;
        if (progressCallback) progressCallback(completed, total);
        continue;
      }

      if (typeof api?.uploadVideo !== 'function') {
        throw new Error('API 客户端未实现 uploadVideo 方法');
      }

      const res = await api.uploadVideo(blob, {
        fileName: `${videoTitle}.mp4`,
        title: videoTitle,
      });

      if (!res?.media_id) {
        throw new Error('微信接口未返回有效的 media_id');
      }

      mediaMap.set(src, { mediaId: res.media_id, title: videoTitle });

      if (videoCache) {
        videoCache.set(cacheKey, {
          mediaId: res.media_id,
          fingerprint,
          uploadedAt: Date.now(),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[wechat-video] 视频处理失败: ${src}`, err);
      failedVideos.push({ src, message: msg });
    }

    completed++;
    if (progressCallback) progressCallback(completed, total);
  }

  const failedSrcMap = new Map(failedVideos.map((item) => [item.src, item.message]));

  // 替换 DOM 中的视频节点为微信 <mpvideo> 或错误提示占位
  videoElements.forEach(({ el }) => {
    const src = getVideoSource(el);
    if (!src) return;

    if (mediaMap.has(src)) {
      const { mediaId, title } = mediaMap.get(src);
      const mpVideoEl = activeDocument.createElement('mpvideo');
      mpVideoEl.setAttribute('data-pluginname', 'insertvideo');
      mpVideoEl.setAttribute('data-mediaid', mediaId);
      mpVideoEl.setAttribute('data-title', title);
      el.replaceWith(mpVideoEl);
    } else if (failedSrcMap.has(src)) {
      const placeholder = activeDocument.createElement('p');
      const placeholderStyle = 'margin:12px 0;padding:10px 12px;border:1px dashed #d0d7de;border-radius:6px;color:#8c6d1f;background:#fff8e5;font-size:13px;line-height:1.7;';
      placeholder.setAttribute('style', placeholderStyle);
      const reason = failedSrcMap.get(src) || '同步失败';
      const title = extractVideoTitleFromSrc(src);
      placeholder.textContent = `视频未同步（${reason}），请在微信后台手动插入视频：${title}`;
      el.replaceWith(placeholder);
    }
  });

  if (failedVideos.length > 0 && typeof options.onVideoFailure === 'function') {
    options.onVideoFailure(failedVideos);
  }

  return div.innerHTML;
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: close the scoped disable block above */
