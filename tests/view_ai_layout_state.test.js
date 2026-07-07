/*
## 核心功能

覆盖 AppleStyleView AI layout state + debug 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护AI 编排选择状态、调试面板、失败恢复和颜色状态行为不回归。

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
  AppleStylePlugin,
  AppleStyleView,
  createObsidianLikeElement,
  resetViewTestGlobals,
} = require('./helpers/view-test-helpers.js');

describe('AppleStyleView AI layout state + debug', () => {
  afterEach(() => {
    resetViewTestGlobals(vi);
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
