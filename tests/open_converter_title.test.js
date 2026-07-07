/*
## 核心功能

覆盖 open converter title 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 open converter title 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');
describe('AppleStylePlugin - openConverter title refresh', () => {
  let AppleStylePlugin;

  beforeEach(() => {
    vi.resetModules();
    AppleStylePlugin = loadInputModule().default;
  });

  it('should refresh stale converter leaf title to unified name', async () => {
    const plugin = new AppleStylePlugin();
    const setViewState = vi.fn().mockResolvedValue(undefined);
    const revealLeaf = vi.fn();
    const staleLeaf = {
      getViewState: vi.fn(() => ({
        type: 'apple-style-converter',
        state: {},
        icon: 'wand',
        title: '微信排版转换',
      })),
      setViewState,
    };

    plugin.app = {
      workspace: {
        getLeavesOfType: vi.fn(() => [staleLeaf]),
        revealLeaf,
      },
    };

    await plugin.openConverter();

    expect(setViewState).toHaveBeenCalledTimes(1);
    expect(setViewState).toHaveBeenCalledWith({
      type: 'apple-style-converter',
      state: {},
      icon: 'wand',
      title: 'Obsidian 发布助手',
      active: true,
    });
    expect(revealLeaf).toHaveBeenCalledWith(staleLeaf);
  });

  it('should not reset converter leaf when title is already up to date', async () => {
    const plugin = new AppleStylePlugin();
    const setViewState = vi.fn().mockResolvedValue(undefined);
    const revealLeaf = vi.fn();
    const freshLeaf = {
      getViewState: vi.fn(() => ({
        type: 'apple-style-converter',
        state: { keep: true },
        icon: 'wand',
        title: 'Obsidian 发布助手',
      })),
      setViewState,
    };

    plugin.app = {
      workspace: {
        getLeavesOfType: vi.fn(() => [freshLeaf]),
        revealLeaf,
      },
    };

    await plugin.openConverter();

    expect(setViewState).not.toHaveBeenCalled();
    expect(revealLeaf).toHaveBeenCalledWith(freshLeaf);
  });

  it('should fallback to setActiveLeaf when revealLeaf is unavailable', async () => {
    const plugin = new AppleStylePlugin();
    const setActiveLeaf = vi.fn();
    const freshLeaf = {
      getViewState: vi.fn(() => ({
        type: 'apple-style-converter',
        state: { keep: true },
        icon: 'wand',
        title: 'Obsidian 发布助手',
      })),
      setViewState: vi.fn().mockResolvedValue(undefined),
    };

    plugin.app = {
      workspace: {
        getLeavesOfType: vi.fn(() => [freshLeaf]),
        setActiveLeaf,
      },
    };

    await plugin.openConverter();

    expect(setActiveLeaf).toHaveBeenCalledWith(freshLeaf, { focus: true });
  });

  it('should migrate stale leaf titles during startup reconciliation', async () => {
    const plugin = new AppleStylePlugin();
    const staleLeafSetViewState = vi.fn().mockResolvedValue(undefined);
    const freshLeafSetViewState = vi.fn().mockResolvedValue(undefined);
    const staleLeaf = {
      getViewState: vi.fn(() => ({
        type: 'apple-style-converter',
        state: { from: 'restore' },
        icon: 'wand',
        title: '微信排版转换',
      })),
      setViewState: staleLeafSetViewState,
    };
    const freshLeaf = {
      getViewState: vi.fn(() => ({
        type: 'apple-style-converter',
        state: { from: 'restore' },
        icon: 'wand',
        title: 'Obsidian 发布助手',
      })),
      setViewState: freshLeafSetViewState,
    };

    plugin.app = {
      workspace: {
        getLeavesOfType: vi.fn(() => [staleLeaf, freshLeaf]),
      },
    };

    await plugin.migrateLegacyConverterLeafTitles();

    expect(staleLeafSetViewState).toHaveBeenCalledTimes(1);
    expect(staleLeafSetViewState).toHaveBeenCalledWith({
      type: 'apple-style-converter',
      state: { from: 'restore' },
      icon: 'wand',
      title: 'Obsidian 发布助手',
      active: false,
    });
    expect(freshLeafSetViewState).not.toHaveBeenCalled();
  });
});
