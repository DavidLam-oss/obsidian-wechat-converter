/*
## 核心功能

覆盖 Wechatsync bridge 队列入站、任务查询、兼容降级、错误分类和短暂故障重试。

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

import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import {
  createReadableBridgeError,
  createWechatSyncBridgeService,
  isRecoverableBridgeConnectionError,
  isUnsupportedBridgeMethodError,
  retryRecoverableBridgeOperation,
} from '../services/wechatsync-bridge.js';

const TEST_PORT_START = 45200;
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

describe('Wechatsync bridge queue operations and recovery', () => {
  const cleanup = [];

  afterEach(async () => {
    while (cleanup.length) {
      const item = cleanup.pop();
      if (item?.stop) await item.stop();
      if (item?.close) item.close();
    }
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
