/*
## 核心功能

覆盖 AppleStyleView native render + lifecycle 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步入口、滚动同步、切换文章和关闭清理行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 AppleStyleView 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi, afterEach } from 'vitest';

const {
  AppleStyleView,
  createObsidianLikeElement,
  resetViewTestGlobals,
} = require('./helpers/view-test-helpers.js');

describe('AppleStyleView native render + lifecycle', () => {
  afterEach(() => {
    resetViewTestGlobals(vi);
  });

  it('getDisplayText should keep the unified plugin title', () => {
    const view = new AppleStyleView(null, { settings: {} });
    expect(view.getDisplayText()).toBe('Obsidian 发布助手');
  });

  it('onOpen should render the recent Markdown file even when the new sidebar is active', async () => {
    vi.useFakeTimers();
    const recentFile = {
      path: 'notes/first-open.md',
      basename: 'first-open',
      extension: 'md',
    };
    const view = new AppleStyleView(null, {
      settings: { usePhoneFrame: false },
    });
    view.containerEl.appendChild(createObsidianLikeElement());
    view.containerEl.appendChild(createObsidianLikeElement());
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
        getActiveFile: vi.fn(() => recentFile),
        on: vi.fn(() => ({ eventName: 'registered' })),
      },
      vault: {
        read: vi.fn(async () => '# first open'),
      },
    };
    view.registerEvent = vi.fn();
    vi.spyOn(view, 'loadDependencies').mockImplementation(async () => {
      view.converter = {};
    });
    vi.spyOn(view, 'createSettingsPanel').mockImplementation((container) => {
      view.docTitleText = container.createDiv({ text: '未选择文档' });
    });
    vi.spyOn(view, 'renderMarkdownForPreview').mockResolvedValue('<section><p>first open</p></section>');

    await view.onOpen();

    expect(view.lastActiveFile).toBe(recentFile);
    expect(view.docTitleText.textContent).toBe('first-open');
    expect(view.currentHtml).toBeNull();

    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => {
      expect(view.currentHtml).toContain('first open');
    });

    expect(view.app.vault.read).toHaveBeenCalledWith(recentFile);
    expect(view.previewContainer.classList.contains('apple-has-content')).toBe(true);
  });

  it('onOpen should keep the preview shell when a non-core settings control throws', async () => {
    const recentFile = {
      path: 'notes/settings-failure.md',
      basename: 'settings-failure',
      extension: 'md',
    };
    const view = new AppleStyleView(null, {
      settings: { usePhoneFrame: false },
    });
    view.containerEl.appendChild(createObsidianLikeElement());
    view.containerEl.appendChild(createObsidianLikeElement());
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
        getActiveFile: vi.fn(() => recentFile),
        on: vi.fn(() => ({ eventName: 'registered' })),
      },
      vault: {
        read: vi.fn(async () => '# settings failure'),
      },
    };
    view.registerEvent = vi.fn();
    vi.spyOn(view, 'loadDependencies').mockImplementation(async () => {
      view.converter = {};
    });
    vi.spyOn(view, 'createSettingsPanel').mockImplementation(() => {
      throw new Error('theme API unavailable');
    });

    await view.onOpen();

    expect(view.previewContainer).toBeTruthy();
    expect(view.previewContainer.textContent).toContain('当前面板用于预览微信公众号排版');
    expect(view.docTitleText).toBeNull();
    expect(view.lastActiveFile).toBe(recentFile);
    expect(view.containerEl.children[1].lastElementChild?.classList.contains('apple-preview-wrapper')).toBe(true);
  });

  it('convertCurrent should render native html in silent mode', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => ({
          editor: { getValue: () => '# micro sample' },
          file: { path: 'fixtures/micro.md', basename: 'micro' },
        })),
      },
    };

    vi.spyOn(view, 'renderMarkdownForPreview').mockResolvedValue('<section><p>native</p></section>');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await view.convertCurrent(true);

    expect(view.currentHtml).toBe('<section><p>native</p></section>');
    expect(view.previewContainer.classList.contains('apple-has-content')).toBe(true);
    expect(view.previewContainer.innerHTML).toContain('<p>native</p>');
  });

  it('convertCurrent should invalidate stale html on silent render failure', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.previewContainer.addClass('apple-has-content');
    view.previewContainer.innerHTML = '<section><p>stale</p></section>';
    view.currentHtml = '<section><p>stale</p></section>';
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => ({
          editor: { getValue: () => '# micro sample' },
          file: { path: 'fixtures/micro.md', basename: 'micro' },
        })),
      },
    };

    vi.spyOn(view, 'renderMarkdownForPreview').mockRejectedValue(new Error('native boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await view.convertCurrent(true);

    expect(view.currentHtml).toBeNull();
    expect(view.lastRenderError).toBe('native boom');
    expect(view.previewContainer.classList.contains('apple-has-content')).toBe(false);
    expect(view.previewContainer.textContent).toContain('渲染失败');
    expect(view.previewContainer.textContent).toContain('native boom');
  });

  it('onSyncToWechat should stop before sync when render result is unavailable', async () => {
    const view = new AppleStyleView(null, {
      settings: {
        wechatAccounts: [{ id: 'acc-1', name: '账号1', appId: 'wx-1', appSecret: 'sec-1' }],
        defaultAccountId: 'acc-1',
        proxyUrl: '',
      },
    });
    view.currentHtml = null;
    view.lastRenderError = 'native boom';
    view.selectedAccountId = 'acc-1';

    const processAllImagesSpy = vi.spyOn(view, 'processAllImages');

    await view.onSyncToWechat();

    expect(processAllImagesSpy).not.toHaveBeenCalled();
  });

  it('onClose should detach listeners and clear all view-level caches', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    const removeEditorScroll = vi.fn();
    const removePreviewScroll = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    view.activeEditorScroller = {
      removeEventListener: removeEditorScroll,
    };
    view.editorScrollListener = vi.fn();

    view.previewContainer = createObsidianLikeElement();
    view.previewContainer.innerHTML = '<p>preview</p>';
    view.previewContainer.removeEventListener = removePreviewScroll;
    view.previewScrollListener = vi.fn();

    view.articleStates = new Map([['note-a', { coverBase64: 'x', digest: 'd' }]]);
    view.svgUploadCache = new Map([['svg-hash', 'https://wx/svg.png']]);
    view.imageUploadCache = new Map([['acc-1::app://img', 'https://wx/img.png']]);
    view.coverUploadCache = new Map([['acc-1::cover::app://cover', { mediaId: 'thumb-1', fingerprint: 'fp' }]]);
    view.mermaidImageCache = new Map([['mermaid-hash', { dataUrl: 'data:image/png;base64,abc' }]]);

    await view.onClose();

    expect(removeEditorScroll).toHaveBeenCalledWith('scroll', view.editorScrollListener);
    expect(removePreviewScroll).toHaveBeenCalledWith('scroll', view.previewScrollListener);
    expect(view.previewContainer.innerHTML).toBe('');
    expect(view.articleStates.size).toBe(0);
    expect(view.svgUploadCache.size).toBe(0);
    expect(view.imageUploadCache.size).toBe(0);
    expect(view.coverUploadCache.size).toBe(0);
    expect(view.mermaidImageCache.size).toBe(0);
  });

  it('registerScrollSync should coalesce rapid preview scroll events into one animation frame', () => {
    let scheduledFrame;
    const requestAnimationFrame = vi.fn((callback) => {
      scheduledFrame = callback;
      return 7;
    });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const view = new AppleStyleView(null, { settings: {} });
    Object.defineProperty(view.containerEl, 'offsetParent', { value: {}, configurable: true });

    const editorScroller = createObsidianLikeElement();
    Object.defineProperties(editorScroller, {
      scrollHeight: { value: 2000, configurable: true },
      clientHeight: { value: 200, configurable: true },
    });
    editorScroller.scrollTop = 0;

    view.previewContainer = createObsidianLikeElement();
    Object.defineProperties(view.previewContainer, {
      scrollHeight: { value: 1000, configurable: true },
      clientHeight: { value: 100, configurable: true },
    });
    view.previewContainer.scrollTop = 0;

    view.registerScrollSync({
      contentEl: {
        querySelector: vi.fn(() => editorScroller),
      },
    });

    view.previewContainer.scrollTop = 180;
    view.previewContainer.dispatchEvent(new Event('scroll'));
    view.previewContainer.scrollTop = 270;
    view.previewContainer.dispatchEvent(new Event('scroll'));

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(editorScroller.scrollTop).toBe(0);

    scheduledFrame();

    expect(editorScroller.scrollTop).toBe(540);
  });

  it('registerScrollSync should ignore matching programmatic scroll callbacks without blocking later user scrolls', () => {
    const frames = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => {
      frames.push(callback);
      return frames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const view = new AppleStyleView(null, { settings: {} });
    Object.defineProperty(view.containerEl, 'offsetParent', { value: {}, configurable: true });

    const editorScroller = createObsidianLikeElement();
    Object.defineProperties(editorScroller, {
      scrollHeight: { value: 2000, configurable: true },
      clientHeight: { value: 200, configurable: true },
    });
    editorScroller.scrollTop = 0;

    view.previewContainer = createObsidianLikeElement();
    Object.defineProperties(view.previewContainer, {
      scrollHeight: { value: 1000, configurable: true },
      clientHeight: { value: 100, configurable: true },
    });
    view.previewContainer.scrollTop = 0;

    view.registerScrollSync({
      contentEl: {
        querySelector: vi.fn(() => editorScroller),
      },
    });

    view.previewContainer.scrollTop = 225;
    view.previewContainer.dispatchEvent(new Event('scroll'));
    frames.shift()();
    expect(editorScroller.scrollTop).toBe(450);

    editorScroller.dispatchEvent(new Event('scroll'));
    editorScroller.dispatchEvent(new Event('scroll'));
    expect(frames).toHaveLength(0);

    editorScroller.scrollTop = 900;
    editorScroller.dispatchEvent(new Event('scroll'));
    expect(frames).toHaveLength(1);
    frames.shift()();

    expect(view.previewContainer.scrollTop).toBe(450);
  });

  it('scheduleActiveLeafRender should debounce and call convertCurrent with loading options', async () => {
    vi.useFakeTimers();
    const view = new AppleStyleView(null, { settings: {} });
    view.app = { workspace: { getActiveViewOfType: vi.fn(() => null) } };
    const convertSpy = vi.spyOn(view, 'convertCurrent').mockResolvedValue();

    view.scheduleActiveLeafRender();
    view.scheduleActiveLeafRender();

    expect(convertSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);

    expect(convertSpy).toHaveBeenCalledTimes(1);
    expect(convertSpy).toHaveBeenCalledWith(true, {
      showLoading: true,
      loadingText: '正在切换文章预览...',
      loadingDelay: 120,
      sourceOverride: null,
    });
    expect(view.activeLeafRenderTimer).toBeNull();
  });

  it('active converter leaf should render the workspace recent Markdown file on first use', async () => {
    vi.useFakeTimers();
    let activeLeafHandler;
    const recentFile = {
      path: 'notes/first-use.md',
      basename: 'first-use',
      extension: 'md',
    };
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.converter = {};
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
        getActiveFile: vi.fn(() => recentFile),
        on: vi.fn((eventName, handler) => {
          if (eventName === 'active-leaf-change') activeLeafHandler = handler;
          return { eventName };
        }),
      },
      vault: {
        read: vi.fn(async () => '# first use'),
      },
    };
    view.registerEvent = vi.fn();
    vi.spyOn(view, 'renderMarkdownForPreview').mockResolvedValue('<section><p>first use</p></section>');

    view.registerActiveFileChange();
    await activeLeafHandler({
      view: { getViewType: () => 'apple-style-converter' },
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => {
      expect(view.currentHtml).toContain('first use');
    });

    expect(view.lastActiveFile).toBe(recentFile);
    expect(view.app.vault.read).toHaveBeenCalledWith(recentFile);
    expect(view.previewContainer.classList.contains('apple-has-content')).toBe(true);
  });

  it('active leaf change should refresh AI panel only after preview render settles', async () => {
    vi.useFakeTimers();
    let activeLeafHandler;
    let resolveRender;
    const activeView = {
      editor: { getValue: () => '# next' },
      file: { path: 'fixtures/next.md', basename: 'next' },
    };
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.converter = {};
    view.aiLayoutOverlay = createObsidianLikeElement();
    view.aiLayoutOverlay.addClass('visible');
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => activeView),
        on: vi.fn((eventName, handler) => {
          if (eventName === 'active-leaf-change') activeLeafHandler = handler;
          return { eventName };
        }),
      },
    };
    view.registerEvent = vi.fn();
    vi.spyOn(view, 'registerScrollSync').mockImplementation(() => {});
    vi.spyOn(view, 'renderMarkdownForPreview').mockImplementation(() => new Promise((resolve) => {
      resolveRender = () => resolve('<section><p>next</p></section>');
    }));
    const refreshSpy = vi.spyOn(view, 'refreshAiLayoutPanel').mockImplementation(() => {});

    view.registerActiveFileChange();
    await activeLeafHandler();

    expect(view.renderMarkdownForPreview).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(view.renderMarkdownForPreview).toHaveBeenCalledWith('# next', 'fixtures/next.md');
    expect(refreshSpy).not.toHaveBeenCalled();

    resolveRender();
    await vi.waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });
    vi.clearAllTimers();
  });

  it('scheduleSidePaddingPreview should debounce convertCurrent calls', async () => {
    vi.useFakeTimers();
    const view = new AppleStyleView(null, { settings: {} });
    const convertSpy = vi.spyOn(view, 'convertCurrent').mockResolvedValue();

    view.scheduleSidePaddingPreview(120);
    view.scheduleSidePaddingPreview(120);

    expect(convertSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(119);
    expect(convertSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(convertSpy).toHaveBeenCalledTimes(1);
    expect(convertSpy).toHaveBeenCalledWith(true);
    expect(view.sidePaddingPreviewTimer).toBeNull();
  });

  it('convertCurrent should avoid showing loading class when render finishes before loadingDelay', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => ({
          editor: { getValue: () => '# fast' },
          file: { path: 'fixtures/fast.md', basename: 'fast' },
        })),
      },
    };

    vi.spyOn(view, 'renderMarkdownForPreview').mockResolvedValue('<section><p>fast</p></section>');
    const setLoadingSpy = vi.spyOn(view, 'setPreviewLoading');

    await view.convertCurrent(true, {
      showLoading: true,
      loadingDelay: 150,
      loadingText: 'testing',
    });

    expect(setLoadingSpy).not.toHaveBeenCalledWith(true, 'testing');
    expect(setLoadingSpy).toHaveBeenCalledWith(false);
    expect(view.loadingVisibilityTimer).toBeNull();
    expect(view.previewContainer.classList.contains('apple-preview-loading')).toBe(false);
  });

  it('convertCurrent should reuse last resolved markdown when no active view is available', async () => {
    const activeView = {
      editor: { getValue: () => '# cached markdown' },
      file: { path: 'fixtures/cached.md', basename: 'cached' },
    };
    const getActiveViewOfType = vi
      .fn()
      .mockReturnValueOnce(activeView)
      .mockReturnValueOnce(null);

    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.app = {
      workspace: { getActiveViewOfType },
      vault: { read: vi.fn() },
    };

    const renderSpy = vi
      .spyOn(view, 'renderMarkdownForPreview')
      .mockImplementation(async (markdown) => `<section><p>${markdown}</p></section>`);

    await view.convertCurrent(true);
    await view.convertCurrent(true);

    expect(renderSpy).toHaveBeenNthCalledWith(1, '# cached markdown', 'fixtures/cached.md');
    expect(renderSpy).toHaveBeenNthCalledWith(2, '# cached markdown', 'fixtures/cached.md');
    expect(view.currentHtml).toContain('# cached markdown');
  });

  it('convertCurrent should prefer sourceOverride on note switching path', async () => {
    const getActiveViewOfType = vi.fn(() => null);
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.app = {
      workspace: { getActiveViewOfType },
      vault: { read: vi.fn() },
    };

    const renderSpy = vi
      .spyOn(view, 'renderMarkdownForPreview')
      .mockImplementation(async (markdown) => `<section><p>${markdown}</p></section>`);

    await view.convertCurrent(true, {
      sourceOverride: {
        markdown: '# overridden',
        sourcePath: 'fixtures/override.md',
      },
    });

    expect(renderSpy).toHaveBeenCalledWith('# overridden', 'fixtures/override.md');
    expect(view.app.vault.read).not.toHaveBeenCalled();
    expect(view.currentHtml).toContain('# overridden');
  });

  it('convertCurrent should not expose the new source hash before switched note rendering finishes', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.lastResolvedSourcePath = 'fixtures/old.md';
    view.lastResolvedMarkdown = '# old';
    view.lastResolvedSourceHash = String(view.simpleHash('# old'));
    view.app = {
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'fixtures/new.md', basename: 'new' })),
        getActiveViewOfType: vi.fn(() => null),
      },
    };

    let resolveRender;
    vi.spyOn(view, 'renderMarkdownForPreview').mockImplementation(() => new Promise((resolve) => {
      resolveRender = () => resolve('<section><p>new</p></section>');
    }));

    const renderPromise = view.convertCurrent(true, {
      sourceOverride: {
        markdown: '# new',
        sourcePath: 'fixtures/new.md',
      },
    });

    const pendingContext = view.getCurrentLayoutContext();
    expect(pendingContext.sourcePath).toBe('fixtures/new.md');
    expect(pendingContext.sourceHash).toBe('');
    expect(pendingContext.isSourcePending).toBe(true);

    resolveRender();
    await renderPromise;

    const settledContext = view.getCurrentLayoutContext();
    expect(settledContext.sourceHash).toBe(String(view.simpleHash('# new')));
    expect(settledContext.isSourcePending).toBe(false);
  });

  it('convertCurrent should skip AI panel refresh when AI UI is inactive', async () => {
    const activeView = {
      editor: { getValue: () => '# 普通预览' },
      file: { path: 'fixtures/plain.md', basename: 'plain' },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          providers: [],
          articleLayoutsByPath: {},
        },
      },
      getArticleLayoutState: vi.fn(() => ({
        sourceHash: '123',
        layoutJson: { blocks: [{ type: 'hero', title: 'AI' }] },
      })),
    });
    view.previewContainer = createObsidianLikeElement();
    view.aiLayoutOverlay = createObsidianLikeElement();
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => activeView),
      },
    };
    view.aiPreviewApplied = false;
    view.aiLayoutLoading = false;

    const refreshSpy = vi.spyOn(view, 'refreshAiLayoutPanel').mockImplementation(() => {});
    vi.spyOn(view, 'renderMarkdownForPreview').mockResolvedValue('<section><p>plain</p></section>');

    await view.convertCurrent(true);

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(view.plugin.getArticleLayoutState).not.toHaveBeenCalled();
  });

  it('convertCurrent should refresh AI panel when AI panel is visible', async () => {
    const activeView = {
      editor: { getValue: () => '# AI 面板' },
      file: { path: 'fixtures/ai.md', basename: 'ai' },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          providers: [],
          articleLayoutsByPath: {},
        },
      },
      getArticleLayoutState: vi.fn(() => null),
    });
    view.previewContainer = createObsidianLikeElement();
    view.aiLayoutOverlay = createObsidianLikeElement();
    view.aiLayoutOverlay.addClass('visible');
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => activeView),
      },
    };

    const refreshSpy = vi.spyOn(view, 'refreshAiLayoutPanel').mockImplementation(() => {});
    vi.spyOn(view, 'renderMarkdownForPreview').mockResolvedValue('<section><p>ai</p></section>');

    await view.convertCurrent(true);

    expect(refreshSpy).toHaveBeenCalled();
  });

  it('onClose should clear active leaf/loading/side-padding timers', async () => {
    vi.useFakeTimers();
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    const convertSpy = vi.spyOn(view, 'convertCurrent').mockResolvedValue();

    view.scheduleActiveLeafRender();
    view.scheduleSidePaddingPreview(120);
    view.loadingVisibilityTimer = setTimeout(() => {}, 200);
    view.aiLayoutStaleSuppressTimer = setTimeout(() => {}, 200);

    await view.onClose();
    await vi.runAllTimersAsync();

    expect(convertSpy).not.toHaveBeenCalled();
    expect(view.activeLeafRenderTimer).toBeNull();
    expect(view.sidePaddingPreviewTimer).toBeNull();
    expect(view.loadingVisibilityTimer).toBeNull();
    expect(view.aiLayoutStaleSuppressTimer).toBeNull();
  });
});
