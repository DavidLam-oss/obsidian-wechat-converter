/*
## 核心功能

图片卡片全局默认（C02）的归一化与会话接线测试：设置层 cardDefaults 的默认值/迁移兼容、
注册表按会话创建注入默认、视图从 plugin.settings 取默认、设置页「卡片」页签渲染与保存。

## 输入

被测模块（plugin-settings / card-session / card-tab / AppleStyleView）、mock 的 Obsidian
环境与受控 plugin 桩。

## 输出

输出自动化断言：非法枚举回落、越界钳制、exportRoot 归一化、无关键不受影响、
新会话读新默认而已调整会话保持、页签操作持久化。

## 定位

位于 tests/，保护 C02 的全局默认边界（全局默认 ≠ 当前笔记会话设置）。

## 依赖

关键依赖：Vitest、__mocks__/obsidian.js、tests/helpers/input-module.cjs。

## 维护规则

- 归一化规则变化时同步更新断言；迁移标记（didMigrate）语义与 settings_migration.test.js 一致。
- 不在此测深度路径校验（保留目录拒绝属 card_export_paths.test.js）。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

const obsidian = require('obsidian');
const { __applyExtensions: applyExtensions } = obsidian;
const { loadInputModule } = require('./helpers/input-module.cjs');

const {
  createDefaultSettings,
  createDefaultCardSettings,
  normalizeLoadedSettings,
} = await import('../services/plugin-settings.js');
const { createCardSessionRegistry } = await import('../services/card-session.js');
const { DEFAULT_CARD_LAYOUT_SETTINGS } = await import('../services/card-settings-model.js');
const { renderCardSettingsTab } = await import('../views/settings/card-tab.js');
const { AppleStyleView } = loadInputModule();

describe('卡片全局默认：设置层归一化（C02）', () => {
  it('默认值 = 内置排版默认 + 默认导出目录', () => {
    expect(createDefaultCardSettings()).toEqual({
      themeId: 'clear-notes',
      ratioId: '3:4',
      fontSize: 14,
      lineHeight: 1.7,
      pagePadding: 28,
      exportRoot: '卡片导出',
    });
    expect(createDefaultSettings().cardDefaults).toEqual(createDefaultCardSettings());
  });

  it('缺字段 / 非法枚举 / 越界数值 → 回落钳制；exportRoot 反斜杠与首尾斜杠归一化', () => {
    const { settings, didMigrate } = normalizeLoadedSettings({
      clientId: 'c1',
      cardDefaults: {
        themeId: 'nope',
        ratioId: '9:16',
        fontSize: 999,
        lineHeight: 'abc',
        pagePadding: -5,
        exportRoot: '\\abs\\path\\',
      },
    });
    expect(settings.cardDefaults).toEqual({
      themeId: 'clear-notes',
      ratioId: '3:4',
      fontSize: 18,
      lineHeight: 1.7,
      pagePadding: 16,
      exportRoot: 'abs/path',
    });
    expect(didMigrate).toBe(true);
  });

  it('已合法的 cardDefaults 不标记迁移；缺失时补默认', () => {
    const valid = createDefaultCardSettings();
    const ok = normalizeLoadedSettings({ clientId: 'c1', cardDefaults: { ...valid } });
    expect(ok.settings.cardDefaults).toEqual(valid);
    expect(ok.didMigrate).toBe(false);

    const filled = normalizeLoadedSettings({ clientId: 'c1' });
    expect(filled.settings.cardDefaults).toEqual(createDefaultCardSettings());
  });

  it('cardDefaults 为非对象时回落默认；不触碰其他设置键', () => {
    const { settings } = normalizeLoadedSettings({
      clientId: 'c1',
      cardDefaults: 'garbage',
      customCss: '.md { color: red }',
      wechatAccounts: [{ id: 'a1', name: 'n', appId: 'id', appSecret: 's' }],
    });
    expect(settings.cardDefaults).toEqual(createDefaultCardSettings());
    expect(settings.customCss).toBe('.md { color: red }');
    expect(settings.wechatAccounts).toHaveLength(1);
  });
});

describe('卡片全局默认：会话创建注入（C02④）', () => {
  it('新会话读取注入默认；非法值回落内置默认', () => {
    const registry = createCardSessionRegistry({
      getLayoutDefaults: () => ({ themeId: 'paper-notes', fontSize: 16 }),
    });
    expect(registry.getSession('a.md').getLayoutSettings()).toEqual({
      ...DEFAULT_CARD_LAYOUT_SETTINGS,
      themeId: 'paper-notes',
      fontSize: 16,
    });

    const bad = createCardSessionRegistry({ getLayoutDefaults: () => ({ themeId: 'nope' }) });
    expect(bad.getSession('b.md').getLayoutSettings().themeId).toBe('clear-notes');

    const plain = createCardSessionRegistry();
    expect(plain.getSession('c.md').getLayoutSettings()).toEqual(DEFAULT_CARD_LAYOUT_SETTINGS);
  });

  it('已调整会话保持不变；之后新建的会话才读取新默认', () => {
    let defaults = { themeId: 'paper-notes' };
    const registry = createCardSessionRegistry({ getLayoutDefaults: () => defaults });

    const session = registry.getSession('a.md');
    session.applyLayoutSettings({ fontSize: 18 });
    expect(session.getLayoutSettings().fontSize).toBe(18);

    defaults = { themeId: 'dark-take', fontSize: 12 };
    expect(session.getLayoutSettings()).toMatchObject({ themeId: 'paper-notes', fontSize: 18 });
    expect(registry.getSession('b.md').getLayoutSettings()).toMatchObject({
      themeId: 'dark-take',
      fontSize: 12,
    });
  });

  it('视图从 plugin.settings.cardDefaults 取默认；无配置时用内置默认', () => {
    const view = new AppleStyleView(null, {
      settings: { cardDefaults: { themeId: 'dark-take', fontSize: 18 } },
    });
    expect(view.getCardSessions().getSession('x.md').getLayoutSettings()).toMatchObject({
      themeId: 'dark-take',
      fontSize: 18,
    });

    const bare = new AppleStyleView(null, { settings: {} });
    expect(bare.getCardSessions().getSession('y.md').getLayoutSettings()).toEqual(
      DEFAULT_CARD_LAYOUT_SETTINGS,
    );
  });
});

describe('设置页「卡片」页签（C02③）', () => {
  beforeEach(() => {
    globalThis.__obsidianSettingNamesRegistry = [];
    globalThis.__obsidianSettingDescriptionsRegistry = [];
    globalThis.__obsidianSettingInstancesRegistry = [];
    globalThis.__obsidianButtonRegistry = [];
  });

  function makeTab(cardOverrides = {}) {
    return {
      renderSettingsTabIntro: vi.fn(),
      plugin: {
        settings: { cardDefaults: { ...createDefaultCardSettings(), ...cardOverrides } },
        saveSettings: vi.fn(async () => undefined),
        obsidianApi: obsidian,
      },
    };
  }

  function renderTab(tab) {
    const containerEl = applyExtensions(document.createElement('div'));
    renderCardSettingsTab(tab, containerEl, { obsidianApi: obsidian });
    return containerEl;
  }

  it('渲染主题三选（当前项高亮）与各设置项说明', () => {
    const tab = makeTab({ themeId: 'paper-notes' });
    const containerEl = renderTab(tab);

    expect(containerEl.textContent).toContain('图片卡片全局默认');
    expect(globalThis.__obsidianSettingNamesRegistry).toEqual(
      expect.arrayContaining(['默认主题', '默认比例', '正文字号', '行高', '页面边距', '默认导出目录', '恢复内置默认']),
    );
    const buttons = globalThis.__obsidianButtonRegistry;
    const themeButtons = buttons.filter((b) => ['清晰笔记', '纸页随笔', '深色观点'].includes(b.text));
    expect(themeButtons.map((b) => b.text)).toEqual(['清晰笔记', '纸页随笔', '深色观点']);
    expect(themeButtons.find((b) => b.text === '纸页随笔').cta).toBe(true);
    expect(themeButtons.find((b) => b.text === '清晰笔记').cta).toBeFalsy();
  });

  it('点击主题按钮 → 写入 cardDefaults 并持久化', async () => {
    const tab = makeTab();
    renderTab(tab);
    const dark = globalThis.__obsidianButtonRegistry.find((b) => b.text === '深色观点');
    await dark.clickHandler();
    expect(tab.plugin.settings.cardDefaults.themeId).toBe('dark-take');
    expect(tab.plugin.saveSettings).toHaveBeenCalled();
  });

  it('恢复内置默认：只重置 cardDefaults 全局作用域', async () => {
    const tab = makeTab({ themeId: 'dark-take', fontSize: 18, exportRoot: 'my/cards' });
    renderTab(tab);
    const reset = globalThis.__obsidianButtonRegistry.find((b) => b.text === '恢复内置默认');
    await reset.clickHandler();
    expect(tab.plugin.settings.cardDefaults).toEqual(createDefaultCardSettings());
    expect(tab.plugin.saveSettings).toHaveBeenCalled();
  });
});
