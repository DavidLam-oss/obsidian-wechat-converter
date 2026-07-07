/*
## 核心功能

覆盖 obsidian publisher policy 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 obsidian publisher policy 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi } from 'vitest';
import {
  canonicalizePolicyPayload,
  checkExtensionPolicyGate,
  checkObsidianPluginPolicyGate,
  getEffectiveObsidianPublisherPolicy,
  isVersionLessThan,
  verifyPolicyPayload,
} from '../services/obsidian-publisher-policy.js';
import { generateKeyPairSync, sign } from 'crypto';

function createSignedPolicy(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ type: 'spki', format: 'der' });
  const publicKeyB64Url = Buffer.from(publicDer).subarray(-32).toString('base64url');
  const payload = {
    productId: 'obsidian-publisher',
    policyVersion: 7,
    issuedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    quota: { mode: 'daily_platform_count', freeLimit: 2 },
    minExtensionVersion: '0.3.0',
    minObsidianPluginVersion: '2.9.4',
    forceUpgradeExtension: false,
    forceUpgradeObsidianPlugin: false,
    proUpgradeUrl: 'https://xiaoweibox.top/obsidian-publisher/pro',
    extensionUpgradeUrl: 'https://xiaoweibox.top/obsidian-publisher/download',
    obsidianPluginUpgradeUrl: 'obsidian://show-plugin?id=wechat-converter',
    ...overrides,
  };
  const signature = sign(null, Buffer.from(canonicalizePolicyPayload(payload), 'utf8'), privateKey)
    .toString('base64url');
  return { payload, signature, publicKeyB64Url };
}

describe('obsidian publisher remote policy', () => {
  it('verifies signed policy payloads with the same canonical JSON contract as the worker', () => {
    const signed = createSignedPolicy();

    expect(verifyPolicyPayload(signed.payload, signed.signature, signed.publicKeyB64Url)).toBe(true);
    expect(verifyPolicyPayload(
      { ...signed.payload, quota: { mode: 'daily_platform_count', freeLimit: 1 } },
      signed.signature,
      signed.publicKeyB64Url
    )).toBe(false);
  });

  it('fetches, verifies and caches an Obsidian plugin policy response', async () => {
    const signed = createSignedPolicy();
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      json: async () => ({
        payload: signed.payload,
        signature: signed.signature,
      }),
    }));
    const plugin = {
      manifest: { version: '2.9.4' },
      settings: {
        clientId: 'client-1',
        multiPlatformSync: {},
      },
      saveSettings: vi.fn(async () => true),
    };

    const result = await getEffectiveObsidianPublisherPolicy(plugin, {
      fetchImpl,
      publicKey: signed.publicKeyB64Url,
      workerUrl: 'https://worker.test',
    });

    expect(result.source).toBe('network');
    expect(result.payload.quota.freeLimit).toBe(2);
    expect(plugin.settings.multiPlatformSync.policyCache).toEqual(expect.objectContaining({
      signature: signed.signature,
      payload: expect.objectContaining({ policyVersion: 7 }),
    }));
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(expect.objectContaining({
      productId: 'obsidian-publisher',
      client: 'obsidian-plugin',
      clientVersion: '2.9.4',
      installId: 'client-1',
    }));
  });

  it('uses semver-like gates for plugin and extension force-upgrade decisions', () => {
    const { payload } = createSignedPolicy({
      minExtensionVersion: '0.3',
      minObsidianPluginVersion: '2.9.10',
      forceUpgradeExtension: true,
      forceUpgradeObsidianPlugin: true,
    });

    expect(isVersionLessThan('2.9.9', '2.9.10')).toBe(true);
    expect(isVersionLessThan('0.3.0', '0.3')).toBe(false);
    expect(checkObsidianPluginPolicyGate(payload, '2.9.4')).toEqual(expect.objectContaining({
      allowed: false,
      reason: 'OBSIDIAN_PLUGIN_VERSION_UNSUPPORTED',
    }));
    expect(checkExtensionPolicyGate(payload, {
      currentVersion: '0.2.9',
      remotePolicySupported: true,
    })).toEqual(expect.objectContaining({
      allowed: false,
      reason: 'EXTENSION_VERSION_UNSUPPORTED',
    }));
    expect(checkExtensionPolicyGate(payload, {
      currentVersion: '0.3.0',
      remotePolicySupported: false,
    })).toEqual(expect.objectContaining({
      allowed: false,
      reason: 'EXTENSION_REMOTE_POLICY_UNSUPPORTED',
    }));
  });
});
