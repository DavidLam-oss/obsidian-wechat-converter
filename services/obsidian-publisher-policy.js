import { createObsidianFetchAdapter } from './obsidian-fetch-adapter.js';
import { normalizeMultiPlatformSyncSettings } from './wechatsync-settings.js';

const PRODUCT_ID = 'obsidian-publisher';
const POLICY_CLIENT = 'obsidian-plugin';
const FALLBACK_LICENSE_PUBLIC_KEY = 'Xm_sBLP69WoJ2LpddMzRYCzVk6G1BlBsGMyHFNq0fUw';
const LICENSE_WORKER_URLS = [
  'https://license.xiaoweibox.top',
  'https://license-cn.xiaoweibox.top',
];
const POLICY_REQUEST_TIMEOUT_MS = 10000;
const POLICY_GRACE_SECONDS = 24 * 60 * 60;
const FALLBACK_FREE_DAILY_PLATFORM_QUOTA = 1;
const DEFAULT_PRO_UPGRADE_URL = 'https://xiaoweibox.top/obsidian-publisher/pro';
const DEFAULT_EXTENSION_UPGRADE_URL = 'https://xiaoweibox.top/obsidian-publisher/download';
const DEFAULT_OBSIDIAN_PLUGIN_UPGRADE_URL = 'obsidian://show-plugin?id=wechat-converter';

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
 * @returns {string}
 */
