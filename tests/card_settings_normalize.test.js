/*
## 核心功能

图片卡片全局默认（C02）的归一化与会话接线测试：设置层 cardDefaults 的默认值/迁移兼容、
注册表按会话创建注入默认、视图从 plugin.settings 取默认。
（2026-09-19：设置页「卡片」页签已摘除——默认值的写入路径改为转换器侧栏「调完即存」
与导出弹窗的目录记忆；前者断言在 card_sidebar_settings.test.js，后者在 card_export_flow.test.js。）

## 输入

被测模块（plugin-settings / card-session / AppleStyleView）、mock 的 Obsidian
环境与受控 plugin 桩。

## 输出

输出自动化断言：非法枚举回落、越界钳制、exportRoot 归一化、无关键不受影响、
新会话读新默认而已调整会话保持。

## 定位

位于 tests/，保护 C02 的全局默认边界（全局默认 ≠ 当前笔记会话设置）。

## 依赖

关键依赖：Vitest、__mocks__/obsidian.js、tests/helpers/input-module.cjs。

## 维护规则

- 归一化规则变化时同步更新断言；迁移标记（didMigrate）语义与 settings_migration.test.js 一致。
- 不在此测深度路径校验（保留目录拒绝属 card_export_paths.test.js）。
*/

import { describe, it, expect } from 'vitest';

require('obsidian');
const { loadInputModule } = require('./helpers/input-module.cjs');

const {
  createDefaultSettings,
  createDefaultCardSettings,
  normalizeLoadedSettings,
} = await import('../services/plugin-settings.js');
const { createCardSessionRegistry } = await import('../services/card-session.js');
const { DEFAULT_CARD_LAYOUT_SETTINGS } = await import('../services/card-settings-model.js');
const { AppleStyleView } = loadInputModule();

