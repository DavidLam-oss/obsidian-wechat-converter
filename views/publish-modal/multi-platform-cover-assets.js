/*
## 核心功能

处理多平台发布所需的微信素材封面和 Bridge 图片资源。

## 输入

当前视图的缓存、封面描述、请求适配器和文章图片限制。

## 输出

可供 Bridge 使用的封面 asset，以及缓存命中或下载错误。

## 定位

位于 views/publish-modal/，是多平台发布的封面资源适配层。

## 依赖

关键依赖：`../../services/article-image-assets.js`。

## 边界

- 只负责资源下载、校验、缓存和 asset:// 引用生成。
- 不创建 DOM、不调用 Bridge、不决定文章或平台发布结果。
- 缓存仍然存放在 view.wechatMaterialCoverAssetCache，保持现有生命周期。

## 维护规则

- 保持缓存 TTL、容量和图片大小限制不变。
- 不在此处创建 DOM、调用 Bridge 或决定发布结果。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: asset adapter crosses dynamic Obsidian file and response objects */

import { DEFAULT_MAX_IMAGE_SIZE_BYTES } from '../../services/article-image-assets.js';

const MATERIAL_COVER_ASSET_TTL_MS = 5 * 60 * 1000;
const MAX_MATERIAL_COVER_ASSET_CACHE_ENTRIES = 3;

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toRecord(value) {
  return isRecord(value) ? value : {};
}

function toText(value) {
  return typeof value === 'string' ? value : '';
}

function toReadableError(error) {
  if (error instanceof Error) return { message: error.message };
  const record = toRecord(error);
  return { message: toText(record.message) || String(error || '') };
}

function getBridgeSafeSessionCover(cover) {
  const value = String(cover || '').trim();
  if (/^(data:image\/|https?:\/\/)/i.test(value)) return value;
  return '';
}

function getFilenameFromUrl(url, fallback = 'wechat-material-cover') {
  try {
    const parsed = new URL(String(url || ''));
    const filename = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    return filename || fallback;
  } catch {
    return fallback;
  }
}

function normalizeRemoteCoverFilename(url, mimeType = '') {
  const rawName = getFilenameFromUrl(url);
  if (/\.(png|jpe?g|gif|webp)$/i.test(rawName)) return rawName;
  if (/png/i.test(mimeType)) return `${rawName}.png`;
  if (/gif/i.test(mimeType)) return `${rawName}.gif`;
  if (/webp/i.test(mimeType)) return `${rawName}.webp`;
  return `${rawName}.jpg`;
}

function bufferFromArrayBuffer(arrayBuffer) {
  if (Buffer.isBuffer(arrayBuffer)) return arrayBuffer;
  if (arrayBuffer instanceof ArrayBuffer) return Buffer.from(arrayBuffer);
  if (ArrayBuffer.isView(arrayBuffer)) {
    return Buffer.from(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength);
  }
  return Buffer.from(arrayBuffer || []);
}

function getResponseArrayBuffer(response) {
  const responseRecord = toRecord(response);
  const arrayBuffer = responseRecord.arrayBuffer;
  if (typeof arrayBuffer !== 'function') return Promise.resolve(arrayBuffer);
  return arrayBuffer();
}

function getMaterialCoverAssetCacheKey(view, url) {
  return [
    toText(toRecord(view).sessionThumbMediaId),
    String(url || '').trim(),
  ].join('::');
}

function pruneMaterialCoverAssetCache(view, now = Date.now()) {
  const viewRecord = toRecord(view);
  if (!(viewRecord.wechatMaterialCoverAssetCache instanceof Map)) {
    viewRecord.wechatMaterialCoverAssetCache = new Map();
  }
  const cache = viewRecord.wechatMaterialCoverAssetCache;

  for (const [key, entry] of cache.entries()) {
    if (!entry || now - entry.cachedAt >= MATERIAL_COVER_ASSET_TTL_MS) {
      cache.delete(key);
    }
  }

  while (cache.size > MAX_MATERIAL_COVER_ASSET_CACHE_ENTRIES) {
    let oldestKey = '';
    let oldestAt = Infinity;
    for (const [key, entry] of cache.entries()) {
      if ((entry?.cachedAt || 0) < oldestAt) {
        oldestAt = entry.cachedAt || 0;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function cloneMaterialCoverAsset(cachedAsset, id) {
  return {
    id,
    filename: cachedAsset.filename,
    mimeType: cachedAsset.mimeType,
    size: cachedAsset.size,
    base64: cachedAsset.base64,
    source: { ...(cachedAsset.source || {}) },
  };
}

async function downloadMaterialCoverAsBridgeAsset(view, coverUrl, assets = [], options = {}) {
  const viewRecord = toRecord(view);
  const url = String(coverUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('微信素材库封面缺少可下载 URL，无法用于多平台发布。请改用本地封面或 frontmatter cover。');
  }

  const now = Date.now();
  const cacheKey = getMaterialCoverAssetCacheKey(view, url);
  pruneMaterialCoverAssetCache(view, now);
  const cache = viewRecord.wechatMaterialCoverAssetCache;
  const cached = cache.get(cacheKey);
  if (cached && now - cached.cachedAt < MATERIAL_COVER_ASSET_TTL_MS) {
    const id = `image-${assets.length + 1}`;
    const asset = cloneMaterialCoverAsset(cached.asset, id);
    assets.push(asset);
    return {
      asset,
      cover: `asset://${id}`,
      fromCache: true,
    };
  }

  let response;
  try {
    const requestUrl = options.requestUrl;
    if (typeof requestUrl !== 'function') {
      throw new Error('Obsidian requestUrl is unavailable');
    }
    response = await requestUrl({ url, method: 'GET' });
  } catch (error) {
    throw new Error(`微信素材库封面下载失败：${toReadableError(error).message}`);
  }

  const responseRecord = toRecord(response);
  const arrayBuffer = await getResponseArrayBuffer(response);
  const buffer = bufferFromArrayBuffer(arrayBuffer);
  if (!buffer.length) {
    throw new Error('微信素材库封面下载失败：图片内容为空。');
  }
  if (buffer.length > DEFAULT_MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`微信素材库封面超过 ${Math.round(DEFAULT_MAX_IMAGE_SIZE_BYTES / 1024 / 1024)} MB，无法用于多平台发布。`);
  }

  const headers = toRecord(responseRecord.headers);
  const mimeType = String(headers['content-type'] || headers['Content-Type'] || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
  if (!/^image\/(png|jpe?g|gif|webp)$/i.test(mimeType)) {
    throw new Error(`微信素材库封面格式不支持：${mimeType}`);
  }

  const id = `image-${assets.length + 1}`;
  const filename = normalizeRemoteCoverFilename(url, mimeType);
  const asset = {
    id,
    filename,
    mimeType,
    size: buffer.length,
    base64: buffer.toString('base64'),
    source: {
      kind: 'wechat-material-cover',
      originalSrc: url,
      thumbMediaId: toText(viewRecord.sessionThumbMediaId),
    },
  };
  assets.push(asset);
  cache.set(cacheKey, {
    cachedAt: now,
    asset: {
      filename,
      mimeType,
      size: buffer.length,
      base64: asset.base64,
      source: { ...asset.source },
    },
  });
  pruneMaterialCoverAssetCache(view, now);
  return {
    asset,
    cover: `asset://${id}`,
    fromCache: false,
  };
}

export {
  getBridgeSafeSessionCover,
  downloadMaterialCoverAsBridgeAsset,
};
