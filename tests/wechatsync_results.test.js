/*
## 核心功能

覆盖 wechatsync results 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 wechatsync results 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect } from 'vitest';
import {
  FEATURED_WECHATSYNC_PLATFORM_ORDER,
  buildWechatsyncPlatformCatalog,
  getMultiPlatformResultSummary,
  getWechatSyncResultUrl,
  getFallbackWechatsyncPlatforms,
  getWechatsyncPlatformStatusBadge,
  isWechatSyncConnectionFailure,
  normalizeWechatSyncResponseResults,
  normalizeWechatsyncAuthSnapshot,
  normalizeWechatsyncCheckAuthResult,
  normalizeWechatsyncPlatformList,
  normalizeWechatsyncPlatform,
  probeWechatsyncPlatformsIndividually,
  sortWechatsyncPlatformItemsForDisplay,
  summarizeWechatsyncPlatformResponse,
  updateCachedPlatformsAfterSync,
} from '../services/wechatsync-results.js';

describe('Wechatsync result helpers', () => {
  it('normalizes extension platform auth fields and excludes WeChat', () => {
    expect(normalizeWechatsyncPlatform({
      id: 'zhihu',
      name: '知乎',
      isAuthenticated: true,
      username: 'Lin',
    })).toMatchObject({
      id: 'zhihu',
      name: '知乎',
      authKnown: true,
      authenticated: true,
      username: 'Lin',
      error: '',
    });

    expect(normalizeWechatsyncPlatform({ id: 'weixin', name: '微信' })).toBeNull();
  });

  it('normalizes wrapped platform lists and nested auth fields from extension responses', () => {
    const response = {
      platforms: [
        {
          id: 'zhihu',
          name: '知乎',
          auth: { isAuthenticated: true, username: 'Lin' },
        },
        {
          id: 'douyin',
          name: '抖音图文',
          status: '已登录',
          accountName: 'home',
        },
        { id: 'weixin', name: '微信公众号', isAuthenticated: true },
      ],
    };

    expect(normalizeWechatsyncPlatformList(response)).toEqual([
      expect.objectContaining({ id: 'zhihu', name: '知乎', authKnown: true, authenticated: true, username: 'Lin', error: '' }),
      expect.objectContaining({ id: 'douyin', name: '抖音图文', authKnown: true, authenticated: true, username: 'home', error: '' }),
    ]);
    expect(summarizeWechatsyncPlatformResponse(response)).toMatchObject({
      responseKind: 'object',
      rawCount: 3,
      normalizedCount: 2,
      authenticatedCount: 2,
    });
  });

  it('normalizes cached auth snapshots from the extension without live probing', () => {
    const snapshot = normalizeWechatsyncAuthSnapshot({
      source: 'cache',
      checkedAt: 1770000000000,
      platforms: [
        { id: 'zhihu', authKnown: true, authenticated: true, username: 'Lin' },
        { id: 'juejin', authKnown: true, authenticated: false, error: '未登录' },
        { id: 'weixin', authKnown: true, authenticated: true },
      ],
    }, [
      { id: 'zhihu', name: '知乎' },
      { id: 'juejin', name: '掘金' },
    ]);

    expect(snapshot).toEqual({
      source: 'cache',
      checkedAt: 1770000000000,
      platforms: [
        expect.objectContaining({ id: 'zhihu', name: '知乎', authKnown: true, authenticated: true, username: 'Lin', error: '' }),
        expect.objectContaining({ id: 'juejin', name: '掘金', authKnown: true, authenticated: false, username: '', error: '未登录' }),
      ],
    });
  });

  it('keeps explicit unknown auth snapshot entries as unknown', () => {
    const platform = normalizeWechatsyncPlatform({
      id: 'juejin',
      name: '掘金',
      authKnown: false,
      authenticated: false,
    });

    expect(platform).toMatchObject({
      id: 'juejin',
      authKnown: false,
      authenticated: false,
    });
    expect(getWechatsyncPlatformStatusBadge(platform)).toMatchObject({
      status: 'unknown',
      text: '未检测',
    });
  });

  // === getWechatsyncPlatformStatusBadge full contract ===
  // These cases lock the user-visible status text + class. Changing them
  // changes the chip / publish-modal status badges; review styles.css
  // (.wechat-platform-chip-status / .wechat-multiplatform-platform-status)
  // before adjusting.

  it('returns "上次可用 · ${username}" badge for authenticated platform with username', () => {
    const platform = normalizeWechatsyncPlatform({
      id: 'zhihu',
      name: '知乎',
      isAuthenticated: true,
      username: 'Lin',
    });
    expect(getWechatsyncPlatformStatusBadge(platform)).toEqual({
      status: 'available',
      text: '上次可用 · Lin',
      cls: 'is-ok',
    });
  });

  it('returns plain "上次可用" badge for authenticated platform without username', () => {
    const platform = normalizeWechatsyncPlatform({
      id: 'douyin',
      name: '抖音图文',
      isAuthenticated: true,
    });
    expect(getWechatsyncPlatformStatusBadge(platform)).toEqual({
      status: 'available',
      text: '上次可用',
      cls: 'is-ok',
    });
  });

  it('returns the original error text for login_required platforms', () => {
    const platform = normalizeWechatsyncPlatform({
      id: 'juejin',
      name: '掘金',
      authKnown: true,
      authenticated: false,
      error: '登录已失效',
    });
    expect(getWechatsyncPlatformStatusBadge(platform)).toEqual({
      status: 'login_required',
      text: '登录已失效',
      cls: 'is-error',
    });
  });

  it('falls back to "需登录" when login_required platform has no error message', () => {
    const platform = normalizeWechatsyncPlatform({
      id: 'juejin',
      name: '掘金',
      authKnown: true,
      authenticated: false,
    });
    expect(getWechatsyncPlatformStatusBadge(platform)).toEqual({
      status: 'login_required',
      text: '需登录',
      cls: 'is-error',
    });
  });

  it('returns bridge_required badge when bridge is not connected', () => {
    const platform = normalizeWechatsyncPlatform({
      id: 'zhihu',
      name: '知乎',
      authKnown: true,
      authenticated: true,
      username: 'Lin',
    });
    expect(getWechatsyncPlatformStatusBadge(platform, { bridgeConnected: false })).toEqual({
      status: 'bridge_required',
      text: '需连接浏览器插件',
      cls: 'is-bridge',
    });
  });

  it('normalizes single-platform checkAuth results with fallback metadata', () => {
    expect(normalizeWechatsyncCheckAuthResult(
      { id: 'zhihu', name: '知乎' },
      { isAuthenticated: true, username: 'Lin' }
    )).toMatchObject({
      id: 'zhihu',
      name: '知乎',
      authKnown: true,
      authenticated: true,
      username: 'Lin',
      error: '',
    });

    expect(normalizeWechatsyncCheckAuthResult(
      { id: 'missing', name: '缺失平台' },
      { isAuthenticated: false, error: 'Platform not found' }
    )).toBeNull();
  });

  it('probes fallback platforms without letting one failed platform block the rest', async () => {
    const bridge = {
      async checkAuth(platform) {
        if (platform === 'zhihu') return { isAuthenticated: true, username: 'Lin' };
        if (platform === 'juejin') return { isAuthenticated: false, error: '未登录' };
        if (platform === 'missing') return { isAuthenticated: false, error: 'Platform not found' };
        throw new Error('network down');
      },
    };

    const platforms = await probeWechatsyncPlatformsIndividually(bridge, {
      candidates: [
        { id: 'zhihu', name: '知乎' },
        { id: 'juejin', name: '掘金' },
        { id: 'missing', name: '缺失平台' },
        { id: 'broken', name: '失败平台' },
      ],
      concurrency: 2,
      logger: { debug() {} },
    });

    expect(platforms).toEqual([
      expect.objectContaining({ id: 'zhihu', name: '知乎', authKnown: true, authenticated: true, username: 'Lin', error: '' }),
      expect.objectContaining({ id: 'juejin', name: '掘金', authKnown: true, authenticated: false, username: '', error: '未登录' }),
    ]);
  });

  it('keeps fallback platform candidates aligned with the Wechatsync support matrix', () => {
    const platforms = getFallbackWechatsyncPlatforms();
    const platformIds = platforms.map((platform) => platform.id);
    expect(platformIds.slice(0, FEATURED_WECHATSYNC_PLATFORM_ORDER.length)).toEqual(
      FEATURED_WECHATSYNC_PLATFORM_ORDER
    );
    expect(platformIds).toContain('zhihu');
    expect(platformIds).toContain('xiaohongshu');
    expect(platformIds).toContain('toutiao');
    expect(platformIds).toContain('smzdm');
    expect(platformIds).not.toContain('wordpress');
    expect(platformIds).not.toContain('typecho');
    expect(platformIds).not.toContain('zip-download');
    expect(platformIds).not.toContain('weixin');
    expect(platformIds).not.toContain('twitter');
    expect(platforms.every((platform) => Object.prototype.hasOwnProperty.call(platform, 'homepage'))).toBe(true);
    expect(platforms.every((platform) => Array.isArray(platform.capabilities))).toBe(true);
  });

  it('builds a non-empty catalog and marks bridge-required state when disconnected', () => {
    const catalog = buildWechatsyncPlatformCatalog({
      supportedPlatforms: [],
      authSnapshotPlatforms: [],
      bridgeConnected: false,
    });

    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.slice(0, FEATURED_WECHATSYNC_PLATFORM_ORDER.length).map((platform) => platform.id))
      .toEqual(FEATURED_WECHATSYNC_PLATFORM_ORDER);
    expect(catalog[0]).toMatchObject({
      authStatus: 'bridge_required',
      authKnown: true,
      authenticated: false,
    });
    expect(getWechatsyncPlatformStatusBadge(catalog[0])).toMatchObject({
      status: 'bridge_required',
      text: '需连接浏览器插件',
    });
  });

  it('uses extension metadata and overlays cached auth snapshot when connected', () => {
    const catalog = buildWechatsyncPlatformCatalog({
      supportedPlatforms: [
        { id: 'zhihu', name: '知乎 Pro', homepage: 'https://example.com/zhihu', capabilities: ['article', 'draft'] },
        { id: 'juejin', name: '掘金', homepage: 'https://juejin.cn', capabilities: ['article'] },
      ],
      authSnapshotPlatforms: [
        { id: 'zhihu', authKnown: true, authenticated: true, username: 'Lin' },
      ],
      bridgeConnected: true,
    });

    expect(catalog).toEqual([
      expect.objectContaining({
        id: 'zhihu',
        name: '知乎 Pro',
        homepage: 'https://example.com/zhihu',
        capabilities: ['article', 'draft'],
        authenticated: true,
        username: 'Lin',
      }),
      expect.objectContaining({
        id: 'juejin',
        name: '掘金',
        authKnown: false,
      }),
    ]);
    expect(getWechatsyncPlatformStatusBadge(catalog[1])).toMatchObject({
      status: 'unknown',
      text: '未检测',
    });
  });

  it('groups connected catalog by authenticated state, then featured platform order', () => {
    const catalog = buildWechatsyncPlatformCatalog({
      supportedPlatforms: [
        { id: 'douban', name: '豆瓣' },
        { id: 'csdn', name: 'CSDN' },
        { id: 'xiaohongshu', name: '小红书' },
        { id: 'zhihu', name: '知乎' },
        { id: 'smzdm', name: '什么值得买' },
        { id: 'weibo', name: '微博' },
      ],
      authSnapshotPlatforms: [
        { id: 'douban', name: '豆瓣', authKnown: true, authenticated: true },
        { id: 'zhihu', name: '知乎', authKnown: true, authenticated: true },
        { id: 'weibo', name: '微博', authKnown: true, authenticated: false },
      ],
      bridgeConnected: true,
    });

    expect(catalog.map((platform) => platform.id)).toEqual([
      'zhihu',
      'douban',
      'xiaohongshu',
      'weibo',
      'csdn',
      'smzdm',
    ]);
  });

  it('sorts arbitrary platform result items with the same display rule', () => {
    const platformById = new Map([
      ['douban', { id: 'douban', authenticated: true }],
      ['zhihu', { id: 'zhihu', authenticated: false }],
      ['xiaohongshu', { id: 'xiaohongshu', authenticated: false }],
      ['weibo', { id: 'weibo', authenticated: true }],
    ]);
    const items = [
      { platform: 'zhihu' },
      { platform: 'douban' },
      { platform: 'xiaohongshu' },
      { platform: 'weibo' },
    ];

    const sorted = sortWechatsyncPlatformItemsForDisplay(items, {
      bridgeConnected: true,
      getPlatformId: (item) => item.platform,
      getPlatform: (item) => platformById.get(item.platform) || item,
    });

    expect(sorted.map((item) => item.platform)).toEqual([
      'weibo',
      'douban',
      'xiaohongshu',
      'zhihu',
    ]);
  });

  it('normalizes sync responses from arrays, wrapped results, and single results', () => {
    const zhihu = { platform: 'zhihu', success: true, postUrl: 'https://zhuanlan.zhihu.com/p/1/edit' };
    const juejin = { platform: 'juejin', success: false, error: '未登录' };

    expect(normalizeWechatSyncResponseResults({ results: [zhihu, null, juejin] })).toEqual([zhihu, juejin]);
    expect(normalizeWechatSyncResponseResults([zhihu])).toEqual([zhihu]);
    expect(normalizeWechatSyncResponseResults(zhihu)).toEqual([zhihu]);
    expect(normalizeWechatSyncResponseResults({ syncId: 'sync-1' })).toEqual([]);
  });

  it('extracts draft links from common result fields', () => {
    expect(getWechatSyncResultUrl({ postUrl: 'https://example.com/post' })).toBe('https://example.com/post');
    expect(getWechatSyncResultUrl({ draftUrl: 'https://example.com/draft' })).toBe('https://example.com/draft');
    expect(getWechatSyncResultUrl({ editUrl: 'https://example.com/edit' })).toBe('https://example.com/edit');
  });

  it('summarizes partial success and detects auth failures', () => {
    const results = [
      { platform: 'zhihu', success: true, postUrl: 'https://zhuanlan.zhihu.com/p/1/edit' },
      { platform: 'juejin', success: false, error: '未登录，请重新登录' },
      { platform: 'csdn', success: false, error: '发布超时' },
    ];

    const summary = getMultiPlatformResultSummary(results, ['zhihu', 'juejin', 'csdn']);

    expect(summary.successCount).toBe(1);
    expect(summary.failedCount).toBe(2);
    expect(summary.totalCount).toBe(3);
    expect(summary.isAllSuccess).toBe(false);
    expect(summary.authFailedResults.map((item) => item.platform)).toEqual(['juejin']);
  });

  it('updates cached auth state after sync without dropping unaffected platforms', () => {
    const cached = [
      { id: 'zhihu', name: '知乎', authenticated: true, username: 'Lin' },
      { id: 'juejin', name: '掘金', authenticated: true },
      { id: 'csdn', name: 'CSDN', authenticated: true },
    ];
    const results = [
      { platform: 'zhihu', success: true, postUrl: 'https://zhuanlan.zhihu.com/p/1/edit' },
      { platform: 'juejin', success: false, error: '未登录，请重新登录' },
      { platform: 'csdn', success: false, error: '发布超时' },
    ];

    expect(updateCachedPlatformsAfterSync(cached, results)).toEqual([
      expect.objectContaining({ id: 'zhihu', name: '知乎', authKnown: true, authenticated: true, username: 'Lin', error: '' }),
      expect.objectContaining({ id: 'juejin', name: '掘金', authKnown: true, authenticated: false, username: '', error: '未登录，请重新登录' }),
      expect.objectContaining({ id: 'csdn', name: 'CSDN', authKnown: true, authenticated: true, username: '', error: '' }),
    ]);
  });

  it('filters catalog to only show platforms selected in plugin settings', () => {
    const catalog = buildWechatsyncPlatformCatalog({
      supportedPlatforms: [
        { id: 'zhihu', name: '知乎' },
        { id: 'juejin', name: '掘金' },
        { id: 'csdn', name: 'CSDN' },
        { id: 'weibo', name: '微博' },
      ],
      authSnapshotPlatforms: [],
      bridgeConnected: true,
    });

    const selectedIds = new Set(['zhihu', 'csdn']);
    const displayed = catalog.filter((p) => selectedIds.has(p.id));

    expect(displayed).toHaveLength(2);
    expect(displayed[0].id).toBe('zhihu');
    expect(displayed[1].id).toBe('csdn');
  });

  // Sprint 1 §4.1: ensure EXTENSION_NOT_AUTHENTICATED is treated as a
  // connection failure so the publish modal / settings UI / status bar
  // all uniformly persist the failure state and clear the cached client.
  it('classifies EXTENSION_NOT_AUTHENTICATED as a connection failure', () => {
    expect(isWechatSyncConnectionFailure({ code: 'EXTENSION_NOT_AUTHENTICATED' })).toBe(true);
  });

  it('keeps existing connection-failure codes classified as failures', () => {
    expect(isWechatSyncConnectionFailure({ code: 'EXTENSION_NOT_CONNECTED' })).toBe(true);
    expect(isWechatSyncConnectionFailure({ code: 'BRIDGE_UNAVAILABLE' })).toBe(true);
    expect(isWechatSyncConnectionFailure({ code: 'AUTH_FAILED' })).toBe(true);
    expect(isWechatSyncConnectionFailure({ code: 'PLATFORM_LIST_TIMEOUT' })).toBe(true);
  });

  it('does not classify unrelated bridge errors as connection failures', () => {
    expect(isWechatSyncConnectionFailure({ code: 'BRIDGE_REQUEST_TIMEOUT' })).toBe(false);
    expect(isWechatSyncConnectionFailure({ code: 'UNKNOWN_METHOD' })).toBe(false);
    expect(isWechatSyncConnectionFailure({ code: '' })).toBe(false);
    expect(isWechatSyncConnectionFailure({})).toBe(false);
    expect(isWechatSyncConnectionFailure(null)).toBe(false);
    expect(isWechatSyncConnectionFailure(undefined)).toBe(false);
  });
});
