/*
## 核心功能

覆盖自定义 CSS 从干净基础 HTML 到普通预览、微信草稿、AI 隔离、多平台隔离和热刷新提交的端到端合同。

## 输入

接收模拟插件设置、vault 笔记和文章 HTML。

## 输出

输出来源、编译、内联、回退和目标隔离的联合断言。

## 定位

位于 tests/，覆盖自定义 CSS 主链路集成行为。

## 依赖

Vitest、jsdom 及自定义 CSS source/compiler/inliner 服务。

## 维护规则

主链路阶段或回退策略变化时必须同步覆盖成功与失败路径。
*/

import { describe, expect, it, vi } from 'vitest';

const { AppleStyleView } = require('./helpers/view-test-helpers.js');

const BASE_HTML = '<section class="owc-article-root"><h2>标题</h2><p>正文</p></section>';
const CSS = 'h2::before { content: "§"; color: red; } p { color: rgb(232, 74, 74) !important; }';

function createView() {
  const view = new AppleStyleView(null, {
    settings: {
      enableCustomCss: true,
      customCss: CSS,
      customCssNote: '',
      macCodeBlock: false,
      codeLineNumber: false,
    },
  });
  view.baseRenderedHtml = BASE_HTML;
  view.currentHtml = BASE_HTML;
  view.lastResolvedSourceHash = 'article-1';
  view.aiPreviewApplied = false;
  return view;
}

function countPseudo(html) {
  return (String(html).match(/pseudo-h2-num/g) || []).length;
}

describe('custom CSS end-to-end', () => {
  it('base 保持干净，普通预览和草稿各自只应用一次', async () => {
    const view = createView();

    const preview = await view.deriveNativePreviewHtml(view.baseRenderedHtml);
    view.currentHtml = preview;
    expect(view.baseRenderedHtml).toBe(BASE_HTML);
    expect(countPseudo(preview)).toBe(1);
    expect(preview).toContain('color: rgb(232, 74, 74) !important');

    const source = view.resolveArticleHtmlSource({ target: 'wechat-draft' });
    expect(source).toMatchObject({ html: BASE_HTML, layoutMode: 'native', sourceKind: 'base' });
    const draft = await view.prepareHtmlForWechatDraft(source.html, {
      layoutMode: source.layoutMode,
    });
    expect(countPseudo(draft)).toBe(1);
  });

  it('多平台使用干净 base，不消费已经套用 CSS 的 currentHtml', async () => {
    const view = createView();
    view.currentHtml = await view.deriveNativePreviewHtml(BASE_HTML);
    expect(countPseudo(view.currentHtml)).toBe(1);

    const source = view.resolveArticleHtmlSource({ target: 'multi-platform' });
    expect(source).toMatchObject({ html: BASE_HTML, layoutMode: 'native', sourceKind: 'base' });
    expect(countPseudo(source.html)).toBe(0);
    expect(source.html).not.toContain('rgb(232, 74, 74)');
  });

  it('AI 模式明确跳过自定义 CSS', async () => {
    const view = createView();
    view.aiPreviewApplied = true;
    const html = '<section data-ai-layout="true"><p>AI 正文</p></section>';

    await expect(view.applyCustomCss(html, {
      target: 'wechat-copy',
      layoutMode: 'ai',
    })).resolves.toBe(html);
    expect(view.customCssStatus.state).toBe('ai-skipped');
  });

  it('同一来源 CSS 暂时无效时继续使用当前会话上一份有效结果', async () => {
    const view = createView();
    const valid = await view.deriveNativePreviewHtml(BASE_HTML);
    expect(countPseudo(valid)).toBe(1);

    view.plugin.settings.customCss = 'h2 { color: red;';
    const fallback = await view.deriveNativePreviewHtml(BASE_HTML);
    expect(countPseudo(fallback)).toBe(1);
    expect(view.customCssStatus.usingLastValid).toBe(true);
    expect(view.customCssStatus.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'fatal', code: 'custom-css-parse-failed' }),
    ]));
  });

  it('连续热刷新只允许最新 generation 提交，并保持滚动位置', async () => {
    const view = createView();
    const preview = document.createElement('div');
    preview.scrollTop = 128;
    preview.addClass = (...names) => preview.classList.add(...names);
    view.previewContainer = preview;
    view.syncPreviewPresentationMode = vi.fn();

    let resolveFirst;
    let resolveSecond;
    view.deriveNativePreviewHtml = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));

    const firstRefresh = view.refreshCustomCssPreview();
    const secondRefresh = view.refreshCustomCssPreview();
    resolveSecond('<p>new</p>');
    await expect(secondRefresh).resolves.toBe(true);
    resolveFirst('<p>old</p>');
    await expect(firstRefresh).resolves.toBe(false);

    expect(view.currentHtml).toBe('<p>new</p>');
    expect(preview.innerHTML).toBe('<p>new</p>');
    expect(preview.scrollTop).toBe(128);
  });
});
