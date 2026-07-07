/*
## 核心功能

覆盖 render pipeline 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 render pipeline 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi } from 'vitest';
const {
  NativeRenderPipeline,
  createRenderPipelines,
} = require('../services/render-pipeline');

describe('Render Pipeline (Native-only)', () => {
  it('native pipeline should throw when renderer is missing', async () => {
    const native = new NativeRenderPipeline({
      nativeRenderer: undefined,
    });

    await expect(native.renderForPreview('body')).rejects.toThrow('Triplet render pipeline is not implemented yet');
  });

  it('native pipeline should use native renderer result when successful', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const native = new NativeRenderPipeline({
      nativeRenderer,
    });

    const html = await native.renderForPreview('body', { sourcePath: 'a.md' });
    expect(html).toBe('<section>native</section>');
    expect(nativeRenderer).toHaveBeenCalledWith('body', { sourcePath: 'a.md' });
  });

  it('native pipeline should prioritize candidateRenderer over nativeRenderer', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const candidateRenderer = vi.fn().mockResolvedValue('<section>candidate</section>');
    const native = new NativeRenderPipeline({
      nativeRenderer,
      candidateRenderer,
    });

    const html = await native.renderForPreview('body');
    expect(html).toBe('<section>candidate</section>');
    expect(candidateRenderer).toHaveBeenCalledTimes(1);
    expect(nativeRenderer).not.toHaveBeenCalled();
  });

  it('native pipeline should rethrow renderer errors', async () => {
    const nativeRenderer = vi.fn().mockRejectedValue(new Error('native crashed'));
    const native = new NativeRenderPipeline({
      nativeRenderer,
    });

    await expect(native.renderForPreview('body')).rejects.toThrow('native crashed');
  });

  it('native pipeline renderForExport should wrap html with diagnostics array', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const native = new NativeRenderPipeline({
      nativeRenderer,
    });

    const result = await native.renderForExport('body', { sourcePath: 'x.md' });
    expect(result).toEqual({
      html: '<section>native</section>',
      diagnostics: [],
    });
  });

  it('createRenderPipelines should expose native pipeline instance', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const pipelines = createRenderPipelines({
      nativeRenderer,
    });

    expect(pipelines.nativePipeline).toBeInstanceOf(NativeRenderPipeline);
    const html = await pipelines.nativePipeline.renderForPreview('x');
    expect(html).toBe('<section>native</section>');
  });
});
