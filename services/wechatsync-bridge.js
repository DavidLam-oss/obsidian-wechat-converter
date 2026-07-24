/*
## 核心功能

实现浏览器发布助手桥接的 wechatsync bridge 能力。

## 输入

接收多平台发布任务、浏览器扩展回传、平台设置和同步结果。

## 输出

输出 `createWechatSyncBridgeService`、桥接常量、错误归一化和重试 helper，用于浏览器发布助手连接、请求转发和平台状态展示。

## 定位

位于 services/，属于多平台桥接服务层；保持与发布弹窗 UI 解耦。

## 依赖

关键依赖：`./wechatsync-constants.js`、`./wechatsync-bridge-runtime.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  DEFAULT_WECHATSYNC_PORT,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_PLATFORM_REQUEST_TIMEOUT_MS,
  DEFAULT_SYNC_REQUEST_TIMEOUT_MS,
  DEFAULT_HELLO_TIMEOUT_MS,
  LOCAL_BIND_HOST,
  REMOTE_BIND_HOST,
  HELLO_ERROR_TOKEN_MISMATCH,
  HELLO_ERROR_PAIRING_REQUIRED,
  HELLO_ERROR_CREDENTIAL_MISMATCH,
  HELLO_ERROR_INVALID_PAYLOAD,
  HELLO_ERROR_TIMEOUT,
  HELLO_ERROR_VERSION_UNSUPPORTED,
  HELLO_ERROR_DUPLICATE_SESSION,
  HELLO_ERROR_TOO_MANY_CLIENTS,
  DEFAULT_MAX_CLIENTS,
} from './wechatsync-constants.js';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import {
  createMinimalWebSocketServer,
  createWebSocketAcceptKey,
  defaultConnectionIdFactory,
  getWebSocketOpenState,
  isOriginAllowedForWebSocket,
  loadDefaultHttpModule,
  parseWebSocketFrames,
  readRequestBody,
} from './wechatsync-bridge-runtime.js';
// Cap on the persisted connected-clients registry (distinct from the
// concurrent-session cap above). A misbehaving extension that mints a
// fresh extensionInstanceId on every reconnect would otherwise grow the
// registry — and the persisted settings file — unboundedly. 20 leaves
// generous headroom for users with multiple browsers × profiles while
// keeping the array O(small).
const MAX_CONNECTED_CLIENT_REGISTRY = 20;

/**
 * @typedef {{ message?: string, code?: string, cause?: unknown }} BridgeErrorLike
 * @typedef {{ debug?: (...args: unknown[]) => void, info?: (...args: unknown[]) => void, warn?: (...args: unknown[]) => void }} BridgeLoggerLike
 * @typedef {{ on: (event: string, handler: (...args: unknown[]) => void) => unknown, once: (event: string, handler: (...args: unknown[]) => void) => unknown, off: (event: string, handler: (...args: unknown[]) => void) => unknown, emit: (event: string, ...args: unknown[]) => void }} BridgeEmitterLike
 * @typedef {{ __ws_control: 'close', code?: number } | { __ws_control: 'ping', payload: Buffer }} WebSocketControlFrame
 * @typedef {string | WebSocketControlFrame} WebSocketParsedMessage
 * @typedef {{ send: (data: string | Buffer) => void, close?: () => void, on: (event: string, handler: (...args: unknown[]) => void) => void, readyState?: number }} BridgeSocketLike
 * @typedef {{ extensionInstanceId: string, browserName?: string, profileLabel?: string, capabilities?: Record<string, unknown>, license?: Record<string, unknown>, version?: string, extensionId?: string, token?: string }} BridgeHelloLike
 * @typedef {{ connectionId: string, ws: BridgeSocketLike, connectedAt: number, origin: string, helloTimeout: number | null }} PendingConnectionLike
 * @typedef {{ timeout: number | null, reject: (error: unknown) => void, resolve: (value: unknown) => void, method: string, startedAt: number }} PendingRequestLike
 * @typedef {{ connectionId: string, ws: BridgeSocketLike, credential: string, extensionInstanceId: string, extensionId: string, version: string, profileLabel: string, browserName: string, capabilities: Record<string, unknown>, license: Record<string, unknown>, connectedAt: number, authenticatedAt: number, origin: string, pendingRequests: Map<string, PendingRequestLike> }} BridgeSessionLike
 * @typedef {{ extensionInstanceId: string, browserName?: string, profileLabel?: string, capabilities?: Record<string, unknown>, license?: Record<string, unknown>, extensionVersion?: string, status?: 'connected' | 'disconnected', lastSeenAt?: number, firstConnectedAt?: number, lastConnectedAt?: number }} ConnectedClientLike
 * @typedef {{ extensionInstanceId: string, credentialHash: string, pairedAt?: number, browserName?: string, profileLabel?: string }} PairedClientLike
 * @typedef {{ extensionInstanceId: string, credentialHash: string, detectedAt?: number, browserName?: string, profileLabel?: string, extensionVersion?: string, reason?: string }} PendingPairingLike
 * @typedef {{ createServer: (handler?: (req: BridgeHttpRequestLike, res: BridgeHttpResponseLike) => void | Promise<void>) => BridgeHttpServerLike }} BridgeHttpModuleLike
 * @typedef {{ on: (event: string, handler: (...args: unknown[]) => void) => unknown, once: (event: string, handler: (...args: unknown[]) => void) => unknown, off?: (event: string, handler: (...args: unknown[]) => void) => unknown, listen: (...args: unknown[]) => unknown, close: (callback?: (...args: unknown[]) => void) => unknown }} BridgeHttpServerLike
 * @typedef {{ headers: Record<string, string | string[] | undefined>, method?: string, url?: string, on: (event: string, handler: (...args: unknown[]) => void) => unknown }} BridgeHttpRequestLike
 * @typedef {{ writeHead: (status: number, headers?: Record<string, string>) => unknown, end: (body?: string) => unknown }} BridgeHttpResponseLike
 * @typedef {{ write: (data: string | Buffer) => unknown, end: () => unknown, destroy: () => unknown, on: (event: string, handler: (...args: unknown[]) => void) => unknown }} RawSocketLike
 * @typedef {{ on: BridgeEmitterLike['on'], once: BridgeEmitterLike['once'], off?: BridgeEmitterLike['off'], close: (callback?: (...args: unknown[]) => void) => unknown }} BridgeWebSocketServerLike
 * @typedef {{ OPEN?: number, WebSocket?: { OPEN?: number }, new (options: { port: number, host: string }): BridgeWebSocketServerLike }} WebSocketServerCtorLike
 * @typedef {{ timeoutMs?: number }} BridgeRequestOptionsLike
 * @typedef {{ forceRefresh?: boolean, timeoutMs?: number }} BridgeListPlatformsOptionsLike
 * @typedef {{ timeoutMs?: number }} BridgeTimeoutOptionsLike
 * @typedef {{ platforms?: unknown, title?: unknown, markdown?: unknown, content?: unknown, cover?: unknown, coverThumbnail?: unknown, assets?: unknown, quotaPolicy?: unknown, timeoutMs?: number, source?: string }} BridgeArticleOptionsLike
 * @typedef {{ WebSocketServer?: WebSocketServerCtorLike | null, http?: BridgeHttpModuleLike | null, httpLoader?: () => Promise<BridgeHttpModuleLike | null>, port?: number, token?: string, requestTimeoutMs?: number, connectTimeoutMs?: number, helloTimeoutMs?: number, allowRemote?: boolean, originAllowlist?: Array<string | RegExp> | null, serverVersion?: string, logger?: BridgeLoggerLike, idFactory?: () => string, connectionIdFactory?: () => string, onClientRegistryChange?: ((clients: ConnectedClientLike[]) => void) | null, onPairingRegistryChange?: ((registry: { pairedClients: PairedClientLike[], pendingClients: PendingPairingLike[] }) => void) | null, initialConnectedClients?: ConnectedClientLike[], initialPairedClients?: PairedClientLike[], initialPendingClients?: PendingPairingLike[], maxClients?: number }} BridgeServiceOptionsLike
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
  return isRecord(value) ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * @param {unknown} value
 * @param {string} [fallback='']
 * @returns {string}
 */
function toBridgeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

/** @param {unknown} value */
function hashBridgeCredential(value) {
  return bytesToHex(sha256(utf8ToBytes(String(value || ''))));
}

/**
 * @param {string} leftHash
 * @param {string} rightHash
 */
function credentialsMatch(leftHash, rightHash) {
  if (!/^[a-f0-9]{64}$/i.test(leftHash) || !/^[a-f0-9]{64}$/i.test(rightHash)) return false;
  let mismatch = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    mismatch |= leftHash.charCodeAt(index) ^ rightHash.charCodeAt(index);
  }
  return mismatch === 0;
}

function normalizeRuntimeLicense(value, capabilities = {}) {
  const source = toRecord(value);
  const state = ['pro', 'free', 'unknown'].includes(source.state)
    ? source.state
    : (toRecord(capabilities).proLicensed === true ? 'pro' : 'unknown');
  const observedAt = Number(source.observedAt);
  return {
    state,
    observedAt: Number.isFinite(observedAt) && observedAt > 0 ? observedAt : Date.now(),
  };
}

/**
 * @param {TimerHandler} handler
 * @param {number} ms
 * @returns {number | null}
 */
function setBridgeTimeout(handler, ms) {
  if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') return null;
  return window.setTimeout(handler, ms);
}

/**
 * @param {number | null | undefined} timer
 */
function clearBridgeTimeout(timer) {
  if (!timer) return;
  if (typeof window === 'undefined' || typeof window.clearTimeout !== 'function') return;
  window.clearTimeout(timer);
}

/**
 * @param {unknown} error
 * @returns {BridgeErrorLike}
 */
function toBridgeErrorLike(error) {
  if (error instanceof Error) return /** @type {BridgeErrorLike} */ (error);
  if (error && typeof error === 'object') return /** @type {BridgeErrorLike} */ (error);
  return { message: String(error || '') };
}

/**
 * @param {unknown} [error={}]
 * @returns {boolean}
 */
function isUnsupportedBridgeMethodError(error = {}) {
  const readableError = toBridgeErrorLike(error);
  const message = String(readableError.message || error || '');
  return /unknown method|unknown tool|method not found|not supported|unsupported/i.test(message);
}

/**
 * @param {unknown} [error={}]
 * @returns {boolean}
 */
function isRecoverableBridgeConnectionError(error = {}) {
  const code = toBridgeErrorLike(error).code || '';
  return ['EXTENSION_NOT_CONNECTED', 'EXTENSION_NOT_AUTHENTICATED', 'BRIDGE_UNAVAILABLE', 'BRIDGE_REQUEST_TIMEOUT'].includes(code);
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setBridgeTimeout(resolve, ms));
}

/**
 * @template T
 * @param {(context: { attempt: number }) => Promise<T>} operation
 * @param {{ retries?: number, delayMs?: number, delay?: (ms: number, attempt: number, error: unknown) => Promise<unknown>, shouldRetry?: (error: unknown, attempt: number) => boolean, logger?: BridgeLoggerLike, label?: string }} [options={}]
 * @returns {Promise<T>}
 */
async function retryRecoverableBridgeOperation(operation, options = {}) {
  const {
    retries = 2,
    delayMs = 1000,
    delay = sleep,
    shouldRetry = isRecoverableBridgeConnectionError,
    logger = console,
    label = 'bridge request',
  } = options;
  let attempt = 0;

  while (true) {
    try {
      return await operation({ attempt });
    } catch (error) {
      const readableError = createReadableBridgeError(error);
      if (attempt >= retries || !shouldRetry(readableError, attempt)) {
        throw readableError;
      }
      attempt += 1;
      logger.debug?.('[WechatsyncBridge] retrying recoverable operation', {
        label,
        attempt,
        retries,
        delayMs,
        code: readableError?.code,
        message: readableError?.message || String(readableError),
      });
      await delay(delayMs, attempt, readableError);
    }
  }
}

/**
 * @param {unknown} error
 * @returns {Error & { code?: string, cause?: unknown }}
 */
function createReadableBridgeError(error) {
  const readableError = toBridgeErrorLike(error);
  const message = String(readableError.message || error || '');
  if (/EADDRINUSE|Primary|ECONNREFUSED|not reachable|port .*in use/i.test(message)) {
    const friendly = new Error('无法连接本地服务。请确认没有其他同步进程占用端口，或稍后重试。');
    friendly.code = 'BRIDGE_UNAVAILABLE';
    friendly.cause = error;
    return friendly;
  }
  if (/Invalid or missing token|MCP token not configured|401|403/i.test(message)) {
    const friendly = new Error('浏览器插件已响应，但连接令牌校验失败。请确认 Obsidian 与浏览器插件使用同一个连接令牌。');
    friendly.code = 'AUTH_FAILED';
    friendly.cause = error;
    return friendly;
  }
  if (/Extension not authenticated/i.test(message)) {
    const friendly = new Error('浏览器插件已连接但未通过认证。请确认插件已升级到支持安全握手的版本，且使用与 Obsidian 一致的连接令牌。');
    friendly.code = 'EXTENSION_NOT_AUTHENTICATED';
    friendly.cause = error;
    return friendly;
  }
  if (/Extension not connected|not connected|timeout:no_extension/i.test(message)) {
    const friendly = new Error('尚未连接到浏览器插件。请确认已在正在运行的 Chromium 浏览器中安装插件，并检查地址、端口和连接令牌。');
    friendly.code = 'EXTENSION_NOT_CONNECTED';
    friendly.cause = error;
    return friendly;
  }
  if (/Request timeout: listPlatforms/i.test(message)) {
    const friendly = new Error('浏览器插件已连接，但读取平台列表超时。平台较多或部分平台检查较慢时可能发生，请稍后重试。');
    friendly.code = 'PLATFORM_LIST_TIMEOUT';
    friendly.cause = error;
    return friendly;
  }
  if (/Request timeout: syncArticle/i.test(message)) {
    const friendly = new Error('浏览器插件长时间没有返回同步结果。插件可能仍在后台处理，请先到插件历史或目标平台草稿箱确认结果；如果某个平台卡住，建议减少平台后重试。');
    friendly.code = 'SYNC_TIMEOUT';
    friendly.cause = error;
    return friendly;
  }
  if (/Request timeout: (health|listSupportedPlatforms|enqueueSyncArticle|getSyncTask|getSyncTaskLink|openSyncTask|getAuthSnapshot)/i.test(message)) {
    const friendly = new Error('浏览器插件响应超时，请确认浏览器正在运行，地址、端口和连接令牌正确后重试。');
    friendly.code = 'BRIDGE_REQUEST_TIMEOUT';
    friendly.cause = error;
    return friendly;
  }
  return error instanceof Error ? error : new Error(message || '浏览器插件连接请求失败。');
}

