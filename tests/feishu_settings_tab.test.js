/*
## 核心功能

覆盖 feishu settings tab 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 feishu settings tab 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

const obsidian = require('obsidian');
const { __applyExtensions: applyExtensions } = obsidian;
const { renderFeishuSettingsTab } = await import('../views/settings/feishu-tab.js');
const { createDefaultFeishuSyncSettings } = await import('../services/feishu-settings.js');

function makeTab() {
  const feishuSync = createDefaultFeishuSyncSettings();
  feishuSync.enabled = true;
  feishuSync.appId = 'cli_test';
  feishuSync.appSecret = 'secret';
  feishuSync.folderToken = 'folder-token';
  feishuSync.uploadHistory = [{
    title: '飞书测试',
    url: 'https://feishu.cn/docx/doc-token',
    uploadTime: '2026-06-21T00:00:00Z',
    docToken: 'doc-token',
    sourcePath: 'notes/feishu.md',
  }];
  feishuSync.apiUsage = {
    month: '2026-06',
    count: 64,
    updatedAt: 123,
  };

  return {
    plugin: {
      settings: { feishuSync },
      saveSettings: vi.fn(async () => undefined),
      openExternalUrl: vi.fn(),
      obsidianApi: obsidian,
    },
    display: vi.fn(),
  };
}

describe('Feishu settings tab', () => {
  beforeEach(() => {
    globalThis.__obsidianNoticeRegistry = [];
  });

  it('renders monthly API usage stats and resets them from the Feishu tab', async () => {
    const tab = makeTab();
    const containerEl = applyExtensions(document.createElement('div'));

    renderFeishuSettingsTab(tab, containerEl, { obsidianApi: obsidian });

    expect(containerEl.textContent).toContain('本月 API 调用次数');
    expect(containerEl.textContent).toContain('您已成功分享 1 个文档');
    expect(containerEl.textContent).toContain('64 / 10,000');
    expect(containerEl.textContent).toContain('剩余约 9,936 次');
    expect(containerEl.textContent).toContain('统计周期：2026-06');

    const resetButton = Array.from(containerEl.querySelectorAll('button'))
      .find((button) => button.textContent === '重置计数');
    expect(resetButton).toBeDefined();

    await resetButton.onclick();

    expect(tab.plugin.settings.feishuSync.apiUsage.count).toBe(0);
    expect(tab.plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(globalThis.__obsidianNoticeRegistry.at(-1).message).toBe('✅ 飞书 API 调用计数已重置');
    expect(containerEl.textContent).toContain('0 / 10,000');
  });
});
