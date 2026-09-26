/*
## 核心功能

小红书卡片封面图源获取服务（Cover Image Sources）：
提供免配置 Picsum 随机摄影图、Unsplash 关键词精准摄影检索、Obsidian 笔记附件提取与本地文件转 Base64 管道。
纯服务层模块，无 UI 状态，在 Node 与 Electron 环境下均可运行。

## 输入

- `fetchPicsumCoverImage()`: 尺寸规格、随机种子与 requestUrl 函数。
- `fetchUnsplashCoverImage()`: 关键词、方向约束、API Key 与 requestUrl 函数。
- `extractNoteImages()`: 当前笔记 Markdown 原文与 Obsidian App 上下文。
- `readLocalFileAsDataUrl()`: 本地 File 对象。

## 输出

- 统一返回 `data:image/jpeg;base64,...` 或 `data:image/png;base64,...`，保证卡片离线可用与彻底规避防盗链/CORS。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- reason: JS file handles dynamic API responses without strict typescript type annotations */

import { getObsidianRequestUrl } from './obsidian-compat.js';

/** 卡片比例到 Unsplash 方向映射 */
export const RATIO_TO_UNSPLASH_ORIENTATION = {
  '3:4': 'portrait',
  '3:5': 'portrait',
  '9:16': 'portrait',
  '1:1': 'squarish',
  '4:3': 'landscape',
  '16:9': 'landscape',
};

/** 卡片比例到 Picsum 推荐下载分辨率映射 */
export const RATIO_TO_PICSUM_DIMENSIONS = {
  '3:4': { width: 1200, height: 1600 },
  '3:5': { width: 1200, height: 2000 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1400, height: 1400 },
  '4:3': { width: 1600, height: 1200 },
  '16:9': { width: 1920, height: 1080 },
};

/**
 * 字符串快速 Hash（FNV-1a 算法）生成稳定种子
 * @param {string} input
 * @returns {string}
 */
export function hashString(input) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * ArrayBuffer 转 Base64 字符串
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function bufferToBase64(buffer) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 根据比例 ID 获取推荐分辨率
 * @param {string} [ratioId='3:4']
 * @returns {{ width: number, height: number }}
 */
export function resolvePicsumDimensions(ratioId = '3:4') {
  return RATIO_TO_PICSUM_DIMENSIONS[ratioId] || RATIO_TO_PICSUM_DIMENSIONS['3:4'];
}

/**
 * 根据比例 ID 获取推荐 Unsplash 方向
 * @param {string} [ratioId='3:4']
 * @returns {'portrait' | 'squarish' | 'landscape'}
 */
export function resolveUnsplashOrientation(ratioId = '3:4') {
  return RATIO_TO_UNSPLASH_ORIENTATION[ratioId] || 'portrait';
}

/**
 * 获取或回退网络请求执行器
 * @param {Function} [requestUrlFn]
 * @returns {Function}
 */
function resolveRequestExecutor(requestUrlFn) {
  if (typeof requestUrlFn === 'function') return requestUrlFn;
  const obsidianReq = getObsidianRequestUrl();
  if (typeof obsidianReq === 'function') return obsidianReq;
  return null;
}

/**
 * 拉取图片 URL 并内联为 Base64 Data URL
 * @param {string} imageUrl
 * @param {Function} [customReq]
 * @param {string} [mimeType='image/jpeg']
 * @returns {Promise<string>}
 */
