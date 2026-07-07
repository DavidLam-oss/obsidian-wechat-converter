/*
## 核心功能

覆盖 AppleStyleView AI layout cache + export 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护AI 编排缓存展示、应用动作和导出 HTML 行为不回归。

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
  installNoticeCapture,
  resetViewTestGlobals,
} = require('./helpers/view-test-helpers.js');

describe('AppleStyleView AI layout cache + export', () => {
  afterEach(() => {
    resetViewTestGlobals(vi);
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
});
