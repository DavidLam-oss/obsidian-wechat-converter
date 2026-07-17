/*
## 核心功能

实现发布弹窗中的 multi platform 交互能力。

## 输入

接收视图状态、账号设置、文章元数据、同步结果和用户在弹窗中的操作。

## 输出

输出 `showMultiPlatformPublishModal`，用于微信、飞书或多平台发布流程的 UI 编排。

## 定位

位于 views/publish-modal/，负责发布弹窗 UI 层；API 调用委托 services/。

## 依赖

关键依赖：`../../services/wechatsync-results.js`、`../../services/wechatsync-bridge.js`、`../../services/wechatsync-settings.js`、`../connection-status-bar.js`、`../../services/markdown-utils.js`、`../../services/article-image-assets.js`、`../../services/obsidian-publisher-policy.js`、`../../services/dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/publish-modal 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// views/publish-modal/multi-platform.js
//
// Renders the「其他平台发布」publish modal. Extracted from input.js
// (originally AppleStyleView.showMultiPlatformSyncModal, ~318 lines).
//
// Public API:
//   showMultiPlatformPublishModal(view, options)
// where `view` is the AppleStyleView instance. The function still relies
// heavily on view.* methods for content preparation (prepareHtmlForWechatsyncArticle,
// getPublishContextFile, getFrontmatterPublishMeta, etc.) and for
// follow-up modals (showWechatsyncEnqueueAcceptedModal, showMultiPlatformSyncResultModal),
// so the view stays the orchestrator — this module only owns the UI shell.

import {
  isWechatSyncConnectionFailure,
  getWechatsyncPlatformStatusBadge,
  normalizeWechatSyncResponseResults,
  normalizeWechatsyncPlatform,
  summarizeWechatsyncPlatformResponse,
  updateCachedPlatformsAfterSync,
} from '../../services/wechatsync-results.js';

import {
  isUnsupportedBridgeMethodError as isWechatSyncUnsupportedMethodError,
} from '../../services/wechatsync-bridge.js';

import {
  getAvailableWechatsyncPlatforms,
  normalizeWechatSyncCapabilities,
  normalizeMultiPlatformConnection,
  normalizeMultiPlatformSyncSettings,
  normalizeWechatSyncRecentTasks,
  parseWechatsyncPlatformIds,
} from '../../services/wechatsync-settings.js';

import {
  describeWechatsyncConnectionState,
  renderWechatsyncConnectionStatusBar,
} from '../connection-status-bar.js';

import { stripMarkdownFrontmatter } from '../../services/markdown-utils.js';
import {
  DEFAULT_MAX_IMAGE_SIZE_BYTES,
  findAssetForCover,
  formatArticleImageWarnings,
  resolveArticleImages,
} from '../../services/article-image-assets.js';
import {
  checkExtensionPolicyGate,
  checkObsidianPluginPolicyGate,
  getDailyPlatformQuotaLimit,
  getEffectiveObsidianPublisherPolicy,
  getObsidianPluginVersion,
  normalizePolicyQuota,
} from '../../services/obsidian-publisher-policy.js';
import { getActiveWindowValue } from '../../services/dom-utils.js';

const QUOTA_POLICY = 'truncate';
const FREE_DAILY_PLATFORM_QUOTA = 1;
const MODAL_SELECTED_PLATFORM_IDS = '__wechatMultiPlatformSelectedPlatformIds';
const MATERIAL_COVER_ASSET_TTL_MS = 5 * 60 * 1000;
const MAX_MATERIAL_COVER_ASSET_CACHE_ENTRIES = 3;

/**
 * @typedef {{ id?: string, filename: string, mimeType: string, size: number, base64: string, source?: Record<string, unknown> }} BridgeAssetLike
 * @typedef {{ cachedAt: number, asset: BridgeAssetLike }} MaterialCoverCacheEntryLike
 * @typedef {{ requestUrl?: (options: Record<string, unknown>) => Promise<unknown>, obsidianApi?: Partial<ObsidianApiLike>, modal?: PublishModalLike }} PublishModalOptionsLike
 * @typedef {{ isMobile?: boolean }} PlatformLike
 * @typedef {{ Modal: new (app: unknown) => PublishModalLike, Notice: new (message: string, timeout?: number) => NoticeLike, Platform?: PlatformLike, requestUrl?: (options: Record<string, unknown>) => Promise<unknown>, setIcon?: (element: HTMLElement, iconName: string) => void }} ObsidianApiLike
 * @typedef {{ hide: () => void, setMessage?: (message: string) => void }} NoticeLike
 * @typedef {{ contentEl: ModalContentElementLike, open: () => void, close: () => void, [MODAL_SELECTED_PLATFORM_IDS]?: string[] }} PublishModalLike
 * @typedef {HTMLElement & { createDiv: (options?: { cls?: string }) => ModalContentElementLike, createEl: (tagName: string, options?: { text?: string, cls?: string, attr?: Record<string, string> }) => ModalContentElementLike, empty?: () => void, addClass?: (className: string) => void, removeClass?: (className: string) => void }} ModalContentElementLike
 * @typedef {{ status?: string, checkedAt?: number, message?: string, platforms?: unknown, capabilities?: unknown }} ConnectionLike
 * @typedef {{ id?: string, name?: string, status?: string, authenticated?: boolean, username?: string, success?: boolean, error?: string, message?: string, platform?: string }} PlatformLikeRecord
 * @typedef {{ syncId?: string, requestId?: string, accepted?: boolean, quotaBlocked?: boolean, skippedPlatforms?: unknown, message?: string, publishedPlatforms?: unknown, platforms?: unknown, maxPlatforms?: number }} EnqueueResultLike
 * @typedef {{ cls: string, text: string, status?: string }} PlatformStatusBadgeLike
 * @typedef {{ code?: string, message: string, stack?: string }} ReadableErrorLike
 * @typedef {{ health?: (options?: Record<string, unknown>) => Promise<unknown>, getActiveClientDescriptor?: () => unknown, getStatus?: () => unknown, enqueueSyncArticle?: (payload: Record<string, unknown>) => Promise<unknown>, sendArticle?: (payload: Record<string, unknown>) => Promise<unknown> }} BridgeLike
 * @typedef {{ settings: { multiPlatformSync?: unknown }, obsidianApi?: Partial<ObsidianApiLike>, getWechatSyncBridgeService: () => BridgeLike, saveSettings: () => Promise<void> }} PluginLike
 * @typedef {{ path: string, basename: string }} FileLike
 * @typedef {{ title?: string, cover?: string }} PublishMetaLike
 * @typedef {{ markdown: string, assets: BridgeAssetLike[], cover?: string, firstImageSrc?: string, warnings?: unknown[] }} ResolvedImagesLike
 * @typedef {{ app?: unknown, currentHtml?: string, lastResolvedMarkdown?: string, sessionCoverBase64?: string, sessionThumbMediaId?: string, wechatMaterialCoverAssetCache?: Map<string, MaterialCoverCacheEntryLike>, articleStates: Map<string, Record<string, unknown>>, plugin: PluginLike, getMissingRenderNotice: () => string, preparePublishModalShell: (modal: PublishModalLike, options: Record<string, unknown>) => void, createPublishModeTabs: (modal: PublishModalLike, mode: string) => { wechatTab: ModalContentElementLike }, showSyncModal: (options: Record<string, unknown>) => void, openPluginSettings: () => boolean, getPublishContextFile: () => FileLike | null, getFrontmatterPublishMeta: (file: FileLike | null) => PublishMetaLike, getCurrentExportHtml: () => string, getFirstImageFromArticle: () => string, prepareHtmlForWechatsyncArticleViaBridge: (html: string, assets: BridgeAssetLike[]) => Promise<string>, generateCoverThumbnailFromAsset: (asset: BridgeAssetLike) => Promise<string>, getWechatsyncTaskSnapshot: (bridge: BridgeLike, syncId: string) => Promise<unknown>, showMultiPlatformQuotaBlockedModal: (options: Record<string, unknown>) => void, showWechatsyncEnqueueAcceptedModal: (options: Record<string, unknown>) => void, showMultiPlatformSyncResultModal: (options: Record<string, unknown>) => void }} PublishViewLike
 */

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
 * @returns {Record<string, unknown>[]}
 */
