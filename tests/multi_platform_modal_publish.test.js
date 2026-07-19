/*
## 核心功能

覆盖多平台发布请求的额度策略、Pro 状态和 Bridge 结果处理。

## 输入

Vitest、发布弹窗 fixture、模拟的 Bridge 能力和发布结果。

## 输出

额度截断、Pro 放行和扩展额度拒绝行为的回归断言。

## 定位

位于 tests/，是多平台发布策略回归测试。

## 依赖

关键依赖：Vitest、`./helpers/multi-platform-modal-fixtures.js`。

## 维护规则

- 只验证策略和发布编排契约，不依赖真实网络或凭据。
- 额度规则变化时同步更新产品策略测试和文档。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  makeView,
  installModalCapture,
} from './helpers/multi-platform-modal-fixtures.js';

describe('multi-platform modal publish policy', () => {
  let modalCapture;

  beforeEach(() => {
    modalCapture = installModalCapture();
  });

  it('passes truncate quotaPolicy and shows quota modal when the extension blocks the task', async () => {
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({
        accepted: false,
        reason: 'daily_limit',
        quotaBlocked: true,
        skippedPlatforms: ['zhihu', 'juejin'],
        message: '免费版今日平台额度不足，明天 0:00 重置，或升级 Pro。',
      }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu', 'juejin'], bridge });
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');

    await syncBtn.onclick();

    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      platforms: ['zhihu', 'juejin'],
      source: 'obsidian',
      quotaPolicy: 'truncate',
    }));
    expect(view.showMultiPlatformQuotaBlockedModal).toHaveBeenCalledWith(expect.objectContaining({
      requestedPlatformIds: ['zhihu', 'juejin'],
      quotaResult: expect.objectContaining({
        accepted: false,
        reason: 'daily_limit',
      }),
    }));
  });

  it('pre-truncates a Free remote-policy request before enqueueing selected platforms', async () => {
    const cachedPlatforms = [
      { id: 'zhihu', name: '知乎', authKnown: true, authenticated: true },
      { id: 'juejin', name: '掘金', authKnown: true, authenticated: true },
      { id: 'csdn', name: 'CSDN', authKnown: true, authenticated: true },
    ];
    const bridge = {
      health: vi.fn().mockResolvedValue({
        ok: true,
        version: '0.3.0',
        proLicensed: false,
        policyVersion: 1,
        quota: { mode: 'daily_platform_count', freeLimit: 1 },
        capabilities: {
          quotaPolicy: true,
          remotePolicy: true,
          proLicensed: false,
          policyVersion: 1,
          quota: { mode: 'daily_platform_count', freeLimit: 1 },
        },
      }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({
        accepted: true,
        syncId: 'sync-remote-policy',
        publishedPlatforms: ['zhihu'],
      }),
    };
    const view = makeView({
      selectedPlatforms: ['zhihu', 'juejin', 'csdn'],
      cachedPlatforms,
      bridge,
    });
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      platforms: ['zhihu'],
      source: 'obsidian',
      quotaPolicy: 'truncate',
    }));
    expect(view.showWechatsyncEnqueueAcceptedModal).toHaveBeenCalledWith(expect.objectContaining({
      platforms: ['zhihu', 'csdn', 'juejin'],
      quotaResult: expect.objectContaining({
        quotaBlocked: true,
        maxPlatforms: 1,
        publishedPlatforms: ['zhihu'],
        skippedPlatforms: ['csdn', 'juejin'],
      }),
    }));
  });

  it('does not pre-truncate when remote policy confirms an active Pro license', async () => {
    const cachedPlatforms = [
      { id: 'zhihu', name: '知乎', authKnown: true, authenticated: true },
      { id: 'juejin', name: '掘金', authKnown: true, authenticated: true },
    ];
    const bridge = {
      health: vi.fn().mockResolvedValue({
        ok: true,
        version: '0.3.0',
        proLicensed: true,
        quota: { mode: 'daily_platform_count', freeLimit: 1 },
        capabilities: {
          quotaPolicy: true,
          remotePolicy: true,
          proLicensed: true,
          quota: { mode: 'daily_platform_count', freeLimit: 1 },
        },
      }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({
        accepted: true,
        syncId: 'sync-pro-policy',
      }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu', 'juejin'], cachedPlatforms, bridge });
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      platforms: ['zhihu', 'juejin'],
      quotaPolicy: 'truncate',
    }));
    expect(view.showWechatsyncEnqueueAcceptedModal.mock.calls[0][0].quotaResult.quotaBlocked).not.toBe(true);
  });
});
