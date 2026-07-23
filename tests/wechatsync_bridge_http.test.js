/*
## 核心功能

覆盖 Wechatsync bridge HTTP Bearer 鉴权、CORS 收敛、host 绑定、Origin allowlist、诊断面和端口冲突。

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
  HELLO_ERROR_PAIRING_REQUIRED,
  createWechatSyncBridgeService,
  isOriginAllowedForWebSocket,
} from '../services/wechatsync-bridge.js';

const TEST_PORT_START = 45600;
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

  it('fails closed when service is configured without a token', async () => {
    const { httpPort } = await startService({ token: '' });
    const response = await httpRequest({ port: httpPort, path: '/status' });
    expect(response.status).toBe(503);
    expect(response.json).toMatchObject({ error: 'bridge_token_not_configured' });
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
      reason: HELLO_ERROR_PAIRING_REQUIRED,
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
