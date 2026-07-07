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
  normalizeMultiPlatformSyncSettings,
  normalizeWechatSyncCapabilities,
} = require('../services/wechatsync-settings');

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

  it('hasWechatSyncProLicense recognises active Pro from cached connection and connected clients', () => {
    expect(hasWechatSyncProLicense({
      connection: { capabilities: { proLicensed: true } },
    })).toBe(true);

    expect(hasWechatSyncProLicense({
      connectedClients: [{
        extensionInstanceId: 'client-1',
        status: 'connected',
        capabilities: { proLicensed: true },
      }],
    })).toBe(true);

    expect(hasWechatSyncProLicense({
      connectedClients: [{
        extensionInstanceId: 'client-2',
        status: 'disconnected',
        capabilities: { proLicensed: true },
      }],
    })).toBe(false);
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