function toText(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalizePolicyPayload(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalize: non-finite number not allowed');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizePolicyPayload(item ?? null)).join(',')}]`;
  }
  if (isRecord(value)) {
    const parts = Object.keys(value)
      .filter((key) => value[key] !== undefined && typeof value[key] !== 'function')
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizePolicyPayload(value[key])}`);
    return `{${parts.join(',')}}`;
  }
  throw new Error(`canonicalize: unsupported type ${typeof value}`);
}

function resolveNodeLoader() {
  if (typeof require === 'function') return require;
  const globalRequire = toRecord(globalThis).require;
  if (typeof globalRequire === 'function') return globalRequire;
  const windowRequire = typeof window !== 'undefined' ? toRecord(window).require : null;
  return typeof windowRequire === 'function' ? windowRequire : null;
}

function resolveCryptoRuntime() {
  const loader = resolveNodeLoader();
  if (!loader) return null;
  try {
    const crypto = loader(['cr', 'ypto'].join(''));
    const BufferCtor = toRecord(globalThis).Buffer || loader('buffer').Buffer;
    if (!crypto?.createPublicKey || !crypto?.verify || !BufferCtor) return null;
    return { crypto, BufferCtor };
  } catch {
    return null;
  }
}

/**
 * @param {string} value
 * @param {unknown} BufferCtor
 * @returns {Buffer}
 */
function decodeBase64Url(value, BufferCtor) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return BufferCtor.from(padded, 'base64');
}

/**
 * @param {unknown} payload
 * @param {string} signatureB64Url
 * @param {string} [publicKeyB64Url]
 * @returns {boolean}
 */
export function verifyPolicyPayload(payload, signatureB64Url, publicKeyB64Url = FALLBACK_LICENSE_PUBLIC_KEY) {
  if (!publicKeyB64Url || !signatureB64Url) return false;
  const runtime = resolveCryptoRuntime();
  if (!runtime) return false;

  const { crypto, BufferCtor } = runtime;
  try {
    const publicKeyBytes = decodeBase64Url(publicKeyB64Url, BufferCtor);
    const signature = decodeBase64Url(signatureB64Url, BufferCtor);
    if (publicKeyBytes.length !== 32 || signature.length !== 64) return false;

    const spkiPrefix = BufferCtor.from('302a300506032b6570032100', 'hex');
    const publicKey = crypto.createPublicKey({
      key: BufferCtor.concat([spkiPrefix, publicKeyBytes]),
      format: 'der',
      type: 'spki',
    });
    const message = BufferCtor.from(canonicalizePolicyPayload(payload), 'utf8');
    return crypto.verify(null, message, publicKey, signature) === true;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} value
 * @returns {{ mode: string, freeLimit?: number } | null}
 */
export function normalizePolicyQuota(value) {
  const quota = toRecord(value);
  const mode = toText(quota.mode);
  if (mode !== 'daily_platform_count' && mode !== 'daily_job_count' && mode !== 'none') {
    return null;
  }
  if (mode === 'none') return { mode: 'none', freeLimit: 0 };
  const freeLimit = Number(quota.freeLimit);
  if (!Number.isFinite(freeLimit)) return null;
  return { mode, freeLimit: Math.max(0, Math.floor(freeLimit)) };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPolicyPayload(value) {
  const payload = toRecord(value);
  const quota = normalizePolicyQuota(payload.quota);
  return (
    payload.productId === PRODUCT_ID &&
    typeof payload.policyVersion === 'number' &&
    typeof payload.issuedAt === 'string' &&
    typeof payload.expiresAt === 'string' &&
    !!quota &&
    typeof payload.forceUpgradeExtension === 'boolean' &&
    typeof payload.forceUpgradeObsidianPlugin === 'boolean' &&
    typeof payload.proUpgradeUrl === 'string'
  );
}

function isSignedPolicyResponse(value) {
  const record = toRecord(value);
  return typeof record.signature === 'string' && isPolicyPayload(record.payload);
}

function normalizePolicyCache(value) {
  const cache = toRecord(value);
  if (typeof cache.signature !== 'string' || !Number.isFinite(Number(cache.cachedAt))) return null;
  if (!isPolicyPayload(cache.payload)) return null;
  return {
    payload: { ...toRecord(cache.payload) },
    signature: cache.signature,
    cachedAt: Number(cache.cachedAt),
  };
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function isPolicyExpired(payload) {
  const expiresAt = Date.parse(toText(toRecord(payload).expiresAt));
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

function isPolicyWithinGrace(payload) {
  const expiresAt = Date.parse(toText(toRecord(payload).expiresAt));
  return Number.isFinite(expiresAt) && expiresAt + POLICY_GRACE_SECONDS * 1000 > Date.now();
}

function hasCachedForceGate(payload) {
  const record = toRecord(payload);
  return record.forceUpgradeExtension === true || record.forceUpgradeObsidianPlugin === true;
}

function readPolicyCache(plugin, publicKey = FALLBACK_LICENSE_PUBLIC_KEY) {
  const settings = normalizeMultiPlatformSyncSettings(toRecord(plugin?.settings).multiPlatformSync);
  const cache = normalizePolicyCache(settings.policyCache);
  if (!cache) return null;
  if (!verifyPolicyPayload(cache.payload, cache.signature, publicKey)) return null;
  if (cache.payload.productId !== PRODUCT_ID) return null;
  return cache;
}

async function writePolicyCache(plugin, payload, signature) {
  const pluginRecord = toRecord(plugin);
  const settings = toRecord(pluginRecord.settings);
  const cache = {
    payload: { ...toRecord(payload) },
    signature,
    cachedAt: nowSeconds(),
  };
  settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
    ...toRecord(settings.multiPlatformSync),
    policyCache: cache,
  });
  pluginRecord.settings = settings;
  if (typeof pluginRecord.saveSettings === 'function') {
    try {
      await pluginRecord.saveSettings();
    } catch {
      // Cache persistence is best-effort; publishing can continue.
    }
  }
  return cache;
}

function buildFallbackPolicy() {
  const now = new Date();
  return {
    productId: PRODUCT_ID,
    policyVersion: 0,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    quota: {
      mode: 'daily_platform_count',
      freeLimit: FALLBACK_FREE_DAILY_PLATFORM_QUOTA,
    },
    minExtensionVersion: undefined,
    minObsidianPluginVersion: undefined,
    forceUpgradeExtension: false,
    forceUpgradeObsidianPlugin: false,
    proUpgradeUrl: DEFAULT_PRO_UPGRADE_URL,
    extensionUpgradeUrl: DEFAULT_EXTENSION_UPGRADE_URL,
    obsidianPluginUpgradeUrl: DEFAULT_OBSIDIAN_PLUGIN_UPGRADE_URL,
  };
}

function createFetchImpl(options = {}) {
  if (typeof options.fetchImpl === 'function') return options.fetchImpl;
  if (typeof options.requestUrl === 'function') {
    return createObsidianFetchAdapter(options.requestUrl);
  }
  return null;
}

async function fetchAndVerifyPolicy(options = {}) {
  const publicKey = options.publicKey || FALLBACK_LICENSE_PUBLIC_KEY;
  if (!publicKey) return { kind: 'public_key_unconfigured' };

  const fetchImpl = createFetchImpl(options);
  if (!fetchImpl) return { kind: 'request_unavailable' };

  const endpoints = options.workerUrl ? [options.workerUrl] : LICENSE_WORKER_URLS;
  const body = {
    productId: PRODUCT_ID,
    client: POLICY_CLIENT,
    clientVersion: options.clientVersion || '0.0.0',
    installId: options.installId || '',
  };

  let lastNetworkOutcome = null;
  let lastNonNetworkOutcome = null;

  for (const baseUrl of endpoints) {
    const url = String(baseUrl || '').replace(/\/+$/, '') + '/policy';
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), options.timeoutMs || POLICY_REQUEST_TIMEOUT_MS)
      : null;
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller?.signal,
      });
      let parsed;
      try {
        parsed = await response.json();
      } catch {
        lastNonNetworkOutcome = {
          kind: 'malformed_response',
          message: `non-JSON response (status ${response.status})`,
        };
        continue;
      }
      if (!isSignedPolicyResponse(parsed)) {
        lastNonNetworkOutcome = {
          kind: 'malformed_response',
          message: `unexpected shape (status ${response.status})`,
        };
        continue;
      }
      if (!verifyPolicyPayload(parsed.payload, parsed.signature, publicKey)) {
        return { kind: 'invalid_signature' };
      }
      if (parsed.payload.productId !== PRODUCT_ID) {
        return { kind: 'product_mismatch' };
      }
      if (isPolicyExpired(parsed.payload)) {
        lastNonNetworkOutcome = { kind: 'expired' };
        continue;
      }
      return { kind: 'success', response: parsed };
    } catch (error) {
      lastNetworkOutcome = {
        kind: 'network_error',
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return lastNonNetworkOutcome || lastNetworkOutcome || { kind: 'network_error', message: 'unknown policy error' };
}

/**
 * @param {unknown} plugin
 * @returns {string}
 */
export function getObsidianPluginVersion(plugin) {
  return toText(toRecord(toRecord(plugin).manifest).version) || '0.0.0';
}

/**
 * @param {unknown} plugin
 * @param {{ requestUrl?: Function, fetchImpl?: Function, workerUrl?: string, publicKey?: string, clientVersion?: string, installId?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ payload: Record<string, unknown>, signature?: string, source: 'cache' | 'network' | 'cache_grace' | 'fallback', fetchedAt?: number, fetchOutcome?: Record<string, unknown> }>}
 */
export async function getEffectiveObsidianPublisherPolicy(plugin, options = {}) {
  const publicKey = options.publicKey || FALLBACK_LICENSE_PUBLIC_KEY;
  const cache = readPolicyCache(plugin, publicKey);
  if (cache && !isPolicyExpired(cache.payload)) {
    return {
      payload: cache.payload,
      signature: cache.signature,
      source: 'cache',
      fetchedAt: cache.cachedAt,
    };
  }

  const fetched = await fetchAndVerifyPolicy({
    ...options,
    publicKey,
    clientVersion: options.clientVersion || getObsidianPluginVersion(plugin),
    installId: options.installId || toText(toRecord(toRecord(plugin).settings).clientId),
  });

  if (fetched.kind === 'success') {
    const cached = await writePolicyCache(plugin, fetched.response.payload, fetched.response.signature);
    return {
      payload: fetched.response.payload,
      signature: fetched.response.signature,
      source: 'network',
      fetchedAt: cached.cachedAt,
    };
  }

  if (cache && (isPolicyWithinGrace(cache.payload) || hasCachedForceGate(cache.payload))) {
    return {
      payload: cache.payload,
      signature: cache.signature,
      source: 'cache_grace',
      fetchedAt: cache.cachedAt,
      fetchOutcome: fetched,
    };
  }

  return {
    payload: buildFallbackPolicy(),
    source: 'fallback',
    fetchOutcome: fetched,
  };
}

/**
 * @param {unknown} policy
 * @param {number} [fallback]
 * @returns {number}
 */
export function getDailyPlatformQuotaLimit(policy, fallback = FALLBACK_FREE_DAILY_PLATFORM_QUOTA) {
  const quota = normalizePolicyQuota(toRecord(policy).quota);
  if (!quota || quota.mode !== 'daily_platform_count') return fallback;
  return Number.isFinite(Number(quota.freeLimit)) ? Math.max(0, Math.floor(Number(quota.freeLimit))) : fallback;
}

function parseSemverLike(raw) {
  const trimmed = toText(raw).trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/i);
  if (!match) return null;
  const parts = [match[1], match[2] || '0', match[3] || '0'].map((part) => Number(part));
  return parts.every((part) => Number.isSafeInteger(part) && part >= 0) ? parts : null;
}

export function compareSemverLike(current, target) {
  const a = parseSemverLike(current);
  const b = parseSemverLike(target);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

export function isVersionLessThan(current, minimum) {
  if (!minimum) return false;
  const compared = compareSemverLike(current, minimum);
  return compared === null ? null : compared < 0;
}

/**
 * @param {unknown} policy
 * @param {string} currentVersion
 * @returns {{ allowed: boolean, warning?: boolean, reason?: string, message?: string, minObsidianPluginVersion?: string, upgradeUrl?: string }}
 */
export function checkObsidianPluginPolicyGate(policy, currentVersion) {
  const record = toRecord(policy);
  const minVersion = toText(record.minObsidianPluginVersion);
  const forceUpgrade = record.forceUpgradeObsidianPlugin === true;
  const lessThan = minVersion ? isVersionLessThan(currentVersion, minVersion) : false;
  const shouldWarn = !!minVersion && (lessThan === true || lessThan === null);
  const shouldBlock = forceUpgrade && shouldWarn;
  const message = '当前 Obsidian 插件版本过低，请升级后继续发布。';
  return {
    allowed: !shouldBlock,
    warning: shouldWarn && !shouldBlock,
    reason: shouldBlock ? 'OBSIDIAN_PLUGIN_VERSION_UNSUPPORTED' : undefined,
    message: shouldBlock ? message : undefined,
    minObsidianPluginVersion: minVersion || undefined,
    upgradeUrl: toText(record.obsidianPluginUpgradeUrl) || DEFAULT_OBSIDIAN_PLUGIN_UPGRADE_URL,
  };
}

/**
 * @param {unknown} policy
 * @param {{ currentVersion?: string, remotePolicySupported?: boolean }} [options]
 * @returns {{ allowed: boolean, warning?: boolean, reason?: string, message?: string, minExtensionVersion?: string, upgradeUrl?: string }}
 */
export function checkExtensionPolicyGate(policy, options = {}) {
  const record = toRecord(policy);
  const minVersion = toText(record.minExtensionVersion);
  const forceUpgrade = record.forceUpgradeExtension === true;
  const currentVersion = toText(options.currentVersion);
  const lessThan = minVersion ? isVersionLessThan(currentVersion, minVersion) : false;
  const versionWarn = !!minVersion && (lessThan === true || lessThan === null);
  const remotePolicyUnsupported = forceUpgrade && options.remotePolicySupported !== true;
  const shouldBlock = forceUpgrade && (remotePolicyUnsupported || versionWarn);
  const message = remotePolicyUnsupported
    ? '当前浏览器扩展版本不支持远端策略，请升级后继续发布。'
    : '当前浏览器扩展版本过低，请升级后继续发布。';
  return {
    allowed: !shouldBlock,
    warning: versionWarn && !shouldBlock,
    reason: shouldBlock
      ? (remotePolicyUnsupported ? 'EXTENSION_REMOTE_POLICY_UNSUPPORTED' : 'EXTENSION_VERSION_UNSUPPORTED')
      : undefined,
    message: shouldBlock ? message : undefined,
    minExtensionVersion: minVersion || undefined,
    upgradeUrl: toText(record.extensionUpgradeUrl) || DEFAULT_EXTENSION_UPGRADE_URL,
  };
}
