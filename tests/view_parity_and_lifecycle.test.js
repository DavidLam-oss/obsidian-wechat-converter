/*
## 核心功能

覆盖 view parity and lifecycle 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 view parity and lifecycle 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi, afterEach } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');
const inputModule = loadInputModule();
const AppleStylePlugin = inputModule.default;
const { AppleStyleView } = inputModule;

function createObsidianLikeElement(tag = 'div') {
  const el = document.createElement(tag);
  el.empty = function empty() {
    this.innerHTML = '';
  };
  el.setText = function setText(text) {
    this.textContent = text;
  };
  el.addClass = function addClass(cls) {
    this.classList.add(cls);
  };
  el.removeClass = function removeClass(cls) {
    this.classList.remove(cls);
  };
  el.createEl = function createEl(childTag, opts = {}) {
    const child = createObsidianLikeElement(childTag);
    if (opts.cls) child.className = opts.cls;
    if (opts.text) child.textContent = opts.text;
    if (opts.attr && typeof opts.attr === 'object') {
      Object.entries(opts.attr).forEach(([k, v]) => {
        child.setAttribute(k, String(v));
      });
    }
    if (opts.type) child.setAttribute('type', String(opts.type));
    if (opts.value !== undefined) child.value = String(opts.value);
    if (opts.placeholder) child.setAttribute('placeholder', String(opts.placeholder));
    if (opts.title) child.setAttribute('title', String(opts.title));
    this.appendChild(child);
    return child;
  };
  el.createDiv = function createDiv(opts = {}) {
    return this.createEl('div', opts);
  };
  return el;
}

describe('AppleStyleView native render + lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (Array.isArray(globalThis.__obsidianNoticeRegistry)) {
      globalThis.__obsidianNoticeRegistry.length = 0;
    }
  });

  function installNoticeCapture() {
    globalThis.__obsidianNoticeRegistry = [];
    return globalThis.__obsidianNoticeRegistry;
  }

  it('getDisplayText should keep the unified plugin title', () => {
    const view = new AppleStyleView(null, { settings: {} });
    expect(view.getDisplayText()).toBe('Obsidian 发布助手');
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
    await Promise.resolve();

    expect(refreshSpy).toHaveBeenCalledTimes(1);
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

  it('createSettingsPanel should keep mobile DOM state aligned (overlay + actions)', () => {
    const view = new AppleStyleView(null, {
      settings: {
        theme: 'github',
        themeColor: 'blue',
        customColor: '#0366d6',
        fontFamily: 'sans-serif',
        fontSize: 3,
        coloredHeader: false,
        macCodeBlock: true,
        codeLineNumber: true,
        sidePadding: 16,
        showImageCaption: true,
        enableWatermark: false,
      },
      saveSettings: vi.fn(),
    });
    view.app = { isMobile: true };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };

    global.AppleTheme = {
      getThemeList: () => [
        { value: 'github', label: '简约' },
        { value: 'wechat', label: '经典' },
      ],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    container.addClass('apple-converter-mobile');
    view.createSettingsPanel(container);

    expect(container.querySelector('.apple-top-toolbar')).toBeTruthy();
    expect(container.querySelector('.apple-settings-overlay')).toBeTruthy();
    expect(container.querySelector('.apple-ai-layout-overlay')).toBeTruthy();
    expect(container.querySelector('.apple-settings-area')).toBeTruthy();
    expect(container.querySelector('.apple-toolbar-plugin-name')).toBeNull();
    expect(container.querySelector('.apple-icon-btn[aria-label="公众号排版样式设置"]')).toBeTruthy();
    expect(container.querySelector('.apple-icon-btn[aria-label="AI 编排"]')).toBeTruthy();
    expect(container.querySelector('.apple-icon-btn[aria-label="发布与分发"]')).toBeTruthy();
    expect(container.querySelector('.apple-icon-btn[aria-label="复制到公众号"]')).toBeNull();
  });

  it('resetSettingsPanelViewState should collapse advanced options and scroll to top without changing settings', () => {
    const settings = { theme: 'wechat', fontSize: 4 };
    const view = new AppleStyleView(null, { settings });

    const overlay = createObsidianLikeElement();
    const settingsArea = createObsidianLikeElement();
    const advancedArea = createObsidianLikeElement();
    const advancedOptions = createObsidianLikeElement('details');
    advancedOptions.open = true;

    view.settingsOverlay = overlay;
    view.settingsArea = settingsArea;
    view.settingsAdvancedArea = advancedArea;
    view.settingsAdvancedOptions = advancedOptions;

    overlay.scrollTop = 180;
    settingsArea.scrollTop = 80;
    advancedArea.scrollTop = 40;

    view.resetSettingsPanelViewState();

    expect(advancedOptions.open).toBe(false);
    expect(overlay.scrollTop).toBe(0);
    expect(settingsArea.scrollTop).toBe(0);
    expect(advancedArea.scrollTop).toBe(0);
    expect(view.plugin.settings).toBe(settings);
    expect(view.plugin.settings).toEqual({ theme: 'wechat', fontSize: 4 });
  });

  it('resetAiLayoutPanelViewState should collapse debug options and scroll to top without changing settings', () => {
    const aiSettings = {
      enabled: true,
      defaultLayoutFamily: 'magazine',
      defaultColorPalette: 'tech-green',
    };
    const view = new AppleStyleView(null, { settings: { ai: aiSettings } });

    const overlay = createObsidianLikeElement();
    const area = createObsidianLikeElement();
    const advancedBody = createObsidianLikeElement();
    const debugBody = createObsidianLikeElement('pre');

    view.aiLayoutOverlay = overlay;
    view.aiLayoutArea = area;
    view.aiAdvancedBody = advancedBody;
    view.aiDebugPanelBody = debugBody;
    view.aiAdvancedOpen = true;
    view.aiLayoutDebugMode = 'json';
    view.aiLayoutPendingAnchor = { blockKey: 'block-1', fallbackScrollTop: 160 };

    overlay.scrollTop = 160;
    area.scrollTop = 70;
    advancedBody.scrollTop = 40;
    debugBody.scrollTop = 25;

    view.resetAiLayoutPanelViewState();

    expect(view.aiAdvancedOpen).toBe(false);
    expect(view.aiLayoutDebugMode).toBe('');
    expect(view.aiLayoutPendingAnchor).toBeNull();
    expect(overlay.scrollTop).toBe(0);
    expect(area.scrollTop).toBe(0);
    expect(advancedBody.scrollTop).toBe(0);
    expect(debugBody.scrollTop).toBe(0);
    expect(view.plugin.settings.ai).toBe(aiSettings);
    expect(view.plugin.settings.ai).toEqual({
      enabled: true,
      defaultLayoutFamily: 'magazine',
      defaultColorPalette: 'tech-green',
    });
  });

  it('onAiLayoutButtonClick should reset AI panel view state before refreshing on open', () => {
    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
        },
      },
    });
    view.aiLayoutOverlay = createObsidianLikeElement();
    view.aiLayoutBtn = createObsidianLikeElement();
    view.aiLayoutArea = createObsidianLikeElement();
    view.aiAdvancedOpen = true;
    view.aiLayoutDebugMode = 'error';
    view.aiLayoutPendingAnchor = { blockKey: 'block-1', fallbackScrollTop: 120 };
    view.aiLayoutOverlay.scrollTop = 120;
    view.aiLayoutArea.scrollTop = 60;

    const refreshSpy = vi.spyOn(view, 'refreshAiLayoutPanel').mockImplementation(() => {
      expect(view.aiAdvancedOpen).toBe(false);
      expect(view.aiLayoutDebugMode).toBe('');
      expect(view.aiLayoutPendingAnchor).toBeNull();
      expect(view.aiLayoutOverlay.scrollTop).toBe(0);
      expect(view.aiLayoutArea.scrollTop).toBe(0);
    });

    view.onAiLayoutButtonClick();

    expect(view.aiLayoutOverlay.classList.contains('visible')).toBe(true);
    expect(view.aiLayoutBtn.classList.contains('active')).toBe(true);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('createSettingsPanel should hide AI entry when feature toggle is off', () => {
    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: false,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          providers: [],
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(),
    });
    view.app = { isMobile: false };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);

    const aiBtn = container.querySelector('.apple-icon-btn[aria-label="AI 编排"]');
    expect(aiBtn).toBeTruthy();
    expect(aiBtn.hidden).toBe(true);
    expect(container.querySelector('.apple-ai-layout-status-text')?.textContent).toContain('AI 编排已关闭，请先在设置中启用');
  });

  it('createSettingsPanel should hide AI entry until a runnable provider or cached layout exists', () => {
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
      saveSettings: vi.fn(),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);

    const aiBtn = container.querySelector('.apple-icon-btn[aria-label="AI 编排"]');
    expect(aiBtn).toBeTruthy();
    expect(aiBtn.hidden).toBe(true);
    expect(aiBtn.getAttribute('title')).toContain('配置可用 AI Provider');
  });

  it('createSettingsPanel should show AI entry when a runnable provider exists', () => {
    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(),
    });
    view.app = { isMobile: false };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);

    const aiBtn = container.querySelector('.apple-icon-btn[aria-label="AI 编排"]');
    expect(aiBtn).toBeTruthy();
    expect(aiBtn.hidden).toBe(false);
    expect(aiBtn.getAttribute('title')).toBe('AI 编排');
  });

  it('updateAiToolbarState should close AI panel when feature toggle is turned off', () => {
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
      saveSettings: vi.fn(),
    });
    view.app = { isMobile: false };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);

    view.aiLayoutOverlay.classList.add('visible');
    view.aiLayoutBtn.classList.add('active');
    view.plugin.settings.ai.enabled = false;

    view.updateAiToolbarState();

    expect(view.aiLayoutBtn.hidden).toBe(true);
    expect(view.aiLayoutOverlay.classList.contains('visible')).toBe(false);
    expect(view.aiLayoutBtn.classList.contains('active')).toBe(false);
  });

  it('createSettingsPanel should render AI panel with dedicated content area', () => {
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
      saveSettings: vi.fn(),
    });
    view.app = { isMobile: false };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);

    expect(container.querySelector('.apple-ai-layout-overlay')).toBeTruthy();
    expect(container.querySelector('.apple-ai-layout-area')).toBeTruthy();
  });

  it('AI layout overlay should contain wheel scroll instead of bubbling to preview wrapper', () => {
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
      saveSettings: vi.fn(),
    });
    view.app = { isMobile: false };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    const parentWheelSpy = vi.fn();
    container.addEventListener('wheel', parentWheelSpy);
    view.createSettingsPanel(container);

    const overlay = container.querySelector('.apple-ai-layout-overlay');
    expect(overlay).toBeTruthy();
    overlay.classList.add('visible');
    Object.defineProperty(overlay, 'scrollHeight', { value: 720, configurable: true });
    Object.defineProperty(overlay, 'clientHeight', { value: 360, configurable: true });
    Object.defineProperty(overlay, 'scrollTop', { value: 360, configurable: true, writable: true });

    const event = new window.WheelEvent('wheel', {
      deltaY: 80,
      bubbles: true,
      cancelable: true,
    });

    overlay.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(parentWheelSpy).not.toHaveBeenCalled();
  });

  it('refreshAiLayoutPanel should default to simplified result view while keeping advanced details collapsible', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        skillLabel: '教程卡片型',
        skillVersion: '2026.03.25-alpha.1',
        layoutFamilyLabel: '教程卡片型',
        colorPaletteLabel: '科技绿',
        stylePackLabel: '科技绿',
        headingCount: 3,
        sectionCount: 2,
        leadParagraphCount: 1,
        bulletGroupCount: 1,
        imageCount: 2,
        aiBlockCount: 3,
        finalBlockCount: 5,
        fallbackUsed: true,
        fallbackBlockCount: 2,
        fallbackBlockTypes: ['cta-card'],
        blockOrigins: [
          { index: 0, type: 'hero', source: 'ai', label: 'AI 编排实践' },
          { index: 1, type: 'section-block', source: 'ai', label: '第一部分' },
          { index: 2, type: 'phone-frame', source: 'ai', label: 'image-1' },
          { index: 3, type: 'section-block', source: 'fallback', label: '第二部分' },
          { index: 4, type: 'part-nav', source: 'fallback', label: '继续阅读' },
        ],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [
          { type: 'hero', title: 'AI 编排实践' },
          { type: 'section-block', title: '第一部分', sectionIndex: 0, sectionLabel: 'PART 01', headingLevel: 2, paragraphs: ['正文一'], bulletGroups: [], imageIds: [] },
          { type: 'phone-frame', imageId: 'image-1', caption: '截图' },
          { type: 'section-block', title: '第二部分', sectionIndex: 1, sectionLabel: 'SUB 02', headingLevel: 3, paragraphs: ['正文二'], bulletGroups: [], imageIds: [] },
          { type: 'part-nav', items: [{ label: 'PART 01', text: '第一部分' }] },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-status .apple-ai-layout-summary')?.textContent).toContain('共 5 个区块');
    expect(container.querySelector('.apple-ai-layout-status')?.textContent).not.toContain('结果摘要');
    expect(container.querySelector('.apple-ai-layout-result-section .apple-setting-label')?.textContent).toBe('区块');
    expect(Array.from(container.querySelectorAll('.apple-ai-layout-actions button')).some((button) => button.textContent === '应用当前结果')).toBe(true);
    expect(Array.from(container.querySelectorAll('.apple-ai-layout-actions button')).some((button) => button.textContent === '重新生成并应用')).toBe(true);
    expect(container.querySelector('.apple-ai-layout-advanced-body')?.hidden).toBe(true);
    expect(container.querySelector('.apple-ai-layout-block-type')).toBeNull();
    expect(container.querySelector('.apple-ai-layout-block-origin')).toBeNull();

    const advancedToggle = container.querySelector('.apple-ai-layout-advanced-toggle');
    advancedToggle.click();
    expect(container.querySelector('.apple-ai-layout-advanced-body')?.hidden).toBe(false);
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).toContain('Provider DeepSeek');
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).toContain('补全 2 块');
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).not.toContain('技能');
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).not.toContain('版本');
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).not.toContain('布局');
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).not.toContain('颜色');
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).not.toContain('纯 AI 输出');
  });

  it('refreshAiLayoutPanel should keep cached layout available when only the selected color changes', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 2,
        finalBlockCount: 2,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [
          { index: 0, type: 'hero', source: 'ai', label: '文章标题' },
          { index: 1, type: 'section-block', source: 'ai', label: '第一部分' },
        ],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [
          { type: 'hero', title: '文章标题' },
          { type: 'section-block', title: '第一部分', sectionIndex: 0, sectionLabel: 'PART 01', headingLevel: 2, paragraphs: ['正文'], bulletGroups: [], imageIds: [] },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.pendingAiStylePack = 'ocean-blue';
    view.pendingAiColorPalette = 'ocean-blue';
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('可应用');
    expect(container.querySelector('.apple-ai-layout-status-text')?.hidden).toBe(true);
    expect(container.querySelector('.apple-ai-layout-status-text')?.textContent).toBe('');
    expect(container.querySelector('.apple-ai-layout-status .apple-ai-layout-summary')?.textContent).toContain('共 2 个区块');
    expect(container.querySelectorAll('.apple-ai-layout-block-item')).toHaveLength(2);
    expect(container.querySelector('.apple-ai-layout-cache-inline')?.textContent).toContain('手动选择');
    expect(container.querySelector('.apple-ai-layout-cache-inline')?.textContent).toContain('教程卡片');
    expect(container.querySelector('.apple-ai-layout-cache-inline')?.textContent).not.toContain('当前内容');
    expect(container.querySelector('.apple-ai-layout-status .apple-ai-layout-cache-inline')).toBeTruthy();
    expect(container.querySelector('.apple-ai-layout-cache-chip')).toBeNull();
    expect(container.querySelector('.apple-ai-layout-cache-section')).toBeNull();
    expect(Array.from(container.querySelectorAll('.apple-ai-layout-actions button')).some((button) => button.textContent === '应用当前结果')).toBe(true);
    expect(Array.from(container.querySelectorAll('.apple-ai-layout-actions button')).some((button) => button.textContent === '重新生成并应用')).toBe(true);
  });

  it('refreshAiLayoutPanel should show cached layout families without current-content wording', () => {
    const currentHash = String(new AppleStyleView(null, { settings: {} }).simpleHash('# demo'));
    const tutorialState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: currentHash,
      selection: { layoutFamily: 'auto', colorPalette: 'auto' },
      resolved: { layoutFamily: 'tutorial-cards', colorPalette: 'tech-green' },
      stylePack: 'tech-green',
      status: 'ready',
      lastAttemptStatus: 'success',
      generationMeta: {
        layoutFamilyLabel: '教程卡片型',
        finalBlockCount: 1,
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '教程标题' }],
      },
      layoutJson: {
        selection: { layoutFamily: 'auto', colorPalette: 'auto' },
        resolved: { layoutFamily: 'tutorial-cards', colorPalette: 'tech-green' },
        stylePack: 'tech-green',
        blocks: [{ type: 'hero', title: '教程标题' }],
      },
    };
    const sourceFirstState = {
      ...tutorialState,
      updatedAt: Date.now() - 1000,
      selection: { layoutFamily: 'source-first', colorPalette: 'auto' },
      resolved: { layoutFamily: 'source-first', colorPalette: 'tech-green' },
      generationMeta: {
        ...tutorialState.generationMeta,
        layoutFamilyLabel: '原文增强型',
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '原文标题' }],
      },
      layoutJson: {
        ...tutorialState.layoutJson,
        selection: { layoutFamily: 'source-first', colorPalette: 'auto' },
        resolved: { layoutFamily: 'source-first', colorPalette: 'tech-green' },
        blocks: [{ type: 'hero', title: '原文标题' }],
      },
    };
    const editorialState = {
      ...tutorialState,
      updatedAt: Date.now() - 2000,
      sourceHash: 'old-hash',
      selection: { layoutFamily: 'editorial-lite', colorPalette: 'auto' },
      resolved: { layoutFamily: 'editorial-lite', colorPalette: 'tech-green' },
      generationMeta: {
        ...tutorialState.generationMeta,
        layoutFamilyLabel: '轻杂志型',
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '轻杂志标题' }],
      },
      layoutJson: {
        ...tutorialState.layoutJson,
        selection: { layoutFamily: 'editorial-lite', colorPalette: 'auto' },
        resolved: { layoutFamily: 'editorial-lite', colorPalette: 'tech-green' },
        blocks: [{ type: 'hero', title: '轻杂志标题' }],
      },
    };
    const cacheEntry = {
      lastSelectionKey: 'auto',
      familyStates: {
        'tutorial-cards': tutorialState,
        'source-first': sourceFirstState,
        'editorial-lite': editorialState,
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultLayoutFamily: 'auto',
          defaultColorPalette: 'auto',
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cacheEntry,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => tutorialState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    view.lastResolvedSourceHash = currentHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    const status = container.querySelector('.apple-ai-layout-status');
    const activeLine = status.querySelector('.apple-ai-layout-cache-inline');
    const switchRow = status.querySelector('.apple-ai-layout-cache-switch-row');
    const chips = Array.from(switchRow.querySelectorAll('.apple-ai-layout-cache-chip'));

    expect(status.querySelector('.apple-ai-layout-status-text')?.hidden).toBe(true);
    expect(status.textContent).not.toContain('当前内容');
    expect(status.textContent).not.toContain('可以直接应用到预览');
    expect(status.textContent).not.toContain('已应用到预览');
    expect(activeLine.textContent).toContain('教程卡片型');
    expect(activeLine.textContent).toContain('由自动推荐生成');
    expect(switchRow.textContent).toContain('切换到');
    expect(chips.map((chip) => chip.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('原文增强型'),
      expect.stringContaining('轻杂志型'),
    ]));
    expect(chips.some((chip) => chip.textContent.includes('教程卡片型'))).toBe(false);
    expect(chips.some((chip) => chip.textContent.includes('基于旧内容'))).toBe(true);
  });

  it('refreshAiLayoutPanel should not mark cached layout stale while the active source is still switching', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: 'new-source-hash',
      selection: { layoutFamily: 'source-first', colorPalette: 'auto' },
      resolved: { layoutFamily: 'source-first', colorPalette: 'tech-green' },
      stylePack: 'tech-green',
      status: 'ready',
      lastAttemptStatus: 'success',
      generationMeta: {
        layoutFamilyLabel: '原文增强型',
        finalBlockCount: 1,
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '新文章标题' }],
      },
      layoutJson: {
        selection: { layoutFamily: 'source-first', colorPalette: 'auto' },
        resolved: { layoutFamily: 'source-first', colorPalette: 'tech-green' },
        stylePack: 'tech-green',
        blocks: [{ type: 'hero', title: '新文章标题' }],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultLayoutFamily: 'auto',
          defaultColorPalette: 'auto',
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/new.md': {
              lastLayoutFamily: 'source-first',
              familyStates: {
                'source-first': cachedState,
              },
            },
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn((sourcePath) => (sourcePath === 'notes/new.md' ? cachedState : null)),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/new.md', basename: 'new' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/old.md';
    view.lastResolvedMarkdown = '# old';
    view.lastResolvedSourceHash = String(view.simpleHash('# old'));
    view.aiLayoutSourceSwitchPath = 'notes/new.md';

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    const context = view.getCurrentLayoutContext();
    expect(context.sourcePath).toBe('notes/new.md');
    expect(context.sourceHash).toBe('');
    expect(context.isSourcePending).toBe(true);
    expect(context.isSourceSwitching).toBe(true);
    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('读取中');
    expect(container.querySelector('.apple-ai-layout-summary')?.textContent).toContain('正在读取当前文章');
    expect(container.querySelector('.apple-ai-layout-status')?.textContent).not.toContain('基于旧内容');
    expect(container.querySelector('.apple-ai-layout-cache-inline')).toBeNull();
  });

  it('refreshAiLayoutPanel should suppress stale wording during the post-switch settle window', () => {
    const staleState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: 'old-source-hash',
      selection: { layoutFamily: 'source-first', colorPalette: 'auto' },
      resolved: { layoutFamily: 'source-first', colorPalette: 'tech-green' },
      stylePack: 'tech-green',
      status: 'ready',
      lastAttemptStatus: 'success',
      generationMeta: {
        layoutFamilyLabel: '原文增强型',
        finalBlockCount: 1,
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '旧文章标题' }],
      },
      layoutJson: {
        selection: { layoutFamily: 'source-first', colorPalette: 'auto' },
        resolved: { layoutFamily: 'source-first', colorPalette: 'tech-green' },
        stylePack: 'tech-green',
        blocks: [{ type: 'hero', title: '旧文章标题' }],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultLayoutFamily: 'auto',
          defaultColorPalette: 'auto',
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/new.md': {
              lastLayoutFamily: 'source-first',
              familyStates: {
                'source-first': staleState,
              },
            },
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn((sourcePath) => (sourcePath === 'notes/new.md' ? staleState : null)),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/new.md', basename: 'new' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/new.md';
    view.lastResolvedMarkdown = '# new';
    view.lastResolvedSourceHash = String(view.simpleHash('# new'));
    view.aiLayoutStaleSuppressPath = 'notes/new.md';
    view.aiLayoutStaleSuppressUntil = Date.now() + 1000;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('读取中');
    expect(container.querySelector('.apple-ai-layout-status')?.textContent).not.toContain('基于旧内容');
    expect(container.querySelector('.apple-ai-layout-cache-inline')).toBeNull();

    view.aiLayoutStaleSuppressUntil = Date.now() - 1;
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('需更新');
    expect(container.querySelector('.apple-ai-layout-status')?.textContent).toContain('基于旧内容');
  });

  it('refreshAiLayoutPanel should keep apply available for cached results even when the provider is unavailable', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 1,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '缓存标题' }],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [{ type: 'hero', title: '缓存标题' }],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;
    vi.spyOn(view, 'getCurrentArticleLayoutState').mockReturnValue(cachedState);

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    const aiBtn = container.querySelector('.apple-icon-btn[aria-label="AI 编排"]');
    expect(aiBtn.hidden).toBe(false);
    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('可应用');
    expect(container.querySelector('.apple-ai-layout-status-text')?.hidden).toBe(true);
    expect(container.querySelector('.apple-ai-layout-status-text')?.textContent).toBe('');
    expect(container.querySelector('.apple-ai-layout-status .apple-ai-layout-summary')?.textContent).toContain('共 1 个区块');
    expect(Array.from(container.querySelectorAll('.apple-ai-layout-actions button')).some((button) => button.textContent === '应用当前结果' && button.disabled === false)).toBe(true);
  });

  it('refreshAiLayoutPanel should apply cached results first while offering regeneration when a provider is available', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        finalBlockCount: 1,
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '缓存标题' }],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [{ type: 'hero', title: '缓存标题' }],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;
    vi.spyOn(view, 'getCurrentArticleLayoutState').mockReturnValue(cachedState);

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    const actionButtons = Array.from(container.querySelectorAll('.apple-ai-layout-actions button'));
    expect(actionButtons.some((button) => button.textContent === '重新生成并应用' && button.disabled === false)).toBe(true);
    expect(actionButtons.some((button) => button.textContent === '应用当前结果' && button.disabled === false)).toBe(true);
    expect(view.aiPrimaryActionMode).toBe('apply');
  });

  it('refreshAiLayoutPanel should allow applying old cache while offering regeneration when content changed', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: 'old-hash',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        finalBlockCount: 1,
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '缓存标题' }],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [{ type: 'hero', title: '缓存标题' }],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# changed demo';
    view.lastResolvedSourceHash = String(view.simpleHash('# changed demo'));

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('需更新');
    expect(container.querySelector('.apple-ai-layout-status-text')?.textContent).toContain('基于旧内容');
    const actionButtons = Array.from(container.querySelectorAll('.apple-ai-layout-actions button'));
    expect(actionButtons.some((button) => button.textContent === '重新生成并应用' && button.disabled === false)).toBe(true);
    expect(actionButtons.some((button) => button.textContent === '应用旧缓存' && button.disabled === false)).toBe(true);
    expect(view.aiPrimaryActionMode).toBe('apply-stale');
  });

  it('applyAiLayoutToPreview should not show a notice when cached content is stale', () => {
    const notices = installNoticeCapture();
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: 'old-hash',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        finalBlockCount: 1,
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '缓存标题' }],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [{ type: 'hero', title: '缓存标题' }],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.previewContainer = createObsidianLikeElement();
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# changed demo';
    view.lastResolvedSourceHash = String(view.simpleHash('# changed demo'));

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    view.applyAiLayoutToPreview();

    expect(notices.some((item) => item.message === '当前文章内容已变化，请先重新生成 AI 编排')).toBe(false);
    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('需更新');
    expect(container.querySelector('.apple-ai-layout-status-text')?.textContent).toContain('基于旧内容');
  });

  it('refreshAiLayoutPanel should reuse the same cached blocks when switching color palettes', () => {
    const greenState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 1,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '科技绿标题' }],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [{ type: 'hero', title: '科技绿标题' }],
      },
    };

    const blueState = {
      ...greenState,
      stylePack: 'ocean-blue',
      generationMeta: {
        ...greenState.generationMeta,
        stylePackLabel: '深海蓝',
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '深海蓝标题' }],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'ocean-blue',
        blocks: [{ type: 'hero', title: '深海蓝标题' }],
      },
    };

    const getArticleLayoutState = vi.fn((_, selection) => {
      if (selection?.layoutFamily === 'source-first') return blueState;
      return greenState;
    });

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState,
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    view.lastResolvedSourceHash = '123';

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    expect(view.aiLayoutFamilySelect.querySelector('option[value="source-first"]')?.textContent).toBe('原文增强型');

    view.pendingAiStylePack = 'ocean-blue';
    view.pendingAiColorPalette = 'ocean-blue';
    view.refreshAiLayoutPanel();
    expect(container.querySelector('.apple-ai-layout-block-name')?.textContent).toContain('科技绿标题');

    view.pendingAiStylePack = 'tech-green';
    view.pendingAiColorPalette = 'tech-green';
    view.refreshAiLayoutPanel();
    expect(container.querySelector('.apple-ai-layout-block-name')?.textContent).toContain('科技绿标题');
    expect(getArticleLayoutState).toHaveBeenCalledWith('notes/demo.md', expect.objectContaining({ colorPalette: 'tech-green' }));
    expect(getArticleLayoutState).toHaveBeenCalledWith('notes/demo.md', expect.objectContaining({ colorPalette: 'ocean-blue' }));
    expect(getArticleLayoutState).not.toHaveBeenCalledWith('notes/demo.md', 'ocean-blue');

    view.aiPreviewApplied = true;
    view.previewContainer = createObsidianLikeElement();
    view.baseRenderedHtml = '<section><p>base</p></section>';
    view.currentHtml = view.baseRenderedHtml;
    view.previewContainer.innerHTML = view.baseRenderedHtml;
    view.aiLayoutFamilySelect.value = 'source-first';
    view.aiLayoutFamilySelect.dispatchEvent(new Event('change'));

    expect(view.pendingAiLayoutFamily).toBe('source-first');
    expect(view.currentHtml).toContain('深海蓝标题');
    expect(view.previewContainer.innerHTML).toContain('深海蓝标题');
  });

  it('getCurrentExportHtml should keep ai preview html untouched while returning draft-safe export html', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'ocean-blue',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '深海蓝',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 1,
        aiBlockCount: 3,
        finalBlockCount: 3,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [
          { index: 0, type: 'hero', source: 'ai', label: '操作教程' },
          { index: 1, type: 'part-nav', source: 'ai', label: 'PART 01' },
          { index: 2, type: 'section-block', source: 'ai', label: '第一步' },
        ],
      },
      layoutJson: {
        articleType: 'tutorial',
        selection: {
          layoutFamily: 'tutorial-cards',
          colorPalette: 'ocean-blue',
        },
        resolved: {
          layoutFamily: 'tutorial-cards',
          colorPalette: 'ocean-blue',
        },
        stylePack: 'ocean-blue',
        blocks: [
          { type: 'hero', title: '操作教程', subtitle: '快速上手', coverImageId: 'image-1', variant: 'cover-right' },
          { type: 'part-nav', items: [{ label: 'PART 01', text: '准备工作' }, { label: 'PART 02', text: '正式操作' }] },
          { type: 'section-block', sectionIndex: 0, title: '第一步', paragraphs: ['这里是正文。'] },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'ocean-blue',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          providers: [],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;
    view.baseRenderedHtml = '<section><figure><img src="https://example.com/cover.png" alt="封面图"><figcaption>封面图</figcaption></figure></section>';
    view.currentHtml = '<section style="background:#f6f9fd;"><div style="display:flex;gap:10px;"><div>preview nav</div></div><h1 style="font-size:28px;">操作教程</h1></section>';
    view.aiPreviewApplied = true;

    const exportHtml = view.getCurrentExportHtml();

    expect(view.currentHtml).toContain('display:flex');
    expect(view.currentHtml).toContain('<h1');
    expect(exportHtml).toContain('操作教程');
    expect(exportHtml).not.toContain('<h1');
    expect(exportHtml).toContain('display:flex;align-items:center;');
    expect(exportHtml).toContain('overflow-x:scroll');
  });

  it('getCurrentExportHtml should leave non-ai preview html unchanged', () => {
    const view = new AppleStyleView(null, { settings: {} });
    view.currentHtml = '<section><h1>普通预览标题</h1><p>正文</p></section>';
    view.aiPreviewApplied = false;

    expect(view.getCurrentExportHtml()).toBe(view.currentHtml);
  });

  it('syncPreviewPresentationMode should only mark classic preview chrome when ai preview is applied', () => {
    const view = new AppleStyleView(null, { settings: {} });
    const wrapper = createObsidianLikeElement('div');
    wrapper.className = 'apple-preview-wrapper mode-classic';
    const preview = createObsidianLikeElement('div');
    preview.className = 'apple-converter-preview';
    wrapper.appendChild(preview);
    document.body.appendChild(wrapper);
    view.previewContainer = preview;

    view.aiPreviewApplied = true;
    view.syncPreviewPresentationMode();

    expect(preview.classList.contains('apple-ai-preview-active')).toBe(true);
    expect(wrapper.classList.contains('apple-ai-preview-active')).toBe(true);

    view.aiPreviewApplied = false;
    view.syncPreviewPresentationMode();

    expect(preview.classList.contains('apple-ai-preview-active')).toBe(false);
    expect(wrapper.classList.contains('apple-ai-preview-active')).toBe(false);

    wrapper.remove();
  });

  it('getCurrentExportHtml should preserve rendered code and table blocks from the base preview', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      selection: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      status: 'ready',
      generationMeta: { blockOrigins: [] },
      layoutJson: {
        selection: {
          layoutFamily: 'tutorial-cards',
          colorPalette: 'ocean-blue',
        },
        resolved: {
          layoutFamily: 'tutorial-cards',
          colorPalette: 'ocean-blue',
        },
        stylePack: 'ocean-blue',
        blocks: [
          {
            type: 'section-block',
            sectionIndex: 0,
            title: '第一部分',
            paragraphs: ['普通正文'],
            subsections: [{ title: '子步骤', level: 3, paragraphs: ['普通子正文'] }],
          },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          providers: [],
          articleLayoutsByPath: { 'notes/demo.md': cachedState },
        },
      },
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;
    view.baseRenderedHtml = '<section><h2>第一部分</h2><section class="code-snippet__fix"><pre>const x = 1;</pre></section><h3>子步骤</h3><table><tr><td>表格</td></tr></table></section>';
    view.currentHtml = '<section><p>ai preview</p></section>';
    view.aiPreviewApplied = true;

    const exportHtml = view.getCurrentExportHtml();

    expect(exportHtml).toContain('code-snippet__fix');
    expect(exportHtml).toContain('<table>');
    expect(exportHtml).not.toContain('普通子正文');
  });

  it('getCurrentExportHtml should preserve rendered nested lists from the base preview for ai layouts', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      selection: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      status: 'ready',
      generationMeta: { blockOrigins: [] },
      layoutJson: {
        selection: {
          layoutFamily: 'tutorial-cards',
          colorPalette: 'ocean-blue',
        },
        resolved: {
          layoutFamily: 'tutorial-cards',
          colorPalette: 'ocean-blue',
        },
        stylePack: 'ocean-blue',
        blocks: [
          {
            type: 'section-block',
            sectionIndex: 0,
            title: '第一部分',
            paragraphs: ['降级正文'],
          },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          providers: [],
          articleLayoutsByPath: { 'notes/demo.md': cachedState },
        },
      },
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;
    view.baseRenderedHtml = `
      <section>
        <h2>第一部分</h2>
        <ul>
          <li>
            父项
            <ul>
              <li>子项一</li>
              <li>子项二</li>
            </ul>
          </li>
        </ul>
      </section>
    `;
    view.currentHtml = '<section><p>ai preview</p></section>';
    view.aiPreviewApplied = true;

    const exportHtml = view.getCurrentExportHtml();

    expect(exportHtml).toContain('<ul>');
    expect(exportHtml).toContain('父项');
    expect(exportHtml).toContain('子项一');
    expect(exportHtml).not.toContain('降级正文');
  });

  it('ensureAiLayoutSelectionState should not persist a new cache when only the color changes', async () => {
    const greenState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      selection: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'tech-green',
      },
      resolved: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'tech-green',
      },
      recommendedLayoutFamily: 'editorial-lite',
      recommendedColorPalette: 'graphite-rose',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        layoutFamilyLabel: '轻杂志型',
        colorPaletteLabel: '科技绿',
        stylePackLabel: '科技绿',
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '经验复盘' }],
      },
      layoutJson: {
        articleType: 'article',
        selection: {
          layoutFamily: 'editorial-lite',
          colorPalette: 'tech-green',
        },
        resolved: {
          layoutFamily: 'editorial-lite',
          colorPalette: 'tech-green',
        },
        recommendedLayoutFamily: 'editorial-lite',
        recommendedColorPalette: 'graphite-rose',
        stylePack: 'tech-green',
        layoutFamily: 'editorial-lite',
        title: '经验复盘',
        summary: '这是一句摘要。',
        blocks: [{ type: 'hero', title: '经验复盘' }],
      },
    };

    const getArticleLayoutState = vi.fn(() => greenState);
    const saveArticleLayoutState = vi.fn().mockResolvedValue(true);

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultLayoutFamily: 'editorial-lite',
          defaultColorPalette: 'tech-green',
          providers: [],
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState,
      saveArticleLayoutState,
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    view.lastResolvedSourceHash = '123';

    const derivedState = await view.ensureAiLayoutSelectionState(greenState, {
      layoutFamily: 'editorial-lite',
      colorPalette: 'ocean-blue',
    });

    expect(derivedState).toBe(greenState);
    expect(saveArticleLayoutState).not.toHaveBeenCalled();
  });

  it('refreshAiLayoutPanel should hide dismissed blocks and enable restore action', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      dismissedBlockKeys: ['section-block::0::第一部分::1'],
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 2,
        finalBlockCount: 2,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [
          { index: 0, type: 'hero', source: 'ai', label: '文章标题' },
          { index: 1, type: 'section-block', source: 'ai', label: '第一部分' },
        ],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [
          { type: 'hero', title: '文章标题' },
          { type: 'section-block', title: '第一部分', sectionIndex: 0, sectionLabel: 'PART 01', headingLevel: 2, paragraphs: ['正文'], bulletGroups: [], imageIds: [] },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelectorAll('.apple-ai-layout-block-item')).toHaveLength(1);
    expect(Array.from(container.querySelectorAll('.apple-ai-layout-mini-note')).some((el) => el.textContent.includes('已隐藏 1 个区块'))).toBe(true);
    expect(Array.from(container.querySelectorAll('.apple-ai-layout-actions button')).some((button) => button.textContent === '恢复已移除' && button.disabled === false)).toBe(true);
  });

  it('removeAiLayoutBlock should persist dismissed state for generated auto selection results', async () => {
    const plugin = {
      settings: {
        ai: {
          enabled: true,
          defaultLayoutFamily: 'auto',
          defaultColorPalette: 'auto',
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'Minimax',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'MiniMax-M2.7',
            enabled: true,
          }],
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(async () => true),
    };
    plugin.getArticleLayoutState = AppleStylePlugin.prototype.getArticleLayoutState;
    plugin.saveArticleLayoutState = AppleStylePlugin.prototype.saveArticleLayoutState;

    await plugin.saveArticleLayoutState('notes/demo.md', {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'MiniMax-M2.7',
      skillId: 'source-first',
      skillVersion: '2026.03.25-alpha.1',
      selection: {
        layoutFamily: 'auto',
        colorPalette: 'auto',
      },
      resolved: {
        layoutFamily: 'source-first',
        colorPalette: 'tech-green',
      },
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      lastAttemptError: '',
      lastAttemptAt: Date.now(),
      dismissedBlockKeys: [],
      generationMeta: {
        providerName: 'Minimax',
        providerModel: 'MiniMax-M2.7',
        layoutFamilyLabel: '原文增强型',
        colorPaletteLabel: '科技绿',
        stylePackLabel: '科技绿',
        headingCount: 4,
        sectionCount: 2,
        imageCount: 0,
        aiBlockCount: 2,
        finalBlockCount: 2,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [
          { index: 0, type: 'lead-quote', source: 'ai', label: '导语' },
          { index: 1, type: 'section-block', source: 'ai', label: '第一部分' },
        ],
      },
      layoutJson: {
        articleType: 'article',
        selection: {
          layoutFamily: 'auto',
          colorPalette: 'auto',
        },
        resolved: {
          layoutFamily: 'source-first',
          colorPalette: 'tech-green',
        },
        stylePack: 'tech-green',
        title: '文章标题',
        summary: '摘要',
        blocks: [
          { type: 'lead-quote', text: '导语' },
          { type: 'section-block', title: '第一部分', sectionIndex: 0, imageIds: [] },
        ],
      },
    }, {
      layoutFamily: 'auto',
      colorPalette: 'auto',
    });

    const view = new AppleStyleView(null, plugin);
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    view.lastResolvedSourceHash = '123';

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();
    expect(container.querySelectorAll('.apple-ai-layout-block-item')).toHaveLength(2);

    await view.removeAiLayoutBlock(1);
    view.refreshAiLayoutPanel();

    const state = plugin.getArticleLayoutState('notes/demo.md', {
      layoutFamily: 'auto',
      colorPalette: 'auto',
    });
    expect(state?.dismissedBlockKeys).toContain('section-block::0::第一部分::1');
    expect(container.querySelectorAll('.apple-ai-layout-block-item')).toHaveLength(1);
    expect(Array.from(container.querySelectorAll('.apple-ai-layout-mini-note')).some((el) => el.textContent.includes('已隐藏 1 个区块'))).toBe(true);
  });

  it('refreshAiLayoutPanel should show full-panel loading state while generating', () => {
    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          providers: [{ id: 'provider-1', name: 'DeepSeek', kind: 'openai-compatible', baseUrl: 'https://api.example.com/v1', apiKey: 'secret', model: 'deepseek-chat', enabled: true }],
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => null),
    });
    view.app = {
      isMobile: false,
      workspace: { getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })) },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    view.aiLayoutLoading = true;
    view.aiLayoutActiveGenerationSelection = {
      layoutFamily: 'auto',
      colorPalette: 'tech-green',
    };

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-overlay')?.classList.contains('is-loading')).toBe(true);
    expect(container.querySelector('.apple-ai-layout-loading-mask')?.classList.contains('visible')).toBe(true);
    expect(container.querySelector('.apple-ai-layout-loading-text')?.textContent).toContain('自动推荐 · 科技绿');
    expect(container.querySelector('.apple-ai-layout-status-text')?.textContent).toContain('正在生成并应用新的编排');
  });

  it('refreshAiLayoutPanel should toggle debug panel for layout json and error details', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'error',
      lastError: '401 unauthorized',
      lastAttemptStatus: 'error',
      lastAttemptError: '401 unauthorized',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [
          { index: 0, type: 'lead-quote', source: 'ai', label: '一句摘要' },
        ],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [
          { type: 'lead-quote', text: '一句摘要' },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);

    const advancedToggle = container.querySelector('.apple-ai-layout-advanced-toggle');
    advancedToggle.click();
    expect(container.querySelector('.apple-ai-layout-advanced-body')?.hidden).toBe(false);

    const jsonBtn = container.querySelector('.apple-ai-layout-debug-btn');
    const errorBtn = container.querySelectorAll('.apple-ai-layout-debug-btn')[1];
    expect(jsonBtn?.textContent).toContain('查看布局 JSON');
    expect(errorBtn?.textContent).toContain('查看错误详情');
    const copyButtons = Array.from(container.querySelectorAll('.apple-ai-layout-debug-copy'));
    expect(copyButtons.map((button) => button.textContent)).toEqual(['复制给 AI', '复制当前内容']);
    expect(copyButtons.some((button) => button.classList.contains('apple-ai-layout-link'))).toBe(false);

    jsonBtn.click();
    expect(container.querySelector('.apple-ai-layout-debug-panel')?.classList.contains('visible')).toBe(true);
    expect(container.querySelector('.apple-ai-layout-debug-title')?.textContent).toContain('布局 JSON');
    expect(container.querySelectorAll('.apple-ai-layout-debug-copy')[0]?.textContent).toBe('复制给 AI');
    expect(container.querySelectorAll('.apple-ai-layout-debug-copy')[1]?.textContent).toBe('复制 JSON');
    expect(container.querySelector('.apple-ai-layout-debug-body')?.textContent).toContain('"layoutJson"');

    errorBtn.click();
    expect(container.querySelector('.apple-ai-layout-debug-title')?.textContent).toContain('错误详情');
    expect(container.querySelectorAll('.apple-ai-layout-debug-copy')[0]?.textContent).toBe('复制给 AI');
    expect(container.querySelectorAll('.apple-ai-layout-debug-copy')[1]?.textContent).toBe('复制错误详情');
    expect(container.querySelector('.apple-ai-layout-debug-body')?.textContent).toContain('401 unauthorized');
    expect(container.querySelector('.apple-ai-layout-debug-body')?.textContent).toContain('"providerName": "DeepSeek"');
  });

  it('copyAiLayoutDebugSnapshot should copy current debug payload to clipboard', async () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [
          { index: 0, type: 'lead-quote', source: 'ai', label: '一句摘要' },
        ],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [
          { type: 'lead-quote', text: '一句摘要' },
        ],
      },
    };

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);

    const jsonBtn = container.querySelector('.apple-ai-layout-debug-btn');
    const copyBtn = container.querySelector('.apple-ai-layout-debug-copy');

    jsonBtn.click();
    await view.copyAiLayoutDebugSnapshot();

    expect(copyBtn?.disabled).toBe(false);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('mode: json');
    expect(writeText.mock.calls[0][0]).toContain('"layoutJson"');
    expect(writeText.mock.calls[0][0]).toContain('sourcePath: notes/demo.md');
  });

  it('copyAiLayoutPromptContext should copy prompt-ready diagnosis context', async () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [
          { index: 0, type: 'lead-quote', source: 'ai', label: '一句摘要' },
        ],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [
          { type: 'lead-quote', text: '一句摘要' },
        ],
      },
    };

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo\n\n这是一段正文。\n\n## 第二段\n更多内容。';
    view.lastResolvedSourceHash = '123';

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);

    const promptBtn = container.querySelectorAll('.apple-ai-layout-debug-copy')[0];
    await view.copyAiLayoutPromptContext();

    expect(promptBtn?.disabled).toBe(false);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('# 公众号 AI 编排调试上下文');
    expect(writeText.mock.calls[0][0]).toContain('1. [AI] lead-quote - 一句摘要');
    expect(writeText.mock.calls[0][0]).toContain('## 文章正文摘录');
    expect(writeText.mock.calls[0][0]).toContain('这是一段正文');
  });

  it('refreshAiLayoutPanel should surface schema validation failure separately', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'schema-error',
      lastError: 'AI 返回的布局结果未通过 schema 校验（2 项）',
      lastAttemptStatus: 'schema-error',
      lastAttemptError: 'AI 返回的布局结果未通过 schema 校验（2 项）',
      lastAttemptSchemaValidation: {
        isValid: false,
        fatal: true,
        issueCount: 2,
        issues: [
          { path: '$.blocks[0].type', message: '不支持的 block type: unknown-block。', fatal: true },
        ],
      },
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 1,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 0,
        finalBlockCount: 0,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        schemaValidation: {
          isValid: false,
          fatal: true,
          issueCount: 2,
          issues: [
            { path: '$.blocks[0].type', message: '不支持的 block type: unknown-block。', fatal: true },
          ],
        },
        blockOrigins: [],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('生成失败');
    expect(container.querySelector('.apple-ai-layout-status-text')?.textContent).toContain('这次生成没有成功');
    expect(container.querySelector('.apple-ai-layout-summary')?.hidden).toBe(true);
    expect(Array.from(container.querySelectorAll('.apple-ai-layout-actions button')).some((button) => button.textContent === '重新生成并应用' && button.disabled === false)).toBe(true);
    const advancedToggle = container.querySelector('.apple-ai-layout-advanced-toggle');
    advancedToggle.click();
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).toContain('Schema 2 项');
    expect(container.querySelector('.apple-ai-layout-issues')?.textContent).toContain('不支持的 block type');
  });

  it('refreshAiLayoutPanel should avoid duplicate copy on hard generation failure', () => {
    const errorState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'error',
      lastError: 'timeout',
      lastAttemptStatus: 'error',
      lastAttemptError: 'timeout',
      layoutJson: { blocks: [] },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': errorState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => errorState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    errorState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = errorState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    const status = container.querySelector('.apple-ai-layout-status');
    expect(status.querySelector('.apple-ai-layout-badge')?.textContent).toContain('生成失败');
    expect(status.querySelector('.apple-ai-layout-status-text')?.textContent).toContain('生成失败，请重试或检查 AI 设置');
    expect(status.querySelector('.apple-ai-layout-summary')?.hidden).toBe(true);
    expect(status.textContent.match(/生成失败/g)).toHaveLength(2);
  });

  it('refreshAiLayoutPanel should show schema warnings even when generation succeeds', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 1,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        schemaValidation: {
          isValid: false,
          fatal: false,
          issueCount: 1,
          issues: [
            { path: '$.blocks[0].extraField', message: 'lead-quote 不支持字段 extraField。', fatal: false },
          ],
        },
        blockOrigins: [
          { index: 0, type: 'lead-quote', source: 'ai', label: '一句摘要' },
        ],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [
          { type: 'lead-quote', text: '一句摘要' },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    view.lastResolvedSourceHash = '123';

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    const advancedToggle = container.querySelector('.apple-ai-layout-advanced-toggle');
    advancedToggle.click();
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).toContain('Schema 1 项');
    expect(container.querySelector('.apple-ai-layout-issues')?.textContent).toContain('extraField');
    expect(container.querySelector('.apple-ai-layout-issues-title')?.textContent).toContain('Schema 提醒');
  });

  it('refreshAiLayoutPanel should keep apply available after a failed regenerate when previous layout is reusable', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now() - 1000,
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'error',
      lastAttemptError: '429 rate limited',
      lastAttemptAt: Date.now(),
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        schemaValidation: { isValid: true, fatal: false, issueCount: 0, issues: [] },
        blockOrigins: [
          { index: 0, type: 'lead-quote', source: 'ai', label: '一句摘要' },
        ],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [
          { type: 'lead-quote', text: '一句摘要' },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('已保留上一版');
    expect(container.querySelector('.apple-ai-layout-summary')?.textContent).toContain('上一版结果仍可继续使用');
    expect(Array.from(container.querySelectorAll('.apple-ai-layout-actions button')).some((button) => button.textContent === '应用上一版' && button.disabled === false)).toBe(true);
    const advancedToggle = container.querySelector('.apple-ai-layout-advanced-toggle');
    advancedToggle.click();
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).toContain('最近一次生成失败');
  });

  it('refreshAiLayoutPanel should keep the pending style pack selection before regeneration', () => {
    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => null),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    view.lastResolvedSourceHash = '123';

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.aiStylePackSelect.value = 'ocean-blue';
    view.aiStylePackSelect.dispatchEvent(new Event('change'));

    expect(view.aiStylePackSelect.value).toBe('ocean-blue');
    view.refreshAiLayoutPanel();
    expect(view.aiStylePackSelect.value).toBe('ocean-blue');
  });

  it('AI layout custom color should stay independent from the regular preview custom color', async () => {
    const view = new AppleStyleView(null, {
      settings: {
        customColor: '#0366d6',
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          defaultColorPalette: 'tech-green',
          customColor: '#ff3366',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => null),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    await view.onAiColorPaletteChange('custom');

    expect(view.plugin.settings.customColor).toBe('#0366d6');
    expect(view.plugin.settings.ai.customColor).toBe('#ff3366');
    expect(view.aiStylePackSelect.value).toBe('custom');
    expect(container.querySelector('.apple-btn-custom-text[data-value="custom"]')).toBeTruthy();
    expect(container.querySelector('.apple-ai-color-pill[data-value="custom"]')).toBeNull();
    expect(container.querySelector('.apple-ai-color-mode-row [data-value="auto"]')).toBeTruthy();
    expect(container.querySelector('.apple-ai-color-custom-row [data-value="custom"]')).toBeTruthy();
    expect(container.querySelector('.apple-ai-color-grid [data-value="auto"]')).toBeNull();
    expect(container.querySelector('.apple-ai-color-grid [data-value="custom"]')).toBeNull();
    expect(container.querySelectorAll('.apple-ai-color-grid .apple-ai-color-btn')).toHaveLength(12);
    expect(view.getAiRenderColorPalette('custom').tokens.accent).toBe('#ff3366');
  });

  it('getCurrentArticleLayoutState should prefer current-source cached layout when auto color would return a stale last selection', () => {
    const freshState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: 'fresh-hash',
      selection: { layoutFamily: 'auto', colorPalette: 'auto' },
      resolved: { layoutFamily: 'source-first', colorPalette: 'tech-green' },
      stylePack: 'tech-green',
      status: 'ready',
      layoutJson: {
        selection: { layoutFamily: 'auto', colorPalette: 'auto' },
        resolved: { layoutFamily: 'source-first', colorPalette: 'tech-green' },
        stylePack: 'tech-green',
        blocks: [{ type: 'hero', title: 'Fresh' }],
      },
    };
    const staleState = {
      ...freshState,
      sourceHash: 'stale-hash',
      selection: { layoutFamily: 'auto', colorPalette: 'ocean-blue' },
      resolved: { layoutFamily: 'source-first', colorPalette: 'ocean-blue' },
      stylePack: 'ocean-blue',
      layoutJson: {
        ...freshState.layoutJson,
        selection: { layoutFamily: 'auto', colorPalette: 'ocean-blue' },
        resolved: { layoutFamily: 'source-first', colorPalette: 'ocean-blue' },
        stylePack: 'ocean-blue',
        blocks: [{ type: 'hero', title: 'Stale' }],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultLayoutFamily: 'auto',
          defaultColorPalette: 'auto',
          providers: [],
          articleLayoutsByPath: {
            'notes/demo.md': {
              lastSelectionKey: 'auto::ocean-blue',
              selectionStates: {
                'auto::auto': freshState,
                'auto::ocean-blue': staleState,
              },
            },
          },
        },
      },
      getArticleLayoutState: vi.fn(() => staleState),
    });
    view.app = {
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# current';
    const currentHash = String(view.simpleHash('# current'));
    view.lastResolvedSourceHash = currentHash;
    freshState.sourceHash = currentHash;
    view.pendingAiLayoutFamily = 'auto';
    view.pendingAiColorPalette = 'auto';

    const state = view.getCurrentArticleLayoutState();
    expect(state?.sourceHash).toBe(currentHash);
    expect(state?.layoutJson?.blocks?.[0]?.title).toBe('Fresh');
  });

  it('refreshAiLayoutPanel should not surface stale schema issues after a timeout-style failure', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now() - 1000,
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: 'AI 请求超时（45s）',
      lastAttemptStatus: 'error',
      lastAttemptError: 'AI 请求超时（45s）',
      lastAttemptAt: Date.now(),
      lastAttemptSchemaValidation: null,
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        schemaValidation: {
          isValid: false,
          fatal: true,
          issueCount: 2,
          issues: [
            { path: '$.blocks[0].type', message: 'block 缺少合法的 type。', fatal: true },
          ],
        },
        blockOrigins: [
          { index: 0, type: 'lead-quote', source: 'ai', label: '一句摘要' },
        ],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [
          { type: 'lead-quote', text: '一句摘要' },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('已保留上一版');
    expect(container.querySelector('.apple-ai-layout-summary')?.textContent).not.toContain('schema');
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).not.toContain('Schema');
    expect(container.querySelector('.apple-ai-layout-issues')?.classList.contains('visible')).toBe(false);

    const advancedToggle = container.querySelector('.apple-ai-layout-advanced-toggle');
    advancedToggle.click();
    const errorBtn = container.querySelectorAll('.apple-ai-layout-debug-btn')[1];
    errorBtn.click();
    const errorBody = container.querySelector('.apple-ai-layout-debug-body')?.textContent || '';
    expect(errorBody).toContain('"status": "ready"');
    expect(errorBody).toContain('"lastAttempt"');
    expect(errorBody).toContain('AI 请求超时（45s）');
    expect(errorBody).toContain('"currentLayoutGenerationMeta"');
  });
});
