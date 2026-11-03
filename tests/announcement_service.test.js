/*
## 核心功能

覆盖 announcement-service 与多平台特惠展示相关行为的 Vitest 测试用例。

## 输入

接收被测 announcement-service 模块、Mock 插件设置与特惠活动数据。

## 输出

输出自动化断言结果，保证活动时效判断、Pro 用户免打扰、用户关闭持久化和引导卡片渲染逻辑可靠。

## 定位

位于 tests/，是回归测试层。

## 依赖

关键依赖：Vitest、`../services/announcement-service.js`、`../views/settings/multi-platform-onboarding.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书。
*/

import { describe, it, expect, vi } from 'vitest';
import {
  isAnnouncementEligible,
  dismissAnnouncement,
} from '../services/announcement-service.js';
import {
  renderMultiPlatformOnboardingGuide,
  mountPromoCard,
} from '../views/settings/multi-platform-onboarding.js';

const baseAnnouncement = {
  id: '2026-double-11',
  active: true,
  tag: '🎉 11.11 特惠',
  startTime: '2026-11-01T00:00:00+08:00',
  endTime: '2026-11-30T23:59:59+08:00',
};

describe('announcement-service', () => {

  it('allows eligible announcement during active period for non-pro user', () => {
    const midNov = new Date('2026-11-15T12:00:00+08:00').getTime();
    const settings = {
      multiPlatformSync: { connectedClients: [] },
      dismissedPromoIds: [],
    };
    expect(isAnnouncementEligible(baseAnnouncement, settings, midNov)).toBe(true);
  });

  it('rejects when active is false', () => {
    const midNov = new Date('2026-11-15T12:00:00+08:00').getTime();
    expect(isAnnouncementEligible({ ...baseAnnouncement, active: false }, {}, midNov)).toBe(false);
  });

  it('rejects when past endTime', () => {
    const dec1 = new Date('2026-12-01T00:00:00+08:00').getTime();
    expect(isAnnouncementEligible(baseAnnouncement, {}, dec1)).toBe(false);
  });

  it('rejects when before startTime', () => {
    const oct30 = new Date('2026-10-30T00:00:00+08:00').getTime();
    expect(isAnnouncementEligible(baseAnnouncement, {}, oct30)).toBe(false);
  });

  it('never shows promo banner to already-licensed Pro user', () => {
    const midNov = new Date('2026-11-15T12:00:00+08:00').getTime();
    const proSettings = {
      multiPlatformSync: {
        connectedClients: [
          {
            extensionInstanceId: 'client_1',
            status: 'connected',
            license: { state: 'pro', observedAt: midNov },
          },
        ],
      },
      dismissedPromoIds: [],
    };
    expect(isAnnouncementEligible(baseAnnouncement, proSettings, midNov)).toBe(false);
  });

  it('rejects when user has already dismissed the promotion', () => {
    const midNov = new Date('2026-11-15T12:00:00+08:00').getTime();
    const settings = {
      multiPlatformSync: {},
      dismissedPromoIds: ['2026-double-11'],
    };
    expect(isAnnouncementEligible(baseAnnouncement, settings, midNov)).toBe(false);
  });

  it('records dismissedPromoIds and invokes saveSettings', async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const mockPlugin = {
      settings: {
        dismissedPromoIds: [],
      },
      saveSettings,
    };

    await dismissAnnouncement(mockPlugin, '2026-double-11');
    expect(mockPlugin.settings.dismissedPromoIds).toEqual(['2026-double-11']);
    expect(saveSettings).toHaveBeenCalledTimes(1);

    // Repeated dismiss should be idempotent
    await dismissAnnouncement(mockPlugin, '2026-double-11');
    expect(mockPlugin.settings.dismissedPromoIds).toEqual(['2026-double-11']);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });
});

describe('multi-platform-onboarding', () => {
  function createMockElement() {
    return {
      children: [],
      createDiv(opts = {}) {
        const el = { ...createMockElement(), ...opts };
        this.children.push(el);
        return el;
      },
      createSpan(opts = {}) {
        const el = { ...createMockElement(), ...opts };
        this.children.push(el);
        return el;
      },
      createEl(tag, opts = {}) {
        const el = { ...createMockElement(), tag, ...opts };
        this.children.push(el);
        return el;
      },
    };
  }

  it('mountPromoCard renders promo card and CTA button driven by announcement data', () => {
    const slot = createMockElement();
    const openExternalUrl = vi.fn();
    mountPromoCard(slot, baseAnnouncement, {
      openExternalUrl,
      tab: {},
      Notice: class {},
    });

    const promoCard = slot.children.find((c) => c.cls === 'wechat-multiplatform-promo-card');
    expect(promoCard).toBeDefined();

    const footer = promoCard.children.find((c) => c.cls === 'wechat-multiplatform-promo-footer');
    const proBtn = footer.children.find((c) => c.cls?.includes('wechat-multiplatform-pro-cta'));
    expect(proBtn).toBeDefined();

    proBtn.onclick();
    expect(openExternalUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('promo=double11')
    );
  });

  it('renders promo slot for free users and skips completely for Pro users', () => {
    const freeContainer = createMockElement();
    const openExternalUrl = vi.fn();
    renderMultiPlatformOnboardingGuide({}, freeContainer, {
      isProLicensed: false,
      isProCached: false,
      isPublishingEnabled: false,
      hasEverConnected: false,
      proLicense: {},
      formatProLicenseObservedAgo: () => '',
      openExternalUrl,
      Notice: class {},
    });

    const promoSlot = freeContainer.children.find((c) => c.cls === 'wechat-multiplatform-promo-slot');
    expect(promoSlot).toBeDefined();

    const proContainer = createMockElement();
    renderMultiPlatformOnboardingGuide({}, proContainer, {
      isProLicensed: true,
      isProCached: false,
      isPublishingEnabled: true,
      hasEverConnected: true,
      proLicense: {},
      formatProLicenseObservedAgo: () => '',
      openExternalUrl,
      Notice: class {},
    });

    const proPromoSlot = proContainer.children.find((c) => c.cls === 'wechat-multiplatform-promo-slot');
    expect(proPromoSlot).toBeUndefined();

    const guide = proContainer.children.find((c) => c.cls?.includes('wechat-multiplatform-onboarding'));
    const badge = guide.children.find((c) => c.text === 'Pro');
    expect(badge).toBeDefined();

    const actions = guide.children.find((c) => c.cls === 'wechat-multiplatform-onboarding-actions');
    const proBtn = actions.children.find((c) => c.text === '查看 Pro 权益');
    expect(proBtn).toBeDefined();
  });
});
