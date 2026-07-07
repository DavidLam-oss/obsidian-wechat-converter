/*
## 核心功能

实现渲染管线相关的 render pipeline 能力，服务预览、复制和发布一致性。

## 输入

接收 Markdown 源、Obsidian 渲染上下文、DOM 容器、渲染选项和转换器依赖。

## 输出

输出 `NativeRenderPipeline`、`createRenderPipelines`，供视图层生成预览或发布 HTML。

## 定位

位于 services/，属于渲染服务层；避免把渲染细节堆回 input.js。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/**
 * @typedef {{ sourcePath?: string, settings?: Record<string, unknown> }} RenderContext
 * @typedef {(markdown: string, context: RenderContext) => Promise<string> | string} RenderFunction
 */

export class NativeRenderPipeline {
  /**
   * @param {{ nativeRenderer?: RenderFunction, candidateRenderer?: RenderFunction }} options
   */
  constructor({ nativeRenderer, candidateRenderer }) {
    this.nativeRenderer = candidateRenderer || nativeRenderer;
  }

  /**
   * @param {string} markdown
   * @param {RenderContext} [context={}]
   * @returns {Promise<string>}
   */
  async renderForPreview(markdown, context = {}) {
    if (typeof this.nativeRenderer !== 'function') {
      throw new Error('Triplet render pipeline is not implemented yet');
    }
    return String(await this.nativeRenderer(markdown, context));
  }

  /**
   * @param {string} markdown
   * @param {RenderContext} [context={}]
   * @returns {Promise<{ html: string, diagnostics: unknown[] }>}
   */
  async renderForExport(markdown, context = {}) {
    return {
      html: await this.renderForPreview(markdown, context),
      diagnostics: [],
    };
  }
}

/**
 * @param {{ nativeRenderer?: RenderFunction, candidateRenderer?: RenderFunction }} options
 * @returns {{ nativePipeline: NativeRenderPipeline }}
 */
export function createRenderPipelines({ nativeRenderer, candidateRenderer }) {
  const nativePipeline = new NativeRenderPipeline({
    nativeRenderer,
    candidateRenderer,
  });
  return { nativePipeline };
}
