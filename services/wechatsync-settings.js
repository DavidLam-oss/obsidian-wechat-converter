/*
## 核心功能

实现浏览器发布助手桥接的 wechatsync settings 能力。

## 输入

接收多平台发布任务、浏览器扩展回传、平台设置和同步结果。

## 输出

输出 `createDefaultMultiPlatformSyncSettings`、`normalizeConnectedClient`、`normalizeConnectedClients`、`normalizeWechatsyncPlatformId`、`parseWechatsyncPlatformIds`、`mergeWechatsyncPlatformLists`、`normalizeWechatSyncCapabilities`、`hasWechatSyncCapability`、`resolveWechatSyncProLicense`、`hasWechatSyncProLicense`、`normalizeWechatSyncRecentTasks`，用于桥接调用、结果归一化和平台状态展示。其中 `resolveWechatSyncProLicense` 在浏览器扩展离线时按 `PRO_LICENSE_STALENESS_MS` 窗口回退到本地 license 缓存，区分 live/cached/none 供 UI 精确展示。

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

import { DEFAULT_WECHATSYNC_PORT, PRO_LICENSE_STALENESS_MS } from './wechatsync-constants.js';
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
    pairedClients: [],
    pendingClients: [],
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
  const licenseSource = asRecord(source.license);
  const licenseState = ['pro', 'free', 'unknown'].includes(licenseSource.state)
    ? licenseSource.state
    : (source.capabilities?.proLicensed === true ? 'pro' : 'unknown');
  return {
    extensionInstanceId: id,
    browserName: typeof source.browserName === 'string' ? source.browserName : '',
    profileLabel: typeof source.profileLabel === 'string' ? source.profileLabel : '',
    capabilities: isRecord(source.capabilities)
      ? { ...source.capabilities }
      : {},
    license: {
      state: licenseState,
      observedAt: Number.isFinite(Number(licenseSource.observedAt))
        ? Number(licenseSource.observedAt)
        : now,
    },
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

export function normalizePairedClient(value) {
  if (!isRecord(value)) return null;
  const source = asRecord(value);
  const extensionInstanceId = String(source.extensionInstanceId || '').trim();
  const credentialHash = String(source.credentialHash || '').trim();
  if (!extensionInstanceId || !/^[a-f0-9]{64}$/i.test(credentialHash)) return null;
  return {
    extensionInstanceId,
    credentialHash,
    pairedAt: Number.isFinite(Number(source.pairedAt)) ? Number(source.pairedAt) : Date.now(),
    browserName: typeof source.browserName === 'string' ? source.browserName : '',
    profileLabel: typeof source.profileLabel === 'string' ? source.profileLabel : '',
  };
}

export function normalizePairedClients(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizePairedClient).filter(Boolean).slice(0, 20);
}

export function normalizePendingClient(value) {
  if (!isRecord(value)) return null;
  const source = asRecord(value);
  const extensionInstanceId = String(source.extensionInstanceId || '').trim();
  const credentialHash = String(source.credentialHash || '').trim();
  if (!extensionInstanceId || !/^[a-f0-9]{64}$/i.test(credentialHash)) return null;
  return {
    extensionInstanceId,
    credentialHash,
    detectedAt: Number.isFinite(Number(source.detectedAt)) ? Number(source.detectedAt) : Date.now(),
    browserName: typeof source.browserName === 'string' ? source.browserName : '',
    profileLabel: typeof source.profileLabel === 'string' ? source.profileLabel : '',
    extensionVersion: typeof source.extensionVersion === 'string' ? source.extensionVersion : '',
    reason: typeof source.reason === 'string' ? source.reason : 'pairing_required',
  };
}

export function normalizePendingClients(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizePendingClient).filter(Boolean).slice(0, 20);
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

/**
 * Determine whether a persisted connected-client's Pro license snapshot is
 * still within the offline cache window. Defensive against invalid or
 * clock-skewed timestamps:
 *  - non-finite / <= 0 observedAt is untrusted → does not sustain Pro.
 *  - a future observedAt (system clock rolled back) is treated leniently as
 *    "not stale" so paying users are not wrongly downgraded.
 * @param {UnknownRecord} license
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
function isProLicenseWithinStaleness(license, now = Date.now()) {
  const source = asRecord(license);
  if (source.state !== 'pro') return false;
  const observedAt = Number(source.observedAt);
  if (!Number.isFinite(observedAt) || observedAt <= 0) return false;
  const age = now - observedAt;
  if (age < 0) return true; // clock rolled back — do not penalize paid users
  return age < PRO_LICENSE_STALENESS_MS;
}

/**
 * Resolve the effective Pro-license state for the multi-platform sync
 * feature, distinguishing a live connection from an offline cache hit so the
 * UI can render accurate messaging.
 *
 * `source`:
 *  - 'live'   — a currently connected client reports Pro.
 *  - 'cached' — no live Pro connection, but a disconnected client's Pro
 *               snapshot is still within the staleness window.
 *  - 'none'   — no Pro signal within the window.
 *
 * @param {UnknownRecord} [settings={}]
 * @param {number} [now=Date.now()]
 * @returns {{ pro: boolean, source: 'live' | 'cached' | 'none', observedAt: number | null, staleAfter: number | null }}
 */
