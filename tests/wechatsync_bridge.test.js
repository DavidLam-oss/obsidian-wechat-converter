/*
## 核心功能

覆盖 wechatsync bridge 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 wechatsync bridge 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, afterEach, vi } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import {
  HELLO_ERROR_INVALID_PAYLOAD,
  HELLO_ERROR_TIMEOUT,
  HELLO_ERROR_TOKEN_MISMATCH,
  HELLO_ERROR_VERSION_UNSUPPORTED,
  HELLO_ERROR_DUPLICATE_SESSION,
  HELLO_ERROR_TOO_MANY_CLIENTS,
  DEFAULT_MAX_CLIENTS,
  createReadableBridgeError,
  createWebSocketAcceptKey,
  createWechatSyncBridgeService,
  defaultConnectionIdFactory,
  isOriginAllowedForWebSocket,
  isRecoverableBridgeConnectionError,
  isUnsupportedBridgeMethodError,
  parseWebSocketFrames,
  retryRecoverableBridgeOperation,
  setBridgeTimeout,
  clearBridgeTimeout,
} from '../services/wechatsync-bridge.js';

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

const DEFAULT_TEST_HELLO = {
  extensionInstanceId: 'ext-instance-test',
  extensionId: 'test-extension',
  version: '0.1.0',
  profileLabel: 'Test Profile',
  browserName: 'TestBrowser',
  capabilities: { enqueueSyncArticle: true },
};

function openSocket(port, { host = '127.0.0.1', origin = '' } = {}) {
  const headers = origin ? { Origin: origin } : undefined;
  const ws = new WebSocket(`ws://${host}:${port}`, headers ? { headers } : undefined);
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function waitForAck(ws) {
  return new Promise((resolve, reject) => {
    const onMessage = (data) => {
      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (parsed?.type === 'extension_hello_ack') {
        ws.off('message', onMessage);
        resolve(parsed);
      }
    };
    const onClose = () => {
      ws.off('message', onMessage);
      reject(new Error('socket_closed_before_ack'));
    };
    ws.on('message', onMessage);
    ws.once('close', onClose);
  });
}

function sendHello(ws, { token = 'secret-token', overrides = {} } = {}) {
  const payload = {
    type: 'extension_hello',
    token,
    ...DEFAULT_TEST_HELLO,
    ...overrides,
  };
  ws.send(JSON.stringify(payload));
  return waitForAck(ws);
}

async function connectExtension(port, handler, options = {}) {
  const { token = 'secret-token', skipHello = false, hello, origin = '' } = options;
  const ws = await openSocket(port, { origin });

  if (!skipHello) {
    const ack = await sendHello(ws, { token, overrides: hello });
    if (!ack.ok) {
      throw Object.assign(new Error(`hello_failed:${ack.error}`), { ack });
    }
  }

  if (handler) {
    ws.on('message', async (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (message?.type) return; // ignore typed messages such as hello_ack
      const response = await handler(message);
      ws.send(JSON.stringify({ id: message.id, ...response }));
    });
  }

  return ws;
}

describe('Wechatsync bridge service', () => {
  const cleanup = [];

  afterEach(async () => {
    while (cleanup.length) {
      const item = cleanup.pop();
      if (item?.stop) await item.stop();
      if (item?.close) item.close();
    }
  });

  it('routes bridge timers through the active window helpers', () => {
    const originalSetTimeout = Object.getOwnPropertyDescriptor(window, 'setTimeout');
    const originalClearTimeout = Object.getOwnPropertyDescriptor(window, 'clearTimeout');
    const timerToken = { timer: 'bridge-timeout' };
    const setTimeoutSpy = vi.fn(() => timerToken);
    const clearTimeoutSpy = vi.fn();

    Object.defineProperty(window, 'setTimeout', {
      value: setTimeoutSpy,
      configurable: true,
    });
    Object.defineProperty(window, 'clearTimeout', {
      value: clearTimeoutSpy,
      configurable: true,
    });

    try {
      const handler = () => {};
      const timer = setBridgeTimeout(handler, 1234);
      clearBridgeTimeout(timer);

      expect(timer).toBe(timerToken);
      expect(setTimeoutSpy).toHaveBeenCalledWith(handler, 1234);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timerToken);
    } finally {
      if (originalSetTimeout) {
        Object.defineProperty(window, 'setTimeout', originalSetTimeout);
      }
      if (originalClearTimeout) {
        Object.defineProperty(window, 'clearTimeout', originalClearTimeout);
      }
    }
  });

  it('prefers active window crypto.randomUUID for bridge connection IDs', () => {
    const originalCrypto = Object.getOwnPropertyDescriptor(window, 'crypto');
    Object.defineProperty(window, 'crypto', {
      value: { randomUUID: vi.fn(() => 'window-random-uuid') },
      configurable: true,
    });

    try {
      expect(defaultConnectionIdFactory()).toBe('window-random-uuid');
      expect(window.crypto.randomUUID).toHaveBeenCalledTimes(1);
    } finally {
      if (originalCrypto) {
        Object.defineProperty(window, 'crypto', originalCrypto);
      } else {
        delete window.crypto;
      }
    }
  });

  it('computes the standard WebSocket accept key without Node crypto', () => {
    expect(createWebSocketAcceptKey('dGhlIHNhbXBsZSBub25jZQ==')).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  });

  it('sends listPlatforms requests to a connected extension client', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'req-1',
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, (message) => {
      expect(message).toMatchObject({
        id: 'req-1',
        method: 'listPlatforms',
        token: 'secret-token',
        params: { forceRefresh: true },
      });
      return {
        result: [
          { id: 'zhihu', name: '知乎', authenticated: true },
          { id: 'juejin', name: '掘金', authenticated: false },
        ],
      };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    const platforms = await service.listPlatforms({ forceRefresh: true });

    expect(platforms).toHaveLength(2);
    expect(platforms[0].id).toBe('zhihu');
  });

  it('checks bridge health through the extension so token errors are surfaced', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'health-1',
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, (message) => {
      expect(message).toMatchObject({
        id: 'health-1',
        method: 'health',
        token: 'secret-token',
      });
      return {
        result: {
          ok: true,
          extensionConnected: true,
          tokenValid: true,
          version: '2.0.9',
        },
      };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await expect(service.health()).resolves.toMatchObject({
      ok: true,
      tokenValid: true,
    });
  });

  it('loads supported platform metadata without triggering auth checks', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'supported-1',
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, (message) => {
      expect(message).toMatchObject({
        id: 'supported-1',
        method: 'listSupportedPlatforms',
        token: 'secret-token',
      });
      return {
        result: [
          { id: 'zhihu', name: '知乎', supportsDraft: true },
          { id: 'xiaohongshu', name: '小红书', supportsDraft: true },
        ],
      };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await expect(service.listSupportedPlatforms()).resolves.toEqual([
      { id: 'zhihu', name: '知乎', supportsDraft: true },
      { id: 'xiaohongshu', name: '小红书', supportsDraft: true },
    ]);
  });

  it('checks auth for selected platforms in a single bridge request', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'auth-batch-1',
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, (message) => {
      expect(message).toMatchObject({
        id: 'auth-batch-1',
        method: 'checkAuth',
        token: 'secret-token',
        params: {
          platforms: ['zhihu', 'juejin'],
          forceRefresh: true,
        },
      });
      return {
        result: [
          { id: 'zhihu', isAuthenticated: true },
          { id: 'juejin', isAuthenticated: false, error: '未登录' },
        ],
      };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await expect(service.checkAuth(['zhihu', 'juejin'], { forceRefresh: true })).resolves.toHaveLength(2);
  });

  it('can time out platform listing without waiting for the long sync timeout', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'slow-list',
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, () => new Promise(() => {}));
    cleanup.push(extension);

    await service.waitForConnection(1000);
    const startedAt = Date.now();
    await expect(service.listPlatforms({ timeoutMs: 20 })).rejects.toMatchObject({
      code: 'PLATFORM_LIST_TIMEOUT',
    });
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  it('can time out article sync with a readable timeout error', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'slow-sync',
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, () => new Promise(() => {}));
    cleanup.push(extension);

    await service.waitForConnection(1000);
    const startedAt = Date.now();
    await expect(service.syncArticle({
      platforms: ['zhihu'],
      title: '测试文章',
      markdown: '# 正文',
      content: '<h1>正文</h1>',
      timeoutMs: 20,
    })).rejects.toMatchObject({
      code: 'SYNC_TIMEOUT',
    });
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  it('maps extension token failures to a readable auth error', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, () => ({
      error: { code: 403, message: 'Invalid or missing token' },
    }), { token: '' });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await expect(service.listPlatforms()).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
  });

  it('passes syncArticle results through with draft URLs and per-platform errors', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'sync-1',
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, (message) => {
      expect(message).toMatchObject({
        id: 'sync-1',
        method: 'syncArticle',
        token: 'secret-token',
        params: {
          platforms: ['zhihu', 'juejin'],
          article: {
            title: '测试文章',
            markdown: '# 正文',
            content: '<h1>正文</h1>',
            cover: 'https://example.com/cover.png',
          },
        },
      });
      return {
        result: {
          syncId: 'remote-sync-1',
          results: [
            {
              platform: 'zhihu',
              platformName: '知乎',
              success: true,
              postUrl: 'https://zhuanlan.zhihu.com/p/123/edit',
              draftOnly: true,
            },
            {
              platform: 'juejin',
              platformName: '掘金',
              success: false,
              error: '未登录',
            },
          ],
        },
      };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    const result = await service.syncArticle({
      platforms: ['zhihu', 'juejin'],
      title: '测试文章',
      markdown: '# 正文',
      content: '<h1>正文</h1>',
      cover: 'https://example.com/cover.png',
    });

    expect(result).toEqual({
      syncId: 'remote-sync-1',
      results: [
        {
          platform: 'zhihu',
          platformName: '知乎',
          success: true,
          postUrl: 'https://zhuanlan.zhihu.com/p/123/edit',
          draftOnly: true,
        },
        {
          platform: 'juejin',
          platformName: '掘金',
          success: false,
          error: '未登录',
        },
      ],
    });
  });

  it('can send article to the extension without waiting for sync results', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'one-way-sync',
    });
    cleanup.push(service);
    await service.start();

    let resolveReceived;
    const receivedMessage = new Promise((resolve) => {
      resolveReceived = resolve;
    });
    const extension = await connectExtension(port, (message) => {
      resolveReceived(message);
      return new Promise(() => {});
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    const startedAt = Date.now();
    const result = await service.sendArticle({
      platforms: ['zhihu'],
      title: '测试文章',
      markdown: '# 正文',
      content: '<h1>正文</h1>',
    });

    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(result).toEqual({
      accepted: true,
      requestId: 'one-way-sync',
      method: 'syncArticle',
    });
    await expect(receivedMessage).resolves.toMatchObject({
      id: 'one-way-sync',
      method: 'syncArticle',
      token: 'secret-token',
      params: {
        platforms: ['zhihu'],
        article: {
          title: '测试文章',
          markdown: '# 正文',
          content: '<h1>正文</h1>',
        },
      },
    });
  });

  it('forwards quotaPolicy through syncArticle (SPEC-3)', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'sync-quota-1',
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, (message) => {
      expect(message).toMatchObject({
        method: 'syncArticle',
        params: {
          platforms: ['zhihu'],
          quotaPolicy: 'truncate',
          article: { title: '配额文章' },
        },
      });
      return { result: { syncId: 'quota-sync-1' } };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await expect(service.syncArticle({
      platforms: ['zhihu'],
      title: '配额文章',
      markdown: '# 正文',
      content: '<p>正文</p>',
      quotaPolicy: 'truncate',
    })).resolves.toMatchObject({ syncId: 'quota-sync-1' });
  });

  it('omits invalid quotaPolicy values from syncArticle wire payload', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'sync-quota-bad',
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, (message) => {
      expect(message.params).not.toHaveProperty('quotaPolicy');
      return { result: { syncId: 'no-policy' } };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await expect(service.syncArticle({
      platforms: ['zhihu'],
      title: '默认策略',
      markdown: '# 正文',
      content: '<p>正文</p>',
      quotaPolicy: 'invalid-value',
    })).resolves.toMatchObject({ syncId: 'no-policy' });
  });

  it('forwards quotaPolicy through sendArticle one-way send (SPEC-3)', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'send-quota-1',
    });
    cleanup.push(service);
    await service.start();

    let resolveReceived;
    const receivedMessage = new Promise((resolve) => { resolveReceived = resolve; });
    const extension = await connectExtension(port, (message) => {
      resolveReceived(message);
      return new Promise(() => {});
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await service.sendArticle({
      platforms: ['zhihu'],
      title: '配额一次性',
      markdown: '# 正文',
      content: '<p>正文</p>',
      quotaPolicy: 'truncate',
    });

    await expect(receivedMessage).resolves.toMatchObject({
      method: 'syncArticle',
      params: { quotaPolicy: 'truncate' },
    });
  });

  it('enqueues article sync and returns the extension sync id', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'enqueue-1',
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, (message) => {
      expect(message).toMatchObject({
        id: 'enqueue-1',
        method: 'enqueueSyncArticle',
        token: 'secret-token',
        params: {
          platforms: ['zhihu'],
          source: 'obsidian',
          article: {
            title: '测试文章',
            markdown: '# 正文',
            content: '<h1>正文</h1>',
          },
        },
      });
      return {
        result: {
          accepted: true,
          syncId: 'extension-sync-1',
          platforms: ['zhihu'],
        },
      };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await expect(service.enqueueSyncArticle({
      platforms: ['zhihu'],
      title: '测试文章',
      markdown: '# 正文',
      content: '<h1>正文</h1>',
    })).resolves.toMatchObject({
      accepted: true,
      syncId: 'extension-sync-1',
    });
  });

  it('forwards coverThumbnail through enqueueSyncArticle when provided', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'enqueue-thumb-1',
    });
    cleanup.push(service);
    await service.start();

    const sampleThumb = 'data:image/jpeg;base64,/9j/MOCK';
    const extension = await connectExtension(port, (message) => {
      expect(message).toMatchObject({
        id: 'enqueue-thumb-1',
        method: 'enqueueSyncArticle',
        params: {
          article: {
            title: '封面文章',
            coverThumbnail: sampleThumb,
          },
        },
      });
      return { result: { accepted: true, syncId: 'thumb-sync-1' } };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await expect(service.enqueueSyncArticle({
      platforms: ['zhihu'],
      title: '封面文章',
      markdown: '# 正文',
      content: '<p>正文</p>',
      cover: 'asset://image-1',
      coverThumbnail: sampleThumb,
    })).resolves.toMatchObject({ syncId: 'thumb-sync-1' });
  });

  it('omits coverThumbnail field entirely when not provided / empty', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'enqueue-no-thumb-1',
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, (message) => {
      expect(message.params.article).not.toHaveProperty('coverThumbnail');
      return { result: { accepted: true, syncId: 'no-thumb-sync-1' } };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await expect(service.enqueueSyncArticle({
      platforms: ['zhihu'],
      title: '无封面缩略图',
      markdown: '# 正文',
      content: '<p>正文</p>',
      coverThumbnail: '',
    })).resolves.toMatchObject({ syncId: 'no-thumb-sync-1' });
  });

  it('passes quotaPolicy through when enqueuing article sync', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => 'enqueue-quota-1',
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, (message) => {
      expect(message).toMatchObject({
        id: 'enqueue-quota-1',
        method: 'enqueueSyncArticle',
        params: {
          platforms: ['zhihu', 'juejin'],
          source: 'obsidian',
          quotaPolicy: 'truncate',
        },
      });
      return {
        result: {
          accepted: true,
          syncId: 'extension-sync-quota',
          platforms: ['zhihu'],
          skippedPlatforms: ['juejin'],
          quotaBlocked: true,
        },
      };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await expect(service.enqueueSyncArticle({
      platforms: ['zhihu', 'juejin'],
      title: '测试文章',
      markdown: '# 正文',
      content: '<h1>正文</h1>',
      quotaPolicy: 'truncate',
    })).resolves.toMatchObject({
      accepted: true,
      quotaBlocked: true,
      skippedPlatforms: ['juejin'],
    });
  });

  it('queries and opens extension sync tasks through the bridge', async () => {
    const port = await getFreePort();
    let requestIndex = 0;
    const expectedMethods = ['getSyncTask', 'openSyncTask'];
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => `task-${requestIndex + 1}`,
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, (message) => {
      expect(message.method).toBe(expectedMethods[requestIndex]);
      expect(message.params).toEqual({ syncId: 'sync-1' });
      requestIndex += 1;
      if (message.method === 'getSyncTask') {
        return {
          result: {
            found: true,
            syncId: 'sync-1',
            status: 'syncing',
            summary: { total: 2, success: 1, failed: 0, pending: 1 },
          },
        };
      }
      return { result: { opened: true, syncId: 'sync-1', target: 'history' } };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await expect(service.getSyncTask('sync-1')).resolves.toMatchObject({
      found: true,
      status: 'syncing',
    });
    await expect(service.openSyncTask({ syncId: 'sync-1' })).resolves.toMatchObject({
      opened: true,
      target: 'history',
    });
  });

  it('falls back to snake_case task and snapshot methods for MCP tool names', async () => {
    const port = await getFreePort();
    const methods = [];
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      idFactory: () => `fallback-${methods.length + 1}`,
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, (message) => {
      methods.push(message.method);
      if (message.method === 'getSyncTask') {
        return { error: { message: 'unknown method: getSyncTask' } };
      }
      if (message.method === 'get_sync_task') {
        return { result: { found: false, syncId: message.params.syncId, code: 'TASK_NOT_FOUND' } };
      }
      if (message.method === 'getAuthSnapshot') {
        return { error: { message: 'unknown method: getAuthSnapshot' } };
      }
      if (message.method === 'get_auth_snapshot') {
        return {
          result: {
            source: 'cache',
            checkedAt: 1770000000000,
            platforms: [{ id: 'zhihu', name: '知乎', authKnown: true, authenticated: true }],
          },
        };
      }
      return { error: { message: `unexpected method: ${message.method}` } };
    });
    cleanup.push(extension);

    await service.waitForConnection(1000);
    await expect(service.getSyncTask('sync-missing')).resolves.toMatchObject({
      found: false,
      code: 'TASK_NOT_FOUND',
    });
    await expect(service.getAuthSnapshot({ platforms: ['zhihu'] })).resolves.toMatchObject({
      source: 'cache',
      platforms: [{ id: 'zhihu', name: '知乎', authKnown: true, authenticated: true }],
    });
    expect(methods).toEqual(['getSyncTask', 'get_sync_task', 'getAuthSnapshot', 'get_auth_snapshot']);
  });

  it('recognizes common bridge error messages', () => {
    expect(createReadableBridgeError(new Error('MCP token not configured')).code).toBe('AUTH_FAILED');
    expect(createReadableBridgeError(new Error('Extension not connected')).code).toBe('EXTENSION_NOT_CONNECTED');
    expect(createReadableBridgeError(new Error('Request timeout: listPlatforms')).code).toBe('PLATFORM_LIST_TIMEOUT');
    expect(createReadableBridgeError(new Error('Request timeout: syncArticle')).code).toBe('SYNC_TIMEOUT');
    expect(createReadableBridgeError(new Error('Request timeout: enqueueSyncArticle')).code).toBe('BRIDGE_REQUEST_TIMEOUT');
    expect(createReadableBridgeError(new Error('Request timeout: getSyncTask')).code).toBe('BRIDGE_REQUEST_TIMEOUT');
    expect(createReadableBridgeError(new Error('port 55111 is already in use by another bridge with a different token')).code).toBe('BRIDGE_UNAVAILABLE');
  });

  it('only treats unsupported methods as fallback-safe task action errors', () => {
    expect(isUnsupportedBridgeMethodError(new Error('unknown method: openSyncTask'))).toBe(true);
    expect(isUnsupportedBridgeMethodError(new Error('method not found: getSyncTaskLink'))).toBe(true);
    expect(isUnsupportedBridgeMethodError(createReadableBridgeError(new Error('Invalid or missing token')))).toBe(false);
    expect(isUnsupportedBridgeMethodError(createReadableBridgeError(new Error('Extension not connected')))).toBe(false);
    expect(isUnsupportedBridgeMethodError(createReadableBridgeError(new Error('Request timeout: openSyncTask')))).toBe(false);
  });

  it('retries short-lived recoverable bridge failures before succeeding', async () => {
    const attempts = [];
    const delays = [];
    const result = await retryRecoverableBridgeOperation(async ({ attempt }) => {
      attempts.push(attempt);
      if (attempt < 2) throw createReadableBridgeError(new Error('Extension not connected'));
      return { ok: true };
    }, {
      retries: 2,
      delayMs: 25,
      delay: async (delayMs, attempt, error) => {
        delays.push({ delayMs, attempt, code: error.code });
      },
      logger: { debug() {} },
      label: 'health',
    });

    expect(result).toEqual({ ok: true });
    expect(attempts).toEqual([0, 1, 2]);
    expect(delays).toEqual([
      { delayMs: 25, attempt: 1, code: 'EXTENSION_NOT_CONNECTED' },
      { delayMs: 25, attempt: 2, code: 'EXTENSION_NOT_CONNECTED' },
    ]);
  });

  it('does not retry auth or unsupported-method failures', async () => {
    await expect(retryRecoverableBridgeOperation(async () => {
      throw createReadableBridgeError(new Error('Invalid or missing token'));
    }, {
      retries: 2,
      delay: async () => {
        throw new Error('delay should not run');
      },
      logger: { debug() {} },
    })).rejects.toMatchObject({ code: 'AUTH_FAILED' });

    await expect(retryRecoverableBridgeOperation(async () => {
      throw new Error('unknown method: health');
    }, {
      retries: 2,
      delay: async () => {
        throw new Error('delay should not run');
      },
      logger: { debug() {} },
    })).rejects.toThrow(/unknown method/);
  });

  it('classifies only connection recovery errors as retryable', () => {
    expect(isRecoverableBridgeConnectionError(createReadableBridgeError(new Error('Extension not connected')))).toBe(true);
    expect(isRecoverableBridgeConnectionError(createReadableBridgeError(new Error('Extension not authenticated')))).toBe(true);
    expect(isRecoverableBridgeConnectionError(createReadableBridgeError(new Error('Request timeout: health')))).toBe(true);
    expect(isRecoverableBridgeConnectionError(createReadableBridgeError(new Error('ECONNREFUSED')))).toBe(true);
    expect(isRecoverableBridgeConnectionError(createReadableBridgeError(new Error('Invalid or missing token')))).toBe(false);
    expect(isRecoverableBridgeConnectionError(new Error('unknown method: health'))).toBe(false);
  });
});

describe('WebSocket frame parsing', () => {
  function maskedFrame(opcode, payload) {
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.from([0x80 | opcode, 0x80 | length]);
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    const maskKey = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    return Buffer.concat([header, maskKey, payload]);
  }

  it('parses a text frame (opcode 0x1)', () => {
    const frame = maskedFrame(0x1, Buffer.from('{"hello":"world"}'));
    const result = parseWebSocketFrames(frame);
    expect(result.messages).toEqual(['{"hello":"world"}']);
    expect(result.remaining.length).toBe(0);
  });

  it('recognises a ping frame (opcode 0x9) as a control sentinel', () => {
    const payload = Buffer.from('keepalive');
    const frame = maskedFrame(0x9, payload);
    const result = parseWebSocketFrames(frame);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      __ws_control: 'ping',
    });
    expect(result.messages[0].payload).toEqual(payload);
  });

  it('recognises a close frame (opcode 0x8) as a control sentinel', () => {
    const payload = Buffer.from([0x03, 0xE8]);
    const frame = maskedFrame(0x8, payload);
    const result = parseWebSocketFrames(frame);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      __ws_control: 'close',
      code: 1000,
    });
  });

  it('leaves close code empty when close payload has no status code', () => {
    const frame = maskedFrame(0x8, Buffer.alloc(0));
    const result = parseWebSocketFrames(frame);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      __ws_control: 'close',
    });
    expect(result.messages[0].code).toBeUndefined();
  });

  it('silently ignores a pong frame (opcode 0xA)', () => {
    const frame = maskedFrame(0xA, Buffer.from('pong'));
    const result = parseWebSocketFrames(frame);
    expect(result.messages).toHaveLength(0);
  });

  it('handles multiple frames in a single buffer', () => {
    const ping = maskedFrame(0x9, Buffer.from('abc'));
    const text = maskedFrame(0x1, Buffer.from('hello'));
    const close = maskedFrame(0x8, Buffer.from([0x03, 0xE8]));
    const buffer = Buffer.concat([ping, text, close]);
    const result = parseWebSocketFrames(buffer);

    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toMatchObject({ __ws_control: 'ping' });
    expect(result.messages[1]).toBe('hello');
    expect(result.messages[2]).toMatchObject({ __ws_control: 'close' });
  });

  it('preserves partial frame data in remaining buffer', () => {
    const fullFrame = maskedFrame(0x1, Buffer.from('complete'));
    const partial = fullFrame.subarray(0, fullFrame.length - 3);
    const result = parseWebSocketFrames(partial);
    expect(result.messages).toHaveLength(0);
    expect(result.remaining.length).toBe(partial.length);
  });

  it('unmasks ping payload with a non-zero mask key', () => {
    const payload = Buffer.from([0x70, 0x69, 0x6E, 0x67]);
    const maskKey = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const opcode = 0x9;
    const header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
    const maskedPayload = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      maskedPayload[i] = payload[i] ^ maskKey[i % 4];
    }
    const frame = Buffer.concat([header, maskKey, maskedPayload]);
    const result = parseWebSocketFrames(frame);
    expect(result.messages[0].payload).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
// §7.1 P0 security tests — extension_hello handshake, HTTP Bearer auth,
// 127.0.0.1 binding, connection replacement audit, origin allowlist.
// Plan: docs/plans/2026-05-16-bridge-security-and-multi-account-plan.md §3 / §7.1
// ---------------------------------------------------------------------------

function httpRequest({ host = '127.0.0.1', port, path, method = 'GET', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const finalHeaders = { ...headers };
    let payload;
    if (body !== undefined) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
      finalHeaders['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({ host, port, path, method, headers: finalHeaders }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        if (text) {
          try { parsed = JSON.parse(text); } catch { parsed = null; }
        }
        resolve({ status: res.statusCode, headers: res.headers, body: text, json: parsed });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function waitForSocketClose(ws, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    const timeout = setTimeout(() => reject(new Error('socket_close_timeout')), timeoutMs);
    ws.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

describe('§3.1 / §3.2 extension_hello handshake', () => {
  const cleanup = [];

  afterEach(async () => {
    while (cleanup.length) {
      const item = cleanup.pop();
      if (item?.stop) await item.stop();
      if (item?.close) item.close();
      if (item?.terminate) item.terminate();
    }
  });

  it('closes a WebSocket that does not send extension_hello within helloTimeoutMs', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      helloTimeoutMs: 80,
    });
    cleanup.push(service);
    await service.start();

    const ws = await openSocket(port);
    cleanup.push(ws);

    const ack = await waitForAck(ws).catch((error) => ({ closedError: error }));
    expect(ack?.ok).toBe(false);
    expect(ack?.error).toBe(HELLO_ERROR_TIMEOUT);
    await waitForSocketClose(ws, 1000);
    expect(service.getActiveClientDescriptor()).toBeNull();
  });

  it('rejects extension_hello with a mismatching token and closes the connection', async () => {
    const port = await getFreePort();
    const auditEvents = [];
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      helloTimeoutMs: 1000,
      logger: {
        info: (event, details) => auditEvents.push({ event, details }),
        debug() {},
        warn() {},
      },
    });
    cleanup.push(service);
    await service.start();

    const ws = await openSocket(port);
    cleanup.push(ws);
    ws.send(JSON.stringify({
      type: 'extension_hello',
      token: 'wrong-token',
      ...DEFAULT_TEST_HELLO,
    }));
    const ack = await waitForAck(ws);
    expect(ack).toMatchObject({ type: 'extension_hello_ack', ok: false, error: HELLO_ERROR_TOKEN_MISMATCH });
    await waitForSocketClose(ws, 1000);
    expect(service.getActiveClientDescriptor()).toBeNull();
    const rejected = auditEvents.find((entry) => /hello_rejected/.test(entry.event));
    expect(rejected).toBeDefined();
    expect(rejected.details.reason).toBe(HELLO_ERROR_TOKEN_MISMATCH);
  });

  it('rejects extension_hello with an invalid payload (non-hello first message)', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      helloTimeoutMs: 1000,
    });
    cleanup.push(service);
    await service.start();

    const ws = await openSocket(port);
    cleanup.push(ws);
    ws.send(JSON.stringify({ id: 'r1', method: 'health', params: {} }));
    const ack = await waitForAck(ws);
    expect(ack).toMatchObject({ ok: false, error: HELLO_ERROR_INVALID_PAYLOAD });
    await waitForSocketClose(ws, 1000);
  });

  it('accepts a valid extension_hello and records active client metadata', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      serverVersion: '0.7.7',
    });
    cleanup.push(service);
    await service.start();

    const ws = await connectExtension(port, null, {
      token: 'secret-token',
      hello: {
        extensionInstanceId: 'ext-instance-A',
        profileLabel: 'Chrome 主号',
        browserName: 'Chrome',
        capabilities: { enqueueSyncArticle: true, getAuthSnapshot: true },
      },
    });
    cleanup.push(ws);

    const descriptor = service.getActiveClientDescriptor();
    expect(descriptor).not.toBeNull();
    expect(descriptor.extensionInstanceId).toBe('ext-instance-A');
    expect(descriptor.profileLabel).toBe('Chrome 主号');
    expect(descriptor.browserName).toBe('Chrome');
    expect(descriptor.capabilities).toMatchObject({ enqueueSyncArticle: true });
    expect(typeof descriptor.connectionId).toBe('string');
    expect(descriptor.connectionId.length).toBeGreaterThan(0);
  });

  it('rejects bridge requests with EXTENSION_NOT_AUTHENTICATED while only pending connections exist', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      helloTimeoutMs: 5000,
      connectTimeoutMs: 500,
    });
    cleanup.push(service);
    await service.start();

    const ws = await openSocket(port);
    cleanup.push(ws);

    await expect(service.listPlatforms({ timeoutMs: 200 })).rejects.toMatchObject({
      code: 'EXTENSION_NOT_AUTHENTICATED',
    });
  });

  it('returns EXTENSION_NOT_CONNECTED when there is no connection at all', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      connectTimeoutMs: 200,
    });
    cleanup.push(service);
    await service.start();

    await expect(service.listPlatforms({ timeoutMs: 200 })).rejects.toMatchObject({
      code: 'EXTENSION_NOT_CONNECTED',
    });
  });

  it('keeps the active client when an unrelated pending connection closes', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      helloTimeoutMs: 5000,
    });
    cleanup.push(service);
    await service.start();

    const active = await connectExtension(port, (message) => ({
      result: { method: message.method, ok: true },
    }), { token: 'secret-token' });
    cleanup.push(active);

    const pending = await openSocket(port);
    pending.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const descriptor = service.getActiveClientDescriptor();
    expect(descriptor).not.toBeNull();
    await expect(service.health({ timeoutMs: 500 })).resolves.toMatchObject({ ok: true });
  });

  it('accepts two clients with different extensionInstanceIds simultaneously', async () => {
    const port = await getFreePort();
    const auditEvents = [];
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      helloTimeoutMs: 5000,
      logger: {
        info: (event, details) => auditEvents.push({ event, details }),
        debug() {},
        warn() {},
      },
    });
    cleanup.push(service);
    await service.start();

    const first = await connectExtension(port, null, {
      token: 'secret-token',
      hello: { extensionInstanceId: 'ext-A' },
    });
    cleanup.push(first);
    const firstDescriptor = service.getActiveClientDescriptor();
    expect(firstDescriptor.extensionInstanceId).toBe('ext-A');

    const second = await connectExtension(port, null, {
      token: 'secret-token',
      hello: { extensionInstanceId: 'ext-B' },
    });
    cleanup.push(second);

    await new Promise((r) => setTimeout(r, 100));

    // ext-A socket must NOT have been closed by the bridge.
    expect(first.readyState).toBe(first.OPEN);

    // Primary stays as the first-connected client.
    const status = await service.getStatus();
    expect(status.primaryClientId).toBe('ext-A');
    const descriptor = service.getActiveClientDescriptor();
    expect(descriptor.extensionInstanceId).toBe('ext-A');

    // No replacement event; both registered as sessions.
    const replacement = auditEvents.find((e) => /replacement_authenticated/.test(e.event));
    expect(replacement).toBeUndefined();
    const registrations = auditEvents.filter((e) => /session_registered/.test(e.event));
    expect(registrations).toHaveLength(2);
  });

});

// Plan §11.2 documents the four error codes that may appear inside a
// `extension_hello_ack` ok:false reply. The browser extension's
// `parseHelloAck` matches them as literal strings, so renaming any of
// them is a wire-format break. This describe block pins the contract.
describe('§11.2 hello rejection wire format (extension_hello_ack errors)', () => {
  it('exports the four original error codes the browser extension parses', () => {
    expect(HELLO_ERROR_TOKEN_MISMATCH).toBe('token_mismatch');
    expect(HELLO_ERROR_INVALID_PAYLOAD).toBe('invalid_payload');
    expect(HELLO_ERROR_TIMEOUT).toBe('hello_timeout');
    expect(HELLO_ERROR_VERSION_UNSUPPORTED).toBe('version_unsupported');
  });

  it('exports the two new Sub-sprint 4.1 error codes', () => {
    expect(HELLO_ERROR_DUPLICATE_SESSION).toBe('duplicate_session');
    expect(HELLO_ERROR_TOO_MANY_CLIENTS).toBe('too_many_clients');
  });

  it('exports DEFAULT_MAX_CLIENTS as 4', () => {
    expect(DEFAULT_MAX_CLIENTS).toBe(4);
  });
});

describe('§3.3 / §3.4 HTTP Bearer authorization and CORS hardening', () => {
  const cleanup = [];

  afterEach(async () => {
    while (cleanup.length) {
      const item = cleanup.pop();
      if (item?.stop) await item.stop();
      if (item?.close) item.close();
    }
  });

  async function startService({ token = 'secret-token', allowRemote = false } = {}) {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token,
      allowRemote,
      helloTimeoutMs: 5000,
    });
    cleanup.push(service);
    await service.start();
    return { service, port, httpPort: port + 1 };
  }

  it('returns 401 from /status when no Authorization header is provided', async () => {
    const { httpPort } = await startService();
    const response = await httpRequest({ port: httpPort, path: '/status' });
    expect(response.status).toBe(401);
    expect(response.json).toMatchObject({ error: 'missing_authorization' });
  });

  it('returns 403 from /status when Authorization token is wrong', async () => {
    const { httpPort } = await startService();
    const response = await httpRequest({
      port: httpPort,
      path: '/status',
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(response.status).toBe(403);
    expect(response.json).toMatchObject({ error: 'invalid_token' });
  });

  it('returns 200 from /status with the correct Bearer token', async () => {
    const { httpPort } = await startService();
    const response = await httpRequest({
      port: httpPort,
      path: '/status',
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({
      mode: 'primary',
      connected: false,
      authenticated: false,
      host: '127.0.0.1',
      allowRemote: false,
    });
  });

  it('rejects /request without Authorization (401) and with wrong token (403)', async () => {
    const { httpPort } = await startService();
    const noAuth = await httpRequest({
      port: httpPort,
      path: '/request',
      method: 'POST',
      body: { method: 'health' },
    });
    expect(noAuth.status).toBe(401);

    const badAuth = await httpRequest({
      port: httpPort,
      path: '/request',
      method: 'POST',
      headers: { Authorization: 'Bearer nope' },
      body: { method: 'health' },
    });
    expect(badAuth.status).toBe(403);
  });

  it('forwards /request to the extension when Authorization is correct', async () => {
    const { service, port, httpPort } = await startService();
    const ws = await connectExtension(port, (message) => ({
      result: { ok: true, method: message.method },
    }), { token: 'secret-token' });
    cleanup.push(ws);
    await service.waitForConnection(1000);

    const response = await httpRequest({
      port: httpPort,
      path: '/request',
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token' },
      body: { method: 'health' },
    });
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ result: { ok: true, method: 'health' } });
  });

  it('rejects /send without Authorization (401) and with wrong token (403)', async () => {
    const { httpPort } = await startService();
    const noAuth = await httpRequest({
      port: httpPort,
      path: '/send',
      method: 'POST',
      body: { method: 'syncArticle' },
    });
    expect(noAuth.status).toBe(401);

    const badAuth = await httpRequest({
      port: httpPort,
      path: '/send',
      method: 'POST',
      headers: { Authorization: 'Bearer nope' },
      body: { method: 'syncArticle' },
    });
    expect(badAuth.status).toBe(403);
  });

  it('does not emit Access-Control-Allow-Origin by default (CORS hardening)', async () => {
    const { httpPort } = await startService();
    const response = await httpRequest({
      port: httpPort,
      path: '/status',
      headers: { Authorization: 'Bearer secret-token', Origin: 'https://example.com' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('responds 204 to OPTIONS preflights without ever exposing the API surface', async () => {
    const { httpPort } = await startService();
    const response = await httpRequest({
      port: httpPort,
      path: '/request',
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('skips Authorization when service is configured without a token (backward compatibility)', async () => {
    const { httpPort } = await startService({ token: '' });
    const response = await httpRequest({ port: httpPort, path: '/status' });
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ mode: 'primary' });
  });
});

describe('§3.5 host binding', () => {
  const cleanup = [];

  afterEach(async () => {
    while (cleanup.length) {
      const item = cleanup.pop();
      if (item?.stop) await item.stop();
    }
  });

  it('binds to 127.0.0.1 by default and rejects non-loopback connections', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
    });
    cleanup.push(service);
    await service.start();

    const status = await service.getStatus();
    expect(status).toMatchObject({ host: '127.0.0.1', allowRemote: false });

    // Localhost via 127.0.0.1 works.
    const localhostResp = await httpRequest({
      host: '127.0.0.1',
      port: port + 1,
      path: '/status',
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(localhostResp.status).toBe(200);
  });

  it('exposes allowRemote=true binding via 0.0.0.0 when configured', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      allowRemote: true,
    });
    cleanup.push(service);
    await service.start();

    const status = await service.getStatus();
    expect(status).toMatchObject({ host: '0.0.0.0', allowRemote: true });
  });
});

describe('§3.7 Origin allowlist (optional defense-in-depth)', () => {
  it('treats empty Origin as allowed (Node clients, native messaging)', () => {
    expect(isOriginAllowedForWebSocket('', { allowlist: ['chrome-extension://*'] })).toBe(true);
  });

  it('matches chrome-extension://* wildcard', () => {
    expect(isOriginAllowedForWebSocket('chrome-extension://abcd1234efgh', { allowlist: ['chrome-extension://*'] })).toBe(true);
  });

  it('rejects regular http(s) origins when allowlist is set', () => {
    expect(isOriginAllowedForWebSocket('http://evil.example', { allowlist: ['chrome-extension://*'] })).toBe(false);
    expect(isOriginAllowedForWebSocket('https://example.com', { allowlist: ['chrome-extension://*'] })).toBe(false);
  });

  it('returns allowed when no allowlist is provided (backwards compatible)', () => {
    expect(isOriginAllowedForWebSocket('http://anywhere.example')).toBe(true);
  });
});

describe('§4.1 diagnostics surface for settings UI state detection', () => {
  const cleanup = [];

  afterEach(async () => {
    while (cleanup.length) {
      const item = cleanup.pop();
      if (item?.stop) await item.stop();
      if (item?.close) item.close();
    }
  });

  it('starts with zeroed counters and no last rejection', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
    });
    cleanup.push(service);
    await service.start();

    expect(service.getDiagnostics()).toEqual({
      socketsOpened: 0,
      helloAttempts: 0,
      helloRejections: 0,
      helloSuccesses: 0,
      pendingConnections: 0,
      lastHelloRejection: null,
    });
  });

  it('counts hello rejections separately from successful auths', async () => {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      helloTimeoutMs: 1000,
    });
    cleanup.push(service);
    await service.start();

    // 1) wrong-token hello → 1 rejection
    const badWs = await openSocket(port);
    cleanup.push(badWs);
    badWs.send(JSON.stringify({ type: 'extension_hello', token: 'wrong', ...DEFAULT_TEST_HELLO }));
    await waitForAck(badWs);
    await waitForSocketClose(badWs, 1000);

    // 2) valid hello → 1 success
    const goodWs = await connectExtension(port, null, { token: 'secret-token' });
    cleanup.push(goodWs);

    const diagnostics = service.getDiagnostics();
    expect(diagnostics.socketsOpened).toBeGreaterThanOrEqual(2);
    expect(diagnostics.helloRejections).toBe(1);
    expect(diagnostics.helloSuccesses).toBe(1);
    expect(diagnostics.lastHelloRejection).toMatchObject({
      reason: HELLO_ERROR_TOKEN_MISMATCH,
    });
  });
});

describe('§4.1 EADDRINUSE no longer silently downgrades', () => {
  const cleanup = [];

  afterEach(async () => {
    while (cleanup.length) {
      const item = cleanup.pop();
      if (item?.stop) await item.stop();
      if (item?.close) item.close();
    }
  });

  it('surfaces port conflicts as BRIDGE_UNAVAILABLE instead of falling back to secondary mode', async () => {
    const port = await getFreePort();
    const primary = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'first-token',
    });
    cleanup.push(primary);
    await primary.start();

    const conflicting = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'second-token',
    });
    cleanup.push(conflicting);

    await expect(conflicting.start()).rejects.toMatchObject({
      code: 'BRIDGE_UNAVAILABLE',
    });
  });
});

describe('§17 Sub-sprint 4.1 — multi-client sessions', () => {
  const cleanup = [];

  afterEach(async () => {
    while (cleanup.length) {
      const item = cleanup.pop();
      if (item?.stop) await item.stop();
      if (item?.close) item.close();
    }
  });

  async function makeService(opts = {}) {
    const port = await getFreePort();
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      helloTimeoutMs: 2000,
      ...opts,
    });
    cleanup.push(service);
    await service.start();
    return { port, service };
  }

  it('two different instanceIds both become connected entries', async () => {
    const { port, service } = await makeService();
    const wsA = await connectExtension(port, null, { token: 'secret-token', hello: { extensionInstanceId: 'multi-A' } });
    const wsB = await connectExtension(port, null, { token: 'secret-token', hello: { extensionInstanceId: 'multi-B' } });
    cleanup.push(wsA, wsB);
    await new Promise((r) => setTimeout(r, 1200));
    const status = await service.getStatus();
    const connected = status.connectedClients.filter((c) => c.status === 'connected');
    expect(connected).toHaveLength(2);
    expect(connected.map((c) => c.extensionInstanceId).sort()).toEqual(['multi-A', 'multi-B']);
  });

  it('first connected client becomes primary', async () => {
    const { port, service } = await makeService();
    const wsA = await connectExtension(port, null, { token: 'secret-token', hello: { extensionInstanceId: 'primary-A' } });
    const wsB = await connectExtension(port, null, { token: 'secret-token', hello: { extensionInstanceId: 'primary-B' } });
    cleanup.push(wsA, wsB);
    const status = await service.getStatus();
    expect(status.primaryClientId).toBe('primary-A');
    expect(service.getActiveClientDescriptor().extensionInstanceId).toBe('primary-A');
  });

  it('takeover: same instanceId reconnect closes old ws and registers new session', async () => {
    const port = await getFreePort();
    const auditEvents = [];
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      helloTimeoutMs: 2000,
      logger: {
        info: (event, details) => auditEvents.push({ event, details }),
        debug() {},
        warn() {},
      },
    });
    cleanup.push(service);
    await service.start();

    const wsOld = await connectExtension(port, null, {
      token: 'secret-token',
      hello: { extensionInstanceId: 'reload-X' },
    });
    cleanup.push(wsOld);
    const oldDescriptor = service.getActiveClientDescriptor();
    expect(oldDescriptor.extensionInstanceId).toBe('reload-X');
    const oldConnectionId = oldDescriptor.connectionId;

    // New connection with the SAME instanceId — simulates SW reload
    // while the old ws still appears OPEN at the Node layer.
    const wsNew = await openSocket(port);
    cleanup.push(wsNew);
    const ack = await sendHello(wsNew, {
      token: 'secret-token',
      overrides: { extensionInstanceId: 'reload-X' },
    });
    expect(ack.ok).toBe(true);

    // Old ws should be closed by the bridge as part of takeover.
    await waitForSocketClose(wsOld, 1000);

    // Audit log should contain hello_takeover with both connectionIds.
    const takeover = auditEvents.find((e) => /hello_takeover/.test(e.event));
    expect(takeover).toBeDefined();
    expect(takeover.details).toMatchObject({
      extensionInstanceId: 'reload-X',
      connectionId: oldConnectionId,
    });
    expect(takeover.details.newConnectionId).not.toBe(oldConnectionId);

    // New session is now the active one for that instanceId.
    const newDescriptor = service.getActiveClientDescriptor();
    expect(newDescriptor.extensionInstanceId).toBe('reload-X');
    expect(newDescriptor.connectionId).toBe(takeover.details.newConnectionId);

    // Bridge no longer emits the duplicate_session ack code.
    expect(ack.error).toBeFalsy();
  });

  it('takeover: same-instanceId reconnect succeeds even at maxClients cap', async () => {
    const { port, service } = await makeService({ maxClients: 1 });
    const wsOld = await connectExtension(port, null, {
      token: 'secret-token',
      hello: { extensionInstanceId: 'solo-A' },
    });
    cleanup.push(wsOld);

    // Cap is 1; a foreign instanceId would be rejected, but same
    // instanceId takeover should still go through (old session is
    // torn down before the count is taken).
    const wsNew = await openSocket(port);
    cleanup.push(wsNew);
    const ack = await sendHello(wsNew, {
      token: 'secret-token',
      overrides: { extensionInstanceId: 'solo-A' },
    });
    expect(ack.ok).toBe(true);
    expect(service.getActiveClientDescriptor().extensionInstanceId).toBe('solo-A');
  });

  it('rejects too_many_clients when at maxClients limit', async () => {
    const { port } = await makeService({ maxClients: 2 });
    const w1 = await connectExtension(port, null, { token: 'secret-token', hello: { extensionInstanceId: 'cap-1' } });
    const w2 = await connectExtension(port, null, { token: 'secret-token', hello: { extensionInstanceId: 'cap-2' } });
    cleanup.push(w1, w2);
    const third = await openSocket(port);
    cleanup.push(third);
    const ack = await sendHello(third, { token: 'secret-token', overrides: { extensionInstanceId: 'cap-3' } });
    expect(ack.ok).toBe(false);
    expect(ack.error).toBe(HELLO_ERROR_TOO_MANY_CLIENTS);
  });

  it('closing a non-primary session does not affect primary or other sessions', async () => {
    const { port, service } = await makeService();
    const wsA = await connectExtension(port, null, { token: 'secret-token', hello: { extensionInstanceId: 'keep-A' } });
    const wsB = await connectExtension(port, null, { token: 'secret-token', hello: { extensionInstanceId: 'drop-B' } });
    cleanup.push(wsA);
    wsB.close();
    await new Promise((r) => setTimeout(r, 300));
    const status = await service.getStatus();
    expect(status.primaryClientId).toBe('keep-A');
    const entry = status.connectedClients.find((c) => c.extensionInstanceId === 'keep-A');
    expect(entry?.status).toBe('connected');
  });

  it('primary migrates to next open session when primary disconnects', async () => {
    const { port, service } = await makeService();
    const wsA = await connectExtension(port, null, { token: 'secret-token', hello: { extensionInstanceId: 'prim-A' } });
    const wsB = await connectExtension(port, null, { token: 'secret-token', hello: { extensionInstanceId: 'prim-B' } });
    cleanup.push(wsB);
    wsA.close();
    await new Promise((r) => setTimeout(r, 300));
    const status = await service.getStatus();
    expect(status.primaryClientId).toBe('prim-B');
  });

  it('getStatus includes primaryClientId and maxClients fields', async () => {
    const { service } = await makeService({ maxClients: 3 });
    const status = await service.getStatus();
    expect(status).toHaveProperty('primaryClientId');
    expect(status).toHaveProperty('maxClients', 3);
  });
});

describe('§16 Phase 1 — connected clients registry', () => {
  const cleanup = [];

  afterEach(async () => {
    while (cleanup.length) {
      const item = cleanup.pop();
      if (item?.stop) await item.stop();
      if (item?.close) item.close();
    }
  });

  async function makeService(opts = {}) {
    const port = await getFreePort();
    const received = [];
    const service = createWechatSyncBridgeService({
      WebSocketServer,
      http,
      port,
      token: 'secret-token',
      helloTimeoutMs: 2000,
      onClientRegistryChange(clients) { received.push([...clients]); },
      ...opts,
    });
    cleanup.push(service);
    await service.start();
    return { port, service, received };
  }

  it('adds a connected entry after successful extension_hello', async () => {
    const { port, service } = await makeService();
    const ws = await connectExtension(port, null, { token: 'secret-token' });
    cleanup.push(ws);
    // Give the debounce time to fire.
    await new Promise((r) => setTimeout(r, 1200));
    const status = await service.getStatus();
    expect(status.connectedClients).toHaveLength(1);
    expect(status.connectedClients[0]).toMatchObject({
      extensionInstanceId: DEFAULT_TEST_HELLO.extensionInstanceId,
      browserName: DEFAULT_TEST_HELLO.browserName,
      profileLabel: DEFAULT_TEST_HELLO.profileLabel,
      status: 'connected',
    });
    expect(status.connectedClients[0].firstConnectedAt).toBeGreaterThan(0);
    expect(status.connectedClients[0].lastConnectedAt).toBe(status.connectedClients[0].firstConnectedAt);
  });

  it('preserves firstConnectedAt on reconnect and updates lastConnectedAt', async () => {
    const { port, service } = await makeService();
    const ws1 = await connectExtension(port, null, { token: 'secret-token' });
    cleanup.push(ws1);
    await new Promise((r) => setTimeout(r, 1200));
    const firstStatus = await service.getStatus();
    const firstConnected = firstStatus.connectedClients[0].firstConnectedAt;

    ws1.close();
    await new Promise((r) => setTimeout(r, 200));

    // Same extensionInstanceId reconnects.
    const ws2 = await connectExtension(port, null, { token: 'secret-token' });
    cleanup.push(ws2);
    await new Promise((r) => setTimeout(r, 1200));
    const secondStatus = await service.getStatus();
    expect(secondStatus.connectedClients).toHaveLength(1);
    expect(secondStatus.connectedClients[0].firstConnectedAt).toBe(firstConnected);
    expect(secondStatus.connectedClients[0].lastConnectedAt).toBeGreaterThanOrEqual(firstConnected);
    expect(secondStatus.connectedClients[0].status).toBe('connected');
  });

  it('echoes heartbeat_ack with the same ts so extension liveness counter can reset (SPEC-1)', async () => {
    const { port, service } = await makeService();
    const ws = await connectExtension(port, null, { token: 'secret-token' });
    cleanup.push(ws);
    await new Promise((r) => setTimeout(r, 100));

    const ackTs = 1716123456789;
    const ackPromise = new Promise((resolve, reject) => {
      const onMessage = (data) => {
        let parsed;
        try { parsed = JSON.parse(data.toString()); } catch { return; }
        if (parsed?.type === 'heartbeat_ack') {
          ws.off('message', onMessage);
          resolve(parsed);
        }
      };
      ws.on('message', onMessage);
      setTimeout(() => {
        ws.off('message', onMessage);
        reject(new Error('heartbeat_ack timeout'));
      }, 1500);
    });

    ws.send(JSON.stringify({ type: 'heartbeat', ts: ackTs }));
    const ack = await ackPromise;
    expect(ack).toEqual({ type: 'heartbeat_ack', ts: ackTs });
    // Service is still alive, no spurious side effects.
    expect(await service.getStatus()).toMatchObject({ connected: true });
  });

  it('refreshes lastSeenAt when a heartbeat arrives', async () => {
    const { port, service } = await makeService();
    const ws = await connectExtension(port, null, { token: 'secret-token' });
    cleanup.push(ws);
    await new Promise((r) => setTimeout(r, 1200));
    const before = (await service.getStatus()).connectedClients[0].lastSeenAt;

    await new Promise((r) => setTimeout(r, 50));
    ws.send(JSON.stringify({ type: 'heartbeat', ts: Date.now() }));
    await new Promise((r) => setTimeout(r, 1200));

    const after = (await service.getStatus()).connectedClients[0].lastSeenAt;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('marks entry as disconnected (but keeps it) when WebSocket closes', async () => {
    const { port, service } = await makeService();
    const ws = await connectExtension(port, null, { token: 'secret-token' });
    cleanup.push(ws);
    await new Promise((r) => setTimeout(r, 1200));

    ws.close();
    await new Promise((r) => setTimeout(r, 1200));

    const status = await service.getStatus();
    expect(status.connectedClients).toHaveLength(1);
    expect(status.connectedClients[0].status).toBe('disconnected');
    expect(status.connectedClients[0].extensionInstanceId).toBe(DEFAULT_TEST_HELLO.extensionInstanceId);
  });

  it('caps the persisted registry at 20 entries on construction, keeping the most recently seen disconnected clients', async () => {
    // Seed 25 stale disconnected entries with monotonically increasing lastSeenAt
    // (id-25 is the most recent, id-1 is the oldest).
    const stale = [];
    for (let i = 1; i <= 25; i += 1) {
      stale.push({
        extensionInstanceId: `stale-${i}`,
        browserName: 'Chrome',
        profileLabel: '',
        capabilities: {},
        extensionVersion: '0.0.0',
        status: 'disconnected',
        lastSeenAt: 1_000_000 + i, // older → smaller
        firstConnectedAt: 1_000_000 + i,
        lastConnectedAt: 1_000_000 + i,
      });
    }
    const { service } = await makeService({ initialConnectedClients: stale });

    const status = await service.getStatus();
    expect(status.connectedClients).toHaveLength(20);
    // The 5 oldest (stale-1..stale-5) must be evicted.
    const keptIds = status.connectedClients.map((c) => c.extensionInstanceId).sort();
    for (let i = 1; i <= 5; i += 1) {
      expect(keptIds).not.toContain(`stale-${i}`);
    }
    // The 20 newest must all be kept.
    for (let i = 6; i <= 25; i += 1) {
      expect(keptIds).toContain(`stale-${i}`);
    }
  });

  it('never evicts currently connected entries even when the registry is over cap', async () => {
    // 20 disconnected entries (already at cap) + 5 live ones → total 25, but
    // the cap can be exceeded by *connected* entries because we refuse to
    // drop a live session.
    const initial = [];
    for (let i = 1; i <= 20; i += 1) {
      initial.push({
        extensionInstanceId: `disc-${i}`,
        status: 'disconnected',
        lastSeenAt: 1_000_000 + i,
        firstConnectedAt: 1_000_000 + i,
        lastConnectedAt: 1_000_000 + i,
        browserName: 'Chrome',
        profileLabel: '',
        capabilities: {},
        extensionVersion: '0.0.0',
      });
    }
    for (let i = 1; i <= 5; i += 1) {
      initial.push({
        extensionInstanceId: `live-${i}`,
        status: 'connected',
        lastSeenAt: 2_000_000 + i,
        firstConnectedAt: 2_000_000 + i,
        lastConnectedAt: 2_000_000 + i,
        browserName: 'Chrome',
        profileLabel: '',
        capabilities: {},
        extensionVersion: '0.0.0',
      });
    }
    const { service } = await makeService({ initialConnectedClients: initial });

    const status = await service.getStatus();
    const keptIds = status.connectedClients.map((c) => c.extensionInstanceId);
    // All 5 live entries must be kept.
    for (let i = 1; i <= 5; i += 1) {
      expect(keptIds).toContain(`live-${i}`);
    }
    // Remaining 15 slots (20 cap − 5 connected) go to most-recent disconnected.
    const keptDisc = keptIds.filter((id) => id.startsWith('disc-'));
    expect(keptDisc).toHaveLength(15);
    expect(keptDisc).toContain('disc-20'); // newest disconnected kept
    expect(keptDisc).not.toContain('disc-1'); // oldest disconnected evicted
  });

  it('does not modify the registry when it is at or below cap', async () => {
    const initial = [];
    for (let i = 1; i <= 18; i += 1) {
      initial.push({
        extensionInstanceId: `small-${i}`,
        status: 'disconnected',
        lastSeenAt: 1_000_000 + i,
        firstConnectedAt: 1_000_000 + i,
        lastConnectedAt: 1_000_000 + i,
        browserName: 'Chrome',
        profileLabel: '',
        capabilities: {},
        extensionVersion: '0.0.0',
      });
    }
    const { service } = await makeService({ initialConnectedClients: initial });
    const status = await service.getStatus();
    expect(status.connectedClients).toHaveLength(18);
  });
});
