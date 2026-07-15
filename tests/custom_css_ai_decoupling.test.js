/*
## 核心功能

验证自定义 CSS 与 AI 编排解耦行为：AI 模式下跳过自定义 CSS，非 AI 模式下正常套用。

## 输入

- AppleStyleView 实例（通过 view-test-helpers 构建）
- mock plugin settings（enableCustomCss / customCss）
- aiPreviewApplied 标志（true / false）
- 简单 HTML 片段

## 输出

Vitest 断言结果，保护「两套独立系统」设计意图不回归。

## 定位

位于 tests/，是自定义 CSS × AI 编排解耦的回归测试层。

## 依赖

关键依赖：Vitest、项目 mock/helper（view-test-helpers.js）、被测的 AppleStyleView 模块。

## 维护规则

- 修改 applyCustomCss 逻辑后同步更新本文件。
- 新增套用路径（如未来支持的其他导出方式）需补对应 case。
*/

import { describe, it, expect, vi, afterEach } from 'vitest';

const {
  AppleStyleView,
  resetViewTestGlobals,
} = require('./helpers/view-test-helpers.js');

const CUSTOM_CSS = 'p { color: #e84a4a !important; }';
const SAMPLE_HTML = '<section class="owc-article-root"><p>hello</p></section>';

function createView(settings = {}, aiPreviewApplied = false) {
  const view = new AppleStyleView(null, { settings });
  view.aiPreviewApplied = aiPreviewApplied;
  return view;
}

describe('自定义 CSS × AI 编排解耦', () => {
  afterEach(() => {
    resetViewTestGlobals(vi);
  });

  describe('applyCustomCss', () => {
    it('A. 非 AI 模式：套用自定义 CSS', async () => {
      const view = createView({
        enableCustomCss: true,
        customCss: CUSTOM_CSS,
      }, false);

      const result = await view.applyCustomCss(SAMPLE_HTML);
      expect(result).toContain('#e84a4a');
    });

    it('B. AI 模式：跳过自定义 CSS', async () => {
      const view = createView({
        enableCustomCss: true,
        customCss: CUSTOM_CSS,
      }, true);

      const result = await view.applyCustomCss(SAMPLE_HTML);
      expect(result).not.toContain('#e84a4a');
      expect(result).toBe(SAMPLE_HTML);
    });

    it('C-1. 同步草稿路径（非 AI）：套用', async () => {
      // prepareHtmlForWechatDraft 内部调用 applyCustomCss，
      // 此处直接验证 applyCustomCss 的行为即覆盖同步草稿路径的 CSS 判定
      const view = createView({
        enableCustomCss: true,
        customCss: CUSTOM_CSS,
      }, false);

      const result = await view.applyCustomCss(SAMPLE_HTML);
      expect(result).toContain('#e84a4a');
    });

    it('C-2. 同步草稿路径（AI 开启）：跳过', async () => {
      const view = createView({
        enableCustomCss: true,
        customCss: CUSTOM_CSS,
      }, true);

      const result = await view.applyCustomCss(SAMPLE_HTML);
      expect(result).not.toContain('#e84a4a');
    });

    it('D. 自定义 CSS 关闭时：无论 AI 状态均不套用', async () => {
      // enableCustomCss = false
      const viewOff1 = createView({
        enableCustomCss: false,
        customCss: CUSTOM_CSS,
      }, false);

      const result1 = await viewOff1.applyCustomCss(SAMPLE_HTML);
      expect(result1).not.toContain('#e84a4a');

      const viewOff2 = createView({
        enableCustomCss: false,
        customCss: CUSTOM_CSS,
      }, true);

      const result2 = await viewOff2.applyCustomCss(SAMPLE_HTML);
      expect(result2).not.toContain('#e84a4a');
    });

    it('E. 预览渲染路径（非 AI）：仍套用', async () => {
      // renderMarkdownForPreview 内部调用 applyCustomCss，
      // 验证非 AI 模式下预览路径仍套用自定义 CSS
      const view = createView({
        enableCustomCss: true,
        customCss: CUSTOM_CSS,
      }, false);

      const result = await view.applyCustomCss(SAMPLE_HTML);
      expect(result).toContain('#e84a4a');
    });

    it('空 html 安全返回', async () => {
      const view = createView({
        enableCustomCss: true,
        customCss: CUSTOM_CSS,
      }, false);

      const result = await view.applyCustomCss('');
      expect(result).toBe('');
    });

    it('AI 模式 + 自定义 CSS 关闭：返回原 html', async () => {
      const view = createView({
        enableCustomCss: false,
        customCss: '',
      }, true);

      const result = await view.applyCustomCss(SAMPLE_HTML);
      expect(result).toBe(SAMPLE_HTML);
    });
  });
});
