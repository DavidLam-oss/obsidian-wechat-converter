/*
## 核心功能

定义微信贴图统一图片项，并负责同来源去重、用户顺序恢复、手动图片保留与九宫格裁剪。

## 输入

接收正文、本地上传、公众号素材或渲染产物构成的图片项，以及用户顺序、删除记录和数量上限。

## 输出

输出图片项规范化、来源 key 构建、兼容 src 读取与 `reconcileStickerImageItems` 纯函数。

## 定位

位于 services/，是贴图图片状态的共享数据层；不依赖 Obsidian API、DOM 或上传实现。

## 依赖

关键依赖：`./markdown-cleaner.js` 的路径身份规范化。

## 维护规则

- `key` 是不透明身份，只能比较，不能从中反解析业务字段。
- 默认只做同来源去重；跨来源内容相同也保留，除非用户手动移除。
- 超过九宫格上限时优先从尾部裁掉正文自动项，保留手动项相对顺序。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: runtime guards normalize legacy and cross-source image records before use */

import { normalizeImageKey } from './markdown-cleaner.js';

const STICKER_IMAGE_SOURCES = new Set(['body', 'upload', 'material', 'render']);

/**
 * @typedef {'body'|'upload'|'material'|'render'} StickerImageSource
 * @typedef {{kind:'src', src:string}|{kind:'blob', blob:Blob}|{kind:'media', mediaId:string, accountId:string}} StickerUploadRef
 * @typedef {{
 *   source: StickerImageSource,
 *   key: string,
 *   displaySrc?: string,
 *   uploadRef: StickerUploadRef,
 *   name?: string,
 *   fingerprint?: string
 * }} StickerImageItem
 */

/**
 * 读取兼容字符串路径。Blob 与纯素材 media_id 不会伪造路径。
 *
 * @param {StickerImageItem|unknown} item
 * @returns {string}
 */
function getStickerImageItemSrc(item) {
  if (!item || typeof item !== 'object') return '';
  if (typeof item.displaySrc === 'string' && item.displaySrc.trim()) {
    return item.displaySrc.trim();
  }
  if (item.uploadRef?.kind === 'src' && typeof item.uploadRef.src === 'string') {
    return item.uploadRef.src.trim();
  }
  return '';
}

/**
 * @param {unknown} item
 * @returns {item is StickerImageItem}
 */
function isStickerImageItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!STICKER_IMAGE_SOURCES.has(item.source)) return false;
  if (typeof item.key !== 'string' || !item.key.trim()) return false;
  const ref = item.uploadRef;
  if (!ref || typeof ref !== 'object') return false;
  if (ref.kind === 'src') return typeof ref.src === 'string' && Boolean(ref.src.trim());
  if (ref.kind === 'blob') return Boolean(ref.blob);
  if (ref.kind === 'media') {
    return typeof ref.mediaId === 'string'
      && Boolean(ref.mediaId.trim())
      && typeof ref.accountId === 'string'
      && Boolean(ref.accountId.trim());
  }
  return false;
}

/**
 * @param {unknown} item
 * @returns {StickerImageItem|null}
 */
function normalizeStickerImageItem(item) {
  if (!isStickerImageItem(item)) return null;
  const normalized = {
    source: item.source,
    key: item.key.trim(),
    uploadRef: item.uploadRef,
  };
  if (typeof item.displaySrc === 'string' && item.displaySrc.trim()) {
    normalized.displaySrc = item.displaySrc.trim();
  }
  if (typeof item.name === 'string' && item.name.trim()) {
    normalized.name = item.name.trim();
  }
  if (typeof item.fingerprint === 'string' && item.fingerprint.trim()) {
    normalized.fingerprint = item.fingerprint.trim();
  }
  return normalized;
}

/**
 * @param {string} src
 * @param {(src:string)=>string} [resolveIdentity]
 * @returns {StickerImageItem|null}
 */
function createBodyStickerImageItem(src, resolveIdentity) {
  if (typeof src !== 'string' || !src.trim()) return null;
  const value = src.trim();
  const resolved = typeof resolveIdentity === 'function' ? resolveIdentity(value) : '';
  const identity = normalizeImageKey(resolved || value);
  if (!identity) return null;
  return {
    source: 'body',
    key: `body:${identity}`,
    displaySrc: value,
    uploadRef: { kind: 'src', src: value },
    name: value.split(/[\\/]/).pop() || value,
  };
}

/**
 * @param {{blob:Blob, fingerprint:string, displaySrc:string, name?:string}} params
 * @returns {StickerImageItem|null}
 */
