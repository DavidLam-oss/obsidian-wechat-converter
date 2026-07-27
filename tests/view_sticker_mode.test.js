/*
## 核心功能

验证 AppleStyleView 在文章与微信贴图预览模式之间切换的集成行为。

## 输入

接收 mock 的 Obsidian 运行时、插件设置与模式切换操作。

## 输出

输出默认模式和切换后渲染入口的自动化断言。

## 定位

位于 tests/，保护贴图模式的视图入口与基础状态。

## 依赖

关键依赖：Vitest、tests/helpers/input-module.cjs 与 AppleStyleView。

## 维护规则

- 模式入口、默认状态或渲染分支变化时同步更新断言。
- 保持运行时 mock 最小化，不在测试中启动真实 Obsidian。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');

describe('AppleStyleView - Sticker Mode Integration', () => {
  let AppleStyleView;
  let obsidianMock;

  beforeEach(() => {
    vi.resetModules();
    obsidianMock = require('obsidian');
    obsidianMock.requestUrl = vi.fn().mockResolvedValue({
      json: { media_id: 'draft-123' },
      status: 200
    });

    const inputModule = loadInputModule();
    AppleStyleView = inputModule.AppleStyleView;
  });

  it('should initialize with default previewMode as article', () => {
    const leaf = { view: null };
    const plugin = { settings: { wechatAccounts: [] } };
    const view = new AppleStyleView(leaf, plugin);

    expect(view.previewMode).toBe('article');
  });

  it('should toggle previewMode between article and sticker', () => {
    const leaf = { view: null };
    const plugin = { settings: { wechatAccounts: [] } };
    const view = new AppleStyleView(leaf, plugin);

    view.convertCurrent = vi.fn();
    view.renderStickerPreview = vi.fn();
    view.closeTransientPanels = vi.fn();

    view.switchPreviewMode('sticker');
    expect(view.previewMode).toBe('sticker');
    expect(view.renderStickerPreview).toHaveBeenCalled();

    view.switchPreviewMode('article');
    expect(view.previewMode).toBe('article');
    expect(view.convertCurrent).toHaveBeenCalled();
  });
});
