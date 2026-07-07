/*
## 核心功能

覆盖 Wechatsync bridge WebSocket frame 解析、extension_hello 握手和 hello ack wire format。

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
  HELLO_ERROR_INVALID_PAYLOAD,
  HELLO_ERROR_TIMEOUT,
  HELLO_ERROR_TOKEN_MISMATCH,
  HELLO_ERROR_VERSION_UNSUPPORTED,
  HELLO_ERROR_DUPLICATE_SESSION,
  HELLO_ERROR_TOO_MANY_CLIENTS,
  DEFAULT_MAX_CLIENTS,
  createWechatSyncBridgeService,
  parseWebSocketFrames,
} from '../services/wechatsync-bridge.js';

const TEST_PORT_START = 45400;
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