export function resolveWechatSyncProLicense(settings = {}, now = Date.now()) {
  const normalized = normalizeMultiPlatformSyncSettings(settings);
  const clients = normalized.connectedClients || [];
  /** @type {UnknownRecord | null} */
  let liveClient = null;
  /** @type {UnknownRecord | null} */
  let cachedClient = null;
  for (const client of clients) {
    if (!isProLicenseWithinStaleness(client?.license, now)) continue;
    if (client?.status === 'connected') {
      if (!liveClient || Number(client.license.observedAt) > Number(liveClient.license.observedAt)) {
        liveClient = client;
      }
    } else if (!cachedClient || Number(client.license.observedAt) > Number(cachedClient.license.observedAt)) {
      cachedClient = client;
    }
  }
  const chosen = liveClient || cachedClient;
  if (!chosen) {
    return { pro: false, source: 'none', observedAt: null, staleAfter: null };
  }
  const observedAt = Number(chosen.license.observedAt);
  return {
    pro: true,
    source: liveClient ? 'live' : 'cached',
    observedAt: Number.isFinite(observedAt) ? observedAt : null,
    staleAfter: Number.isFinite(observedAt) ? observedAt + PRO_LICENSE_STALENESS_MS : null,
  };
}

export function hasWechatSyncProLicense(settings = {}) {
  return resolveWechatSyncProLicense(settings).pro;
}

/**
 * Fold a bridge client-registry snapshot back into the persisted
 * multi-platform settings. Besides replacing `connectedClients`, a live
 * (hello-authenticated) client also promotes `connection.status` to
 * 'connected': the WebSocket handshake is at least as strong a connectivity
 * proof as the manual 「测试连接」 check, and without this promotion a plugin
 * reload leaves `connection.status` stuck at 'untested' — platform badges
 * and the publish modal would keep claiming the bridge is offline even
 * though the extension has already reconnected.
 *
 * The promotion is skipped when the status is already 'connected' so a
 * previous check's `checkedAt` / cached `platforms` are not overwritten by
 * every registry heartbeat. Disconnects deliberately leave `connection`
 * untouched (same as today: the last check result remains the last check
 * result; the live/offline distinction is rendered from `connectedClients`).
 *
 * @param {UnknownRecord} [settings={}]
 * @param {unknown} [clients=[]]
 * @param {number} [now=Date.now()]
 * @returns {ReturnType<typeof normalizeMultiPlatformSyncSettings>}
 */
export function applyClientRegistryToMultiPlatformSettings(settings = {}, clients = [], now = Date.now()) {
  const current = normalizeMultiPlatformSyncSettings(settings);
  const registry = Array.isArray(clients) ? clients : [];
  const hasLiveClient = registry.some((client) => asRecord(client).status === 'connected');
  const connection = asRecord(current.connection);
  return normalizeMultiPlatformSyncSettings({
    ...current,
    connectedClients: registry,
    ...(hasLiveClient && connection.status !== 'connected'
      ? {
        connection: {
          ...connection,
          status: 'connected',
          checkedAt: now,
          message: '',
        },
      }
      : {}),
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
    pairedClients: normalizePairedClients(source.pairedClients),
    pendingClients: normalizePendingClients(source.pendingClients),
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