function createUploadStickerImageItem({ blob, fingerprint, displaySrc, name = '' }) {
  if (!blob || typeof fingerprint !== 'string' || !fingerprint.trim()) return null;
  return {
    source: 'upload',
    key: `upload:${fingerprint.trim()}`,
    displaySrc: typeof displaySrc === 'string' ? displaySrc.trim() : '',
    uploadRef: { kind: 'blob', blob },
    name: typeof name === 'string' ? name.trim() : '',
    fingerprint: fingerprint.trim(),
  };
}

/**
 * @param {{mediaId:string, accountId:string, displaySrc?:string, name?:string}} params
 * @returns {StickerImageItem|null}
 */
function createMaterialStickerImageItem({ mediaId, accountId, displaySrc = '', name = '' }) {
  if (typeof mediaId !== 'string' || !mediaId.trim()) return null;
  if (typeof accountId !== 'string' || !accountId.trim()) return null;
  return {
    source: 'material',
    key: `material:${accountId.trim()}:${mediaId.trim()}`,
    displaySrc: typeof displaySrc === 'string' ? displaySrc.trim() : '',
    uploadRef: {
      kind: 'media',
      mediaId: mediaId.trim(),
      accountId: accountId.trim(),
    },
    name: typeof name === 'string' ? name.trim() : '',
  };
}

/**
 * 把 legacy src/key 对齐到当前图片项 key。
 *
 * @param {unknown} value
 * @param {StickerImageItem[]} available
 * @returns {string}
 */
function resolveStickerOrderKey(value, available) {
  if (value && typeof value === 'object' && typeof value.key === 'string') {
    return value.key.trim();
  }
  if (typeof value !== 'string' || !value.trim()) return '';
  const raw = value.trim();
  const exactKey = available.find((item) => item.key === raw);
  if (exactKey) return exactKey.key;
  const exactSrc = available.find((item) => getStickerImageItemSrc(item) === raw);
  if (exactSrc) return exactSrc.key;
  const normalized = normalizeImageKey(raw);
  const normalizedMatches = available.filter((item) => {
    if (item.source !== 'body') return false;
    return normalizeImageKey(getStickerImageItemSrc(item)) === normalized;
  });
  return normalizedMatches.length === 1 ? normalizedMatches[0].key : raw;
}

/**
 * 保留用户交错顺序，并把新正文项追加到末尾。超过上限时优先裁掉尾部正文项。
 *
 * @param {object} params
 * @param {StickerImageItem[]} [params.defaultItems]
 * @param {StickerImageItem[]} [params.manualItems]
 * @param {(string|StickerImageItem)[]} [params.order]
 * @param {string[]} [params.removedKeys]
 * @param {number} [params.limit=9]
 * @returns {StickerImageItem[]}
 */
function reconcileStickerImageItems({
  defaultItems = [],
  manualItems = [],
  order = [],
  removedKeys = [],
  limit = 9,
}) {
  /** @type {StickerImageItem[]} */
  const candidates = [];
  /** @type {Set<string>} */
  const candidateKeys = new Set();
  for (const candidate of [...defaultItems, ...manualItems]) {
    const item = normalizeStickerImageItem(candidate);
    if (!item || candidateKeys.has(item.key)) continue;
    candidateKeys.add(item.key);
    candidates.push(item);
  }

  const removed = new Set(
    (Array.isArray(removedKeys) ? removedKeys : [])
      .map((value) => resolveStickerOrderKey(value, candidates))
      .filter(Boolean)
  );
  const byKey = new Map(candidates.map((item) => [item.key, item]));
  /** @type {StickerImageItem[]} */
  const result = [];
  const used = new Set();

  for (const value of Array.isArray(order) ? order : []) {
    const key = resolveStickerOrderKey(value, candidates);
    const item = byKey.get(key);
    if (!item || used.has(key) || removed.has(key)) continue;
    used.add(key);
    result.push(item);
  }

  for (const item of candidates) {
    if (used.has(item.key) || removed.has(item.key)) continue;
    used.add(item.key);
    result.push(item);
  }

  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 9;
  while (result.length > safeLimit) {
    let removeIndex = -1;
    for (let index = result.length - 1; index >= 0; index--) {
      if (result[index].source === 'body') {
        removeIndex = index;
        break;
      }
    }
    result.splice(removeIndex === -1 ? result.length - 1 : removeIndex, 1);
  }

  return result;
}

export {
  createBodyStickerImageItem,
  createMaterialStickerImageItem,
  createUploadStickerImageItem,
  getStickerImageItemSrc,
  isStickerImageItem,
  normalizeStickerImageItem,
  reconcileStickerImageItems,
  resolveStickerOrderKey,
};
