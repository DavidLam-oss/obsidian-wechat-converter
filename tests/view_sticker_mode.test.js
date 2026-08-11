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
const { createObsidianLikeElement } = require('./helpers/obsidian-dom.js');

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

  it('should describe semantic conversions with user-facing labels', async () => {
    const leaf = { view: null };
    const plugin = { settings: { wechatAccounts: [] } };
    const view = new AppleStyleView(leaf, plugin);
    view.previewMode = 'sticker';
    view.previewContainer = createObsidianLikeElement();
    view.buildStickerData = vi.fn().mockResolvedValue({
      title: '测试',
      content: '正文',
      imageItems: [],
      imageDisplaySources: [],
      sourcePath: 'test.md',
      removed: [
        { kind: 'codeBlocks', count: 1 },
        { kind: 'tables', count: 2 },
      ],
    });
    view.getStickerUiState = vi.fn().mockReturnValue({
      order: [],
      removedKeys: [],
      undoItems: [],
    });

    await view.renderStickerPreview();

    expect(view.previewContainer.querySelector('.apple-sticker-notice-title')?.textContent)
      .toBe('已转换：代码块 1 处、表格 2 处');
    expect(view.previewContainer.querySelector('.apple-sticker-notice-desc')?.textContent)
      .toBe('内容已转换为适合贴图的纯文本，不会改动笔记原文。');
    expect(view.previewContainer.querySelector('.apple-sticker-notice-icon')).toBeNull();
  });

  it('should collapse the image section into a blocking notice when no image exists', async () => {
    const leaf = { view: null };
    const plugin = { settings: { wechatAccounts: [] } };
    const view = new AppleStyleView(leaf, plugin);
    view.previewMode = 'sticker';
    view.previewContainer = createObsidianLikeElement();
    view.buildStickerData = vi.fn().mockResolvedValue({
      title: '测试',
      content: '正文',
      imageItems: [],
      imageDisplaySources: [],
      sourcePath: 'test.md',
      removed: [],
    });
    view.getStickerUiState = vi.fn().mockReturnValue({
      order: [],
      removedKeys: [],
      undoItems: [],
    });

    await view.renderStickerPreview();

    expect(view.previewContainer.querySelector('.apple-sticker-images-section')).toBeNull();
    expect(view.previewContainer.querySelector('.sticker-image-list')).toBeNull();
    expect(view.previewContainer.querySelector('.apple-sticker-readiness-notice')?.textContent)
      .toContain('还缺 1 张图片');
    expect(view.previewContainer.querySelector('.apple-sticker-text-heading')?.textContent)
      .toContain('发布文案将以纯文本同步到微信草稿');
  });

  it('should place the image-order hint between the image header and grid', async () => {
    const leaf = { view: null };
    const plugin = { settings: { wechatAccounts: [] } };
    const view = new AppleStyleView(leaf, plugin);
    view.previewMode = 'sticker';
    view.previewContainer = createObsidianLikeElement();
    view.buildStickerData = vi.fn().mockResolvedValue({
      title: '测试',
      content: '正文',
      imageItems: [{ key: 'body:test.png', source: 'body', src: 'test.png', name: 'test.png' }],
      imageDisplaySources: ['app://local/test.png'],
      sourcePath: 'test.md',
      removed: [],
    });
    view.getStickerUiState = vi.fn().mockReturnValue({
      order: ['body:test.png'],
      removedKeys: [],
      undoItems: [],
    });

    await view.renderStickerPreview();

    const imageSection = view.previewContainer.querySelector('.apple-sticker-images-section');
    const children = Array.from(imageSection.children);
    const headerIndex = children.indexOf(imageSection.querySelector('.apple-sticker-section-header'));
    const hintIndex = children.indexOf(imageSection.querySelector('.apple-sticker-hint-line'));
    const gridIndex = children.indexOf(imageSection.querySelector('.sticker-image-list'));
    expect(headerIndex).toBeLessThan(hintIndex);
    expect(hintIndex).toBeLessThan(gridIndex);
    expect(imageSection.querySelector('.apple-sticker-hint-icon')).toBeNull();
  });

  it('should keep the image list to two rows until the user expands it', async () => {
    const leaf = { view: null };
    const plugin = { settings: { wechatAccounts: [] } };
    const view = new AppleStyleView(leaf, plugin);
    const imageItems = Array.from({ length: 20 }, (_, index) => ({
      key: `body:image-${index + 1}.png`,
      source: 'body',
      src: `image-${index + 1}.png`,
      name: `image-${index + 1}.png`,
    }));
    const uiState = {
      order: imageItems.map((item) => item.key),
      removedKeys: [],
      undoItems: [],
      imageListExpanded: false,
    };
    view.previewMode = 'sticker';
    view.previewContainer = createObsidianLikeElement();
    view.buildStickerData = vi.fn().mockResolvedValue({
      title: '测试',
      content: '正文',
      imageItems,
      imageDisplaySources: imageItems.map((_, index) => `app://local/image-${index + 1}.png`),
      sourcePath: 'test.md',
      removed: [],
    });
    view.getStickerUiState = vi.fn().mockReturnValue(uiState);

    await view.renderStickerPreview();

    const cells = Array.from(view.previewContainer.querySelectorAll('.sticker-image-list__item'));
    const toggle = view.previewContainer.querySelector('.sticker-image-list__toggle');
    expect(cells).toHaveLength(20);
    expect(cells.filter((cell) => !cell.hidden)).toHaveLength(6);
    expect(toggle?.textContent).toBe('展开全部 20 张');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    toggle.click();

    expect(cells.every((cell) => !cell.hidden)).toBe(true);
    expect(toggle.textContent).toBe('收起到 2 行');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(uiState.imageListExpanded).toBe(true);
  });
});
