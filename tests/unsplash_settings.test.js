/**
## 核心功能

测试 Unsplash Access Key 在设置层归一化、持久化以及设置面板中的渲染逻辑。

## 输入

被测模块（plugin-settings、ai-tab）、mock 的 Obsidian 环境与 fetch 适配器。

## 输出

自动化断言确保 Unsplash 配置规范运作。
*/

import { describe, it, expect, vi, beforeEach } from 'vitest';

require('obsidian');

const obsidian = require('obsidian');
const { __applyExtensions: applyExtensions } = obsidian;

const {
  createDefaultSettings,
  normalizeLoadedSettings,
} = await import('../services/plugin-settings.js');
const {
  renderAiSettingsTab,
  UNSPLASH_API_KEY_GUIDE_URL,
} = await import('../views/settings/ai-tab.js');

describe('Unsplash 设置与面板渲染', () => {
  beforeEach(() => {
    globalThis.__obsidianButtonRegistry = [];
    globalThis.__obsidianSettingNamesRegistry = [];
    globalThis.__obsidianSettingInstancesRegistry = [];
  });

  it('默认包含 unsplashAccessKey 为空字符串', () => {
    const defaults = createDefaultSettings();
    expect(defaults.unsplashAccessKey).toBe('');
  });

  it('normalizeLoadedSettings 能够清洗 unsplashAccessKey 首尾空格', () => {
    const raw = {
      unsplashAccessKey: '   my-secret-key-123   ',
    };
    const { settings, didMigrate } = normalizeLoadedSettings(raw);
    expect(settings.unsplashAccessKey).toBe('my-secret-key-123');
    expect(didMigrate).toBe(true);
  });

  it('normalizeLoadedSettings 能够将非字符串回退为空字符串', () => {
    const raw = {
      unsplashAccessKey: 12345,
    };
    const { settings, didMigrate } = normalizeLoadedSettings(raw);
    expect(settings.unsplashAccessKey).toBe('');
    expect(didMigrate).toBe(true);
  });

  it('renderAiSettingsTab 能够正常渲染 Unsplash 设置项并绑定事件', async () => {
    const containerEl = applyExtensions(document.createElement('div'));
    const mockSaveSettings = vi.fn().mockResolvedValue(undefined);
    const mockPlugin = {
      settings: {
        ai: {
          providers: [],
          defaultProviderId: '',
          defaultImageProviderId: '',
          enabled: true,
        },
        unsplashAccessKey: 'test-key-abc',
      },
      saveSettings: mockSaveSettings,
      obsidianApi: {},
    };
    const mockTab = {
      plugin: mockPlugin,
      app: {},
      renderSettingsTabIntro: vi.fn(),
      refreshOpenConverterAiState: vi.fn(),
    };

    renderAiSettingsTab(mockTab, containerEl);

    // 检查注册的 Setting 项中包含 Unsplash 相关的标题和设置项
    const settingNames = globalThis.__obsidianSettingNamesRegistry || [];
    expect(settingNames).toContain('摄影图库与搜索服务');
    expect(settingNames).toContain('Unsplash Access Key');

    // 检查行内指南链接是否存在并可点击打开
    const unsplashSetting = (globalThis.__obsidianSettingInstancesRegistry || []).find(
      (setting) => setting.name === 'Unsplash Access Key'
    );
    expect(unsplashSetting).toBeDefined();

    const guideLink = unsplashSetting.descEl?.querySelector('.apple-settings-guide-link');
    expect(guideLink).not.toBeNull();
    expect(guideLink.textContent).toContain('申请图文指引');
    expect(guideLink.getAttribute('href')).toBe(UNSPLASH_API_KEY_GUIDE_URL);

    mockPlugin.openExternalUrl = vi.fn();
    guideLink.click();
    expect(mockPlugin.openExternalUrl).toHaveBeenCalledWith(UNSPLASH_API_KEY_GUIDE_URL);

    // 检查存在测试连接按钮
    const buttons = globalThis.__obsidianButtonRegistry || [];
    const testBtn = buttons.find((btn) => btn.text === '测试连接');
    expect(testBtn).toBeDefined();
  });

  it('点击测试连接在无 Key 时提示输入，有 Key 时发起请求', async () => {
    const containerEl = applyExtensions(document.createElement('div'));
    const mockRequestUrl = vi.fn().mockResolvedValue({ status: 200 });
    const mockPlugin = {
      settings: {
        ai: { providers: [], defaultProviderId: '', defaultImageProviderId: '', enabled: true },
        unsplashAccessKey: '',
      },
      saveSettings: vi.fn(),
      obsidianApi: {
        requestUrl: mockRequestUrl,
      },
    };
    const mockTab = { plugin: mockPlugin, app: {} };

    renderAiSettingsTab(mockTab, containerEl);

    const buttons = globalThis.__obsidianButtonRegistry || [];
    const testBtn = buttons.find((btn) => btn.text === '测试连接');
    expect(testBtn).toBeDefined();

    // 1. 无 Key 时
    await testBtn.clickHandler();
    expect(mockRequestUrl).not.toHaveBeenCalled();

    // 2. 有 Key 时
    mockPlugin.settings.unsplashAccessKey = 'valid-key';
    await testBtn.clickHandler();
    expect(mockRequestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.unsplash.com/photos/random?count=1',
        headers: expect.objectContaining({
          Authorization: 'Client-ID valid-key',
        }),
      })
    );
  });
});