/**
 * @param {BridgeServiceOptionsLike} [options={}]
 */
function createWechatSyncBridgeService(options = {}) {
  const {
    WebSocketServer,
    http = null,
    httpLoader = loadDefaultHttpModule,
    port = DEFAULT_WECHATSYNC_PORT,
    token = '',
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
    helloTimeoutMs = DEFAULT_HELLO_TIMEOUT_MS,
    allowRemote = false,
    originAllowlist = null,
    serverVersion = '',
    logger = console,
    idFactory = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    connectionIdFactory = defaultConnectionIdFactory,
    onClientRegistryChange = null,
    onPairingRegistryChange = null,
    initialConnectedClients = [],
    initialPairedClients = [],
    initialPendingClients = [],
    maxClients = DEFAULT_MAX_CLIENTS,
  } = options;

  const bindHost = allowRemote ? REMOTE_BIND_HOST : LOCAL_BIND_HOST;
  /** @type {BridgeHttpModuleLike | null} */
  let activeHttp = http;

  // §16 Phase 1: runtime connected-clients registry.
  // Initialized from persisted settings so previously seen clients are
  // visible immediately (status 'disconnected') even before reconnection.
  /** @type {ConnectedClientLike[]} */
  let connectedClients = Array.isArray(initialConnectedClients)
    ? initialConnectedClients.map((c) => ({ ...c, status: 'disconnected' }))
    : [];
  /** @type {PairedClientLike[]} */
  let pairedClients = Array.isArray(initialPairedClients)
    ? initialPairedClients.map((c) => ({ ...c }))
    : [];
  /** @type {PendingPairingLike[]} */
  let pendingClients = Array.isArray(initialPendingClients)
    ? initialPendingClients.map((c) => ({ ...c }))
    : [];
  /** @type {number | null} */
  let _clientRegistryDebounceTimer = null;
  // Defensive: if a previous version persisted >MAX entries (e.g., before
  // this cap shipped, or due to extension misbehavior), trim once at
  // construction so the in-memory state and the next persist write are
  // within budget. trimClientRegistry is hoisted within the closure.
  trimClientRegistry();

  function scheduleRegistryChange() {
    if (!onClientRegistryChange) return;
    clearBridgeTimeout(_clientRegistryDebounceTimer);
    _clientRegistryDebounceTimer = setBridgeTimeout(() => {
      onClientRegistryChange(connectedClients.map((c) => ({ ...c })));
    }, 1000);
  }

  function persistPairingRegistry() {
    onPairingRegistryChange?.({
      pairedClients: pairedClients.map((client) => ({ ...client })),
      pendingClients: pendingClients.map((client) => ({ ...client })),
    });
  }

  /**
   * @param {BridgeHelloLike} hello
   * @param {string} credentialHash
   * @param {string} reason
   */
  function upsertPendingClient(hello, credentialHash, reason) {
    const next = {
      extensionInstanceId: hello.extensionInstanceId,
      credentialHash,
      detectedAt: Date.now(),
      browserName: hello.browserName || '',
      profileLabel: hello.profileLabel || '',
      extensionVersion: hello.version || '',
      reason,
    };
    const index = pendingClients.findIndex((client) => client.extensionInstanceId === hello.extensionInstanceId);
    if (index >= 0) pendingClients[index] = next;
    else pendingClients.push(next);
    pendingClients = pendingClients
      .sort((a, b) => Number(b.detectedAt || 0) - Number(a.detectedAt || 0))
      .slice(0, MAX_CONNECTED_CLIENT_REGISTRY);
    persistPairingRegistry();
  }

  /** @param {string} extensionInstanceId */
  function pairClient(extensionInstanceId) {
    const pending = pendingClients.find((client) => client.extensionInstanceId === extensionInstanceId);
    if (!pending) return false;
    const next = {
      extensionInstanceId: pending.extensionInstanceId,
      credentialHash: pending.credentialHash,
      pairedAt: Date.now(),
      browserName: pending.browserName || '',
      profileLabel: pending.profileLabel || '',
    };
    const index = pairedClients.findIndex((client) => client.extensionInstanceId === extensionInstanceId);
    if (index >= 0) pairedClients[index] = next;
    else pairedClients.push(next);
    pendingClients = pendingClients.filter((client) => client.extensionInstanceId !== extensionInstanceId);
    persistPairingRegistry();
    return true;
  }

  /** @param {string} extensionInstanceId */
  function unpairClient(extensionInstanceId) {
    const previousLength = pairedClients.length;
    pairedClients = pairedClients.filter((client) => client.extensionInstanceId !== extensionInstanceId);
    const session = sessions.get(extensionInstanceId);
    if (session) closeWs(session.ws, 'client-unpaired');
    if (pairedClients.length !== previousLength) persistPairingRegistry();
    return pairedClients.length !== previousLength;
  }

  // Trim the registry to at most MAX_CONNECTED_CLIENT_REGISTRY entries.
  // Eviction policy: never drop a 'connected' session (those are live and
  // visible in the UI); among 'disconnected' entries, keep the most
  // recently seen. Returns the number of entries dropped.
  function trimClientRegistry() {
    if (connectedClients.length <= MAX_CONNECTED_CLIENT_REGISTRY) return 0;
    const connected = connectedClients.filter((c) => c && c.status === 'connected');
    const disconnected = connectedClients
      .filter((c) => c && c.status !== 'connected')
      .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
    const budgetForDisconnected = Math.max(0, MAX_CONNECTED_CLIENT_REGISTRY - connected.length);
    const keptDisconnected = disconnected.slice(0, budgetForDisconnected);
    const next = [...connected, ...keptDisconnected];
    const dropped = connectedClients.length - next.length;
    connectedClients = next;
    return dropped;
  }

  /**
   * @param {BridgeHelloLike} hello
   * @param {'connected' | 'disconnected'} status
   */
  function upsertConnectedClient(hello, status) {
    const now = Date.now();
    const idx = connectedClients.findIndex(
      (c) => c.extensionInstanceId === hello.extensionInstanceId
    );
    if (idx >= 0) {
      const existing = connectedClients[idx];
      connectedClients[idx] = {
        ...existing,
        browserName: hello.browserName || existing.browserName,
        profileLabel: hello.profileLabel !== undefined ? hello.profileLabel : existing.profileLabel,
        capabilities: hello.capabilities || existing.capabilities,
        license: normalizeRuntimeLicense(hello.license, hello.capabilities),
        extensionVersion: hello.version || existing.extensionVersion,
        status,
        lastSeenAt: now,
        lastConnectedAt: status === 'connected' ? now : existing.lastConnectedAt,
      };
    } else {
      connectedClients.push({
        extensionInstanceId: hello.extensionInstanceId,
        browserName: hello.browserName || '',
        profileLabel: hello.profileLabel || '',
        capabilities: hello.capabilities || {},
        license: normalizeRuntimeLicense(hello.license, hello.capabilities),
        extensionVersion: hello.version || '',
        status,
        lastSeenAt: now,
        firstConnectedAt: now,
        lastConnectedAt: now,
      });
    }
    const dropped = trimClientRegistry();
    if (dropped > 0) {
      logger.debug?.('Wechatsync bridge: trimmed', dropped, 'stale client registry entries');
    }
    scheduleRegistryChange();
  }

  /** @param {unknown} extensionInstanceId */
  function markClientDisconnected(extensionInstanceId) {
    if (!extensionInstanceId) return;
    const idx = connectedClients.findIndex(
      (c) => c.extensionInstanceId === extensionInstanceId
    );
    if (idx < 0) return;
    connectedClients[idx] = { ...connectedClients[idx], status: 'disconnected' };
    scheduleRegistryChange();
  }

  /** @param {unknown} extensionInstanceId */
  function refreshClientSeen(extensionInstanceId) {
    if (!extensionInstanceId) return;
    const idx = connectedClients.findIndex(
      (c) => c.extensionInstanceId === extensionInstanceId
    );
    if (idx < 0) return;
    connectedClients[idx] = { ...connectedClients[idx], lastSeenAt: Date.now() };
    scheduleRegistryChange();
  }

  /** @type {BridgeWebSocketServerLike | null} */
  let wss = null;
  /** @type {BridgeHttpServerLike | null} */
  let httpServer = null;
  /** @type {Map<string, BridgeSessionLike>} */
  const sessions = new Map();                   // extensionInstanceId → session
  /** @type {Map<string, string>} */
  const connectionIdToInstanceId = new Map();   // connectionId → extensionInstanceId
  /** @type {string | null} */
  let primaryClientId = null;
  /** @type {Map<string, PendingConnectionLike>} */
  const pendingConnections = new Map();
  /** @type {Array<() => void>} */
  const connectionResolvers = [];
  const wsOpenState = getWebSocketOpenState(WebSocketServer);
  const diagnostics = {
    socketsOpened: 0,
    helloAttempts: 0,
    helloRejections: 0,
    helloSuccesses: 0,
    lastHelloRejection: null,
  };

  /**
   * @param {string} message
   * @param {unknown} [details]
   */
  function debug(message, details) {
    logger.debug?.(`[WechatsyncBridge] ${message}`, details || '');
  }

  /**
   * @param {string} event
   * @param {unknown} [details]
   */
  function audit(event, details) {
    logger.info?.(`[WechatsyncBridge:audit] ${event}`, details || {});
  }

  /**
   * @param {BridgeSocketLike | null | undefined} ws
   * @returns {boolean}
   */
  function isClientSocketOpen(ws) {
    return !!(ws && ws.readyState === wsOpenState);
  }

  function isAuthenticatedConnected() {
    for (const session of sessions.values()) {
      if (isClientSocketOpen(session.ws)) return true;
    }
    return false;
  }

  function notifyConnected() {
    while (connectionResolvers.length > 0) {
      const resolve = connectionResolvers.shift();
      resolve();
    }
  }

  /**
   * @param {unknown} message
   * @returns {(BridgeHelloLike & { type: 'extension_hello' }) | null}
   */
  function tryParseHelloPayload(message) {
    const record = toRecord(message);
    if (record.type !== 'extension_hello') return null;
    return {
      type: 'extension_hello',
      token: toBridgeString(record.token),
      extensionInstanceId: toBridgeString(record.extensionInstanceId),
      extensionId: toBridgeString(record.extensionId),
      version: toBridgeString(record.version),
      profileLabel: toBridgeString(record.profileLabel),
      browserName: toBridgeString(record.browserName),
      capabilities: toRecord(record.capabilities),
      license: toRecord(record.license),
    };
  }

  /**
   * @param {BridgeSocketLike} ws
   * @param {{ ok: boolean, connectionId?: string, error?: string }} options
   */
  function sendHelloAck(ws, { ok, connectionId = '', error = '' }) {
    try {
      const payload = ok
        ? {
            type: 'extension_hello_ack',
            ok: true,
            connectionId,
            mode: 'multi-client',
            serverVersion: serverVersion || '',
          }
        : {
            type: 'extension_hello_ack',
            ok: false,
            error,
          };
      ws.send(JSON.stringify(payload));
    } catch (err) {
      logger.warn?.('Failed to send extension_hello_ack:', err);
    }
  }

  /**
   * @param {BridgeSocketLike} ws
   * @param {string} reason
   */
  function closeWs(ws, reason) {
    try {
      ws.close?.();
    } catch (err) {
      const readableError = toBridgeErrorLike(err);
      debug('Failed to close socket', { reason, error: readableError.message || String(err) });
    }
  }

  /** @param {string} connectionId */
  function removePendingConnection(connectionId) {
    const pending = pendingConnections.get(connectionId);
    if (!pending) return;
    if (pending.helloTimeout) clearBridgeTimeout(pending.helloTimeout);
    pendingConnections.delete(connectionId);
  }

  /**
   * @param {PendingConnectionLike} pending
   * @param {BridgeHelloLike} hello
   * @param {string} origin
   */
  function registerSession(pending, hello, origin) {
    const instanceId = hello.extensionInstanceId;

    // Takeover: same extensionInstanceId means the previous SW reloaded
    // (or was killed). Tear down the previous session so the new hello
    // can register cleanly. Latest-wins semantic — one extension instance
    // should only have one live session at any moment. This avoids the
    // ~10s cold-backoff penalty that would otherwise hit on every reload
    // because Node's WebSocket readyState lags TCP half-close.
    const existing = sessions.get(instanceId);
    if (existing) {
      audit('hello_takeover', {
        connectionId: existing.connectionId,
        newConnectionId: pending.connectionId,
        extensionInstanceId: instanceId,
        previousSocketOpen: isClientSocketOpen(existing.ws),
      });
      closeWs(existing.ws, 'hello_takeover');
      connectionIdToInstanceId.delete(existing.connectionId);
      for (const [, req] of existing.pendingRequests.entries()) {
        clearBridgeTimeout(req.timeout);
        req.reject(createReadableBridgeError(new Error('Session replaced by reconnect.')));
      }
      existing.pendingRequests.clear();
      sessions.delete(instanceId);
    }

    // After takeover, the old session is gone from the Map so this count
    // naturally excludes it. Only foreign instanceIds count toward the cap.
    let openCount = 0;
    for (const s of sessions.values()) {
      if (isClientSocketOpen(s.ws)) openCount += 1;
    }
    if (openCount >= maxClients) {
      rejectHello(pending, HELLO_ERROR_TOO_MANY_CLIENTS, { max: maxClients, current: openCount });
      return;
    }

    /** @type {BridgeSessionLike} */
    const session = {
      connectionId: pending.connectionId,
      ws: pending.ws,
      extensionInstanceId: instanceId,
      extensionId: hello.extensionId || '',
      version: hello.version || '',
      profileLabel: hello.profileLabel || '',
      browserName: hello.browserName || '',
      capabilities: hello.capabilities || {},
      license: normalizeRuntimeLicense(hello.license, hello.capabilities),
      credential: hello.token || '',
      connectedAt: pending.connectedAt,
      authenticatedAt: Date.now(),
      origin: origin || pending.origin || '',
      pendingRequests: new Map(),
    };
    sessions.set(instanceId, session);
    connectionIdToInstanceId.set(pending.connectionId, instanceId);
    removePendingConnection(pending.connectionId);

    if (primaryClientId === null) {
      primaryClientId = instanceId;
    }

    diagnostics.helloAttempts += 1;
    diagnostics.helloSuccesses += 1;
    audit('session_registered', {
      connectionId: session.connectionId,
      extensionInstanceId: instanceId,
      profileLabel: session.profileLabel,
      browserName: session.browserName,
      sessionsCount: sessions.size,
    });
    sendHelloAck(pending.ws, { ok: true, connectionId: pending.connectionId });
    upsertConnectedClient(hello, 'connected');
    notifyConnected();
  }

  /**
   * @param {PendingConnectionLike} pending
   * @param {string} errorCode
   * @param {Record<string, unknown>} [details={}]
   */
  function rejectHello(pending, errorCode, details = {}) {
    diagnostics.helloAttempts += 1;
    diagnostics.helloRejections += 1;
    diagnostics.lastHelloRejection = {
      reason: errorCode,
      at: Date.now(),
      connectionId: pending.connectionId,
      details: { ...details },
    };
    audit('hello_rejected', {
      connectionId: pending.connectionId,
      reason: errorCode,
      ...details,
    });
    sendHelloAck(pending.ws, { ok: false, error: errorCode });
    removePendingConnection(pending.connectionId);
    closeWs(pending.ws, `hello_rejected:${errorCode}`);
  }

  /**
   * @param {PendingConnectionLike} pending
   * @param {string} raw
   * @param {string} origin
   */
  function handlePendingMessage(pending, raw, origin) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      logger.warn?.('Failed to parse pending bridge message:', error);
      rejectHello(pending, HELLO_ERROR_INVALID_PAYLOAD, { parseError: true });
      return;
    }
    const hello = tryParseHelloPayload(parsed);
    if (!hello) {
      rejectHello(pending, HELLO_ERROR_INVALID_PAYLOAD, { receivedType: toRecord(parsed).type || '' });
      return;
    }
    if (!hello.extensionInstanceId || !hello.token) {
      rejectHello(pending, HELLO_ERROR_INVALID_PAYLOAD, { missingIdentityOrCredential: true });
      return;
    }
    const credentialHash = hashBridgeCredential(hello.token);
    const paired = pairedClients.find((client) => client.extensionInstanceId === hello.extensionInstanceId);
    if (paired && !credentialsMatch(paired.credentialHash, credentialHash)) {
      upsertPendingClient(hello, credentialHash, HELLO_ERROR_CREDENTIAL_MISMATCH);
      rejectHello(pending, HELLO_ERROR_CREDENTIAL_MISMATCH, {
        extensionInstanceId: hello.extensionInstanceId,
        extensionId: hello.extensionId,
        credentialFingerprint: credentialHash.slice(0, 12),
      });
      return;
    }
    if (!paired) {
      if (token && hello.token === token) {
        pairedClients.push({
          extensionInstanceId: hello.extensionInstanceId,
          credentialHash,
          pairedAt: Date.now(),
          browserName: hello.browserName || '',
          profileLabel: hello.profileLabel || '',
        });
        pendingClients = pendingClients.filter((client) => client.extensionInstanceId !== hello.extensionInstanceId);
        persistPairingRegistry();
      } else {
        upsertPendingClient(hello, credentialHash, HELLO_ERROR_PAIRING_REQUIRED);
        rejectHello(pending, HELLO_ERROR_PAIRING_REQUIRED, {
          extensionInstanceId: hello.extensionInstanceId,
          extensionId: hello.extensionId,
          browserName: hello.browserName,
          profileLabel: hello.profileLabel,
          credentialFingerprint: credentialHash.slice(0, 12),
        });
        return;
      }
    }
    registerSession(pending, hello, origin);
  }

  /**
   * @param {BridgeSessionLike} session
   * @param {string} raw
   */
  function handleSessionMessage(session, raw) {
    /** @type {unknown} */
    let message;
    try {
      message = JSON.parse(raw);
    } catch (error) {
      logger.warn?.('Failed to parse Wechatsync bridge response:', error);
      return;
    }

    const record = toRecord(message);

    if (record.type === 'extension_hello') {
      debug('Ignoring extension_hello on already-authenticated session');
      return;
    }

    if (record.type === 'heartbeat') {
      refreshClientSeen(session.extensionInstanceId);
      // SPEC-1 (Extension >= 2.8.0): echo heartbeat_ack so the extension's
      // liveness counter resets. Once the plugin ships this reply,
      // extension can flip MAX_MISSED_HEARTBEAT_ACKS from Infinity to 3
      // and detect plugin crashes/freezes within ~75s. ts is echoed back
      // unchanged so the extension can measure round-trip latency.
      if (isClientSocketOpen(session.ws)) {
        try {
          session.ws.send(JSON.stringify({ type: 'heartbeat_ack', ts: record.ts }));
        } catch (err) {
          const readableError = toBridgeErrorLike(err);
          logger.warn?.('Failed to send heartbeat_ack:', readableError.message || err);
        }
      }
      return;
    }

    const messageId = toBridgeString(record.id);
    const pending = session.pendingRequests.get(messageId);
    if (!pending) {
      debug('Received response for one-way, unknown, or timed out request', {
        id: messageId,
        hasError: !!record.error,
        resultKind: Array.isArray(record.result) ? 'array' : typeof record.result,
      });
      return;
    }

    clearBridgeTimeout(pending.timeout);
    session.pendingRequests.delete(messageId);

    if (record.error) {
      const errorRecord = toRecord(record.error);
      const errorMessage = toBridgeString(errorRecord.message || errorRecord.error, String(record.error));
      debug('Request failed', {
        id: messageId,
        method: pending.method,
        elapsedMs: Date.now() - pending.startedAt,
        error: errorMessage,
      });
      pending.reject(createReadableBridgeError(new Error(errorMessage)));
      return;
    }
    debug('Request completed', {
      id: messageId,
      method: pending.method,
      elapsedMs: Date.now() - pending.startedAt,
      resultKind: Array.isArray(record.result) ? 'array' : typeof record.result,
    });
    pending.resolve(record.result);
  }

  /**
   * @param {BridgeSocketLike} ws
   * @param {{ origin?: string }} [options={}]
   */
  function registerConnection(ws, { origin = '' } = {}) {
    const connectionId = connectionIdFactory();
    diagnostics.socketsOpened += 1;
    const pending = {
      connectionId,
      ws,
      connectedAt: Date.now(),
      origin,
      helloTimeout: null,
    };
    pendingConnections.set(connectionId, pending);
    debug('Extension connected (pending hello)', { connectionId, origin });

    pending.helloTimeout = setBridgeTimeout(() => {
      if (!pendingConnections.has(connectionId)) return;
      rejectHello(pending, HELLO_ERROR_TIMEOUT, { timeoutMs: helloTimeoutMs });
    }, helloTimeoutMs);

    ws.on('message', (data) => {
      const raw = data.toString();
      const stillPending = pendingConnections.get(connectionId);
      if (stillPending) {
        handlePendingMessage(stillPending, raw, origin);
        return;
      }
      const instanceId = connectionIdToInstanceId.get(connectionId);
      const session = instanceId ? sessions.get(instanceId) : null;
      if (session) handleSessionMessage(session, raw);
    });
    ws.on('close', () => {
      removePendingConnection(connectionId);
      const instanceId = connectionIdToInstanceId.get(connectionId);
      if (instanceId) {
        connectionIdToInstanceId.delete(connectionId);
        const session = sessions.get(instanceId);
        if (session) {
          for (const [, req] of session.pendingRequests.entries()) {
            clearBridgeTimeout(req.timeout);
            req.reject(createReadableBridgeError(new Error('Extension disconnected.')));
          }
          session.pendingRequests.clear();
          sessions.delete(instanceId);
          markClientDisconnected(instanceId);
          debug('Session disconnected', { connectionId, extensionInstanceId: instanceId });
          if (primaryClientId === instanceId) {
            primaryClientId = null;
            for (const [id, s] of sessions.entries()) {
              if (isClientSocketOpen(s.ws)) { primaryClientId = id; break; }
            }
          }
        }
      }
    });
    ws.on('error', (error) => {
      logger.warn?.('Wechatsync bridge WebSocket error:', error);
    });
  }

  /**
   * @param {BridgeHttpRequestLike} req
   * @returns {{ ok: true } | { ok: false, status: number, reason: string }}
   */
  function isAuthorizedHttpRequest(req) {
    if (!token) return { ok: false, status: 503, reason: 'bridge_token_not_configured' };
    const header = req.headers['authorization'] || req.headers['Authorization'] || '';
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || typeof value !== 'string') {
      return { ok: false, status: 401, reason: 'missing_authorization' };
    }
    const match = /^Bearer\s+(.+)$/i.exec(value.trim());
    if (!match) {
      return { ok: false, status: 401, reason: 'invalid_authorization_scheme' };
    }
    if (match[1].trim() !== token) {
      return { ok: false, status: 403, reason: 'invalid_token' };
    }
    return { ok: true };
  }

  /**
   * @param {BridgeHttpResponseLike} res
   * @param {number} status
   * @param {string} reason
   */
  function denyHttpRequest(res, status, reason) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: reason }));
  }

  async function startHttpApi() {
    httpServer = activeHttp.createServer(async (req, res) => {
      const request = /** @type {BridgeHttpRequestLike} */ (req);
      const response = /** @type {BridgeHttpResponseLike} */ (res);
      // §3.4: do not emit Access-Control-Allow-Origin by default; rely on
      // browser-enforced same-origin policy as the second defense layer.

      if (request.method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
      }

      const auth = isAuthorizedHttpRequest(request);
      if (!auth.ok) {
        const status = Number(auth.status);
        const reason = String(auth.reason);
        audit('http_request_unauthorized', {
          url: request.url,
          method: request.method,
          reason,
        });
        denyHttpRequest(response, status, reason);
        return;
      }

      if (request.method === 'GET' && request.url === '/status') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
          connected: isAuthenticatedConnected(),
          mode: 'primary',
          authenticated: isAuthenticatedConnected(),
          pendingConnections: pendingConnections.size,
          host: bindHost,
          allowRemote: !!allowRemote,
        }));
        return;
      }

      if (request.method === 'POST' && request.url === '/request') {
        try {
          const body = await readRequestBody(request);
          const requestBody = toRecord(JSON.parse(body || '{}'));
          const method = toBridgeString(requestBody.method);
          const params = requestBody.params;
          const timeoutMs = Number(requestBody.timeoutMs);
          const result = await requestInternal(method, params, { timeoutMs });
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ result }));
        } catch (error) {
          const readableError = toBridgeErrorLike(error);
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: readableError.message || String(error) }));
        }
        return;
      }

      if (request.method === 'POST' && request.url === '/send') {
        try {
          const body = await readRequestBody(request);
          const requestBody = toRecord(JSON.parse(body || '{}'));
          const method = toBridgeString(requestBody.method);
          const params = requestBody.params;
          const result = sendInternal(method, params);
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ result }));
        } catch (error) {
          const readableError = toBridgeErrorLike(error);
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: readableError.message || String(error) }));
        }
        return;
      }

      response.writeHead(404);
      response.end('Not found');
    });

    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen({ port: port + 1, host: bindHost }, () => {
        httpServer.off?.('error', reject);
        resolve();
      });
    });
  }

  async function startServer() {
    if (!activeHttp) {
      activeHttp = await httpLoader();
    }
    if (!activeHttp || typeof activeHttp.createServer !== 'function') {
      throw new Error('http module is required to create Wechatsync bridge service.');
    }
    await new Promise((resolve, reject) => {
      try {
        wss = WebSocketServer
          ? new WebSocketServer({ port, host: bindHost })
          : createMinimalWebSocketServer({ http: activeHttp, port, host: bindHost, originAllowlist, logger });
      } catch (error) {
        reject(error);
        return;
      }

      wss.once('listening', resolve);
      wss.once('error', reject);
      wss.on('connection', (ws, request) => {
        // Both the ws library and our minimal server emit (ws, request|extras).
        const requestRecord = toRecord(request);
        const headers = toRecord(requestRecord.headers);
        const origin = toBridgeString(headers.origin || requestRecord.origin);
        registerConnection(/** @type {BridgeSocketLike} */ (ws), { origin });
      });
    });

    try {
      await startHttpApi();
    } catch (error) {
      if (wss) {
        await new Promise((resolve) => wss.close(resolve));
        wss = null;
      }
      throw error;
    }
  }

  async function start() {
    if (wss) {
      return getStatus();
    }

    try {
      await startServer();
      debug('Bridge started', {
        port,
        httpPort: port + 1,
        host: bindHost,
        allowRemote,
      });
    } catch (error) {
      // §4.1: EADDRINUSE no longer silently degrades into SECONDARY mode.
      // Surface the failure so the user can fix port conflicts.
      throw createReadableBridgeError(error);
    }

    return getStatus();
  }

  async function stop() {
    for (const session of sessions.values()) {
      for (const [id, req] of session.pendingRequests.entries()) {
        clearBridgeTimeout(req.timeout);
        req.reject(new Error(`Request cancelled: ${id}`));
      }
      session.pendingRequests.clear();
      closeWs(session.ws, 'stop');
    }
    sessions.clear();
    connectionIdToInstanceId.clear();
    primaryClientId = null;

    for (const pending of pendingConnections.values()) {
      if (pending.helloTimeout) clearBridgeTimeout(pending.helloTimeout);
      closeWs(pending.ws, 'stop');
    }
    pendingConnections.clear();

    if (wss) {
      await new Promise((resolve) => wss.close(resolve));
      wss = null;
    }
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      httpServer = null;
    }
  }

  function waitForConnection(timeoutMs = connectTimeoutMs) {
    if (isAuthenticatedConnected()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      /** @type {() => void} */
      let wrappedResolve = () => {};
      const timeout = setBridgeTimeout(() => {
        const index = connectionResolvers.indexOf(wrappedResolve);
        if (index >= 0) connectionResolvers.splice(index, 1);
        reject(createReadableBridgeError(new Error('timeout:no_extension')));
      }, timeoutMs);

      wrappedResolve = () => {
        clearBridgeTimeout(timeout);
        resolve();
      };
      connectionResolvers.push(wrappedResolve);
    });
  }

  /**
   * @param {string} method
   * @param {unknown} params
   * @param {BridgeRequestOptionsLike} [options={}]
   * @returns {Promise<unknown>}
   */
  function requestInternal(method, params, options = {}) {
    if (!method) {
      return Promise.reject(new Error('Wechatsync bridge method is required.'));
    }
    const session = primaryClientId ? sessions.get(primaryClientId) : null;
    if (!session) {
      if (pendingConnections.size > 0) {
        return Promise.reject(createReadableBridgeError(new Error('Extension not authenticated.')));
      }
      return Promise.reject(createReadableBridgeError(new Error('Extension not connected.')));
    }
    if (!isClientSocketOpen(session.ws)) {
      return Promise.reject(createReadableBridgeError(new Error('Extension not connected.')));
    }

    const id = idFactory();
    /** @type {{ id: string, method: string, params: unknown, token?: string }} */
    const message = { id, method, params };
    message.token = session.credential;
    const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
      ? Number(options.timeoutMs)
      : requestTimeoutMs;

    return new Promise((resolve, reject) => {
      const timeout = setBridgeTimeout(() => {
        session.pendingRequests.delete(id);
        debug('Request timed out', { id, method, timeoutMs });
        reject(createReadableBridgeError(new Error(`Request timeout: ${method}`)));
      }, timeoutMs);

      session.pendingRequests.set(id, { resolve, reject, timeout, method, startedAt: Date.now() });
      debug('Sending request', {
        id,
        method,
        timeoutMs,
        connectionId: session.connectionId,
        extensionInstanceId: session.extensionInstanceId,
        paramKeys: params && typeof params === 'object' ? Object.keys(params) : [],
      });
      session.ws.send(JSON.stringify(message));
    });
  }

  /**
   * @param {string} method
   * @param {unknown} params
   * @returns {{ accepted: boolean, requestId: string, method: string }}
   */
  function sendInternal(method, params) {
    if (!method) {
      throw new Error('Wechatsync bridge method is required.');
    }
    const session = primaryClientId ? sessions.get(primaryClientId) : null;
    if (!session) {
      if (pendingConnections.size > 0) {
        throw createReadableBridgeError(new Error('Extension not authenticated.'));
      }
      throw createReadableBridgeError(new Error('Extension not connected.'));
    }
    if (!isClientSocketOpen(session.ws)) {
      throw createReadableBridgeError(new Error('Extension not connected.'));
    }

    const id = idFactory();
    /** @type {{ id: string, method: string, params: unknown, token?: string }} */
    const message = { id, method, params };
    message.token = session.credential;
    debug('Sending one-way request', {
      id,
      method,
      connectionId: session.connectionId,
      extensionInstanceId: session.extensionInstanceId,
      paramKeys: params && typeof params === 'object' ? Object.keys(params) : [],
    });
    session.ws.send(JSON.stringify(message));
    return { accepted: true, requestId: id, method };
  }

  /**
   * @param {string} method
   * @param {unknown} params
   * @param {BridgeRequestOptionsLike} [options={}]
   * @returns {Promise<unknown>}
   */
  async function request(method, params, options = {}) {
    await start();
    return requestInternal(method, params, options);
  }

  /**
   * @param {string} method
   * @param {string} fallbackMethod
   * @param {unknown} params
   * @param {BridgeRequestOptionsLike} [options={}]
   * @returns {Promise<unknown>}
   */
  async function requestWithMethodFallback(method, fallbackMethod, params, options = {}) {
    try {
      return await request(method, params, options);
    } catch (error) {
      if (!fallbackMethod || !isUnsupportedBridgeMethodError(error)) throw error;
      debug('Retrying request with fallback method', {
        method,
        fallbackMethod,
        code: toBridgeErrorLike(error).code,
        message: toBridgeErrorLike(error).message || String(error),
      });
      return request(fallbackMethod, params, options);
    }
  }

  /**
   * @param {string} method
   * @param {unknown} params
   */
  async function send(method, params) {
    await start();
    return sendInternal(method, params);
  }

  /** @param {BridgeListPlatformsOptionsLike} [options={}] */
  function listPlatforms({ forceRefresh = false, timeoutMs = DEFAULT_PLATFORM_REQUEST_TIMEOUT_MS } = {}) {
    return request('listPlatforms', { forceRefresh }, { timeoutMs });
  }

  /** @param {BridgeTimeoutOptionsLike} [options={}] */
  function health({ timeoutMs = 5000 } = {}) {
    return request('health', {}, { timeoutMs });
  }

  /** @param {BridgeTimeoutOptionsLike} [options={}] */
  function listSupportedPlatforms({ timeoutMs = DEFAULT_PLATFORM_REQUEST_TIMEOUT_MS } = {}) {
    return requestWithMethodFallback('listSupportedPlatforms', 'list_supported_platforms', {}, { timeoutMs });
  }

  /**
   * @param {unknown} platformOrPlatforms
   * @param {{ timeoutMs?: number, forceRefresh?: boolean }} [options={}]
   */
  function checkAuth(platformOrPlatforms, { timeoutMs = DEFAULT_PLATFORM_REQUEST_TIMEOUT_MS, forceRefresh = false } = {}) {
    const params = Array.isArray(platformOrPlatforms)
      ? { platforms: platformOrPlatforms, forceRefresh }
      : { platform: platformOrPlatforms, forceRefresh };
    return requestWithMethodFallback('checkAuth', 'check_auth', params, { timeoutMs });
  }

  /** @param {BridgeArticleOptionsLike} options */
  function syncArticle({ platforms, title, markdown, content, cover, coverThumbnail, assets, quotaPolicy, timeoutMs = DEFAULT_SYNC_REQUEST_TIMEOUT_MS }) {
    const article = { title, markdown, content, cover, assets };
    if (coverThumbnail) article.coverThumbnail = coverThumbnail;
    /** @type {Record<string, unknown>} */
    const params = { platforms, article };
    // SPEC-3 (Extension >= 2.8.0): quotaPolicy is forwarded so the
    // extension can choose between 'block' (default; old behavior) and
    // 'truncate' (auto-shrink to remaining free quota). Older extensions
    // ignore the field, so this is fully backwards-compatible.
    if (quotaPolicy === 'block' || quotaPolicy === 'truncate') {
      params.quotaPolicy = quotaPolicy;
    }
    return request('syncArticle', params, { timeoutMs });
  }

  /** @param {BridgeArticleOptionsLike} options */
  function enqueueSyncArticle({
    platforms,
    title,
    markdown,
    content,
    cover,
    coverThumbnail,
    assets,
    source = 'obsidian',
    quotaPolicy,
    timeoutMs = 10000,
  }) {
    const article = { title, markdown, content, cover, assets };
    if (coverThumbnail) article.coverThumbnail = coverThumbnail;
    /** @type {Record<string, unknown>} */
    const params = { platforms, source, article };
    if (quotaPolicy === 'block' || quotaPolicy === 'truncate') {
      params.quotaPolicy = quotaPolicy;
    }
    return requestWithMethodFallback('enqueueSyncArticle', 'enqueue_sync_article', params, { timeoutMs });
  }

  /**
   * @param {unknown} syncIdOrOptions
   * @param {BridgeTimeoutOptionsLike} [options={}]
   */
  function getSyncTask(syncIdOrOptions, { timeoutMs = 5000 } = {}) {
    const params = isRecord(syncIdOrOptions)
      ? { syncId: syncIdOrOptions.syncId }
      : { syncId: syncIdOrOptions };
    return requestWithMethodFallback('getSyncTask', 'get_sync_task', params, { timeoutMs });
  }

  /**
   * @param {unknown} syncIdOrOptions
   * @param {BridgeTimeoutOptionsLike} [options={}]
   */
  function getSyncTaskLink(syncIdOrOptions, { timeoutMs = 5000 } = {}) {
    const params = isRecord(syncIdOrOptions)
      ? { syncId: syncIdOrOptions.syncId }
      : { syncId: syncIdOrOptions };
    return requestWithMethodFallback('getSyncTaskLink', 'get_sync_task_link', params, { timeoutMs });
  }

  /**
   * @param {unknown} syncIdOrOptions
   * @param {BridgeTimeoutOptionsLike} [options={}]
   */
  function openSyncTask(syncIdOrOptions, { timeoutMs = 5000 } = {}) {
    const params = isRecord(syncIdOrOptions)
      ? { syncId: syncIdOrOptions.syncId }
      : { syncId: syncIdOrOptions };
    return requestWithMethodFallback('openSyncTask', 'open_sync_task', params, { timeoutMs });
  }

  /** @param {{ platforms?: unknown[], maxAgeMs?: number, timeoutMs?: number }} [options={}] */
  function getAuthSnapshot({ platforms = [], maxAgeMs = 86400000, timeoutMs = 5000 } = {}) {
    return requestWithMethodFallback('getAuthSnapshot', 'get_auth_snapshot', {
      platforms,
      maxAgeMs,
    }, { timeoutMs });
  }

  /** @param {BridgeArticleOptionsLike} options */
  function sendArticle({ platforms, title, markdown, content, cover, coverThumbnail, assets, quotaPolicy }) {
    const article = { title, markdown, content, cover, assets };
    if (coverThumbnail) article.coverThumbnail = coverThumbnail;
    /** @type {Record<string, unknown>} */
    const params = { platforms, article };
    if (quotaPolicy === 'block' || quotaPolicy === 'truncate') {
      params.quotaPolicy = quotaPolicy;
    }
    return send('syncArticle', params);
  }

  async function getStatus() {
    return {
      mode: 'primary',
      connected: isAuthenticatedConnected(),
      authenticated: isAuthenticatedConnected(),
      pendingConnections: pendingConnections.size,
      host: bindHost,
      allowRemote: !!allowRemote,
      port,
      connectedClients: connectedClients.map((c) => ({ ...c })),
      pairedClients: pairedClients.map((c) => ({ ...c })),
      pendingClients: pendingClients.map((c) => ({ ...c })),
      primaryClientId,
      maxClients,
      diagnostics: getDiagnostics(),
    };
  }

  function getDiagnostics() {
    const lastHelloRejection = diagnostics.lastHelloRejection
      ? toRecord(diagnostics.lastHelloRejection)
      : null;
    return {
      socketsOpened: diagnostics.socketsOpened,
      helloAttempts: diagnostics.helloAttempts,
      helloRejections: diagnostics.helloRejections,
      helloSuccesses: diagnostics.helloSuccesses,
      pendingConnections: pendingConnections.size,
      lastHelloRejection: lastHelloRejection
        ? { ...lastHelloRejection, details: { ...toRecord(lastHelloRejection.details) } }
        : null,
    };
  }

  function getActiveClientDescriptor() {
    const session = primaryClientId ? sessions.get(primaryClientId) : null;
    if (!session) return null;
    return {
      connectionId: session.connectionId,
      extensionInstanceId: session.extensionInstanceId,
      extensionId: session.extensionId,
      version: session.version,
      profileLabel: session.profileLabel,
      browserName: session.browserName,
      capabilities: { ...(session.capabilities || {}) },
      license: { ...(session.license || {}) },
      connectedAt: session.connectedAt,
      authenticatedAt: session.authenticatedAt,
      origin: session.origin,
    };
  }

  return {
    start,
    stop,
    waitForConnection,
    getStatus,
    getDiagnostics,
    getActiveClientDescriptor,
    pairClient,
    unpairClient,
    health,
    listSupportedPlatforms,
    listPlatforms,
    checkAuth,
    syncArticle,
    enqueueSyncArticle,
    getSyncTask,
    getSyncTaskLink,
    openSyncTask,
    getAuthSnapshot,
    sendArticle,
    _request: request,
    _send: send,
  };
}

