/*
## 核心功能

实现渲染管线相关的 render pipeline 能力，服务预览、复制和发布一致性。
挂载前置 Markdown 动态 Frontmatter 变量插值与后置文章标题分节样式装饰（heading-style-renderer）。

## 输入

接收 Markdown 源、Obsidian 渲染上下文、DOM 容器、渲染选项和转换器依赖。

## 输出

输出 `NativeRenderPipeline`、`createRenderPipelines`，供视图层生成预览或发布 HTML。

## 定位

位于 services/，属于渲染服务层；避免把渲染细节堆回 input.js。

## 依赖

关键依赖：`./frontmatter-interpolator.js`、`./heading-style-renderer.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { interpolateMarkdownVariables } from './frontmatter-interpolator.js';
import { decorateArticleHeadings } from './heading-style-renderer.js';
import { findCustomTheme } from './custom-theme-adapter.js';

/**
 * @typedef {{
 *   sourcePath?: string,
 *   settings?: Record<string, unknown>,
 *   isExport?: boolean,
 *   headingStyle?: string,
 *   themeColor?: string,
 *   customColor?: string,
 *   [key: string]: unknown,
 * }} RenderContext
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

    const settings = /** @type {Record<string, unknown> | undefined} */ (context.settings);
    const enableInterpolation = context.enableFrontmatterInterpolation !== undefined
      ? Boolean(context.enableFrontmatterInterpolation)
      : settings?.enableFrontmatterInterpolation !== false;

    let inputMarkdown = String(markdown || '');
    if (enableInterpolation) {
      inputMarkdown = interpolateMarkdownVariables(inputMarkdown, {
        context,
        highlightUnresolved: !context.isExport,
      });
    }

    let html = String(await this.nativeRenderer(inputMarkdown, context));

    let headingStyle = (typeof context.headingStyle === 'string' && context.headingStyle)
      || (typeof settings?.headingStyle === 'string' && settings.headingStyle)
      || 'default';

    let customHeadingConfig = null;
    if (settings && typeof settings.theme === 'string') {
      const customTheme = findCustomTheme(settings.customThemes, settings.theme);
      if (customTheme) {
        if (headingStyle === 'default') {
          if (customTheme.headingStyle && customTheme.headingStyle !== 'default') {
            headingStyle = customTheme.headingStyle;
          }
          if (customTheme.heading) {
            customHeadingConfig = customTheme.heading;
          }
        }
      }
    }

    if ((headingStyle && headingStyle !== 'default') || customHeadingConfig) {
      html = decorateArticleHeadings(html, {
        headingStyle,
        customHeading: customHeadingConfig,
        settings,
        themeColor: typeof context.themeColor === 'string' ? context.themeColor : undefined,
        customColor: typeof context.customColor === 'string' ? context.customColor : undefined,
      });
    }

    return html;
  }

  /**
   * @param {string} markdown
   * @param {RenderContext} [context={}]
   * @returns {Promise<{ html: string, diagnostics: unknown[] }>}
   */
  async renderForExport(markdown, context = {}) {
    return {
      html: await this.renderForPreview(markdown, { ...context, isExport: true }),
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
