/*
## 核心功能

测试文章排版标题分节风格控制组件（heading-style-controls.js）与侧边栏设置联动：
1. 验证面板构建结构（4 种分节风格按钮：默认、序号、徽标、禅意）；
2. 验证按钮高亮状态与初始配置对齐；
3. 验证点击按钮后更新设置、持久化并立即触发强制预览重渲染（WYSIWYG 实时生效）；
4. 验证全局设置页（wechat-tab.js）修改分节风格时跨面板通知活跃侧边栏视图实时刷新。
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildHeadingStyleSection,
  onHeadingStyleChange,
  HEADING_STYLE_OPTIONS,
} from '../views/converter/heading-style-controls.js';
import { HEADING_STYLES } from '../services/heading-style-renderer.js';
import { APPLE_STYLE_VIEW } from '../views/apple-style-view-shared.js';

const { loadInputModule } = require('./helpers/input-module.cjs');
const { createObsidianLikeElement } = require('./helpers/obsidian-dom.js');
const { resetViewTestGlobals } = require('./helpers/view-test-helpers.js');

describe('文章分节标题风格侧边栏控制组件 (heading-style-controls.js)', () => {
  let AppleStyleView;
  let view;
  let container;
  let savedSettings;

  beforeEach(() => {
    resetViewTestGlobals(vi);
    const inputModule = loadInputModule();
    AppleStyleView = inputModule.AppleStyleView;

    savedSettings = {
      headingStyle: HEADING_STYLES.DEFAULT,
    };

    view = new AppleStyleView(null, {
      settings: savedSettings,
      saveSettings: vi.fn(async () => {}),
    });

    view.convertCurrent = vi.fn(async () => {});
    container = createObsidianLikeElement();
  });

  afterEach(() => {
    resetViewTestGlobals(vi);
  });

  it('正确暴露 4 种标题风格选项配置', () => {
    expect(HEADING_STYLE_OPTIONS).toHaveLength(4);
    const values = HEADING_STYLE_OPTIONS.map((o) => o.value);
    expect(values).toEqual([
      HEADING_STYLES.DEFAULT,
      HEADING_STYLES.SERIAL_NUMBER,
      HEADING_STYLES.BADGE,
      HEADING_STYLES.ZEN,
    ]);
  });

  it('成功构建「分节标题」设置区块，并默认高亮当前设置项', () => {
    const parent = container.createEl('div');
    const section = buildHeadingStyleSection(view, parent);

    expect(section).toBeTruthy();
    expect(view.settingsHeadingStyleGrid).toBeTruthy();

    const buttons = Array.from(view.settingsHeadingStyleGrid.querySelectorAll('button'));
    expect(buttons).toHaveLength(4);

    const defaultBtn = buttons.find((b) => b.dataset.value === HEADING_STYLES.DEFAULT);
    expect(defaultBtn).toBeTruthy();
    expect(defaultBtn.classList.contains('active')).toBe(true);

    const serialBtn = buttons.find((b) => b.dataset.value === HEADING_STYLES.SERIAL_NUMBER);
    expect(serialBtn).toBeTruthy();
    expect(serialBtn.classList.contains('active')).toBe(false);
  });

  it('点击按钮即时更新设置、持久化并调用 convertCurrent(true) 触发实时预览重渲染', async () => {
    const parent = container.createEl('div');
    buildHeadingStyleSection(view, parent);

    const buttons = Array.from(view.settingsHeadingStyleGrid.querySelectorAll('button'));
    const serialBtn = buttons.find((b) => b.dataset.value === HEADING_STYLES.SERIAL_NUMBER);
    expect(serialBtn).toBeTruthy();

    // 模拟用户点击「序号」
    serialBtn.click();
    // 异步执行事件处理
    await new Promise((r) => setTimeout(r, 0));

    expect(view.plugin.settings.headingStyle).toBe(HEADING_STYLES.SERIAL_NUMBER);
    expect(view.plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(view.convertCurrent).toHaveBeenCalledWith(true);

    // 按钮高亮状态已切至序号
    expect(serialBtn.classList.contains('active')).toBe(true);
    const defaultBtn = buttons.find((b) => b.dataset.value === HEADING_STYLES.DEFAULT);
    expect(defaultBtn.classList.contains('active')).toBe(false);
  });

  it('切换回「默认」或「禅意」时均能正确同步状态与重新转换', async () => {
    const parent = container.createEl('div');
    buildHeadingStyleSection(view, parent);

    await onHeadingStyleChange(view, HEADING_STYLES.ZEN, view.settingsHeadingStyleGrid);

    expect(view.plugin.settings.headingStyle).toBe(HEADING_STYLES.ZEN);
    expect(view.convertCurrent).toHaveBeenCalledWith(true);

    const zenBtn = view.settingsHeadingStyleGrid.querySelector(`button[data-value="${HEADING_STYLES.ZEN}"]`);
    expect(zenBtn.classList.contains('active')).toBe(true);
  });

  it('在整体侧边栏面板构建时自动集成分节标题控制组', () => {
    view.createSettingsPanel(container);

    expect(view.settingsHeadingStyleGrid).toBeTruthy();
    const buttons = Array.from(view.settingsHeadingStyleGrid.querySelectorAll('button'));
    expect(buttons).toHaveLength(4);
  });

  it('全局设置页 (wechat-tab.js) 切换分节标题时即时通知活跃侧边栏视图刷新', async () => {
    const { AppleStyleSettingTab } = loadInputModule();

    // 预先构建侧边栏视图的按钮组
    view.createSettingsPanel(container);

    const mockApp = {
      workspace: {
        getLeavesOfType: vi.fn((type) => {
          if (type === APPLE_STYLE_VIEW) {
            return [{ view }];
          }
          return [];
        }),
      },
    };

    const mockPlugin = {
      settings: savedSettings,
      saveSettings: vi.fn(async () => {}),
    };

    const tab = new AppleStyleSettingTab(mockApp, mockPlugin);
    const tabContainer = createObsidianLikeElement();
    tab.renderHeadingStyleSection(tabContainer);

    const dropdown = globalThis.__obsidianDropdownRegistry?.at(-1);
    expect(dropdown).toBeTruthy();
    expect(dropdown.value).toBe(HEADING_STYLES.DEFAULT);

    // 模拟在设置页切换为「badge」
    await dropdown.changeHandler(HEADING_STYLES.BADGE);

    expect(mockPlugin.settings.headingStyle).toBe(HEADING_STYLES.BADGE);
    expect(mockPlugin.saveSettings).toHaveBeenCalled();
    expect(view.convertCurrent).toHaveBeenCalledWith(true);

    // 侧边栏按钮也同步切换为高亮
    const badgeBtn = view.settingsHeadingStyleGrid.querySelector(`button[data-value="${HEADING_STYLES.BADGE}"]`);
    expect(badgeBtn.classList.contains('active')).toBe(true);
  });
});
