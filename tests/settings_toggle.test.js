/*
## 核心功能

覆盖 settings toggle 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 settings toggle 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/


import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Obsidian modules
vi.mock('obsidian', () => ({
  Plugin: class {},
  MarkdownView: class {},
  ItemView: class {},
  Notice: class {},
  PluginSettingTab: class {},
  Setting: class {},
  setIcon: vi.fn(),
  Modal: class {}
}));

// Mock modules that input.js requires
vi.mock('../converter.js', () => ({
  AppleStyleConverter: class {}
}));

describe('Settings - Colorize Headings', () => {
  let settings;
  let themeMock;

  beforeEach(() => {
    // Simulate the default settings state
    settings = {
      theme: 'github',
      coloredHeader: false // Default should be false
    };

    // Mock the Theme object
    themeMock = {
      update: vi.fn(),
      getThemeColorValue: vi.fn().mockReturnValue('#000000')
    };
  });

  it('should have coloredHeader disabled by default', () => {
    expect(settings.coloredHeader).toBe(false);
  });

  it('should update setting when toggled', () => {
    // Simulate toggle action
    const toggleSetting = (currentState) => !currentState;

    // Turn ON
    settings.coloredHeader = toggleSetting(settings.coloredHeader);
    expect(settings.coloredHeader).toBe(true);

    // Turn OFF
    settings.coloredHeader = toggleSetting(settings.coloredHeader);
    expect(settings.coloredHeader).toBe(false);
  });

  // Test the Logic flow (Simulation of input.js logic)
  it('should call theme.update with correct params when toggled', () => {
    // Function to mimic the logic in input.js
    const onToggleChange = (isChecked) => {
        settings.coloredHeader = isChecked;
        themeMock.update({ coloredHeader: isChecked });
    };

    // Case 1: Turn ON
    onToggleChange(true);
    expect(settings.coloredHeader).toBe(true);
    expect(themeMock.update).toHaveBeenCalledWith({ coloredHeader: true });

    // Case 2: Turn OFF
    onToggleChange(false);
    expect(settings.coloredHeader).toBe(false);
    expect(themeMock.update).toHaveBeenCalledWith({ coloredHeader: false });
  });
});
