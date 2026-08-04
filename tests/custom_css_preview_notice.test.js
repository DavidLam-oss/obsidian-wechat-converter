/*
## 核心功能

覆盖自定义 CSS 变化后的热预览调度与 Vault 文件匹配。

## 输入

接收插件实例、预览叶片状态、连续设置变化和 Vault modify 事件。

## 输出

输出自动化断言结果，保护刷新合并、关闭预览静默和卸载清理行为。

## 定位

位于 tests/，是自定义 CSS 用户提示的生命周期回归测试。

## 依赖

关键依赖：Vitest、Obsidian mock 与插件入口。

## 维护规则

- 连续变化只触发一次视图热刷新，不显示重开面板 Notice。
- Vault 事件只匹配当前配置的 CSS 笔记路径。
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');

describe('AppleStylePlugin - custom CSS preview refresh', () => {
  let AppleStylePlugin;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.__obsidianNoticeRegistry = [];
    AppleStylePlugin = loadInputModule().default;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makePlugin(leaves = [{ view: { refreshCustomCssPreview: vi.fn().mockResolvedValue(true) } }]) {
    const plugin = new AppleStylePlugin();
    plugin.app = {
      workspace: {
        getLeavesOfType: vi.fn(() => leaves),
      },
    };
    return plugin;
  }

  it('coalesces rapid changes into one hot refresh while the preview is open', async () => {
    const plugin = makePlugin();
    const view = plugin.getConverterView();

    expect(plugin.scheduleCustomCssPreviewNotice()).toBe(true);
    plugin.scheduleCustomCssPreviewNotice();
    plugin.scheduleCustomCssPreviewNotice();
    vi.advanceTimersByTime(649);
    expect(view.refreshCustomCssPreview).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await Promise.resolve();

    expect(view.refreshCustomCssPreview).toHaveBeenCalledTimes(1);
    expect(globalThis.__obsidianNoticeRegistry).toHaveLength(0);
  });

  it('does not notify when no converter preview is open', () => {
    const plugin = makePlugin([]);

    expect(plugin.scheduleCustomCssPreviewNotice()).toBe(false);
    vi.runAllTimers();
    expect(globalThis.__obsidianNoticeRegistry).toHaveLength(0);
  });

  it('rechecks the preview before running a scheduled refresh', () => {
    const view = { refreshCustomCssPreview: vi.fn() };
    const leaves = [{ view }];
    const plugin = makePlugin(leaves);

    plugin.scheduleCustomCssPreviewNotice();
    leaves.length = 0;
    vi.runAllTimers();

    expect(globalThis.__obsidianNoticeRegistry).toHaveLength(0);
    expect(view.refreshCustomCssPreview).not.toHaveBeenCalled();
  });

  it('matches only the currently configured custom CSS note', () => {
    const plugin = makePlugin();
    plugin.settings = { customCssNote: 'Meta/custom.css.md' };
    const scheduleSpy = vi.spyOn(plugin, 'scheduleCustomCssPreviewNotice');

    expect(plugin.handleCustomCssNoteModified({ path: 'Notes/article.md' })).toBe(false);
    expect(plugin.handleCustomCssNoteModified({ path: 'Meta/custom.css.md' })).toBe(true);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it('配置省略 .md 时也匹配规范化后的笔记路径', () => {
    const plugin = makePlugin();
    plugin.settings = { customCssNote: '\\Meta//custom.css' };
    const scheduleSpy = vi.spyOn(plugin, 'scheduleCustomCssPreviewNotice');

    expect(plugin.handleCustomCssNoteModified({ path: 'Meta/custom.css.md' })).toBe(true);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it('clears a pending refresh when the plugin unloads', async () => {
    const plugin = makePlugin();
    plugin.scheduleCustomCssPreviewNotice();

    await plugin.onunload();
    vi.runAllTimers();

    expect(globalThis.__obsidianNoticeRegistry).toHaveLength(0);
  });
});