export async function downloadAsBase64(imageUrl, customReq, defaultMime = 'image/jpeg') {
  const reqFn = resolveRequestExecutor(customReq);
  const ext = (imageUrl.split(/[?#]/)[0].split('.').pop() || '').toLowerCase();
  const extMime = ext === 'png' ? 'image/png'
    : (ext === 'webp' ? 'image/webp'
    : (ext === 'gif' ? 'image/gif'
    : (ext === 'svg' ? 'image/svg+xml' : '')));

  if (reqFn) {
    const res = await reqFn({
      url: imageUrl,
      method: 'GET',
      throw: false,
    });
    const obj = /** @type {{ status?: number, headers?: Record<string, string>, arrayBuffer?: ArrayBuffer }} */ (res);
    if (obj && obj.arrayBuffer) {
      const headerMime = obj.headers?.['content-type'] || obj.headers?.['Content-Type'];
      const mime = headerMime?.split(';')[0]?.trim() || extMime || defaultMime;
      const b64 = bufferToBase64(obj.arrayBuffer);
      return `data:${mime};base64,${b64}`;
    }
  }

  if (typeof fetch === 'function') {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`下载图片失败: HTTP ${res.status}`);
    const headerMime = res.headers?.get?.('content-type');
    const mime = headerMime?.split(';')[0]?.trim() || extMime || defaultMime;
    const buf = await res.arrayBuffer();
    const b64 = bufferToBase64(buf);
    return `data:${mime};base64,${b64}`;
  }

  throw new Error('当前环境缺少 requestUrl 与 fetch，无法下载图片');
}

/**
 * 免配置获取 Picsum 摄影随机图并转换为 Base64
 * @param {object} options
 * @param {string} [options.ratioId='3:4'] 卡片比例
 * @param {number} [options.width] 自定义宽度
 * @param {number} [options.height] 自定义高度
 * @param {string} [options.seed] 自定义种子
 * @param {Function} [options.requestUrl]
 * @returns {Promise<string>} Base64 Data URL
 */
export async function fetchPicsumCoverImage(options = {}) {
  const ratioId = options.ratioId || '3:4';
  const dims = resolvePicsumDimensions(ratioId);
  const width = options.width || dims.width;
  const height = options.height || dims.height;

  const randSeed = options.seed || hashString(`card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const picsumUrl = `https://picsum.photos/seed/${encodeURIComponent(randSeed)}/${width}/${height}`;

  try {
    return await downloadAsBase64(picsumUrl, options.requestUrl, 'image/jpeg');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`获取 Picsum 摄影图失败: ${msg}`);
  }
}

/**
 * 调用 Unsplash 接口检索摄影图片并转换为 Base64
 * @param {object} options
 * @param {string} options.apiKey Unsplash Access Key
 * @param {string} [options.query] 搜索关键词
 * @param {string} [options.ratioId='3:4'] 卡片比例
 * @param {'portrait' | 'squarish' | 'landscape'} [options.orientation]
 * @param {Function} [options.requestUrl]
 * @returns {Promise<string>} Base64 Data URL
 */
export async function fetchUnsplashCoverImage(options = {}) {
  const apiKey = (options.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('未配置 Unsplash Access Key，请前往设置配置或使用免配置的随机摄影图');
  }

  const query = (options.query || '').trim() || 'nature landscape architecture';
  const orientation = options.orientation || resolveUnsplashOrientation(options.ratioId || '3:4');
  const endpoint = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=${orientation}&content_filter=high&count=1&ts=${Date.now()}`;

  const reqFn = resolveRequestExecutor(options.requestUrl);
  let rawResponse = null;

  if (reqFn) {
    const res = await reqFn({
      url: endpoint,
      method: 'GET',
      headers: {
        Authorization: `Client-ID ${apiKey}`,
      },
      throw: false,
    });
    rawResponse = /** @type {{ status?: number, text?: string, json?: unknown }} */ (res);
  } else if (typeof fetch === 'function') {
    const res = await fetch(endpoint, {
      headers: { Authorization: `Client-ID ${apiKey}` },
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    rawResponse = { status: res.status, text, json };
  } else {
    throw new Error('当前环境缺少网络请求能力');
  }

  const status = rawResponse?.status || 0;
  if (status >= 400 || !rawResponse?.json) {
    const errText = rawResponse?.text || `HTTP ${status}`;
    throw new Error(`Unsplash 检索失败 (${status}): ${errText}`);
  }

  const data = rawResponse.json;
  const photo = Array.isArray(data) ? data[0] : data;
  const rawUrl = photo?.urls?.raw || photo?.urls?.regular;

  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('未在 Unsplash 返回结果中找到有效的图片地址');
  }

  const downloadUrl = rawUrl.includes('?')
    ? `${rawUrl}&w=1600&q=85&auto=format`
    : `${rawUrl}?w=1600&q=85&auto=format`;

  return await downloadAsBase64(downloadUrl, options.requestUrl, 'image/jpeg');
}

/**
 * 提取当前笔记中的图片引用（支持 ![[image.png]] 与 ![alt](path)）
 * @param {string} markdown
 * @returns {Array<{ name: string, path: string, isWiki: boolean }>}
 */
export function extractNoteImageReferences(markdown) {
  if (!markdown || typeof markdown !== 'string') return [];
  const results = [];
  const seen = new Set();

  // 1. 匹配 Wikilink 图片 ![[name.png|...]]
  const wikiRegex = /!\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g;
  let match;
  while ((match = wikiRegex.exec(markdown)) !== null) {
    const path = match[1].trim();
    if (path && !seen.has(path)) {
      seen.add(path);
      const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
      results.push({ name, path, isWiki: true });
    }
  }

  // 2. 匹配 Markdown 格式图片 ![alt](url)
  const mdRegex = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
  while ((match = mdRegex.exec(markdown)) !== null) {
    const rawTarget = match[2].trim();
    const urlPart = rawTarget.replace(/^<|>$/g, '').split(/\s+/)[0];
    if (urlPart && !seen.has(urlPart)) {
      seen.add(urlPart);
      const cleanPath = urlPart.split(/[?#]/)[0];
      const rawName = match[1].trim();
      const nameClean = rawName.split('|')[0].trim();
      const name = nameClean || (cleanPath.includes('/') ? cleanPath.slice(cleanPath.lastIndexOf('/') + 1) : cleanPath);
      results.push({ name, path: urlPart, isWiki: false });
    }
  }

  return results;
}

/**
 * 从本地 File 对象读取为 Base64 Data URL
 * @param {File | Blob} file
 * @returns {Promise<string>}
 */
export function readLocalFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('未传入有效的图片文件'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('读取本地图片失败'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('读取本地图片异常'));
    reader.readAsDataURL(file);
  });
}
