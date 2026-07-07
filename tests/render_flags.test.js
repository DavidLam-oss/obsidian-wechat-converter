/*
## 核心功能

覆盖 render flags 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 render flags 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');
const inputModule = loadInputModule();
const AppleStylePlugin = inputModule.default;
const { AppleStyleView } = inputModule;

describe('Render Pipeline Wiring (Native-only)', () => {
  it('should always route preview rendering to native pipeline', async () => {
    const plugin = new AppleStylePlugin();
    plugin.settings = {};
    const view = new AppleStyleView({}, plugin);
    const renderForPreview = vi.fn().mockResolvedValue('<section>ok</section>');
    view.nativeRenderPipeline = { renderForPreview };

    const html = await view.renderMarkdownForPreview('# title', 'notes/a.md');

    expect(view.getActiveRenderPipeline()).toBe(view.nativeRenderPipeline);
    expect(renderForPreview).toHaveBeenCalledWith('# title', {
      sourcePath: 'notes/a.md',
      settings: view.plugin.settings,
    });
    expect(html).toBe('<section>ok</section>');
  });

  it('should throw when native pipeline is not initialized', async () => {
    const plugin = new AppleStylePlugin();
    plugin.settings = {};
    const view = new AppleStyleView({}, plugin);

    await expect(view.renderMarkdownForPreview('# title', 'notes/a.md')).rejects.toThrow('渲染管线未初始化');
  });
});