export {
  DEFAULT_WECHATSYNC_PORT,
  DEFAULT_SYNC_REQUEST_TIMEOUT_MS,
  DEFAULT_HELLO_TIMEOUT_MS,
  LOCAL_BIND_HOST,
  REMOTE_BIND_HOST,
  HELLO_ERROR_TOKEN_MISMATCH,
  HELLO_ERROR_PAIRING_REQUIRED,
  HELLO_ERROR_CREDENTIAL_MISMATCH,
  HELLO_ERROR_INVALID_PAYLOAD,
  HELLO_ERROR_TIMEOUT,
  HELLO_ERROR_VERSION_UNSUPPORTED,
  HELLO_ERROR_DUPLICATE_SESSION,
  HELLO_ERROR_TOO_MANY_CLIENTS,
  DEFAULT_MAX_CLIENTS,
  clearBridgeTimeout,
  createReadableBridgeError,
  createWechatSyncBridgeService,
  createWebSocketAcceptKey,
  defaultConnectionIdFactory,
  credentialsMatch,
  hashBridgeCredential,
  isOriginAllowedForWebSocket,
  isRecoverableBridgeConnectionError,
  isUnsupportedBridgeMethodError,
  parseWebSocketFrames,
  retryRecoverableBridgeOperation,
  setBridgeTimeout,
};
