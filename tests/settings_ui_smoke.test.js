/*
## 核心功能

覆盖 settings UI smoke 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 settings UI smoke 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// tests/settings_ui_smoke.test.js
//
// Smoke test for AppleStyleSettingTab settings rendering. Goal: any future refactor
// that accidentally drops a Setting from the wechat tab or the multi-platform
// tab will be caught here. This was motivated by commit d115abd silently
// dropping「使用系统回收站」and「API 代理地址」when refactoring 高级设置 into the
// wechat tab — neither change had a test, so the regression went unnoticed.
//
// Invariant: when the test fails, fix the SettingTab UI, not the test —
// unless the field has been intentionally retired.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { createObsidianLikeElement } = require('./helpers/obsidian-dom.js');
const { loadInputModule } = require('./helpers/input-module.cjs');
const { AppleStyleSettingTab } = loadInputModule();

function makeMinimalSettings(overrides = {}) {
  return {
    theme: 'github',
    themeColor: 'blue',
    customColor: '#0366d6',
    quoteCalloutStyleMode: 'theme',
    fontFamily: 'sans-serif',
    fontSize: 3,
    macCodeBlock: true,
    codeLineNumber: true,
    avatarUrl: '',
    avatarBase64: '',
    enableWatermark: false,
    showImageCaption: true,
    normalizeChinesePunctuation: true,
    wechatAccounts: [],
    defaultAccountId: '',
    proxyUrl: '',
    usePhoneFrame: true,
    sidePadding: 16,
    coloredHeader: false,
    cleanupAfterSync: false,
    cleanupUseSystemTrash: true,
    cleanupDirTemplate: '',
    multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: '',
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: {
        status: 'untested',
        checkedAt: 0,
        platforms: [],
        capabilities: {},
        message: '',
      },
      recentTasks: [],
    },
    wechatAppId: '',
    wechatAppSecret: '',
    ai: {
      enabled: false,
      providers: [],
      defaultProviderId: '',
      defaultLayoutFamily: 'auto',
      defaultColorPalette: 'auto',
      includeImagesInLayout: true,
      requestTimeoutMs: 45000,
      articleLayoutsByPath: {},
    },
    ...overrides,
  };
}

function makePlugin(settingsOverrides = {}) {
  return {
    app: {},
    manifest: { dir: '/test', id: 'wechat-converter', version: '0.0.0-test' },
    settings: makeMinimalSettings(settingsOverrides),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    openExternalUrl: vi.fn(() => true),
    startWechatSyncBridgeInBackground: vi.fn(),
    _wechatSyncBridgeService: null,
    getWechatSyncBridgeService: vi.fn(() => ({
      start: vi.fn().mockResolvedValue({}),
      waitForConnection: vi.fn().mockResolvedValue(undefined),
      health: vi.fn().mockResolvedValue({ ok: true, tokenValid: true }),
      listSupportedPlatforms: vi.fn().mockResolvedValue([]),
      getAuthSnapshot: vi.fn().mockResolvedValue({ platforms: [], checkedAt: 0 }),
      checkAuth: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn().mockResolvedValue({}),
    })),
    getConverterView: vi.fn(() => null),
    getArticleLayoutState: vi.fn(() => null),
  };
}

function renderTab(plugin) {
  const tab = new AppleStyleSettingTab(plugin.app, plugin);
  tab.containerEl = createObsidianLikeElement('div');
  tab.renderSettingsContent();
  return tab;
}

describe('AppleStyleSettingTab settings rendering - smoke test', () => {
  beforeEach(() => {
    globalThis.__obsidianSettingNamesRegistry = [];
    globalThis.__obsidianSettingDescriptionsRegistry = [];
    globalThis.__obsidianSettingInstancesRegistry = [];
    globalThis.__obsidianButtonRegistry = [];
    globalThis.__obsidianModalRegistry = [];
    globalThis.__obsidianDisableSetDestructiveForButtons = false;
  });

  it('loads via the resolver patch (sanity check)', () => {
    expect(globalThis.__obsidianMockLoaded).toBe(true);
  });

  it('uses the imperative full-page fallback on Obsidian 1.13+', () => {
    const plugin = makePlugin();
    const tab = new AppleStyleSettingTab(plugin.app, plugin);
    tab.containerEl = createObsidianLikeElement('div');

    // Obsidian 1.13 only calls display() when getSettingDefinitions() is
    // empty. A non-empty definition would render the custom multi-tab page
    // inside one setting row and leave only its title/description visible.
    const definitions = tab.getSettingDefinitions();
    expect(definitions).toEqual([]);

    tab.display();

    expect(globalThis.__obsidianSettingNamesRegistry.length).toBeGreaterThan(5);
    expect(tab.containerEl.querySelector('.apple-settings-tabs')).not.toBeNull();
    expect(tab.containerEl.textContent).toContain('暂无账号，请点击下方按钮添加');
    expect(tab.containerEl.querySelector('.wechat-btn-add')?.textContent).toBe('+ 添加账号');
  });

  it('renders the wechat-tab core sections without throwing', () => {
    const plugin = makePlugin();
    expect(() => renderTab(plugin)).not.toThrow();
    expect(globalThis.__obsidianSettingNamesRegistry.length).toBeGreaterThan(5);
  });

  it('keeps the公众号首次配置指南 inline with the account heading', () => {
    const plugin = makePlugin();
    renderTab(plugin);

    expect(globalThis.__obsidianSettingNamesRegistry).not.toContain('公众号首次配置指南');
    expect(
      globalThis.__obsidianButtonRegistry.some(
        (button) => button.text === '查看图文指南 →'
      )
    ).toBe(false);
    expect(
      globalThis.__obsidianButtonRegistry.some(
        (button) => button.text === '查看使用指南 →'
      )
    ).toBe(false);

    const accountGuideDescription = globalThis.__obsidianSettingInstancesRegistry.find(
      (setting) => setting.name === '微信公众号账号'
    )?.descEl;
    expect(accountGuideDescription?.textContent).toContain(
      '首次配置请先完成 IP 白名单设置。 查看图文指南 →'
    );
    expect(accountGuideDescription?.textContent).not.toContain('[object DocumentFragment]');
    const accountGuideLink = accountGuideDescription?.querySelector('a');
    expect(accountGuideLink?.classList.contains('apple-settings-guide-link')).toBe(true);
    expect(accountGuideLink?.href).toBe(
      'https://xiaoweibox.top/obsidian-publisher/guide#wechat-api'
    );

    accountGuideLink.click();

    expect(plugin.openExternalUrl).toHaveBeenCalledWith(
      'https://xiaoweibox.top/obsidian-publisher/guide#wechat-api'
    );

    const customCssGuideDescription = globalThis.__obsidianSettingInstancesRegistry.find(
      (setting) => setting.name === '使用指南'
    )?.descEl;
    expect(customCssGuideDescription?.textContent).toContain(
      '可直接复制的示例与禁忌坑位。 查看使用指南 →'
    );
    expect(customCssGuideDescription?.textContent).not.toContain('[object DocumentFragment]');
    const customCssGuideLink = customCssGuideDescription?.querySelector('a');
    expect(customCssGuideLink?.classList.contains('apple-settings-guide-link')).toBe(true);
    expect(customCssGuideLink?.href).toBe(
      'https://xiaoweibox.top/obsidian-publisher/guide/custom-css'
    );

    customCssGuideLink.click();

    expect(plugin.openExternalUrl).toHaveBeenCalledWith(
      'https://xiaoweibox.top/obsidian-publisher/guide/custom-css'
    );
  });

  it('preserves the settings scroll position across a background refresh', () => {
    const plugin = makePlugin();
    const tab = renderTab(plugin);
    tab.containerEl.scrollTop = 480;

    tab.renderSettingsContent();

    expect(tab.containerEl.scrollTop).toBe(480);
  });

  it('shows a quiet custom CSS status row without rebuilding the settings tab', async () => {
    const plugin = makePlugin({
      enableCustomCss: true,
      customCss: 'h2 { color: red; }',
      customCssNote: '',
    });
    plugin.getConverterView = vi.fn(() => ({
      customCssStatus: {
        state: 'unmatched',
        sourceIdentity: 'textarea',
        diagnostics: [],
      },
    }));

    const tab = renderTab(plugin);
    expect(tab.containerEl.querySelector('.owc-custom-css-status')?.textContent)
      .toContain('当前状态');
    await vi.waitFor(() => {
      expect(tab.containerEl.querySelector('.owc-custom-css-status')?.textContent)
        .not.toContain('正在检查自定义 CSS');
    });
  });

  it('exposes a GitHub star shortcut at the top of settings', () => {
    const plugin = makePlugin();
    const tab = renderTab(plugin);

    const banner = tab.containerEl.querySelector('.apple-settings-github-banner');
    const starButton = banner?.querySelector('.apple-settings-github-button');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('喜欢这个插件？');
    expect(starButton).not.toBeNull();
    expect(tab.containerEl.querySelector('.apple-settings-intro')).toBeNull();
    expect(tab.containerEl.querySelector('.apple-settings-tab-intro')?.textContent).toContain('配置公众号账号、封面摘要和微信预览相关选项');
    expect(tab.containerEl.querySelector('.apple-settings-tab-intro')?.textContent).not.toContain('不会改变');

    starButton.click();

    expect(plugin.openExternalUrl).toHaveBeenCalledWith('https://github.com/DavidLam-oss/obsidian-wechat-converter');
  });

  it('pins the GitHub banner and tab bar inside a sticky header shell', () => {
    const tab = renderTab(makePlugin());

    const sticky = tab.containerEl.querySelector('.apple-settings-sticky-header');
    expect(sticky).not.toBeNull();
    // Both the banner and the tab bar must live inside the sticky shell so
    // they stay pinned together while the settings body scrolls.
    expect(sticky.querySelector('.apple-settings-github-banner')).not.toBeNull();
    expect(sticky.querySelector('.apple-settings-tabs')).not.toBeNull();
    // Tab contents must stay outside the sticky shell.
    expect(sticky.querySelector('.apple-settings-tab-content')).toBeNull();
  });

  it('covers the full Obsidian settings top padding without widening the visual inset', () => {
    const plugin = makePlugin();
    const tab = new AppleStyleSettingTab(plugin.app, plugin);
    tab.containerEl = createObsidianLikeElement('div');
    tab.containerEl.setCssStyles({ paddingTop: '48px' });

    tab.renderSettingsContent();

    const sticky = tab.containerEl.querySelector('.apple-settings-sticky-header');
    expect(sticky.style.top).toBe('-48px');
    expect(sticky.style.marginTop).toBe('-48px');
    // Keep the CSS-defined 32px visual inset instead of expanding it to the
    // 48px scrollport mask used by Obsidian 1.13.4.
    expect(sticky.style.paddingTop).toBe('');
  });

  it('paints the sticky header with the pane\u2019s real opaque background', () => {
    const plugin = makePlugin();
    const tab = new AppleStyleSettingTab(plugin.app, plugin);
    tab.containerEl = createObsidianLikeElement('div');
    // Simulate a theme that keeps the settings pane transparent and paints
    // the actual color on an outer modal layer.
    const modalLayer = createObsidianLikeElement('div');
    modalLayer.setCssStyles({ backgroundColor: 'rgb(24, 25, 26)' });
    modalLayer.appendChild(tab.containerEl);
    tab.renderSettingsContent();

    const sticky = tab.containerEl.querySelector('.apple-settings-sticky-header');
    expect(sticky.style.backgroundColor).toBe('rgb(24, 25, 26)');
  });

  it('keeps 高级设置 fields that earlier refactors silently dropped', () => {
    // Regression guard for commit d115abd. If you remove either of these,
    // either restore them (recommended) or update this test deliberately.
    renderTab(makePlugin());
    const names = globalThis.__obsidianSettingNamesRegistry;
    expect(names).toContain('发送成功后自动清理资源');
    expect(names).toContain('清理目录');
    expect(names).toContain('使用系统回收站');
    expect(names).toContain('API 代理地址');
  });

  it('renders the preview / watermark headings on the wechat tab', () => {
    renderTab(makePlugin());
    const names = globalThis.__obsidianSettingNamesRegistry;
    expect(names).toContain('预览模式');
    expect(names).toContain('使用手机仿真框');
    expect(names).toContain('图片水印');
  });

  it('cancels AI Provider deletion through an Obsidian confirmation modal', async () => {
    const plugin = makePlugin({
      ai: {
        enabled: true,
        providers: [{
          id: 'provider-1',
          name: '测试 Provider',
          kind: 'openai-compatible',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'secret',
          model: 'gpt-test',
          enabled: true,
        }],
        defaultProviderId: 'provider-1',
        defaultLayoutFamily: 'auto',
        defaultColorPalette: 'auto',
        includeImagesInLayout: true,
        requestTimeoutMs: 45000,
        articleLayoutsByPath: {},
      },
    });
    const tab = renderTab(plugin);
    const deleteButton = Array.from(tab.containerEl.querySelectorAll('button'))
      .find((button) => button.textContent === '删除');
    expect(deleteButton).toBeDefined();

    const pending = deleteButton.onclick();
    const modal = globalThis.__obsidianModalRegistry.at(-1);
    expect(modal.titleEl.textContent).toBe('删除 AI Provider');
    modal.contentEl.querySelector('button').click();
    await pending;

    expect(plugin.settings.ai.providers).toHaveLength(1);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it('confirms AI Provider deletion through an Obsidian confirmation modal', async () => {
    const plugin = makePlugin({
      ai: {
        enabled: true,
        providers: [{
          id: 'provider-1',
          name: '测试 Provider',
          kind: 'openai-compatible',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'secret',
          model: 'gpt-test',
          enabled: true,
        }],
        defaultProviderId: 'provider-1',
        defaultLayoutFamily: 'auto',
        defaultColorPalette: 'auto',
        includeImagesInLayout: true,
        requestTimeoutMs: 45000,
        articleLayoutsByPath: {},
      },
    });
    const tab = renderTab(plugin);
    const deleteButton = Array.from(tab.containerEl.querySelectorAll('button'))
      .find((button) => button.textContent === '删除');

    const pending = deleteButton.onclick();
    const modal = globalThis.__obsidianModalRegistry.at(-1);
    const confirmButton = Array.from(modal.contentEl.querySelectorAll('button'))
      .find((button) => button.textContent === '删除');
    confirmButton.click();
    await pending;

    expect(plugin.settings.ai.providers).toEqual([]);
    expect(plugin.settings.ai.defaultProviderId).toBe('');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it('marks destructive Setting buttons with setDestructive and clears AI layout cache only after confirmation', async () => {
    const plugin = makePlugin({
      ai: {
        enabled: true,
        providers: [],
        defaultProviderId: '',
        defaultLayoutFamily: 'auto',
        defaultColorPalette: 'auto',
        includeImagesInLayout: true,
        requestTimeoutMs: 45000,
        articleLayoutsByPath: {
          'notes/demo.md': {
            layoutJson: {
              articleType: 'tutorial',
              stylePack: 'tech-green',
              blocks: [{ type: 'lead-quote', text: 'hello' }],
            },
          },
        },
      },
    });
    renderTab(plugin);
    const clearButton = globalThis.__obsidianButtonRegistry.find((button) => button.text === '清空缓存');
    expect(clearButton).toBeDefined();
    expect(clearButton.destructive).toBe(true);

    const pending = clearButton.clickHandler();
    const modal = globalThis.__obsidianModalRegistry.at(-1);
    expect(modal.titleEl.textContent).toBe('清空 AI 编排缓存');
    const confirmButton = Array.from(modal.contentEl.querySelectorAll('button'))
      .find((button) => button.textContent === '清空');
    confirmButton.click();
    await pending;

    expect(plugin.settings.ai.articleLayoutsByPath).toEqual({});
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it('falls back to setWarning when setDestructive is unavailable on older Obsidian buttons', () => {
    globalThis.__obsidianDisableSetDestructiveForButtons = true;
    renderTab(makePlugin({
      avatarBase64: 'data:image/png;base64,ZmFrZQ==',
    }));

    const clearButton = globalThis.__obsidianButtonRegistry.find((button) => button.text === '清除');
    expect(clearButton).toBeDefined();
    expect(clearButton.destructive).toBeUndefined();
    expect(clearButton.warning).toBe(true);
  });

  it('renders the multi-platform tab core fields when bridge is enabled', () => {
    renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: '',
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'untested', checkedAt: 0, platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));
    const names = globalThis.__obsidianSettingNamesRegistry;
    expect(names).toContain('启用浏览器插件发布');
    expect(names).toContain('本地服务端口');
    expect(names).toContain('连接令牌');
    expect(names).toContain('测试连接');
    expect(names).toContain('读取已选平台状态');
  });

  it('shows Pro identity in the multi-platform panel without adding a settings-tab badge', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'token',
      supportedPlatforms: [],
      selectedPlatforms: [],
      connectedClients: [{ extensionInstanceId: 'pro-client', status: 'connected', license: { state: 'pro', observedAt: Date.now() } }],
      connection: { status: 'connected', checkedAt: Date.now(), platforms: [], capabilities: { proLicensed: true }, message: '' },
      recentTasks: [],
    } }));

    const tabBadge = tab.containerEl.querySelector('.apple-settings-tab-multi .wechat-pro-identity-badge');
    const panel = tab.containerEl.querySelector('.wechat-multiplatform-onboarding.is-pro');
    expect(tabBadge).toBeNull();
    expect(panel?.textContent).toContain('Pro 已激活');
    expect(panel?.textContent).toContain('不再受免费版每日平台数量限制');
  });

  it('does not treat stale cached Pro identity as active when browser publishing is disabled', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: false,
      port: 9527,
      token: 'token',
      supportedPlatforms: [],
      selectedPlatforms: [],
      connectedClients: [],
      connection: { status: 'connected', checkedAt: Date.now(), platforms: [], capabilities: { proLicensed: true }, message: '' },
      recentTasks: [],
    } }));

    const panel = tab.containerEl.querySelector('.wechat-multiplatform-onboarding:not(.is-pro)');
    expect(panel?.textContent).not.toContain('上次连接时识别为 Pro');
    expect(panel?.textContent).toContain('免费版每天 1 个平台额度');
    expect(panel?.textContent).not.toContain('多平台发布已解锁');
    expect(panel?.textContent).not.toContain('不再受免费版每日平台数量限制');
  });

  it('renders cached (offline) Pro identity with a badge when the browser is disconnected but within the staleness window', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'token',
      supportedPlatforms: [],
      selectedPlatforms: [],
      // Disconnected client whose Pro snapshot is fresh (observedAt ~ now).
      connectedClients: [{ extensionInstanceId: 'pro-cached', status: 'disconnected', license: { state: 'pro', observedAt: Date.now() } }],
      connection: { status: 'untested', checkedAt: 0, platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));

    const panel = tab.containerEl.querySelector('.wechat-multiplatform-onboarding.is-pro');
    expect(panel?.textContent).toContain('Pro 身份已保留');
    expect(panel?.textContent).toContain('重新连接浏览器即可刷新状态');
    const badge = panel?.querySelector('.wechat-pro-identity-badge');
    expect(badge?.textContent).toBe('Pro');
  });

  it('keeps the cached Pro badge visible even when browser publishing is toggled off', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: false,
      port: 9527,
      token: 'token',
      supportedPlatforms: [],
      selectedPlatforms: [],
      connectedClients: [{ extensionInstanceId: 'pro-cached', status: 'disconnected', license: { state: 'pro', observedAt: Date.now() } }],
      connection: { status: 'untested', checkedAt: 0, platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));

    const panel = tab.containerEl.querySelector('.wechat-multiplatform-onboarding.is-pro');
    expect(panel?.textContent).toContain('Pro 身份已保留');
    const badge = panel?.querySelector('.wechat-pro-identity-badge');
    expect(badge?.textContent).toBe('Pro');
  });

  it('does not expose hidden fallback-only platforms in the settings picker', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'token',
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'failed', checkedAt: 123, platforms: [], capabilities: {}, message: '浏览器插件连接失败' },
      recentTasks: [],
    } }));
    const platformIds = Array.from(tab.containerEl.querySelectorAll('.wechat-platform-chip input'))
      .map((input) => input.value);

    expect(platformIds).not.toContain('wordpress');
    expect(platformIds).not.toContain('typecho');
    expect(platformIds).not.toContain('zip-download');
  });

  it('testing the bridge connection does not read or refresh platform auth state', async () => {
    const bridge = {
      start: vi.fn().mockResolvedValue({}),
      waitForConnection: vi.fn().mockResolvedValue(undefined),
      health: vi.fn().mockResolvedValue({ ok: true, tokenValid: true, capabilities: {} }),
      listSupportedPlatforms: vi.fn().mockResolvedValue([
        { id: 'zhihu', name: '知乎' },
        { id: 'juejin', name: '掘金' },
      ]),
      getAuthSnapshot: vi.fn().mockResolvedValue({ platforms: [], checkedAt: 0 }),
      checkAuth: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn().mockResolvedValue({}),
    };
    const plugin = makePlugin({
      multiPlatformSync: {
        enabled: true,
        port: 9527,
        token: 'token',
        supportedPlatforms: [],
        selectedPlatforms: ['zhihu'],
        connection: {
          status: 'connected',
          checkedAt: 123,
          platforms: [
            { id: 'zhihu', name: '知乎', authKnown: true, authenticated: true, username: 'Lin' },
          ],
          capabilities: {},
          message: '',
        },
        recentTasks: [],
      },
    });
    plugin.getWechatSyncBridgeService = vi.fn(() => bridge);

    renderTab(plugin);
    const testButton = globalThis.__obsidianButtonRegistry.find((button) => button.text === '测试');
    expect(testButton).toBeDefined();

    await testButton.clickHandler();

    expect(bridge.health).toHaveBeenCalled();
    expect(bridge.listSupportedPlatforms).toHaveBeenCalled();
    expect(bridge.getAuthSnapshot).not.toHaveBeenCalled();
    expect(bridge.checkAuth).not.toHaveBeenCalled();
    expect(plugin.settings.multiPlatformSync.connection.platforms).toEqual([
      expect.objectContaining({ id: 'zhihu', authenticated: true, username: 'Lin' }),
    ]);
    expect(plugin.settings.multiPlatformSync.connection.message).toContain('未读取平台登录状态');
  });

  it('reads cached selected platform auth state without running a live auth check', async () => {
    const bridge = {
      start: vi.fn().mockResolvedValue({}),
      waitForConnection: vi.fn().mockResolvedValue(undefined),
      health: vi.fn().mockResolvedValue({ ok: true, tokenValid: true, capabilities: {} }),
      listSupportedPlatforms: vi.fn().mockResolvedValue([]),
      getAuthSnapshot: vi.fn().mockResolvedValue({
        checkedAt: 456,
        platforms: [
          { id: 'zhihu', name: '知乎', authKnown: true, authenticated: true, username: 'Lin' },
        ],
      }),
      checkAuth: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn().mockResolvedValue({}),
    };
    const plugin = makePlugin({
      multiPlatformSync: {
        enabled: true,
        port: 9527,
        token: 'token',
        supportedPlatforms: [{ id: 'zhihu', name: '知乎' }],
        selectedPlatforms: ['zhihu'],
        connection: {
          status: 'connected',
          checkedAt: 123,
          platforms: [],
          capabilities: {},
          message: '',
        },
        recentTasks: [],
      },
    });
    plugin.getWechatSyncBridgeService = vi.fn(() => bridge);

    renderTab(plugin);
    const readButton = globalThis.__obsidianButtonRegistry.find((button) => button.text === '读取');
    expect(readButton).toBeDefined();

    await readButton.clickHandler();

    expect(bridge.getAuthSnapshot).toHaveBeenCalledWith({
      platforms: ['zhihu'],
      maxAgeMs: 86400000,
      timeoutMs: 5000,
    });
    expect(bridge.checkAuth).not.toHaveBeenCalled();
    expect(plugin.settings.multiPlatformSync.connection.platforms).toEqual([
      expect.objectContaining({ id: 'zhihu', authenticated: true, username: 'Lin' }),
    ]);
    expect(plugin.settings.multiPlatformSync.connection.message).toContain('已读取所选平台的上次登录状态');
  });

  it('unified status bar shows 「连接失败」 and error message when connection.status is failed', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'abc',
      connectedClients: [],
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: {
        status: 'failed',
        checkedAt: Date.now(),
        platforms: [],
        capabilities: {},
        message: '连接令牌校验失败',
      },
      recentTasks: [],
    } }));

    const dot = tab.containerEl.querySelector('.wechat-multiplatform-token-status-dot');
    expect(dot).not.toBeNull();
    expect(dot.classList.contains('is-error')).toBe(true);
    expect(dot.textContent).toBe('连接失败');
    const body = tab.containerEl.querySelector('.wechat-bridge-status-body');
    expect(body.textContent).toContain('连接令牌校验失败');

    // Unified bar must come before the platform picker.
    const unifiedBar = tab.containerEl.querySelector('.wechat-multiplatform-token-status');
    const picker = tab.containerEl.querySelector('.wechat-platform-picker');
    expect(picker).not.toBeNull();
    expect(unifiedBar.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not render the unified status bar or platform section when bridge is disabled', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: false,
      port: 9527,
      token: '',
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'untested', checkedAt: 0, platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));
    expect(tab.containerEl.querySelector('.wechat-multiplatform-token-status')).toBeNull();
    expect(tab.containerEl.querySelector('.wechat-platform-picker')).toBeNull();
  });

  it('hides bridge-config fields and diagnostics when bridge is disabled', () => {
    renderTab(makePlugin({ multiPlatformSync: {
      enabled: false,
      port: 9527,
      token: '',
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'untested', checkedAt: 0, platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));
    const names = globalThis.__obsidianSettingNamesRegistry;
    expect(names).toContain('启用浏览器插件发布');
    expect(names).not.toContain('本地服务端口');
    expect(names).not.toContain('测试连接');
    expect(names).not.toContain('读取已选平台状态');
  });

  // Sprint 1 §4.1 introduced three visible affordances; later cleanup
  // pruned two of them, leaving the user-facing surface as just the
  // token state badge:
  //   1. "兼容旧版浏览器插件（过渡）" — removed in Sprint 3 (hello is
  //      now the only auth path)
  //   2. "允许远程访问（高级）" — hidden post-Sprint-3 because普通用户
  //      用不上；底层 settings.allowRemote / bridge bind host / cache
  //      key 全部保留，可通过手动编辑 data.json 启用
  //   3. token state badge (未填 / 已填 / 已验证) — kept

  it('does not expose the advanced allowRemote / legacy-compat toggles to ordinary users', () => {
    renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'abc',
      allowRemote: false,
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'untested', checkedAt: 0, platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));
    const names = globalThis.__obsidianSettingNamesRegistry;
    expect(names).not.toContain('允许远程访问（高级）');
    expect(names).not.toContain('兼容旧版浏览器插件（过渡）');
  });

  it('renders the Sprint 1 §4.1 token-state badge in the "未填" state when token is empty', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: '',
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'untested', checkedAt: 0, platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));
    const dot = tab.containerEl.querySelector('.wechat-multiplatform-token-status-dot');
    expect(dot).not.toBeNull();
    expect(dot.classList.contains('is-error')).toBe(true);
    expect(dot.textContent).toBe('未填写');
  });

  it('renders the Sprint 1 §4.1 token-state badge in the "已填" state when token is set but unverified', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'abc-xyz',
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'untested', checkedAt: 0, platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));
    const dot = tab.containerEl.querySelector('.wechat-multiplatform-token-status-dot');
    expect(dot).not.toBeNull();
    expect(dot.classList.contains('is-unknown')).toBe(true);
    expect(dot.textContent).toBe('等待连接');
  });

  it('renders the Sprint 1 §4.1 token-state badge in the "已验证" state when bridge handshake succeeded', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'abc-xyz',
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'connected', checkedAt: Date.now(), platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));
    const dot = tab.containerEl.querySelector('.wechat-multiplatform-token-status-dot');
    expect(dot).not.toBeNull();
    expect(dot.classList.contains('is-ok')).toBe(true);
    expect(dot.textContent).toBe('已就绪');
  });

  it('§16 Phase 1: 无 connectedClients 且未测试时显示「等待连接」', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'abc',
      connectedClients: [],
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'untested', checkedAt: 0, platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));
    const dot = tab.containerEl.querySelector('.wechat-multiplatform-token-status-dot');
    expect(dot).not.toBeNull();
    expect(dot.classList.contains('is-unknown')).toBe(true);
    expect(dot.textContent).toBe('等待连接');
  });

  it('shows pending browser pairing and approves only after an explicit click', async () => {
    const pairClient = vi.fn(() => true);
    const plugin = makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'migration-token',
      connectedClients: [],
      pairedClients: [],
      pendingClients: [{
        extensionInstanceId: 'pending-profile',
        credentialHash: 'a'.repeat(64),
        browserName: 'comet',
        profileLabel: '写作号',
        extensionVersion: '0.2.9',
        reason: 'pairing_required',
      }],
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'failed', checkedAt: Date.now(), platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } });
    plugin.getWechatSyncBridgeService = vi.fn(() => ({ pairClient }));
    const tab = renderTab(plugin);
    const panel = tab.containerEl.querySelector('.wechat-bridge-pairing-panel');
    expect(panel?.textContent).toContain('写作号');
    expect(pairClient).not.toHaveBeenCalled();
    panel.querySelector('button')?.click();
    await Promise.resolve();
    expect(pairClient).toHaveBeenCalledWith('pending-profile');
  });

  it('§16 Phase 1: 有 profileLabel 时显示 profileLabel（不再叠加 browserName）', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'abc',
      connectedClients: [{
        extensionInstanceId: 'test-instance-id-001',
        browserName: 'chrome',
        profileLabel: '主号',
        capabilities: {},
        extensionVersion: '1.1.4',
        status: 'connected',
        lastSeenAt: Date.now(),
        firstConnectedAt: Date.now() - 5000,
        lastConnectedAt: Date.now(),
      }],
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'connected', checkedAt: Date.now(), platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));
    const dot = tab.containerEl.querySelector('.wechat-multiplatform-token-status-dot');
    expect(dot).not.toBeNull();
    expect(dot.classList.contains('is-ok')).toBe(true);
    expect(dot.textContent).toBe('已就绪');
    const body = tab.containerEl.querySelector('.wechat-bridge-status-body');
    expect(body).not.toBeNull();
    expect(body.textContent).toContain('主号');
    // Plan B: profileLabel 存在时不再显示 'Chrome'
    expect(body.textContent).not.toContain('Chrome');
    expect(body.querySelector('.wechat-bridge-status-id')).toBeNull();
  });

  it('§16 Phase 1: 无 profileLabel 时降级显示 browserName', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'abc',
      connectedClients: [{
        extensionInstanceId: 'test-instance-id-002',
        browserName: 'chrome',
        profileLabel: '',
        capabilities: {},
        extensionVersion: '1.1.4',
        status: 'connected',
        lastSeenAt: Date.now(),
        firstConnectedAt: Date.now() - 5000,
        lastConnectedAt: Date.now(),
      }],
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'connected', checkedAt: Date.now(), platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));
    const body = tab.containerEl.querySelector('.wechat-bridge-status-body');
    expect(body).not.toBeNull();
    expect(body.textContent).toContain('Chrome');
  });

  it('§18.7 Plan B: chrome / chromium 走通用 icon（不撒谎为某个特定 fork）', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'abc',
      connectedClients: [{
        extensionInstanceId: 'test-chromium',
        browserName: 'chrome',
        profileLabel: '',
        capabilities: {},
        extensionVersion: '1.1.4',
        status: 'connected',
        lastSeenAt: Date.now(),
        firstConnectedAt: Date.now() - 5000,
        lastConnectedAt: Date.now(),
      }],
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'connected', checkedAt: Date.now(), platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));
    const body = tab.containerEl.querySelector('.wechat-bridge-status-body');
    expect(body.querySelector('.wechat-bridge-browser-icon')).toBeNull();         // no SVG
    expect(body.querySelector('.wechat-bridge-browser-icon-generic')).not.toBeNull(); // generic span
  });

  it('§18.7 Plan B: opt-in 浏览器（如 edge）保留各自品牌 SVG', () => {
    const tab = renderTab(makePlugin({ multiPlatformSync: {
      enabled: true,
      port: 9527,
      token: 'abc',
      connectedClients: [{
        extensionInstanceId: 'test-edge',
        browserName: 'edge',
        profileLabel: '',
        capabilities: {},
        extensionVersion: '1.1.4',
        status: 'connected',
        lastSeenAt: Date.now(),
        firstConnectedAt: Date.now() - 5000,
        lastConnectedAt: Date.now(),
      }],
      supportedPlatforms: [],
      selectedPlatforms: [],
      connection: { status: 'connected', checkedAt: Date.now(), platforms: [], capabilities: {}, message: '' },
      recentTasks: [],
    } }));
    const body = tab.containerEl.querySelector('.wechat-bridge-status-body');
    expect(body.querySelector('.wechat-bridge-browser-icon')).not.toBeNull();
  });
});
