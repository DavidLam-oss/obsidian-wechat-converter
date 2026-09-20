/*
## 核心功能

保护「切换预览模式时，在途的文章渲染不得覆盖新模式预览」这一时序契约。

## 输入

接收 mock 的 Obsidian 运行时、受控 Promise 模拟的慢速文章渲染，以及三种模式切换操作。

## 输出

输出模式切换后预览区归属（贴图/卡片/文章）的自动化断言。

## 定位

位于 tests/，保护 panel-shell 的 switchPreviewMode 与 core 的 convertCurrent 提交守卫之间的协作。

## 依赖

关键依赖：Vitest、tests/helpers/input-module.cjs、tests/helpers/obsidian-dom.js。

## 维护规则

- 提交守卫的条件、模式切换的作废语义变化时同步更新断言。
- 断言以「预览区最终归属哪个模式的容器」为准，不依赖内部 generation 数值。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');
const { createObsidianLikeElement } = require('./helpers/obsidian-dom.js');

/** 装配一个可切换模式、可注入受控文章渲染的视图 */
function makeView(AppleStyleView) {
  const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
  view.containerEl = createObsidianLikeElement();
  view.previewContainer = createObsidianLikeElement();
  view.previewContainer.scrollTop = 0;
  view.lastResolvedMarkdown = '';
  view.lastResolvedSourcePath = '';
  view.lastResolvedSourceHash = '';
  view.simpleHash = () => 'h1';
  view.updateCurrentDoc = () => {};
  view.syncPreviewPresentationMode = () => {};
  view.completeAiLayoutSourceSwitch = () => {};
  view.shouldSyncAiLayoutUi = () => false;

  view.btnArticleMode = createObsidianLikeElement('button');
  view.btnArticleMode.classList.add('active');
  view.btnStickerMode = createObsidianLikeElement('button');
  view.btnCardMode = createObsidianLikeElement('button');

  view.getStickerUiState = vi.fn(() => ({ order: [], removedKeys: [], undoItems: [], manualItems: [] }));
  view.buildStickerData = vi.fn(async () => ({
    title: '贴图标题',
    content: '贴图正文',
    imageItems: [],
    imageDisplaySources: [],
    sourcePath: 'a.md',
    removed: [],
  }));
  view.cardPreviewPendingInput = { markdown: '# 标题\n\n正文', sourcePath: 'a.md', sourcePathKey: 'a.md' };
  view.renderCardPreview = vi.fn(async () => {
    view.previewContainer.empty();
    view.previewContainer.createEl('div', { cls: 'icard-preview-shell', text: '卡片预览' });
  });
  return view;
}

/** 受控的文章渲染：返回一个可手动放行的 Promise */
function gateArticleRender(view) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  view.renderMarkdownForPreview = vi.fn(async () => {
    await gate;
    return '<p class="from-article-render">文章渲染结果</p>';
  });
  view.deriveNativePreviewHtml = vi.fn(async (html) => html);
  return () => release();
}

function startArticleRender(view) {
  return view.convertCurrent(true, {
    sourceOverride: { markdown: '# 标题\n\n正文', sourcePath: 'a.md' },
  });
}

describe('预览模式切换：在途文章渲染不得覆盖新模式预览', () => {
  let AppleStyleView;

  beforeEach(() => {
    vi.resetModules();
    const obsidianMock = require('obsidian');
    obsidianMock.requestUrl = vi.fn().mockResolvedValue({ json: {}, status: 200 });
    obsidianMock.setIcon = () => {};
    AppleStyleView = loadInputModule().AppleStyleView;
  });

  it('切到贴图模式后，先前的文章渲染落地时不覆盖贴图预览', async () => {
    const view = makeView(AppleStyleView);
    const release = gateArticleRender(view);
    const inFlight = startArticleRender(view);
    await new Promise((r) => setTimeout(r, 5));

    view.switchPreviewMode('sticker');
    await new Promise((r) => setTimeout(r, 20));
    expect(view.previewContainer.querySelector('.apple-sticker-preview-wrapper')).toBeTruthy();

    // 放行在途的文章渲染——它必须已经失效
    release();
    await inFlight;
    await new Promise((r) => setTimeout(r, 10));

    expect(view.previewMode).toBe('sticker');
    expect(view.previewContainer.querySelector('.from-article-render')).toBeNull();
    expect(view.previewContainer.querySelector('.apple-sticker-preview-wrapper')).toBeTruthy();
  });

  it('切到卡片模式后，先前的文章渲染落地时不覆盖卡片预览', async () => {
    const view = makeView(AppleStyleView);
    const release = gateArticleRender(view);
    const inFlight = startArticleRender(view);
    await new Promise((r) => setTimeout(r, 5));

    view.switchPreviewMode('card');
    await new Promise((r) => setTimeout(r, 20));
    expect(view.previewContainer.querySelector('.icard-preview-shell')).toBeTruthy();

    release();
    await inFlight;
    await new Promise((r) => setTimeout(r, 10));

    expect(view.previewMode).toBe('card');
    expect(view.previewContainer.querySelector('.from-article-render')).toBeNull();
    expect(view.previewContainer.querySelector('.icard-preview-shell')).toBeTruthy();
  });

  it('模式切换会作废在途渲染：切换后旧的 generation 不再被接受', async () => {
    const view = makeView(AppleStyleView);
    const release = gateArticleRender(view);
    const before = Number(view.renderGeneration) || 0;
    const inFlight = startArticleRender(view);
    await new Promise((r) => setTimeout(r, 5));

    view.switchPreviewMode('sticker');

    // 作废与提交守卫一道保证旧结果不落地（此处也验证 generation 前进）
    release();
    await inFlight;
    expect(Number(view.renderGeneration)).toBeGreaterThan(before + 1);
    expect(view.previewContainer.querySelector('.apple-sticker-preview-wrapper')).toBeTruthy();
  });

  it('仍在文章模式时，文章渲染照常落地（守卫不过度拦截）', async () => {
    const view = makeView(AppleStyleView);
    const release = gateArticleRender(view);
    const inFlight = startArticleRender(view);
    await new Promise((r) => setTimeout(r, 5));

    release();
    await inFlight;

    expect(view.previewMode).toBe('article');
    expect(view.previewContainer.querySelector('.from-article-render')).toBeTruthy();
    expect(view.lastResolvedMarkdown).toBe('# 标题\n\n正文');
  });
});
