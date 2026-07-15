/*
## 核心功能

针对 services/custom-css-inliner.js 的单元测试。

## 输入

- CSS 文本（含危险语法、@media、普通选择器、!important）
- HTML 文本（含已有 inline style 的元素）
- 模拟 plugin 对象（settings + app.vault）

## 输出

Vitest 断言结果，验证 sanitize / scope / inline / resolve 四个接口的行为契约。

## 定位

位于 tests/，是自定义 CSS 功能的回归测试层。

## 依赖

关键依赖：Vitest、被测模块 services/custom-css-inliner.js。

## 维护规则

- 修改 inliner 逻辑后同步更新本文件说明书与测试用例。
- 保持职责边界清晰，只测 inliner 本身，集成路径在更上层测试覆盖。
*/

import { describe, it, expect } from 'vitest';
import {
  sanitizeCustomCss,
  scopeCustomCss,
  inlineCustomCss,
  resolveCustomCssFromSettings,
} from '../services/custom-css-inliner.js';

describe('custom-css-inliner', () => {
  describe('sanitizeCustomCss', () => {
    it('允许普通样式规则', () => {
      expect(() => sanitizeCustomCss('p { color: red; }')).not.toThrow();
    });

    it('拦截 expression()', () => {
      expect(() => sanitizeCustomCss('div { width: expression(1+1); }')).toThrow('expression');
    });

    it('拦截 javascript: url', () => {
      expect(() => sanitizeCustomCss('div { background: url(javascript:alert(1)); }')).toThrow('javascript');
    });

    it('拦截 @import', () => {
      expect(() => sanitizeCustomCss('@import url("https://example.com/a.css");')).toThrow('@import');
    });
  });

  describe('scopeCustomCss', () => {
    it('给普通选择器加根作用域前缀', () => {
      const css = 'p { color: red; }';
      expect(scopeCustomCss(css)).toContain('.owc-article-root p');
    });

    it('给选择器组加前缀', () => {
      const css = 'p, h1 { color: red; }';
      const scoped = scopeCustomCss(css);
      expect(scoped).toContain('.owc-article-root p');
      expect(scoped).toContain('.owc-article-root h1');
    });

    it('保留 @media 结构并给内部选择器加前缀', () => {
      const css = '@media (min-width: 600px) { p { color: red; } }';
      const scoped = scopeCustomCss(css);
      expect(scoped).toContain('@media (min-width: 600px)');
      expect(scoped).toContain('.owc-article-root p');
    });

    it('保留 @font-face', () => {
      const css = '@font-face { font-family: "X"; src: url("x.woff2"); }';
      const scoped = scopeCustomCss(css);
      expect(scoped).toContain('@font-face');
      expect(scoped).not.toContain('.owc-article-root @font-face');
    });
  });

  describe('inlineCustomCss', () => {
    it('空 CSS 直接返回原 HTML', () => {
      const html = '<p>hello</p>';
      expect(inlineCustomCss(html, '')).toBe(html);
      expect(inlineCustomCss(html, '   ')).toBe(html);
    });

    it('把用户 CSS 内联到匹配元素', () => {
      const html = '<section class="owc-article-root"><p class="intro">hello</p></section>';
      const css = 'p.intro { color: red; }';
      const result = inlineCustomCss(html, css);
      expect(result).toContain('style="color: red;"');
    });

    it('用户值覆盖主题默认值（需使用 !important）', () => {
      const html = '<section class="owc-article-root"><p style="color: blue;">hello</p></section>';
      const css = 'p { color: red !important; }';
      const result = inlineCustomCss(html, css);
      // 主题已内联为 inline style，优先级高于外部 CSS；
      // 用户要覆盖必须使用 !important，这也是 UI 警告要提示的内容。
      expect(result).toContain('color: red !important');
    });

    it('保留 !important', () => {
      const html = '<section class="owc-article-root"><p>hello</p></section>';
      const css = 'p { color: red !important; }';
      const result = inlineCustomCss(html, css);
      expect(result).toContain('color: red !important');
    });

    it('外层 wrapper 被去掉', () => {
      const html = '<p>hello</p>';
      const css = 'p { color: red; }';
      const result = inlineCustomCss(html, css);
      expect(result).not.toContain('<div class="owc-article-root"');
      expect(result).toContain('<p style="color: red;">hello</p>');
    });

    it('拒绝危险 CSS', () => {
      const html = '<p>hello</p>';
      expect(() => inlineCustomCss(html, 'p { width: expression(1); }')).toThrow('expression');
    });
  });

  describe('resolveCustomCssFromSettings', () => {
    it('未启用时返回空字符串', async () => {
      const plugin = { settings: { enableCustomCss: false, customCss: 'p { color: red; }' } };
      expect(await resolveCustomCssFromSettings(plugin)).toBe('');
    });

    it('优先返回 customCssNote 对应的笔记内容', async () => {
      const plugin = {
        settings: { enableCustomCss: true, customCss: 'textarea', customCssNote: 'Meta/custom.css' },
        app: {
          vault: {
            getAbstractFileByPath: (path) => (path === 'Meta/custom.css' ? { extension: 'md' } : null),
            read: async () => 'from-note',
          },
        },
      };
      expect(await resolveCustomCssFromSettings(plugin)).toBe('from-note');
    });

    it('笔记读取失败时回退到 textarea', async () => {
      const plugin = {
        settings: { enableCustomCss: true, customCss: 'textarea', customCssNote: 'Missing.md' },
        app: {
          vault: {
            getAbstractFileByPath: () => null,
            read: async () => { throw new Error('not found'); },
          },
        },
      };
      expect(await resolveCustomCssFromSettings(plugin)).toBe('textarea');
    });
  });
});
