/*
## 核心功能

实现微信公众号同步链路的 wechat draft cache 服务能力。

## 输入

接收插件设置、账号凭证、文章 HTML、图片资源、frontmatter 元数据和微信 API 响应。

## 输出

输出 `DRAFT_CACHE_VERSION`、`createEmptyDraftCache`、`normalizeDraftEntry`、`normalizeDraftCache`、`getDraftAssociation`、`setDraftAssociation`、`clearDraftAssociation`，用于草稿创建/更新、素材上传、清洗、缓存或错误呈现。

## 定位

位于 services/，属于微信发布服务层；不直接操作设置页 DOM。

## 依赖

关键依赖：`./path-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { normalizeVaultPath } from './path-utils.js';

export const DRAFT_CACHE_VERSION = 1;

/**
 * @typedef {{ sourcePath: string, mediaId: string, accountId: string, title: string, index: number, updatedAt: number }} DraftCacheEntry
 * @typedef {{ version: number, articles: Record<string, DraftCacheEntry> }} DraftCache
 * @typedef {{ draftCache?: unknown, [key: string]: unknown }} DraftSettingsLike
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @returns {DraftCache}
 */
export function createEmptyDraftCache() {
  return {
    version: DRAFT_CACHE_VERSION,
    articles: {},
  };
}

/**
 * @param {unknown} entry
 * @param {string} [fallbackPath='']
 * @returns {DraftCacheEntry | null}
 */
export function normalizeDraftEntry(entry, fallbackPath = '') {
  if (!isPlainRecord(entry)) return null;

  const mediaId = typeof entry.mediaId === 'string'
    ? entry.mediaId.trim()
    : typeof entry.media_id === 'string'
      ? entry.media_id.trim()
      : '';
  if (!mediaId) return null;

  const sourcePath = normalizeVaultPath(
    typeof entry.sourcePath === 'string' && entry.sourcePath
      ? entry.sourcePath
      : fallbackPath
  );
  if (!sourcePath) return null;

  const index = Number.isInteger(entry.index) && entry.index >= 0 ? entry.index : 0;
  const updatedAt = Number.isFinite(entry.updatedAt) && entry.updatedAt > 0
    ? entry.updatedAt
    : 0;

  return {
    sourcePath,
    mediaId,
    accountId: typeof entry.accountId === 'string' ? entry.accountId.trim() : '',
    title: typeof entry.title === 'string' ? entry.title : '',
    index,
    updatedAt,
  };
}

/**
 * @param {unknown} rawCache
 * @returns {{ cache: DraftCache, changed: boolean }}
 */
export function normalizeDraftCache(rawCache) {
  const normalized = createEmptyDraftCache();
  let changed = false;

  if (!isPlainRecord(rawCache)) {
    return {
      cache: normalized,
      changed: rawCache !== undefined && rawCache !== null,
    };
  }

  const sourceArticles = rawCache.version === DRAFT_CACHE_VERSION && isPlainRecord(rawCache.articles)
    ? rawCache.articles
    : rawCache;

  if (sourceArticles !== rawCache.articles || rawCache.version !== DRAFT_CACHE_VERSION) {
    changed = true;
  }

  for (const [rawPath, rawEntry] of Object.entries(sourceArticles)) {
    const sourcePath = normalizeVaultPath(rawPath);
    const entry = normalizeDraftEntry(rawEntry, sourcePath);
    if (!entry) {
      changed = true;
      continue;
    }

    normalized.articles[entry.sourcePath] = entry;
    if (entry.sourcePath !== rawPath || JSON.stringify(entry) !== JSON.stringify(rawEntry)) {
      changed = true;
    }
  }

  const expected = JSON.stringify(normalized);
  if (expected !== JSON.stringify(rawCache)) {
    changed = true;
  }

  return { cache: normalized, changed };
}

/**
 * @param {DraftSettingsLike | null | undefined} settings
 * @param {unknown} sourcePath
 * @param {string} [accountId='']
 * @returns {DraftCacheEntry | null}
 */
export function getDraftAssociation(settings, sourcePath, accountId = '') {
  const path = normalizeVaultPath(sourcePath || '');
  if (!path) return null;

  const { cache } = normalizeDraftCache(settings?.draftCache);
  const entry = cache.articles[path] || null;
  if (!entry) return null;

  const expectedAccountId = typeof accountId === 'string' ? accountId.trim() : '';
  if (expectedAccountId && entry.accountId && entry.accountId !== expectedAccountId) {
    return null;
  }

  return { ...entry };
}

/**
 * @param {DraftSettingsLike | null | undefined} settings
 * @param {unknown} association
 * @returns {DraftCache}
 */
export function setDraftAssociation(settings, association) {
  if (!isPlainRecord(settings)) return createEmptyDraftCache();
  const associationRecord = isPlainRecord(association) ? association : {};
  const sourcePath = normalizeVaultPath(associationRecord.sourcePath || associationRecord.filePath || '');
  const entry = normalizeDraftEntry({ ...associationRecord, sourcePath }, sourcePath);
  const { cache } = normalizeDraftCache(settings.draftCache);

  if (entry) {
    cache.articles[entry.sourcePath] = {
      ...entry,
      updatedAt: entry.updatedAt || Date.now(),
    };
  }

  settings.draftCache = cache;
  return cache;
}

/**
 * @param {DraftSettingsLike | null | undefined} settings
 * @param {unknown} sourcePath
 * @returns {DraftCache}
 */
export function clearDraftAssociation(settings, sourcePath) {
  if (!isPlainRecord(settings)) return createEmptyDraftCache();
  const path = normalizeVaultPath(sourcePath || '');
  const { cache } = normalizeDraftCache(settings.draftCache);
  if (path) delete cache.articles[path];
  settings.draftCache = cache;
  return cache;
}
