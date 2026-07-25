/*
## 核心功能

覆盖 wechatsync settings normalize 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 wechatsync settings normalize 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Pure-function tests for wechatsync settings normalize, focused on the
// security-relevant defaults introduced in Sprint 1 (§4.1) and refined
// after Sprint 3 (the legacy unauthenticated compat field is gone now
// that hello handshake is the only auth path).
//
// These guard against accidental regressions like:
//   - default switching from allowRemote: false (loopback) to true (0.0.0.0)
//   - allowRemote leaking truthy when an old data.json has unrelated
//     fields named "allow*"
//   - token / port / connection.status getting silently reset to defaults
//     when a partial object is normalized
//   - obsolete pre-Sprint-3 compat fields sneaking back into the schema

import { describe, it, expect } from 'vitest';

const {
  createDefaultMultiPlatformSyncSettings,
  normalizeConnectedClient,
  normalizeConnectedClients,
  hasWechatSyncProLicense,
  resolveWechatSyncProLicense,
  normalizeMultiPlatformSyncSettings,
  normalizeWechatSyncCapabilities,
  applyClientRegistryToMultiPlatformSettings,
} = require('../services/wechatsync-settings');
const { PRO_LICENSE_STALENESS_MS } = require('../services/wechatsync-constants');

describe('Sprint 1 §4.1 normalizeMultiPlatformSyncSettings — security defaults', () => {
  // Sprint 3 schema lock: the post-Sprint-3 normalize output may add new
  // fields, but it must keep `allowRemote` as the only legacy-style
  // boolean security flag. If a future change accidentally re-introduces
  // a fallback compat flag ("allow*"), the assertion below will catch it
  // without needing to spell that flag out by name in source.
  const EXPECTED_BOOLEAN_SECURITY_KEYS = ['allowRemote'];

  function listLegacyStyleSecurityKeys(value) {
    return Object.keys(value || {}).filter((key) =>
      key.startsWith('allow') && typeof value[key] === 'boolean');
  }

  it('createDefaultMultiPlatformSyncSettings returns the expected hardened defaults', () => {
    const defaults = createDefaultMultiPlatformSyncSettings();
    expect(defaults.allowRemote).toBe(false);
    expect(defaults.enabled).toBe(false);
    expect(defaults.token).toBe('');
    expect(defaults.connection.status).toBe('untested');
    expect(listLegacyStyleSecurityKeys(defaults)).toEqual(EXPECTED_BOOLEAN_SECURITY_KEYS);
  });

  it('normalize on a missing object returns hardened defaults', () => {
    const normalized = normalizeMultiPlatformSyncSettings();
    expect(normalized.allowRemote).toBe(false);
    expect(listLegacyStyleSecurityKeys(normalized)).toEqual(EXPECTED_BOOLEAN_SECURITY_KEYS);
  });

  it('normalize on an empty object returns hardened defaults', () => {
    const normalized = normalizeMultiPlatformSyncSettings({});
    expect(normalized.allowRemote).toBe(false);
    expect(listLegacyStyleSecurityKeys(normalized)).toEqual(EXPECTED_BOOLEAN_SECURITY_KEYS);
  });

  it('normalize coerces non-boolean truthy values to false (strict === true)', () => {
    // Defense against a stale data.json where a previous version stored
    // allowRemote as 1 / 'true' / 'yes' / non-empty strings — strict opt-in.
    const cases = [
      { allowRemote: 1 },
      { allowRemote: 'true' },
      { allowRemote: 'yes' },
      { allowRemote: {} },
      { allowRemote: [] },
    ];
    for (const input of cases) {
      const normalized = normalizeMultiPlatformSyncSettings(input);
      expect(normalized.allowRemote).toBe(false);
    }
  });

  it('normalize accepts only the literal boolean true to opt into remote bind', () => {
    const normalized = normalizeMultiPlatformSyncSettings({
      allowRemote: true,
    });
    expect(normalized.allowRemote).toBe(true);
  });

  it('normalize coerces explicit false correctly', () => {
    const normalized = normalizeMultiPlatformSyncSettings({
      allowRemote: false,
    });
    expect(normalized.allowRemote).toBe(false);
  });

  it('normalize drops obsolete pre-Sprint-3 compat boolean fields even if data.json still contains them', () => {
    // Sprint 3 removal: if a user upgrades from a build whose data.json
    // still carries an obsolete unauthenticated-mode compat toggle, the
    // normalize step must silently strip it instead of preserving a
    // setting the runtime no longer honours.
    const obsoleteCompatFlag = ['allow', 'Legacy', 'Unauthenticated'].join('');
    const normalized = normalizeMultiPlatformSyncSettings({
      enabled: true,
      port: 9527,
      token: 'abc-123',
      [obsoleteCompatFlag]: true,
    });
    expect(listLegacyStyleSecurityKeys(normalized)).toEqual(EXPECTED_BOOLEAN_SECURITY_KEYS);
    expect(Object.prototype.hasOwnProperty.call(normalized, obsoleteCompatFlag)).toBe(false);
  });

  it('normalize preserves token, port and selected platforms while still hardening the security flags', () => {
    const normalized = normalizeMultiPlatformSyncSettings({
      enabled: true,
      port: 9527,
      token: 'abc-123',
      selectedPlatforms: ['zhihu'],
      // legacy data.json without the security flags
    });
    expect(normalized.enabled).toBe(true);
    expect(normalized.port).toBe(9527);
    expect(normalized.token).toBe('abc-123');
    expect(normalized.selectedPlatforms).toContain('zhihu');
    // Critical: a legacy settings file that predates Sprint 1 must NOT
    // accidentally enable remote bind.
    expect(normalized.allowRemote).toBe(false);
  });

  it('normalize is idempotent — running it twice yields an equivalent result', () => {
    const once = normalizeMultiPlatformSyncSettings({
      enabled: true,
      port: 12345,
      token: '  trim-me  ',
      allowRemote: true,
    });
    const twice = normalizeMultiPlatformSyncSettings(once);
    expect(twice).toEqual(once);
    expect(twice.token).toBe('trim-me');
  });
});

describe('§16 Phase 1 normalizeConnectedClient / normalizeConnectedClients', () => {
  const VALID_CLIENT = {
    extensionInstanceId: 'abc-123',
    browserName: 'chrome',
    profileLabel: '主号',
    capabilities: { enqueueSyncArticle: true },
    extensionVersion: '1.1.4',
    status: 'connected',
    lastSeenAt: 1000000,
    firstConnectedAt: 900000,
    lastConnectedAt: 1000000,
  };

  it('createDefaultMultiPlatformSyncSettings includes connectedClients: []', () => {
    const defaults = createDefaultMultiPlatformSyncSettings();
    expect(defaults).toHaveProperty('connectedClients');
    expect(defaults.connectedClients).toEqual([]);
    expect(defaults.pairedClients).toEqual([]);
    expect(defaults.pendingClients).toEqual([]);
  });

  it('normalizes paired and pending client registries without persisting raw credentials', () => {
    const credentialHash = 'a'.repeat(64);
    const normalized = normalizeMultiPlatformSyncSettings({
      pairedClients: [{ extensionInstanceId: 'paired-A', credentialHash }],
      pendingClients: [{ extensionInstanceId: 'pending-B', credentialHash, reason: 'pairing_required' }],
    });
    expect(normalized.pairedClients).toMatchObject([{ extensionInstanceId: 'paired-A', credentialHash }]);
    expect(normalized.pendingClients).toMatchObject([{ extensionInstanceId: 'pending-B', credentialHash }]);
    expect(JSON.stringify(normalized)).not.toContain('raw-token');
  });

  it('normalizeMultiPlatformSyncSettings propagates connectedClients', () => {
    const normalized = normalizeMultiPlatformSyncSettings({
      connectedClients: [VALID_CLIENT],
    });
    expect(normalized.connectedClients).toHaveLength(1);
    expect(normalized.connectedClients[0]).toMatchObject({
      extensionInstanceId: 'abc-123',
      browserName: 'chrome',
      status: 'connected',
    });
  });

  it('normalizeConnectedClient passes through all 9 valid fields', () => {
    const result = normalizeConnectedClient(VALID_CLIENT);
    expect(result).toMatchObject({
      extensionInstanceId: 'abc-123',
      browserName: 'chrome',
      profileLabel: '主号',
      extensionVersion: '1.1.4',
      status: 'connected',
      lastSeenAt: 1000000,
      firstConnectedAt: 900000,
      lastConnectedAt: 1000000,
    });
    expect(result.capabilities).toEqual({ enqueueSyncArticle: true });
  });

  it('normalizeConnectedClient returns null for entries missing extensionInstanceId', () => {
    expect(normalizeConnectedClient({})).toBeNull();
    expect(normalizeConnectedClient({ extensionInstanceId: '' })).toBeNull();
    expect(normalizeConnectedClient(null)).toBeNull();
    expect(normalizeConnectedClient('string')).toBeNull();
  });

  it('normalizeConnectedClients filters out invalid entries', () => {
    const result = normalizeConnectedClients([
      VALID_CLIENT,
      { extensionInstanceId: '' },
      null,
      'bad',
      { extensionInstanceId: 'good-2', browserName: 'firefox', status: 'disconnected' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].extensionInstanceId).toBe('abc-123');
    expect(result[1].extensionInstanceId).toBe('good-2');
    expect(result[1].status).toBe('disconnected');
  });

  it('normalizeConnectedClients returns [] for non-array input', () => {
    expect(normalizeConnectedClients(undefined)).toEqual([]);
    expect(normalizeConnectedClients(null)).toEqual([]);
    expect(normalizeConnectedClients('bad')).toEqual([]);
  });

  it('normalizeMultiPlatformSyncSettings recognises proLicensed capability so the publish modal can hide upgrade affordances', () => {
    const normalized = normalizeMultiPlatformSyncSettings({
      connection: { capabilities: { proLicensed: true } },
    });
    expect(normalized.connection.capabilities.proLicensed).toBe(true);
  });

  it('hasWechatSyncProLicense recognises active Pro from connected clients and cached (offline) Pro within the staleness window', () => {
    expect(hasWechatSyncProLicense({
      connection: { capabilities: { proLicensed: true } },
    })).toBe(false);

    expect(hasWechatSyncProLicense({
      connectedClients: [{
        extensionInstanceId: 'client-1',
        status: 'connected',
        capabilities: { proLicensed: true },
        license: { state: 'pro', observedAt: Date.now() },
      }],
    })).toBe(true);

    // Offline cache: a disconnected Pro client whose snapshot is still within
    // the staleness window keeps the user on Pro (the browser extension does
    // not need to be running to preserve a paid identity).
    expect(hasWechatSyncProLicense({
      connectedClients: [{
        extensionInstanceId: 'client-2',
        status: 'disconnected',
        capabilities: { proLicensed: true },
        license: { state: 'pro', observedAt: Date.now() },
      }],
    })).toBe(true);
  });

  it('resolveWechatSyncProLicense distinguishes live / cached / none, and expires stale caches', () => {
    const now = Date.now();

    // Live: a connected Pro client.
    expect(resolveWechatSyncProLicense({
      connectedClients: [{
        extensionInstanceId: 'live',
        status: 'connected',
        license: { state: 'pro', observedAt: now },
      }],
    }, now)).toEqual(expect.objectContaining({ pro: true, source: 'live' }));

    // Cached: disconnected but within window.
    const cachedObservedAt = now - (PRO_LICENSE_STALENESS_MS - 1000);
    const cached = resolveWechatSyncProLicense({
      connectedClients: [{
        extensionInstanceId: 'cached',
        status: 'disconnected',
        license: { state: 'pro', observedAt: cachedObservedAt },
      }],
    }, now);
    expect(cached.pro).toBe(true);
    expect(cached.source).toBe('cached');
    expect(cached.observedAt).toBe(cachedObservedAt);
    expect(cached.staleAfter).toBe(cachedObservedAt + PRO_LICENSE_STALENESS_MS);

    // Expired: disconnected and past the window → none.
    expect(resolveWechatSyncProLicense({
      connectedClients: [{
        extensionInstanceId: 'stale',
        status: 'disconnected',
        license: { state: 'pro', observedAt: now - (PRO_LICENSE_STALENESS_MS + 1000) },
      }],
    }, now)).toEqual({ pro: false, source: 'none', observedAt: null, staleAfter: null });
  });

  it('resolveWechatSyncProLicense is defensive against invalid or clock-skewed observedAt', () => {
    const now = Date.now();

    // A finite but invalid observedAt (<= 0) survives normalize unchanged and
    // is untrusted → does not sustain Pro. (A non-finite / missing observedAt
    // is instead seeded to load-time by normalizeConnectedClient, which is the
    // legacy-migration path covered by its own test below.)
    for (const observedAt of [0, -1]) {
      expect(resolveWechatSyncProLicense({
        connectedClients: [{
          extensionInstanceId: 'bad',
          status: 'disconnected',
          license: { state: 'pro', observedAt },
        }],
      }, now).pro).toBe(false);
    }

    // A future observedAt (system clock rolled back) must not downgrade a
    // paying user — treated leniently as "not stale".
    expect(resolveWechatSyncProLicense({
      connectedClients: [{
        extensionInstanceId: 'future',
        status: 'disconnected',
        license: { state: 'pro', observedAt: now + 60_000 },
      }],
    }, now).pro).toBe(true);
  });

  it('resolveWechatSyncProLicense returns Pro when any client is Pro within the window (mixed multi-device)', () => {
    const now = Date.now();
    const result = resolveWechatSyncProLicense({
      connectedClients: [
        {
          extensionInstanceId: 'free-live',
          status: 'connected',
          license: { state: 'free', observedAt: now },
        },
        {
          extensionInstanceId: 'pro-cached',
          status: 'disconnected',
          license: { state: 'pro', observedAt: now - 1000 },
        },
      ],
    }, now);
    expect(result.pro).toBe(true);
    expect(result.source).toBe('cached');
  });

  it('resolveWechatSyncProLicense treats a legacy proLicensed-only client as Pro after normalize seeds observedAt', () => {
    // Legacy persisted data: capabilities.proLicensed:true with no license
    // object. normalizeConnectedClient derives state:'pro' and seeds
    // observedAt to load time, so it counts as a fresh cache.
    expect(resolveWechatSyncProLicense({
      connectedClients: [{
        extensionInstanceId: 'legacy',
        status: 'disconnected',
        capabilities: { proLicensed: true },
      }],
    }).pro).toBe(true);
  });

  it('normalizeWechatSyncCapabilities coerces non-boolean proLicensed inputs to false (strict === true)', () => {
    expect(normalizeWechatSyncCapabilities({ proLicensed: true }).proLicensed).toBe(true);
    expect(normalizeWechatSyncCapabilities({ proLicensed: 'true' }).proLicensed).toBe(false);
    expect(normalizeWechatSyncCapabilities({ proLicensed: 1 }).proLicensed).toBe(false);
    expect(normalizeWechatSyncCapabilities({})).not.toHaveProperty('proLicensed');
  });

  it('preserves remote policy capability and policy cache shape without coercing quota into capabilities', () => {
    const normalized = normalizeMultiPlatformSyncSettings({
      connection: {
        capabilities: {
          remotePolicy: true,
          quotaPolicy: true,
          quota: { mode: 'daily_platform_count', freeLimit: 2 },
        },
      },
      policyCache: {
        signature: 'sig',
        cachedAt: 123,
        payload: {
          productId: 'obsidian-publisher',
          quota: { mode: 'daily_platform_count', freeLimit: 2 },
        },
      },
    });

    expect(normalized.connection.capabilities.remotePolicy).toBe(true);
    expect(normalized.connection.capabilities.quotaPolicy).toBe(true);
    expect(normalized.connection.capabilities).not.toHaveProperty('quota');
    expect(normalized.policyCache).toEqual(expect.objectContaining({
      signature: 'sig',
      cachedAt: 123,
      payload: expect.objectContaining({
        productId: 'obsidian-publisher',
        quota: { mode: 'daily_platform_count', freeLimit: 2 },
      }),
    }));
  });

  it('normalizeMultiPlatformSyncSettings is idempotent with connectedClients', () => {
    const once = normalizeMultiPlatformSyncSettings({ connectedClients: [VALID_CLIENT] });
    const twice = normalizeMultiPlatformSyncSettings(once);
    expect(twice.connectedClients).toEqual(once.connectedClients);
  });
});

// After a plugin reload, loadSettings resets connection.status to 'untested'
// while the extension silently reconnects via hello. The registry callback
// must promote connection.status back to 'connected'; otherwise platform
// badges keep saying 「需连接浏览器插件」 and the publish modal stays disabled
// until the user manually clicks 「测试连接」.
describe('applyClientRegistryToMultiPlatformSettings — hello promotes connection.status', () => {
  const LIVE_CLIENT = {
    extensionInstanceId: 'live-1',
    browserName: 'chrome',
    status: 'connected',
    lastSeenAt: 5000,
  };
  const OFFLINE_CLIENT = {
    extensionInstanceId: 'off-1',
    browserName: 'edge',
    status: 'disconnected',
    lastSeenAt: 4000,
  };

  it('promotes untested → connected when a live client is present (plugin reload recovery)', () => {
    const next = applyClientRegistryToMultiPlatformSettings(
      { connection: { status: 'untested' } },
      [LIVE_CLIENT],
      777000
    );
    expect(next.connection.status).toBe('connected');
    expect(next.connection.checkedAt).toBe(777000);
    expect(next.connection.message).toBe('');
    expect(next.connectedClients).toHaveLength(1);
    expect(next.connectedClients[0].status).toBe('connected');
  });

  it('self-heals a failed connection and clears the stale error message', () => {
    const next = applyClientRegistryToMultiPlatformSettings(
      { connection: { status: 'failed', message: '连接失败：端口被占用' } },
      [LIVE_CLIENT],
      888000
    );
    expect(next.connection.status).toBe('connected');
    expect(next.connection.message).toBe('');
  });

  it('keeps an existing connected check untouched (heartbeat must not churn checkedAt/platforms)', () => {
    const next = applyClientRegistryToMultiPlatformSettings(
      {
        connection: {
          status: 'connected',
          checkedAt: 123456,
          platforms: [{ id: 'zhihu', name: '知乎', status: 'available' }],
        },
      },
      [LIVE_CLIENT],
      999000
    );
    expect(next.connection.status).toBe('connected');
    expect(next.connection.checkedAt).toBe(123456);
    expect(next.connection.platforms.map((platform) => platform.id)).toEqual(['zhihu']);
  });

  it('leaves connection untouched when no client is live (disconnect keeps last check result)', () => {
    const next = applyClientRegistryToMultiPlatformSettings(
      { connection: { status: 'untested' } },
      [OFFLINE_CLIENT],
      101000
    );
    expect(next.connection.status).toBe('untested');
    expect(next.connection.checkedAt).toBe(0);
    expect(next.connectedClients).toHaveLength(1);
    expect(next.connectedClients[0].status).toBe('disconnected');
  });

  it('replaces connectedClients wholesale and tolerates a non-array registry', () => {
    const next = applyClientRegistryToMultiPlatformSettings(
      { connectedClients: [OFFLINE_CLIENT], connection: { status: 'connected', checkedAt: 42 } },
      /** @type {never} */ (null),
      202000
    );
    expect(next.connectedClients).toEqual([]);
    // No live client in the (empty) registry — the last check result stays.
    expect(next.connection.status).toBe('connected');
    expect(next.connection.checkedAt).toBe(42);
  });
});
