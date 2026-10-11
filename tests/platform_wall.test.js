/*
## 核心功能

覆盖平台照片墙 (Platform Wall) 与多平台设置通用 Section Header 的单元测试。

## 输入

测试平台数据列表、模拟 DOM 容器。

## 输出

测试断言结果，确保平台列表严格剔除微信与飞书，DOM 结构符合规范且容灾降级有效。

## 定位

位于 tests/，是多平台发布设置的视图与逻辑契约测试。
*/

import { describe, it, expect } from 'vitest';
import {
  getMultiPlatformWallList,
  renderPlatformWall,
  renderSectionHeader,
} from '../views/settings/platform-wall.js';
const { createObsidianLikeElement } = require('./helpers/obsidian-dom.js');

describe('platform-wall', () => {
  describe('getMultiPlatformWallList', () => {
    it('严格剔除微信 (weixin/wechat) 与飞书 (feishu) 及其变体，动态返回全部第三方平台', () => {
      const list = getMultiPlatformWallList();
      const expectedCount = list.length;
      expect(expectedCount).toBeGreaterThan(0);

      const ids = list.map((p) => p.id.toLowerCase());
      expect(ids).not.toContain('weixin');
      expect(ids).not.toContain('wechat');
      expect(ids).not.toContain('feishu');

      // 验证包含常见主流自媒体与技术社区
      expect(ids).toContain('xiaohongshu');
      expect(ids).toContain('zhihu');
      expect(ids).toContain('bilibili');
      expect(ids).toContain('juejin');
      expect(ids).toContain('csdn');
    });

    it('自定义平台列表中包含微信或飞书变体（如 wechatmp、weixin-mp、feishu-doc）时也能归一化过滤', () => {
      const custom = [
        { id: 'weixin', name: '微信公众号' },
        { id: 'wechatmp', name: '微信公众号变体' },
        { id: 'weixin-mp', name: '微信变体2' },
        { id: 'feishu', name: '飞书文档' },
        { id: 'feishu-open', name: '飞书变体' },
        { id: 'zhihu', name: '知乎' },
        { id: 'wechat', name: '微信' },
      ];
      const result = getMultiPlatformWallList(custom);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('zhihu');
    });
  });

  describe('renderSectionHeader', () => {
    it('正确渲染统一样式的 Section Header，包含原生 Lucide 图标与文本', () => {
      const container = createObsidianLikeElement('div');
      const header = renderSectionHeader(container, 'share-2', '测试标题');

      expect(header.className).toContain('apple-settings-about-section-header');
      const icon = header.querySelector('.apple-settings-about-section-icon');
      expect(icon).not.toBeNull();
      expect(header.textContent).toContain('测试标题');
    });
  });

  describe('renderPlatformWall', () => {
    it('渲染照片墙卡片、统计徽标与动态派生的全部平台 Tile 栅格', () => {
      const container = createObsidianLikeElement('div');
      const card = renderPlatformWall(container);
      const expectedCount = getMultiPlatformWallList().length;

      expect(card.className).toContain('wechat-platform-wall-card');
      const badge = card.querySelector('.wechat-platform-wall-badge');
      expect(badge?.textContent).toBe(`${expectedCount} 平台矩阵`);

      const title = card.querySelector('.wechat-platform-wall-title');
      expect(title?.textContent).toContain(`${expectedCount} 个主流平台`);

      const tiles = card.querySelectorAll('.wechat-platform-wall-tile');
      expect(tiles.length).toBe(expectedCount);

      // 验证每个 Tile 都有名字与图标容器
      tiles.forEach((tile) => {
        const nameEl = tile.querySelector('.wechat-platform-wall-name');
        expect(nameEl?.textContent).toBeTruthy();
        const iconWrap = tile.querySelector('.wechat-platform-wall-icon-wrap');
        expect(iconWrap).not.toBeNull();
      });
    });

    it('内置官方平台优先采用离线内嵌 Base64 图标（0网络请求/0IP泄露）', () => {
      const container = createObsidianLikeElement('div');
      const customPlatforms = [{ id: 'zhihu', name: '知乎' }];
      const card = renderPlatformWall(container, { platforms: customPlatforms });

      const img = card.querySelector('img.wechat-platform-wall-icon');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toMatch(/^data:image\//);
    });

    it('当非内置平台外部图片加载失败时能经 DuckDuckGo 二级回退并最终降级为首字符微标', () => {
      const container = createObsidianLikeElement('div');
      const customPlatforms = [{ id: 'custom_blog', name: '技术博客', homepage: 'https://example.com' }];
      const card = renderPlatformWall(container, { platforms: customPlatforms });

      const img = card.querySelector('img.wechat-platform-wall-icon');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toContain('icons.duckduckgo.com');

      // 失败后最终降级为首字符微标
      if (typeof img?.onerror === 'function') {
        img.onerror();
      }
      const letterFallback = card.querySelector('.wechat-platform-wall-letter');
      expect(letterFallback).not.toBeNull();
      expect(letterFallback?.textContent).toBe('技');
    });

    it('支持可交互勾选模式 (selectable: true)，正确渲染复选框与登录状态徽标，并在勾选时刷新徽标', () => {
      const container = createObsidianLikeElement('div');
      const customPlatforms = [{ id: 'zhihu', name: '知乎' }, { id: 'juejin', name: '掘金' }];
      const selectedSet = new Set(['zhihu']);

      let statusQueryCount = 0;
      const card = renderPlatformWall(container, {
        selectable: true,
        platforms: customPlatforms,
        selectedSet,
        getAuthBadge: (p) => {
          statusQueryCount++;
          return p.id === 'zhihu' ? { text: '上次可用', cls: 'is-ok' } : { text: '需登录', cls: 'is-error' };
        },
      });

      expect(card.className).toContain('is-selectable');
      const chips = card.querySelectorAll('.wechat-platform-chip');
      expect(chips.length).toBe(2);

      const zhihuChip = card.querySelector('.wechat-platform-chip.is-selected');
      expect(zhihuChip).not.toBeNull();
      const zhihuInput = zhihuChip?.querySelector('input');
      expect(zhihuInput?.checked).toBe(true);
      expect(zhihuChip?.querySelector('.wechat-platform-chip-status')?.textContent).toBe('上次可用');

      // 切换勾选掘金
      const juejinChip = chips[1];
      const juejinInput = juejinChip.querySelector('input');
      juejinInput.checked = true;
      if (typeof juejinInput.onchange === 'function') {
        juejinInput.onchange();
      }
      expect(selectedSet.has('juejin')).toBe(true);
      expect(juejinChip.className).toContain('is-selected');
      expect(statusQueryCount).toBeGreaterThan(2);
    });

    it('默认折叠 3 行（前 9 个），支持点击展开更多与收起，且已勾选项始终常驻不被折叠', () => {
      const container = createObsidianLikeElement('div');
      // 创建 15 个平台，并将第 12 个（索引 11）设为勾选
      const platforms = Array.from({ length: 15 }, (_, i) => ({
        id: `plat_${i + 1}`,
        name: `平台 ${i + 1}`,
      }));
      const selectedSet = new Set(['plat_12']);

      const card = renderPlatformWall(container, {
        selectable: true,
        platforms,
        selectedSet,
      });

      const tiles = card.querySelectorAll('.wechat-platform-wall-tile');
      expect(tiles.length).toBe(15);

      // 验证收起态：前 9 项显示；第 10~15 项中，除了已勾选的 plat_12，其余都带有 is-collapsed-hidden
      const hiddenTiles = card.querySelectorAll('.is-collapsed-hidden');
      expect(hiddenTiles.length).toBe(5); // 15 - 9 - 1 (plat_12) = 5 项被隐藏

      const plat12Tile = tiles[11];
      expect(plat12Tile.className).not.toContain('is-collapsed-hidden');
      expect(plat12Tile.className).toContain('is-selected');

      const expandBtn = card.querySelector('.wechat-platform-wall-expand-btn');
      expect(expandBtn).not.toBeNull();
      expect(expandBtn?.textContent).toContain('展开更多平台 (共 15 个) ▾');

      // 点击展开
      expandBtn?.click();
      const hiddenAfterExpand = card.querySelectorAll('.is-collapsed-hidden');
      expect(hiddenAfterExpand.length).toBe(0);
      expect(expandBtn?.textContent).toBe('收起 ▴');

      // 再次点击收起
      expandBtn?.click();
      const hiddenAfterCollapse = card.querySelectorAll('.is-collapsed-hidden');
      expect(hiddenAfterCollapse.length).toBe(5);
      expect(expandBtn?.textContent).toContain('展开更多平台 (共 15 个) ▾');
    });

    it('在 selectable 模式下渲染头部就近刷新状态按钮（含图标与文案），并联动 onRefreshAuth 回调', async () => {
      const container = createObsidianLikeElement('div');
      let refreshCalled = false;
      let resolveRefresh;
      const refreshPromise = new Promise((resolve) => {
        resolveRefresh = resolve;
      });

      const card = renderPlatformWall(container, {
        selectable: true,
        platforms: [{ id: 'zhihu', name: '知乎' }],
        onRefreshAuth: async () => {
          refreshCalled = true;
          await refreshPromise;
        },
      });

      const refreshBtn = card.querySelector('.wechat-platform-wall-refresh-btn');
      expect(refreshBtn).not.toBeNull();
      expect(refreshBtn?.textContent).toContain('刷新已选状态');
      expect(refreshBtn?.querySelector('.wechat-platform-wall-refresh-icon')).not.toBeNull();

      // 触发刷新
      const clickPromise = refreshBtn?.onclick();
      expect(refreshBtn?.disabled).toBe(true);
      expect(refreshBtn?.className).toContain('is-loading');
      expect(refreshBtn?.textContent).toContain('刷新中...');
      expect(refreshCalled).toBe(true);

      // 结束刷新
      resolveRefresh();
      await clickPromise;

      expect(refreshBtn?.disabled).toBe(false);
      expect(refreshBtn?.className).not.toContain('is-loading');
      expect(refreshBtn?.textContent).toContain('刷新已选状态');
    });
  });
});