describe('卡片全局默认：设置层归一化（C02）', () => {
  it('默认值 = 内置排版默认（含 C01③ 三键）+ 默认导出目录', () => {
    expect(createDefaultCardSettings()).toEqual({
      themeId: 'simple-white',
      ratioId: '3:4',
      fontSize: 14,
      lineHeight: 1.7,
      pagePadding: 28,
      coverEnabled: true,
      pageNumberEnabled: true,
      watermarkText: '',
      exportRoot: '卡片导出',
    });
    expect(createDefaultSettings().cardDefaults).toEqual(createDefaultCardSettings());
  });

  it('缺字段 / 非法枚举 / 越界数值 → 回落钳制；exportRoot 反斜杠与首尾斜杠归一化', () => {
    const { settings, didMigrate } = normalizeLoadedSettings({
      clientId: 'c1',
      cardDefaults: {
        themeId: 'nope',
        ratioId: '16:9',
        fontSize: 999,
        lineHeight: 'abc',
        pagePadding: -5,
        exportRoot: '\\abs\\path\\',
      },
    });
    expect(settings.cardDefaults).toEqual({
      themeId: 'simple-white',
      ratioId: '3:4',
      fontSize: 18,
      lineHeight: 1.7,
      pagePadding: 16,
      coverEnabled: true,
      pageNumberEnabled: true,
      watermarkText: '',
      exportRoot: 'abs/path',
    });
    expect(didMigrate).toBe(true);
  });

  it('封面/页码/水印默认（C01③）：布尔回落、水印 trim 清洗不截断', () => {
    const { settings } = normalizeLoadedSettings({
      clientId: 'c1',
      cardDefaults: {
        coverEnabled: 'yes',
        pageNumberEnabled: false,
        watermarkText: '  内部\n资料  ',
      },
    });
    expect(settings.cardDefaults.coverEnabled).toBe(true); // 非布尔回落默认（C01③ 起默认为开启）
    expect(settings.cardDefaults.pageNumberEnabled).toBe(false);
    expect(settings.cardDefaults.watermarkText).toBe('内部 资料');
    const { settings: keep } = normalizeLoadedSettings({
      clientId: 'c1',
      cardDefaults: { coverEnabled: true, pageNumberEnabled: true, watermarkText: '长'.repeat(60) },
    });
    expect(keep.cardDefaults.coverEnabled).toBe(true);
    expect(keep.cardDefaults.watermarkText).toBe('长'.repeat(60)); // 不静默截断
  });

  it('已合法的 cardDefaults 不标记迁移；缺失时补默认', () => {
    const valid = createDefaultCardSettings();
    // 迁移标记已落库（首次加载会写一次），这份齐备的配置不该再被判为需要迁移
    const ok = normalizeLoadedSettings({
      clientId: 'c1', cardDefaults: { ...valid }, cardCoverDefaultMigrated: true,
    });
    expect(ok.settings.cardDefaults).toEqual(valid);
    expect(ok.didMigrate).toBe(false);

    const filled = normalizeLoadedSettings({ clientId: 'c1' });
    expect(filled.settings.cardDefaults).toEqual(createDefaultCardSettings());
  });

  it('C01③ 遗留迁移（一次性）：旧默认的封面关闭会被翻正，且不重复执行', () => {
    const first = normalizeLoadedSettings({
      clientId: 'c1',
      cardDefaults: { ...createDefaultCardSettings(), coverEnabled: false },
    });
    expect(first.settings.cardDefaults.coverEnabled).toBe(true);
    expect(first.settings.cardCoverDefaultMigrated).toBe(true);
    expect(first.didMigrate).toBe(true);

    // 标记已落库：用户之后主动关掉全局封面不会被再次翻正
    const second = normalizeLoadedSettings({
      clientId: 'c1',
      cardDefaults: { ...createDefaultCardSettings(), coverEnabled: false },
      cardCoverDefaultMigrated: true,
    });
    expect(second.settings.cardDefaults.coverEnabled).toBe(false);

    // 未配置 / 已开启封面的装机不该因为这条迁移被多写一次盘
    expect(normalizeLoadedSettings({ clientId: 'c1' }).didMigrate).toBe(false);
    expect(normalizeLoadedSettings({
      clientId: 'c1',
      cardDefaults: { ...createDefaultCardSettings(), coverEnabled: true },
    }).didMigrate).toBe(false);
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
      getLayoutDefaults: () => ({ themeId: 'gradient-blue', fontSize: 16 }),
    });
    expect(registry.getSession('a.md').getLayoutSettings()).toEqual({
      ...DEFAULT_CARD_LAYOUT_SETTINGS,
      themeId: 'gradient-blue',
      fontSize: 16,
    });

    const bad = createCardSessionRegistry({ getLayoutDefaults: () => ({ themeId: 'nope' }) });
    expect(bad.getSession('b.md').getLayoutSettings().themeId).toBe('simple-white');

    const plain = createCardSessionRegistry();
    expect(plain.getSession('c.md').getLayoutSettings()).toEqual(DEFAULT_CARD_LAYOUT_SETTINGS);
  });

  it('已调整会话保持不变；之后新建的会话才读取新默认', () => {
    let defaults = { themeId: 'gradient-blue' };
    const registry = createCardSessionRegistry({ getLayoutDefaults: () => defaults });

    const session = registry.getSession('a.md');
    session.applyLayoutSettings({ fontSize: 18 });
    expect(session.getLayoutSettings().fontSize).toBe(18);

    defaults = { themeId: 'neon-purple', fontSize: 12 };
    expect(session.getLayoutSettings()).toMatchObject({ themeId: 'gradient-blue', fontSize: 18 });
    expect(registry.getSession('b.md').getLayoutSettings()).toMatchObject({
      themeId: 'neon-purple',
      fontSize: 12,
    });
  });

  it('视图从 plugin.settings.cardDefaults 取默认；无配置时用内置默认', () => {
    const view = new AppleStyleView(null, {
      settings: { cardDefaults: { themeId: 'neon-purple', fontSize: 18 } },
    });
    expect(view.getCardSessions().getSession('x.md').getLayoutSettings()).toMatchObject({
      themeId: 'neon-purple',
      fontSize: 18,
    });

    const bare = new AppleStyleView(null, { settings: {} });
    expect(bare.getCardSessions().getSession('y.md').getLayoutSettings()).toEqual(
      DEFAULT_CARD_LAYOUT_SETTINGS,
    );
  });
});
