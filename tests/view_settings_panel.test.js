/*
## 核心功能

覆盖 AppleStyleView settings panel + toolbar 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护设置面板、移动端工具栏和 AI 编排入口行为不回归。

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

describe('AppleStyleView settings panel + toolbar', () => {
  afterEach(() => {
    resetViewTestGlobals(vi);
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
});
