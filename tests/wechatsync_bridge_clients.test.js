/*
## 核心功能

覆盖 Wechatsync bridge 多客户端会话、主客户端迁移、同实例接管和 connected clients registry。

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
  HELLO_ERROR_TOO_MANY_CLIENTS,
  createWechatSyncBridgeService,
} from '../services/wechatsync-bridge.js';

const TEST_PORT_START = 45800;
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
