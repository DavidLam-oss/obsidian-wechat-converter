/*
## 核心功能

覆盖 Wechatsync bridge 基础服务、平台查询、认证检查和文章同步主流程。

## 输入

接收 wechatsync bridge 被测模块、Node HTTP/WebSocket 运行时和测试断言数据。

## 输出

输出 Vitest 自动化断言结果，保护 Wechatsync bridge 服务契约不回归。

## 定位

位于 tests/，是 Wechatsync bridge 回归测试拆分文件。

## 依赖

关键依赖：Vitest、ws、Node http/net，以及 services/wechatsync-bridge.js。

## 维护规则

- 修改 bridge 行为后同步更新相关拆分测试，并检查 tests 文件夹 README 是否仍准确。
- 保持职责边界清晰，跨文件共享逻辑优先维持轻量、可读的测试 helper。
*/

import { describe, it, expect, afterEach, vi } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import {
  createWebSocketAcceptKey,
  createWechatSyncBridgeService,
  credentialsMatch,
  defaultConnectionIdFactory,
  hashBridgeCredential,
  setBridgeTimeout,
  clearBridgeTimeout,
} from '../services/wechatsync-bridge.js';

const TEST_PORT_START = 45000;
let nextPortCandidate = TEST_PORT_START;

function listenOnPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(null));
    server.listen({ port, host: '127.0.0.1' }, () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function canUseBridgePortPair(port) {
  const wsServer = await listenOnPort(port);
  if (!wsServer) return false;
  const httpServer = await listenOnPort(port + 1);
  await closeServer(wsServer);
  if (!httpServer) return false;
  await closeServer(httpServer);
  return true;
}

async function getFreePort() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const port = nextPortCandidate;
    nextPortCandidate += 2;
    if (await canUseBridgePortPair(port)) return port;
  }
  throw new Error('Unable to find available bridge test port pair');
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

  it('hashes bridge credentials without Node crypto while preserving SHA-256 compatibility', () => {
    expect(hashBridgeCredential('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('compares fixed-length credential hashes without Node crypto', () => {
    const credentialHash = hashBridgeCredential('secret-token');
    expect(credentialsMatch(credentialHash, credentialHash)).toBe(true);
    expect(credentialsMatch(credentialHash, hashBridgeCredential('other-token'))).toBe(false);
    expect(credentialsMatch(credentialHash, 'invalid')).toBe(false);
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
      token: 'secret-token',
      requestTimeoutMs: 1000,
      connectTimeoutMs: 1000,
    });
    cleanup.push(service);
    await service.start();

    const extension = await connectExtension(port, () => ({
      error: { code: 403, message: 'Invalid or missing token' },
    }));
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

});
