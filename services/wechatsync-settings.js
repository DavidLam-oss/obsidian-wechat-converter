/*
## 核心功能

实现浏览器发布助手桥接的 wechatsync settings 能力。

## 输入

接收多平台发布任务、浏览器扩展回传、平台设置和同步结果。

## 输出

输出 `createDefaultMultiPlatformSyncSettings`、`normalizeConnectedClient`、`normalizeConnectedClients`、`normalizeWechatsyncPlatformId`、`parseWechatsyncPlatformIds`、`mergeWechatsyncPlatformLists`、`normalizeWechatSyncCapabilities`、`hasWechatSyncCapability`、`hasWechatSyncProLicense`、`normalizeWechatSyncRecentTasks`，用于桥接调用、结果归一化和平台状态展示。

## 定位

位于 services/，属于多平台桥接服务层；保持与发布弹窗 UI 解耦。

## 依赖

关键依赖：`./wechatsync-constants.js`、`./wechatsync-results.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// services/wechatsync-settings.js
//
// Pure data helpers for the multi-platform sync (浏览器插件) feature.
// Previously inlined at the top of input.js (lines 73-236). Extracted so
// the views/ layer can normalize / read settings without depending on
// input.js (which would create a cycle).
//
// All functions are pure — no DOM, no Obsidian API, no side effects.

import { DEFAULT_WECHATSYNC_PORT } from './wechatsync-constants.js';
import {
  buildWechatsyncPlatformCatalog,
  getFallbackWechatsyncPlatforms,
  normalizeWechatsyncPlatform,
} from './wechatsync-results.js';

/**
 * @typedef {Record<string, unknown>} UnknownRecord
 * @typedef {{
 *   id: string,
 *   name?: string,
 *   homepage?: string,
 *   icon?: string,
 *   capabilities?: string[],
 *   authKnown?: boolean,
 *   authenticated?: boolean,
 *   username?: string,
 *   error?: string,
 *   custom?: boolean,
 * }} PlatformLike
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

/**
 * @param {unknown} value
 * @returns {PlatformLike | null}
 */
function normalizePlatformCandidate(value) {
  return /** @type {PlatformLike | null} */ (
    normalizeWechatsyncPlatform(isRecord(value) ? value : {})
  );
}

export function createDefaultMultiPlatformSyncSettings() {
  return {
    enabled: false,
    port: DEFAULT_WECHATSYNC_PORT,
    token: '',
    allowRemote: false,
    supportedPlatforms: [],
    connectedClients: [],
    selectedPlatforms: [],
    recentTasks: [],
    policyCache: null,
    connection: {
      status: 'untested',
      checkedAt: 0,
      platforms: [],
      message: '',
    },
  };
}

export function normalizeConnectedClient(value) {
  if (!isRecord(value)) return null;
  const source = asRecord(value);
  const id = String(source.extensionInstanceId || '').trim();
  if (!id) return null;
  const status = source.status === 'connected' ? 'connected' : 'disconnected';
  const now = Date.now();
  return {
    extensionInstanceId: id,
    browserName: typeof source.browserName === 'string' ? source.browserName : '',
    profileLabel: typeof source.profileLabel === 'string' ? source.profileLabel : '',
    capabilities: isRecord(source.capabilities)
      ? { ...source.capabilities }
      : {},
    extensionVersion: typeof source.extensionVersion === 'string' ? source.extensionVersion : '',
    status,
    lastSeenAt: Number.isFinite(Number(source.lastSeenAt)) ? Number(source.lastSeenAt) : now,
    firstConnectedAt: Number.isFinite(Number(source.firstConnectedAt)) ? Number(source.firstConnectedAt) : now,
    lastConnectedAt: Number.isFinite(Number(source.lastConnectedAt)) ? Number(source.lastConnectedAt) : now,
  };
}

export function normalizeConnectedClients(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeConnectedClient(entry)).filter(Boolean);
}

export function normalizeWechatsyncPlatformId(value = '') {
  const id = String(value || '').trim().toLowerCase();
  if (id === 'twitter') return 'x';
  return id && id !== 'weixin' ? id : '';
}

export function parseWechatsyncPlatformIds(value = []) {
  const rawIds = Array.isArray(value)
    ? value
    : String(value || '').split(/[\s,，;；]+/);
  const seen = new Set();
  return rawIds
    .map((id) => normalizeWechatsyncPlatformId(String(id || '')))
    .filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

/**
 * @param {...unknown} lists
 * @returns {PlatformLike[]}
 */
export function mergeWechatsyncPlatformLists(...lists) {
  /** @type {Map<string, PlatformLike>} */
  const byId = new Map();
  for (const list of lists) {
    for (const platform of Array.isArray(list) ? list : []) {
      const normalized = normalizePlatformCandidate(platform);
      if (!normalized) continue;
      byId.set(normalized.id, {
        ...(byId.get(normalized.id) || {}),
        ...normalized,
      });
    }
  }
  return Array.from(byId.values());
}

export function normalizeWechatSyncCapabilities(value = {}) {
  const source = asRecord(value);
  const knownKeys = [
    'enqueueSyncArticle',
    'listSupportedPlatforms',
    'checkAuth',
    'getSyncTask',
    'getSyncTaskLink',
    'openSyncTask',
    'getAuthSnapshot',
    'quotaPolicy',
    'remotePolicy',
    // Set by Obsidian Publisher >= 0.2.6 when LicenseManager reports an
    // active Pro tier; the publish modal hides upgrade affordances when true.
    'proLicensed',
  ];
  return knownKeys.reduce((result, key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key] === true;
    return result;
  }, /** @type {Record<string, boolean>} */ ({}));
}

