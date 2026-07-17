/*
## 核心功能

覆盖自定义 CSS 变化后的预览重开提示调度与 Vault 文件匹配。

## 输入

接收插件实例、预览叶片状态、连续设置变化和 Vault modify 事件。

## 输出

输出自动化断言结果，保护提示合并、关闭预览静默和卸载清理行为。

## 定位

位于 tests/，是自定义 CSS 用户提示的生命周期回归测试。

## 依赖

关键依赖：Vitest、Obsidian mock 与插件入口。

## 维护规则

- 不把提示测试扩展成预览热刷新测试；该功能只提示用户重新打开面板。
- Vault 事件只匹配当前配置的 CSS 笔记路径。
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');

describe('AppleStylePlugin - custom CSS preview notice', () => {
  let AppleStylePlugin;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.__obsidianNoticeRegistry = [];
    AppleStylePlugin = loadInputModule().default;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makePlugin(leaves = [{ view: {} }]) {
    const plugin = new AppleStylePlugin();
    plugin.app = {
      workspace: {
        getLeavesOfType: vi.fn(() => leaves),
      },
    };
    return plugin;
  }

  it('coalesces rapid changes into one notice while the preview is open', () => {
    const plugin = makePlugin();

    expect(plugin.scheduleCustomCssPreviewNotice()).toBe(true);
    plugin.scheduleCustomCssPreviewNotice();
    plugin.scheduleCustomCssPreviewNotice();
    vi.advanceTimersByTime(299);
    expect(globalThis.__obsidianNoticeRegistry).toHaveLength(0);
    vi.advanceTimersByTime(1);

    expect(globalThis.__obsidianNoticeRegistry).toHaveLength(1);
    expect(globalThis.__obsidianNoticeRegistry[0].message).toBe(
      '自定义 CSS 已更新，请关闭并重新打开发布助手面板以刷新预览。'
    );
  });

  it('does not notify when no converter preview is open', () => {
    const plugin = makePlugin([]);

    expect(plugin.scheduleCustomCssPreviewNotice()).toBe(false);
    vi.runAllTimers();
    expect(globalThis.__obsidianNoticeRegistry).toHaveLength(0);
  });

  it('rechecks the preview before showing a scheduled notice', () => {
    const leaves = [{ view: {} }];
    const plugin = makePlugin(leaves);

    plugin.scheduleCustomCssPreviewNotice();
    leaves.length = 0;
    vi.runAllTimers();

    expect(globalThis.__obsidianNoticeRegistry).toHaveLength(0);
  });

  it('matches only the currently configured custom CSS note', () => {
    const plugin = makePlugin();
    plugin.settings = { customCssNote: 'Meta/custom.css.md' };
    const scheduleSpy = vi.spyOn(plugin, 'scheduleCustomCssPreviewNotice');

    expect(plugin.handleCustomCssNoteModified({ path: 'Notes/article.md' })).toBe(false);
    expect(plugin.handleCustomCssNoteModified({ path: 'Meta/custom.css.md' })).toBe(true);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it('clears a pending notice when the plugin unloads', async () => {
    const plugin = makePlugin();
    plugin.scheduleCustomCssPreviewNotice();

    await plugin.onunload();
    vi.runAllTimers();

    expect(globalThis.__obsidianNoticeRegistry).toHaveLength(0);
  });
});