function toRecordList(value) {
  return Array.isArray(value)
    ? value.filter(isRecord).map((item) => ({ ...item }))
    : [];
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toText(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * @param {unknown} target
 * @param {string} methodName
 * @param {unknown[]} [args]
 * @returns {boolean | null}
 */
function callBooleanMethod(target, methodName, args = []) {
  const method = toRecord(target)[methodName];
  if (typeof method !== 'function') return null;
  const methodFn = /** @type {(...methodArgs: unknown[]) => unknown} */ (method);
  return methodFn.apply(target, args) === true;
}

/**
 * @param {unknown} error
 * @returns {ReadableErrorLike}
 */
function toReadableError(error) {
  if (error instanceof Error) {
    const errorRecord = /** @type {{ code?: unknown }} */ (error);
    return {
      message: error.message,
      code: toText(errorRecord.code),
      stack: toText(error.stack),
    };
  }
  const record = toRecord(error);
  return {
    message: toText(record.message) || String(error || ''),
    code: toText(record.code),
    stack: toText(record.stack),
  };
}

/**
 * @param {unknown} platform
 * @returns {string}
 */
function getPlatformId(platform) {
  const record = toRecord(platform);
  return toText(record.id || record.platform);
}

/**
 * @param {unknown} value
 * @returns {EnqueueResultLike}
 */
function toEnqueueResult(value) {
  return /** @type {EnqueueResultLike} */ ({ ...toRecord(value) });
}

/**
 * @param {unknown} value
 * @returns {BridgeAssetLike[]}
 */
function toBridgeAssets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((asset) => /** @type {BridgeAssetLike} */ ({ ...asset }));
}

/**
 * @param {unknown} value
 * @returns {ResolvedImagesLike}
 */
function toResolvedImages(value) {
  const record = toRecord(value);
  return {
    markdown: toText(record.markdown),
    assets: toBridgeAssets(record.assets),
    cover: toText(record.cover),
    firstImageSrc: toText(record.firstImageSrc),
    warnings: Array.isArray(record.warnings) ? record.warnings : [],
  };
}

/**
 * @param {unknown} value
 * @returns {BridgeAssetLike | null}
 */
function toBridgeAsset(value) {
  const record = toRecord(value);
  if (!record.filename || !record.mimeType || typeof record.size !== 'number' || typeof record.base64 !== 'string') {
    return null;
  }
  return /** @type {BridgeAssetLike} */ ({
    ...record,
    filename: toText(record.filename),
    mimeType: toText(record.mimeType),
    size: record.size,
    base64: record.base64,
    source: isRecord(record.source) ? { ...record.source } : undefined,
  });
}

/**
 * @param {unknown} value
 * @returns {PlatformStatusBadgeLike}
 */
function toPlatformStatusBadge(value) {
  const record = toRecord(value);
  return {
    cls: toText(record.cls),
    text: toText(record.text),
    status: toText(record.status),
  };
}

/**
 * @param {unknown} value
 * @returns {PlatformLikeRecord | null}
 */
function toNormalizedPlatform(value) {
  const record = toRecord(value);
  const id = toText(record.id);
  const name = toText(record.name) || id;
  if (!id) return null;
  return /** @type {PlatformLikeRecord} */ ({
    ...record,
    id,
    name,
  });
}

/**
 * @param {unknown} value
 * @returns {{ platform?: string, platformName?: string, success?: boolean, error?: string }[]}
 */
function toTaskResults(value) {
  return toRecordList(value).map((item) => {
    const record = toRecord(item);
    return {
      platform: toText(record.id || record.platform),
      platformName: toText(record.name),
      success: record.success === true || record.status === 'success',
      error: toText(record.error || record.message),
    };
  }).filter((item) => item.platform);
}

/**
 * @param {EnqueueResultLike} result
 * @param {string[]} requestedPlatformIds
 * @returns {unknown[]}
 */
function getRecentTaskPlatforms(result, requestedPlatformIds) {
  const publishedPlatforms = toUnknownList(result.publishedPlatforms);
  if (publishedPlatforms.length) return publishedPlatforms;
  const resultPlatforms = toUnknownList(result.platforms);
  return resultPlatforms.length ? resultPlatforms : requestedPlatformIds;
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
function toUnknownList(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {unknown} response
 * @returns {Promise<unknown>}
 */
async function getResponseArrayBuffer(response) {
  const responseRecord = toRecord(response);
  const arrayBuffer = responseRecord.arrayBuffer;
  if (typeof arrayBuffer !== 'function') return /** @type {unknown} */ (arrayBuffer);
  const readArrayBuffer = /** @type {() => Promise<unknown>} */ (arrayBuffer);
  return readArrayBuffer();
}

/**
 * @param {unknown} element
 * @returns {ModalContentElementLike}
 */
function asModalElement(element) {
  return /** @type {ModalContentElementLike} */ (element);
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isUnsupportedBridgeError(error) {
  return isWechatSyncUnsupportedMethodError(toReadableError(error));
}

/**
 * @param {number} [selectedCount]
 * @param {{ proLicensed?: boolean, freeLimit?: number }} [options]
 * @returns {string}
 */
function getQuotaHintText(selectedCount = 0, { proLicensed = false, freeLimit = FREE_DAILY_PLATFORM_QUOTA } = {}) {
  const limit = Number.isFinite(Number(freeLimit))
    ? Math.max(0, Math.floor(Number(freeLimit)))
    : FREE_DAILY_PLATFORM_QUOTA;
  if (proLicensed) {
    return selectedCount > 0
      ? `已选 ${selectedCount} 个平台。Pro 已激活，无每日平台数量限制。`
      : 'Pro 已激活，无每日平台数量限制。';
  }
  if (selectedCount > limit) {
    return `已选 ${selectedCount} 个平台；免费版每天 ${limit} 个平台额度，超出部分会自动跳过。`;
  }
  if (selectedCount === limit) {
    return `已选 ${selectedCount} 个平台，刚好达到免费版每天 ${limit} 个平台额度。`;
  }
  if (selectedCount > 0) {
    return `已选 ${selectedCount} 个平台；免费版每天 ${limit} 个平台额度。`;
  }
  return `免费版每天 ${limit} 个平台额度。`;
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * @param {Record<string, unknown>} target
 * @param {unknown} source
 * @returns {Record<string, unknown>}
 */
function mergePolicyCapabilityDetails(target, source) {
  const sourceRecord = toRecord(source);
  /** @type {Record<string, unknown>} */
  const next = {
    ...target,
    ...normalizeWechatSyncCapabilities(sourceRecord),
  };
  const quota = normalizePolicyQuota(sourceRecord.quota);
  if (quota) next.quota = quota;

  const policyVersion = toFiniteNumber(sourceRecord.policyVersion);
  if (policyVersion !== undefined) next.policyVersion = policyVersion;

  for (const key of [
    'minExtensionVersion',
    'minObsidianPluginVersion',
    'proUpgradeUrl',
    'extensionUpgradeUrl',
    'obsidianPluginUpgradeUrl',
  ]) {
    const text = toText(sourceRecord[key]);
    if (text) next[key] = text;
  }

  if (toText(sourceRecord.version)) next.extensionVersion = toText(sourceRecord.version);
  for (const key of ['forceUpgradeExtension', 'forceUpgradeObsidianPlugin']) {
    if (Object.prototype.hasOwnProperty.call(sourceRecord, key)) {
      next[key] = sourceRecord[key] === true;
    }
  }
  return next;
}

/**
 * @param {Record<string, unknown>} cachedCapabilities
 * @param {unknown} health
 * @returns {Record<string, unknown>}
 */
function mergeHealthPolicyCapabilities(cachedCapabilities, health) {
  const healthRecord = toRecord(health);
  return mergePolicyCapabilityDetails(
    mergePolicyCapabilityDetails(cachedCapabilities, healthRecord.capabilities),
    healthRecord
  );
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function getDailyPlatformQuotaLimitFromCapabilities(value, fallback = FREE_DAILY_PLATFORM_QUOTA) {
  const quota = normalizePolicyQuota(toRecord(value).quota);
  if (!quota || quota.mode !== 'daily_platform_count') return fallback;
  return Math.max(0, Math.floor(Number(quota.freeLimit)));
}

/**
 * @param {unknown} bridgeSettings
 * @param {Record<string, unknown>} capabilities
 * @returns {number}
 */
function resolveInitialFreeQuotaLimit(bridgeSettings, capabilities) {
  const settingsRecord = toRecord(bridgeSettings);
  const cachedPolicy = toRecord(toRecord(settingsRecord.policyCache).payload);
  const fallback = getDailyPlatformQuotaLimitFromCapabilities(capabilities, FREE_DAILY_PLATFORM_QUOTA);
  return getDailyPlatformQuotaLimit(cachedPolicy, fallback);
}

/**
 * @param {string[]} requestedPlatformIds
 * @param {{ payload?: unknown, source?: string }} effectivePolicy
 * @param {Record<string, unknown>} capabilities
 * @returns {{ platformIds: string[], skippedPlatformIds: string[], quotaLimit: number, truncated: boolean }}
 */
function resolvePluginSideQuotaTruncation(requestedPlatformIds, effectivePolicy, capabilities) {
  if (capabilities.proLicensed === true) {
    return {
      platformIds: requestedPlatformIds,
      skippedPlatformIds: [],
      quotaLimit: FREE_DAILY_PLATFORM_QUOTA,
      truncated: false,
    };
  }
  if (!Object.prototype.hasOwnProperty.call(capabilities, 'proLicensed')) {
    return {
      platformIds: requestedPlatformIds,
      skippedPlatformIds: [],
      quotaLimit: FREE_DAILY_PLATFORM_QUOTA,
      truncated: false,
    };
  }

  const policyQuota = effectivePolicy.source !== 'fallback'
    ? normalizePolicyQuota(toRecord(effectivePolicy.payload).quota)
    : null;
  const quota = policyQuota
    || normalizePolicyQuota(toRecord(capabilities).quota)
    || normalizePolicyQuota(toRecord(effectivePolicy.payload).quota);
  if (!quota || quota.mode !== 'daily_platform_count') {
    return {
      platformIds: requestedPlatformIds,
      skippedPlatformIds: [],
      quotaLimit: FREE_DAILY_PLATFORM_QUOTA,
      truncated: false,
    };
  }

  const quotaLimit = Math.max(0, Math.floor(Number(quota.freeLimit)));
  if (requestedPlatformIds.length <= quotaLimit) {
    return {
      platformIds: requestedPlatformIds,
      skippedPlatformIds: [],
      quotaLimit,
      truncated: false,
    };
  }
  return {
    platformIds: requestedPlatformIds.slice(0, quotaLimit),
    skippedPlatformIds: requestedPlatformIds.slice(quotaLimit),
    quotaLimit,
    truncated: true,
  };
}

/**
 * @param {EnqueueResultLike} result
 * @param {{ platformIds: string[], skippedPlatformIds: string[], quotaLimit: number, truncated: boolean }} truncation
 * @returns {EnqueueResultLike}
 */
function mergePluginSkippedPlatformsIntoResult(result, truncation) {
  if (!truncation.skippedPlatformIds.length) return result;
  const skippedPlatformIds = parseWechatsyncPlatformIds([
    ...truncation.skippedPlatformIds,
    ...parseWechatsyncPlatformIds(toUnknownList(result.skippedPlatforms)),
  ]);
  const publishedPlatforms = toUnknownList(result.publishedPlatforms).length
    ? result.publishedPlatforms
    : truncation.platformIds;
  return {
    ...result,
    quotaBlocked: true,
    maxPlatforms: Number.isFinite(Number(result.maxPlatforms))
      ? Number(result.maxPlatforms)
      : truncation.quotaLimit,
    publishedPlatforms,
    skippedPlatforms: skippedPlatformIds,
  };
}

/**
 * @param {unknown} app
 * @param {PlatformLike | null} [platformApi]
 * @returns {boolean}
 */
function isMobileClient(app, platformApi = null) {
  if (typeof platformApi?.isMobile === 'boolean') return platformApi.isMobile;
  return toRecord(app).isMobile === true;
}

/**
 * @param {unknown} view
 * @returns {boolean}
 */
function openPublisherProPage(view) {
  const openedProPage = callBooleanMethod(view, 'openPublisherProPage');
  if (openedProPage !== null) return openedProPage;
  const openedExternalUrl = callBooleanMethod(view, 'openExternalUrl', ['https://xiaoweibox.top/obsidian-publisher/pro/']);
  if (openedExternalUrl !== null) return openedExternalUrl;
  return false;
}

/**
 * @param {unknown} view
 * @param {string} [section]
 * @returns {boolean}
 */
function openPublisherGuidePage(view, section = 'install-extension') {
  const openedGuidePage = callBooleanMethod(view, 'openPublisherGuidePage', [section]);
  if (openedGuidePage !== null) return openedGuidePage;
  const hash = section === 'bridge' ? 'bridge' : 'install-extension';
  const openedExternalUrl = callBooleanMethod(view, 'openExternalUrl', [`https://xiaoweibox.top/obsidian-publisher/guide/?from=obsidian-plugin#${hash}`]);
  if (openedExternalUrl !== null) return openedExternalUrl;
  return false;
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

/**
 * @param {ArrayBuffer | ArrayBufferView | Buffer | unknown} arrayBuffer
 * @returns {Buffer}
 */
function bufferFromArrayBuffer(arrayBuffer) {
  if (Buffer.isBuffer(arrayBuffer)) return arrayBuffer;
  if (arrayBuffer instanceof ArrayBuffer) return Buffer.from(arrayBuffer);
  if (ArrayBuffer.isView(arrayBuffer)) {
    return Buffer.from(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength);
  }
  return Buffer.from(arrayBuffer || []);
}

function getMaterialCoverAssetCacheKey(view, url) {
  return [
    toText(toRecord(view).sessionThumbMediaId),
    String(url || '').trim(),
  ].join('::');
}

function pruneMaterialCoverAssetCache(view, now = Date.now()) {
  const viewRecord = toRecord(view);
  if (!(viewRecord.wechatMaterialCoverAssetCache instanceof Map)) viewRecord.wechatMaterialCoverAssetCache = new Map();
  const cache = /** @type {Map<string, MaterialCoverCacheEntryLike>} */ (viewRecord.wechatMaterialCoverAssetCache);

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

/**
 * @param {BridgeAssetLike} cachedAsset
 * @param {string} id
 * @returns {BridgeAssetLike}
 */
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

/**
 * @param {PublishViewLike} view
 * @param {unknown} coverUrl
 * @param {BridgeAssetLike[]} [assets]
 * @param {PublishModalOptionsLike} [options]
 */
async function downloadMaterialCoverAsBridgeAsset(view, coverUrl, assets = [], options = {}) {
  const viewRecord = toRecord(view);
  const url = String(coverUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('微信素材库封面缺少可下载 URL，无法用于多平台发布。请改用本地封面或 frontmatter cover。');
  }

  const now = Date.now();
  const cacheKey = getMaterialCoverAssetCacheKey(view, url);
  pruneMaterialCoverAssetCache(view, now);
  const cache = /** @type {Map<string, MaterialCoverCacheEntryLike>} */ (viewRecord.wechatMaterialCoverAssetCache);
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

/**
 * @param {PublishModalLike} modal
 * @param {Set<string>} defaultSelectedPlatforms
 * @returns {Set<string>}
 */
function getModalSelectedPlatformIds(modal, defaultSelectedPlatforms) {
  if (!Array.isArray(modal[MODAL_SELECTED_PLATFORM_IDS])) {
    modal[MODAL_SELECTED_PLATFORM_IDS] = Array.from(defaultSelectedPlatforms);
  }
  return new Set(parseWechatsyncPlatformIds(modal[MODAL_SELECTED_PLATFORM_IDS]));
}

/**
 * @param {PublishModalLike} modal
 * @param {Set<string>} selectedPlatforms
 */
function saveModalSelectedPlatformIds(modal, selectedPlatforms) {
  modal[MODAL_SELECTED_PLATFORM_IDS] = Array.from(selectedPlatforms);
}

/**
 * @param {BridgeLike | null | undefined} bridge
 * @param {ConnectionLike} [cachedConnection]
 * @returns {Promise<Record<string, unknown>>}
 */
async function detectQuotaPolicySupport(bridge, cachedConnection = {}) {
  const cachedCapabilities = normalizeWechatSyncCapabilities(toRecord(cachedConnection.capabilities));
  if (!bridge || typeof bridge.health !== 'function') return cachedCapabilities;

  try {
    const health = await bridge.health({ timeoutMs: 5000 });
    return mergeHealthPolicyCapabilities(cachedCapabilities, health);
  } catch (error) {
    if (isUnsupportedBridgeError(error)) return cachedCapabilities;
    const readableError = toReadableError(error);
    console.debug?.('[Wechatsync] quota feature detection skipped', {
      code: readableError.code,
      message: readableError.message,
    });
    return cachedCapabilities;
  }
}

/**
 * @param {PublishViewLike} view
 * @param {ConnectionLike} [cachedConnection]
 * @returns {Record<string, unknown>}
 */
function resolvePublishModalCapabilities(view, cachedConnection = {}) {
  const cachedCapabilities = normalizeWechatSyncCapabilities(toRecord(cachedConnection.capabilities));
  const bridge = /** @type {BridgeLike} */ (view.plugin.getWechatSyncBridgeService());
  const activeClient = typeof bridge.getActiveClientDescriptor === 'function'
    ? bridge.getActiveClientDescriptor()
    : null;
  const activeClientRecord = toRecord(activeClient);
  if (activeClientRecord.capabilities) {
    return mergePolicyCapabilityDetails(
      mergePolicyCapabilityDetails(cachedCapabilities, activeClientRecord.capabilities),
      activeClientRecord
    );
  }

  const status = typeof bridge.getStatus === 'function' ? toRecord(bridge.getStatus()) : {};
  const connectedClients = toRecordList(status.connectedClients);
  const liveClient = connectedClients.find((client) => client.status === 'connected' && client.capabilities);
  const liveClientRecord = toRecord(liveClient);
  return mergePolicyCapabilityDetails(
    mergePolicyCapabilityDetails(cachedCapabilities, liveClientRecord.capabilities),
    liveClientRecord
  );
}

/**
 * @param {PublishViewLike} view
 * @param {PublishModalOptionsLike} [options]
 * @returns {ObsidianApiLike}
 */
/**
 * @param {PublishViewLike} view
 * @param {PublishModalOptionsLike} [options]
 * @returns {ObsidianApiLike}
 */
function getObsidianApi(view, options = {}) {
  return /** @type {ObsidianApiLike} */ (options.obsidianApi
    || view.plugin.obsidianApi
    || getActiveWindowValue('obsidian')
    || {});
}

/**
 * @param {PublishViewLike} view
 * @param {PublishModalOptionsLike} [options]
 * @returns {Promise<void>}
 */
async function showMultiPlatformPublishModal(view, options = {}) {
  const obsidian = getObsidianApi(view, options);
  const { Notice, Platform, setIcon } = obsidian;
  if (!view.currentHtml) {
    new Notice(view.getMissingRenderNotice());
    return;
  }

  const modal = options.modal || new obsidian.Modal(view.app);
  modal.contentEl = asModalElement(modal.contentEl);
  const shouldOpenModal = !options.modal;
  const mobileSync = isMobileClient(view.app, Platform);
  const bridgeSettings = normalizeMultiPlatformSyncSettings(toRecord(view.plugin.settings.multiPlatformSync));
  const cachedConnection = bridgeSettings.connection || normalizeMultiPlatformConnection();
  const cachedConnectionRecord = toRecord(cachedConnection);
  view.preparePublishModalShell(modal, { mode: 'multi', mobileSync });

  const { wechatTab, feishuTab } = view.createPublishModeTabs(modal, 'multi');
  wechatTab.onclick = () => {
    view.showSyncModal({ modal });
  };
  if (feishuTab) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- reason: dynamic tab element click handler
    feishuTab.onclick = () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- reason: dynamic modal invocation
      view.showFeishuSyncModal({ modal });
    };
  }

  if (!bridgeSettings.enabled) {
    const enablePanel = asModalElement(modal.contentEl.createDiv({ cls: 'wechat-multiplatform-enable-panel' }));
    const enableMessage = asModalElement(enablePanel.createDiv({ cls: 'wechat-multiplatform-enable-message' }));
    const enableIcon = asModalElement(enableMessage.createDiv({
      cls: 'wechat-multiplatform-enable-icon',
      attr: { 'aria-hidden': 'true' },
    }));
    if (typeof setIcon === 'function') {
      setIcon(enableIcon, 'plug');
    }
    const enableCopy = asModalElement(enableMessage.createDiv({ cls: 'wechat-multiplatform-enable-copy' }));
    enableCopy.createEl('h3', { text: '启用浏览器插件发布' });
    enableCopy.createEl('p', {
      text: '连接浏览器插件后，可将文章保存到小红书、知乎、头条等平台的草稿箱。',
    });
    const enableActions = asModalElement(enablePanel.createDiv({ cls: 'wechat-multiplatform-enable-actions' }));
    const settingsBtn = asModalElement(enableActions.createEl('button', { text: '去设置', cls: 'mod-cta' }));
    settingsBtn.onclick = () => {
      modal.close();
      if (!view.openPluginSettings()) {
        new Notice('请在设置中打开 Obsidian 发布助手并开启浏览器插件发布');
      }
    };
    const guideBtn = asModalElement(enableActions.createEl('button', { text: '查看安装教程' }));
    guideBtn.onclick = () => openPublisherGuidePage(view, 'install-extension');
    if (shouldOpenModal) modal.open();
    return;
  }

  const intro = asModalElement(modal.contentEl.createDiv({ cls: 'wechat-multiplatform-intro' }));
  const introText = asModalElement(intro.createDiv({ cls: 'wechat-multiplatform-intro-text' }));
  introText.createEl('p', {
    text: '选择平台后通过浏览器插件保存为草稿。',
  });
  introText.createEl('p', {
    text: '💡 提示：多平台发布能力依赖于浏览器插件，建议在电脑端使用。',
    cls: 'wechat-multiplatform-tip',
  });

  const publishModalCapabilities = resolvePublishModalCapabilities(view, cachedConnection);
  const isProLicensed = publishModalCapabilities.proLicensed === true;
  const initialFreeQuotaLimit = resolveInitialFreeQuotaLimit(bridgeSettings, publishModalCapabilities);
  const quotaHint = asModalElement(modal.contentEl.createDiv({
    cls: `wechat-multiplatform-quota-hint ${isProLicensed ? 'is-pro' : 'is-free'}`,
  }));
  if (isProLicensed) {
    quotaHint.createEl('span', {
      text: 'Pro',
      cls: 'wechat-pro-identity-badge wechat-pro-identity-badge-quota',
    });
  } else {
    quotaHint.createEl('span', {
      text: '免费版',
      cls: 'wechat-multiplatform-quota-pill',
    });
  }
  const quotaText = quotaHint.createEl('span', {
    cls: 'wechat-multiplatform-quota-copy',
    text: getQuotaHintText(0, { proLicensed: isProLicensed, freeLimit: initialFreeQuotaLimit }),
  });
  if (!isProLicensed) {
    const quotaUpgradeBtn = asModalElement(quotaHint.createEl('button', {
      text: '升级 Pro',
      cls: 'wechat-multiplatform-quota-link',
    }));
    quotaUpgradeBtn.onclick = () => openPublisherProPage(view);
  }

  const availablePlatforms = toRecordList(getAvailableWechatsyncPlatforms(bridgeSettings));
  const defaultSelectedPlatforms = new Set(
    parseWechatsyncPlatformIds(bridgeSettings.selectedPlatforms || [])
  );
  // 只显示插件设置中已勾选的平台
  const displayedPlatforms = availablePlatforms.filter((p) => defaultSelectedPlatforms.has(getPlatformId(p)));
  const isBridgeReady = cachedConnectionRecord.status === 'connected';
  const modalSelectedPlatforms = getModalSelectedPlatformIds(modal, defaultSelectedPlatforms);

  {
    const description = describeWechatsyncConnectionState(cachedConnectionRecord, { variant: 'modal' });
    renderWechatsyncConnectionStatusBar(modal.contentEl, description);
  }
  const platformListEl = asModalElement(modal.contentEl.createDiv({ cls: 'wechat-multiplatform-list' }));
  /** @type {Set<string>} */
  const selectedPlatforms = new Set();
  console.debug('[Wechatsync] render cached platform state', {
    status: cachedConnectionRecord.status,
    checkedAt: cachedConnectionRecord.checkedAt,
    message: cachedConnectionRecord.message,
    ...summarizeWechatsyncPlatformResponse(cachedConnectionRecord.platforms),
  });

  const btnRow = asModalElement(modal.contentEl.createDiv({ cls: 'wechat-modal-buttons' }));
  const cancelBtn = asModalElement(btnRow.createEl('button', { text: '取消' }));
  const syncBtn = asModalElement(btnRow.createEl('button', { text: '发送到浏览器插件', cls: 'mod-cta' }));
  syncBtn.disabled = true;
  syncBtn.addClass?.('apple-btn-disabled');
  cancelBtn.onclick = () => modal.close();

  const updateQuotaHintText = () => {
    quotaText.textContent = getQuotaHintText(selectedPlatforms.size, {
      proLicensed: isProLicensed,
      freeLimit: initialFreeQuotaLimit,
    });
  };

  const updateSyncButtonState = () => {
    syncBtn.disabled = !isBridgeReady || selectedPlatforms.size === 0;
    if (syncBtn.disabled) {
      syncBtn.addClass?.('apple-btn-disabled');
    } else {
      syncBtn.removeClass?.('apple-btn-disabled');
    }
    updateQuotaHintText();
  };

  /**
   * @param {Record<string, unknown>[]} [platforms]
   */
  const renderPlatforms = (platforms = []) => {
    platformListEl.empty();
    selectedPlatforms.clear();
    const normalizedPlatforms = platforms
      .map((platform) => normalizeWechatsyncPlatform(platform))
      .map(toNormalizedPlatform)
      .filter((platform) => platform !== null);

    if (normalizedPlatforms.length === 0) {
      const empty = asModalElement(platformListEl.createDiv({ cls: 'wechat-multiplatform-state' }));
      empty.createEl('div', { text: '还没有可分发的平台', cls: 'wechat-multiplatform-state-title' });
      empty.createEl('p', { text: '请先连接浏览器插件，或稍后重试读取平台清单。' });
      updateSyncButtonState();
      return;
    }

    for (const platform of normalizedPlatforms) {
      const authBadge = toPlatformStatusBadge(getWechatsyncPlatformStatusBadge(platform, { bridgeConnected: isBridgeReady }));
      const isSelected = isBridgeReady && modalSelectedPlatforms.has(platform.id);
      const row = asModalElement(platformListEl.createDiv({
        cls: `wechat-multiplatform-platform ${isSelected ? `${authBadge.cls} is-selected` : ''} ${!isBridgeReady ? 'is-disabled' : ''}`.trim(),
      }));
      row.setAttribute('title', isSelected ? `${platform.name} · ${authBadge.text}` : platform.name);
      const checkbox = asModalElement(row.createEl('input'));
      checkbox.type = 'checkbox';
      checkbox.value = platform.id;
      checkbox.checked = isSelected;
      checkbox.disabled = !isBridgeReady;
      if (isSelected) selectedPlatforms.add(platform.id);
      const label = asModalElement(row.createEl('label', { cls: 'wechat-multiplatform-platform-label' }));
      label.createEl('span', { text: platform.name, cls: 'wechat-multiplatform-platform-name' });
      const statusEl = asModalElement(label.createEl('span', {
        text: authBadge.text,
        cls: `wechat-multiplatform-platform-status ${authBadge.cls}`,
      }));
      statusEl.setAttribute('title', authBadge.text);
      const setStatusVisible = (visible) => {
        for (const cls of ['is-ok', 'is-error', 'is-unknown', 'is-bridge']) {
          row.removeClass?.(cls);
          row.classList?.remove(cls);
          statusEl.removeClass?.(cls);
          statusEl.classList?.remove(cls);
        }
        statusEl.textContent = authBadge.text;
        if (visible) {
          row.addClass?.(authBadge.cls);
          row.classList?.add(authBadge.cls);
          statusEl.addClass?.(authBadge.cls);
          statusEl.classList?.add(authBadge.cls);
        }
        row.setAttribute('title', visible ? `${platform.name} · ${authBadge.text}` : platform.name);
      };
      label.onclick = () => {
        if (!checkbox.disabled) checkbox.click();
      };
      checkbox.onchange = () => {
        if (checkbox.checked) {
          selectedPlatforms.add(platform.id);
          row.addClass?.('is-selected');
          row.classList?.add('is-selected');
          setStatusVisible(true);
          if (authBadge.status === 'login_required') {
            new Notice(`${platform.name} 上次状态为需登录。请先在浏览器插件打开平台登录页，或继续尝试由插件返回实际结果。`, 8000);
          }
          if (authBadge.status === 'unknown') {
            new Notice(`${platform.name} 此前未检测，发布结果以浏览器插件实际执行为准。`, 6000);
          }
        } else {
          selectedPlatforms.delete(platform.id);
          row.removeClass?.('is-selected');
          row.classList?.remove('is-selected');
          setStatusVisible(false);
        }
        saveModalSelectedPlatformIds(modal, selectedPlatforms);
        updateSyncButtonState();
      };
    }
    updateSyncButtonState();
  };

  renderPlatforms(displayedPlatforms);

  syncBtn.onclick = async () => {
    if (!isBridgeReady) {
      new Notice('请先连接浏览器插件，再发送多平台发布任务。', 8000);
      return;
    }
    if (selectedPlatforms.size === 0) {
      new Notice('请先选择至少一个平台');
      return;
    }
    const activeFile = view.getPublishContextFile();
    const publishMeta = view.getFrontmatterPublishMeta(activeFile);
    const currentPath = activeFile ? activeFile.path : null;
    const cachedState = currentPath ? view.articleStates.get(currentPath) : null;
    const title = cachedState?.title || publishMeta?.title || activeFile?.basename || '无标题文章';
    const rawMarkdown = stripMarkdownFrontmatter(view.lastResolvedMarkdown || '');
    const exportHtml = view.getCurrentExportHtml() || view.currentHtml || '';
    const selectedWechatMaterialCover = !!view.sessionThumbMediaId;
    const rawCover = getBridgeSafeSessionCover(view.sessionCoverBase64) || publishMeta.cover || '';
    const notice = new Notice('正在准备并发送到浏览器插件...', 0);
    syncBtn.disabled = true;
    syncBtn.addClass?.('apple-btn-disabled');
    const sendStartedAt = Date.now();
    const requestedPlatformIds = Array.from(selectedPlatforms);
    try {
      const bridge = view.plugin.getWechatSyncBridgeService();
      const [detectedCapabilities, effectivePolicy] = await Promise.all([
        detectQuotaPolicySupport(bridge, cachedConnection),
        getEffectiveObsidianPublisherPolicy(view.plugin, {
          requestUrl: obsidian.requestUrl,
          clientVersion: getObsidianPluginVersion(view.plugin),
        }),
      ]);
      const pluginPolicyGate = checkObsidianPluginPolicyGate(
        effectivePolicy.payload,
        getObsidianPluginVersion(view.plugin)
      );
      if (!pluginPolicyGate.allowed) {
        notice.hide();
        new Notice(`❌ ${pluginPolicyGate.message || '当前 Obsidian 插件版本过低，请升级后继续发布。'}`, 10000);
        return;
      }
      const extensionPolicyGate = checkExtensionPolicyGate(effectivePolicy.payload, {
        currentVersion: toText(detectedCapabilities.extensionVersion),
        remotePolicySupported: detectedCapabilities.remotePolicy === true,
      });
      if (!extensionPolicyGate.allowed) {
        notice.hide();
        new Notice(`❌ ${extensionPolicyGate.message || '当前浏览器扩展版本过低，请升级后继续发布。'}`, 10000);
        return;
      }
      if (pluginPolicyGate.warning) {
        console.debug('[Wechatsync] Obsidian plugin upgrade recommended by policy', {
          currentVersion: getObsidianPluginVersion(view.plugin),
          minObsidianPluginVersion: pluginPolicyGate.minObsidianPluginVersion,
          policyVersion: toRecord(effectivePolicy.payload).policyVersion,
        });
      }
      if (extensionPolicyGate.warning) {
        console.debug('[Wechatsync] browser extension upgrade recommended by policy', {
          currentVersion: toText(detectedCapabilities.extensionVersion),
          minExtensionVersion: extensionPolicyGate.minExtensionVersion,
          policyVersion: toRecord(effectivePolicy.payload).policyVersion,
        });
      }
      const platformTruncation = resolvePluginSideQuotaTruncation(
        requestedPlatformIds,
        effectivePolicy,
        detectedCapabilities
      );
      if (platformTruncation.truncated) {
        console.debug('[Wechatsync] request pre-truncated by Obsidian plugin policy', {
          requestedPlatformCount: requestedPlatformIds.length,
          enqueuedPlatformCount: platformTruncation.platformIds.length,
          skippedPlatformCount: platformTruncation.skippedPlatformIds.length,
          quotaLimit: platformTruncation.quotaLimit,
          policyVersion: toRecord(effectivePolicy.payload).policyVersion,
          policySource: effectivePolicy.source,
        });
      }
      const resolvedImages = toResolvedImages(await resolveArticleImages(rawMarkdown, activeFile, {
        app: view.app,
        cover: rawCover,
      }));
      if (resolvedImages.warnings?.length) {
        throw new Error(`本地图片处理失败：${formatArticleImageWarnings(resolvedImages.warnings)}`);
      }
      const markdown = resolvedImages.markdown;
      const assets = resolvedImages.assets;
      const fallbackCover = view.getFirstImageFromArticle();
      let cover = resolvedImages.cover
        || resolvedImages.firstImageSrc
        || (/^(https?:\/\/|data:image\/)/i.test(fallbackCover || '') ? fallbackCover : '')
        || '';
      if (selectedWechatMaterialCover) {
        const materialCover = await downloadMaterialCoverAsBridgeAsset(view, view.sessionCoverBase64, assets, {
          requestUrl: obsidian.requestUrl,
        });
        cover = materialCover.cover;
      }
      // Bridge flow: do NOT inline base64 (assets[] carries bytes
      // separately). The ViaBridge variant maps app:// img srcs to
      // asset://<id> using the assets[] metadata directly. Sticking with
      // the legacy prepareHtmlForWechatsyncArticle would double-encode
      // every local image and break extension-side retry on redacted
      // base64.
      const content = await view.prepareHtmlForWechatsyncArticleViaBridge(exportHtml, assets);

      // Invariant guard (handover §3.2): bridge content[] must never carry
      // inline base64 image bytes — assets[] is the single source of truth
      // for image bytes, and the extension has to redact base64 from
      // history to fit chrome.storage.local quota. A leak here would break
      // the extension's retry path. Warn loud (do not abort) so an
      // unrelated regression surfaces in dev while users can still publish.
      const base64Matches = String(content || '').match(/data:image\/[a-z]+;base64,/gi);
      if (base64Matches && base64Matches.length) {
        console.error('[Wechatsync] bridge content contains inline base64 images — this should never happen on bridge flow. Likely a regression in prepareHtmlForWechatsyncArticleViaBridge or a forgotten callsite using the legacy preparator.', {
          inlineBase64ImageCount: base64Matches.length,
          contentLength: content.length,
          assetCount: assets.length,
          title,
        });
      }

      // Generate a small inline cover thumbnail when the resolved cover is
      // a local asset. The extension popup History list cannot resolve
      // asset:// URLs in plain <img src>; previously the only fallback was
      // for the extension to re-decode + resize the full asset bytes at
      // first paint. coverThumbnail short-circuits that: a ≤8KB JPEG data
      // URL the extension can drop straight into <img src>. Purely
      // additive — older extensions just ignore the field.
      const coverAsset = toBridgeAsset(findAssetForCover(cover, assets));
      const coverThumbnail = coverAsset
        ? await view.generateCoverThumbnailFromAsset(coverAsset)
        : '';

      console.debug('[Wechatsync] enqueueSyncArticle started', {
        platformCount: platformTruncation.platformIds.length,
        requestedPlatformCount: requestedPlatformIds.length,
        platforms: requestedPlatformIds,
        enqueuedPlatforms: platformTruncation.platformIds,
        skippedByPluginPolicy: platformTruncation.skippedPlatformIds,
        title,
        hasMarkdown: !!markdown,
        contentLength: content.length,
        hasCover: !!cover,
        hasCoverThumbnail: !!coverThumbnail,
        coverThumbnailBytes: coverThumbnail.length,
        assetCount: assets.length,
        assetBytes: assets.reduce((sum, asset) => sum + (asset.size || 0), 0),
      });
      /** @type {EnqueueResultLike | null} */
      let result = null;
      let usedFallbackSend = false;
      if (platformTruncation.platformIds.length === 0) {
        result = {
          accepted: false,
          reason: 'daily_limit',
          quotaBlocked: true,
          maxPlatforms: platformTruncation.quotaLimit,
          publishedPlatforms: [],
          skippedPlatforms: requestedPlatformIds,
          message: `免费版今日 ${platformTruncation.quotaLimit} 个平台额度已用完，明天 0:00 重置，或升级 Pro。`,
        };
      } else {
        try {
          result = toEnqueueResult(await bridge.enqueueSyncArticle({
            platforms: platformTruncation.platformIds,
            title,
            markdown,
            content,
            cover,
            coverThumbnail,
            assets,
            source: 'obsidian',
            quotaPolicy: QUOTA_POLICY,
          }));
        } catch (enqueueError) {
          if (!isUnsupportedBridgeError(enqueueError)) throw enqueueError;
          usedFallbackSend = true;
          console.warn('[Wechatsync] enqueueSyncArticle unsupported, falling back to one-way syncArticle', enqueueError);
          result = toEnqueueResult(await bridge.sendArticle({
            platforms: platformTruncation.platformIds,
            title,
            markdown,
            content,
            cover,
            coverThumbnail,
            assets,
            quotaPolicy: QUOTA_POLICY,
          }));
        }
        result = mergePluginSkippedPlatformsIntoResult(result, platformTruncation);
      }
      console.debug('[Wechatsync] enqueueSyncArticle accepted', {
        elapsedMs: Date.now() - sendStartedAt,
        resultKind: Array.isArray(result) ? 'array' : typeof result,
        syncId: result?.syncId,
        requestId: result?.requestId,
        accepted: result?.accepted,
        quotaBlocked: result?.quotaBlocked,
        skippedPlatforms: result?.skippedPlatforms,
        usedFallbackSend,
        platformCount: platformTruncation.platformIds.length,
        requestedPlatformCount: requestedPlatformIds.length,
        supportsQuotaPolicy: detectedCapabilities.quotaPolicy === true,
        remotePolicy: detectedCapabilities.remotePolicy === true,
      });
      const currentMultiPlatformSettings = normalizeMultiPlatformSyncSettings(view.plugin.settings.multiPlatformSync);
      const connectionRecord = toRecord(currentMultiPlatformSettings.connection);
      if (result?.accepted === false) {
        notice.hide();
        modal.close();
        view.plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
          ...currentMultiPlatformSettings,
          connection: {
            ...connectionRecord,
            status: 'connected',
            checkedAt: Date.now(),
            capabilities: {
              ...toRecord(connectionRecord.capabilities),
              ...detectedCapabilities,
            },
            message: result?.message || '浏览器插件已拒绝本次发布。',
          },
        });
        await view.plugin.saveSettings();
        view.showMultiPlatformQuotaBlockedModal({
          quotaResult: result,
          requestedPlatformIds,
        });
        return;
      }
      if (result?.syncId) notice.setMessage('已投递，正在读取插件任务状态...');
      const taskSnapshot = result?.syncId
        ? await view.getWechatsyncTaskSnapshot(bridge, result.syncId)
        : null;
      const immediateResults = toUnknownList(normalizeWechatSyncResponseResults(result));
      const taskSnapshotRecord = toRecord(taskSnapshot);
      const taskResults = toTaskResults(taskSnapshotRecord.platforms);
      const cachedPlatformsAfterSync = updateCachedPlatformsAfterSync(
        toRecordList(connectionRecord.platforms),
        immediateResults.length ? immediateResults : taskResults
      );
      notice.hide();
      modal.close();
      const nextRecentTasks = result?.syncId
        ? normalizeWechatSyncRecentTasks([
          {
            syncId: result.syncId,
            title,
            platforms: getRecentTaskPlatforms(result, requestedPlatformIds),
            createdAt: Date.now(),
          },
          ...toUnknownList(currentMultiPlatformSettings.recentTasks),
        ])
        : currentMultiPlatformSettings.recentTasks;
      view.plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
        ...currentMultiPlatformSettings,
        recentTasks: nextRecentTasks,
        connection: {
          ...connectionRecord,
          status: 'connected',
          checkedAt: Date.now(),
          platforms: cachedPlatformsAfterSync,
          capabilities: {
            ...toRecord(connectionRecord.capabilities),
            ...detectedCapabilities,
          },
          message: '',
        },
      });
      await view.plugin.saveSettings();
      view.showWechatsyncEnqueueAcceptedModal({
        syncId: result?.syncId || '',
        title,
        platforms: requestedPlatformIds,
        task: taskSnapshot,
        usedFallbackSend,
        quotaResult: result,
      });
    } catch (error) {
      notice.hide();
      const readableError = toReadableError(error);
      console.error('[Wechatsync] enqueueSyncArticle failed', {
        elapsedMs: Date.now() - sendStartedAt,
        code: readableError.code,
        message: readableError.message,
        stack: readableError.stack,
        requestedPlatformIds,
      });
      // §4.1: surface EXTENSION_NOT_AUTHENTICATED with a dedicated message
      // so users know the extension is reachable but failed the handshake,
      // rather than reusing the generic "connection failed" copy.
      const displayMessage = readableError.code === 'EXTENSION_NOT_AUTHENTICATED'
        ? '浏览器插件已连接但未通过握手认证。如果你刚刚在浏览器插件设置中重置过令牌，请到本插件的"多平台同步"设置页粘贴新令牌；否则请确认插件已升级到支持安全握手的版本。'
        : (readableError.message || '浏览器插件连接失败');
      if (isWechatSyncConnectionFailure(readableError)) {
        const currentMultiPlatformSettings = normalizeMultiPlatformSyncSettings(view.plugin.settings.multiPlatformSync);
        view.plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
          ...currentMultiPlatformSettings,
          connection: {
            ...toRecord(currentMultiPlatformSettings.connection),
            status: 'failed',
            checkedAt: Date.now(),
            message: displayMessage,
          },
        });
        await view.plugin.saveSettings();
      }
      modal.close();
      new Notice(`❌ 发送到浏览器插件失败：${displayMessage}`, 10000);
      view.showMultiPlatformSyncResultModal({
        requestedPlatformIds,
        fatalError: error,
      });
    } finally {
      updateSyncButtonState();
    }
  };

  if (shouldOpenModal) modal.open();
}

export { showMultiPlatformPublishModal };