export function hasWechatSyncCapability(settings = {}, capability = '') {
  const capabilities = normalizeMultiPlatformSyncSettings(settings).connection.capabilities || {};
  return capabilities[capability] === true;
}

export function hasWechatSyncProLicense(settings = {}) {
  const normalized = normalizeMultiPlatformSyncSettings(settings);
  if (normalized.connection?.capabilities?.proLicensed === true) return true;
  return (normalized.connectedClients || []).some((client) => {
    if (client?.status !== 'connected') return false;
    return normalizeWechatSyncCapabilities(client.capabilities || {}).proLicensed === true;
  });
}

export function normalizeWechatSyncRecentTasks(value = []) {
  const tasks = Array.isArray(value) ? value : [];
  const seen = new Set();
  return tasks
    .map((task) => {
      const source = asRecord(task);
      const syncId = String(source.syncId || '').trim();
      if (!syncId || seen.has(syncId)) return null;
      seen.add(syncId);
      return {
        syncId,
        title: String(source.title || '无标题文章'),
        platforms: parseWechatsyncPlatformIds(source.platforms || []),
        createdAt: Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : Date.now(),
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

export function normalizeMultiPlatformConnection(value = {}) {
  const source = asRecord(value);
  const status = ['connected', 'failed', 'untested'].includes(source.status)
    ? source.status
    : 'untested';
  return {
    status,
    checkedAt: Number.isFinite(Number(source.checkedAt)) ? Number(source.checkedAt) : 0,
    platforms: Array.isArray(source.platforms)
      ? /** @type {PlatformLike[]} */ (
          source.platforms
            .map((platform) => normalizePlatformCandidate(platform))
            .filter(Boolean)
        )
      : [],
    message: typeof source.message === 'string' ? source.message : '',
    capabilities: normalizeWechatSyncCapabilities(source.capabilities),
  };
}

function normalizeWechatSyncPolicyCache(value = null) {
  if (!isRecord(value)) return null;
  const source = asRecord(value);
  const payload = asRecord(source.payload);
  const cachedAt = Number(source.cachedAt);
  if (!isRecord(source.payload) || typeof source.signature !== 'string' || !Number.isFinite(cachedAt)) {
    return null;
  }
  return {
    payload: { ...payload },
    signature: source.signature,
    cachedAt,
  };
}

export function normalizeMultiPlatformSyncSettings(value = {}) {
  const defaults = createDefaultMultiPlatformSyncSettings();
  const source = asRecord(value);
  const portNumber = Number(source.port);
  const fallbackPlatformIds = new Set(getFallbackWechatsyncPlatforms().map((platform) => platform.id));
  const supportedPlatforms = /** @type {PlatformLike[]} */ (
    mergeWechatsyncPlatformLists(source.supportedPlatforms)
  );
  const supportedPlatformIds = new Set(supportedPlatforms.map((platform) => platform.id));
  const selectablePlatformIds = new Set([...fallbackPlatformIds, ...supportedPlatformIds]);
  const selectedPlatforms = parseWechatsyncPlatformIds(source.selectedPlatforms)
    .filter((id) => selectablePlatformIds.has(id));
  return {
    enabled: !!source.enabled,
    port: Number.isInteger(portNumber) && portNumber > 0 && portNumber < 65536
      ? portNumber
      : defaults.port,
    token: typeof source.token === 'string' ? source.token.trim() : '',
    allowRemote: source.allowRemote === true,
    supportedPlatforms,
    selectedPlatforms,
    connection: normalizeMultiPlatformConnection(source.connection),
    recentTasks: normalizeWechatSyncRecentTasks(source.recentTasks),
    connectedClients: normalizeConnectedClients(source.connectedClients),
    policyCache: normalizeWechatSyncPolicyCache(source.policyCache),
  };
}

export function getConfiguredWechatsyncPlatforms(settings = {}, cachedPlatforms = []) {
  const normalizedSettings = normalizeMultiPlatformSyncSettings(settings);
  /** @type {Map<string, PlatformLike>} */
  const availableById = new Map(
    mergeWechatsyncPlatformLists(getFallbackWechatsyncPlatforms(), normalizedSettings.supportedPlatforms)
      .map((platform) => [platform.id, platform])
  );
  /** @type {Map<string, PlatformLike>} */
  const cachedById = new Map(
    (cachedPlatforms || [])
      .map((platform) => normalizePlatformCandidate(platform))
      .filter(Boolean)
      .map((platform) => [platform.id, platform])
  );

  return (normalizedSettings.selectedPlatforms || [])
    .map((id) => {
      const fallback = availableById.get(id) || { id, name: id, custom: true };
      const cached = cachedById.get(id);
      return cached
        ? { ...fallback, ...cached, authKnown: true }
        : { ...fallback, authKnown: false, authenticated: false, username: '', error: '' };
    })
    .filter((platform) => platform.id !== 'weixin');
}

export function getAvailableWechatsyncPlatforms(settings = {}) {
  const normalizedSettings = normalizeMultiPlatformSyncSettings(settings);
  const catalog = /** @type {PlatformLike[]} */ (buildWechatsyncPlatformCatalog({
    supportedPlatforms: normalizedSettings.supportedPlatforms,
    authSnapshotPlatforms: normalizedSettings.connection?.platforms || [],
    bridgeConnected: normalizedSettings.connection?.status === 'connected',
  }));
  return catalog;
}
