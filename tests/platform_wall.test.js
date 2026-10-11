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
    it('严格剔除微信 (weixin/wechat) 与飞书 (feishu)，返回 27 个第三方平台', () => {
      const list = getMultiPlatformWallList();
      expect(list.length).toBe(27);

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

    it('自定义平台列表中包含微信或飞书时也能正确过滤', () => {
      const custom = [
        { id: 'weixin', name: '微信公众号' },
        { id: 'feishu', name: '飞书文档' },
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
    it('渲染照片墙卡片、统计徽标与 27 个平台 Tile 栅格', () => {
      const container = createObsidianLikeElement('div');
      const card = renderPlatformWall(container);

      expect(card.className).toContain('wechat-platform-wall-card');
      const badge = card.querySelector('.wechat-platform-wall-badge');
      expect(badge?.textContent).toBe('27 平台矩阵');

      const title = card.querySelector('.wechat-platform-wall-title');
      expect(title?.textContent).toContain('27 个主流平台');

      const tiles = card.querySelectorAll('.wechat-platform-wall-tile');
      expect(tiles.length).toBe(27);

      // 验证每个 Tile 都有名字与图标容器
      tiles.forEach((tile) => {
        const nameEl = tile.querySelector('.wechat-platform-wall-name');
        expect(nameEl?.textContent).toBeTruthy();
        const iconWrap = tile.querySelector('.wechat-platform-wall-icon-wrap');
        expect(iconWrap).not.toBeNull();
      });
    });

    it('当图片加载失败 (onerror) 时能降级渲染首字符徽标', () => {
      const container = createObsidianLikeElement('div');
      const customPlatforms = [{ id: 'zhihu', name: '知乎' }];
      const card = renderPlatformWall(container, { platforms: customPlatforms });

      const img = card.querySelector('img.wechat-platform-wall-icon');
      expect(img).not.toBeNull();

      // 触发 onerror 回退
      if (typeof img.onerror === 'function') {
        img.onerror();
      }

      const letterFallback = card.querySelector('.wechat-platform-wall-letter');
      expect(letterFallback).not.toBeNull();
      expect(letterFallback?.textContent).toBe('知');
    });
  });
});
