/*
## 核心功能

覆盖 callout 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 callout 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock markdown-it globally before importing converter
global.markdownit = function(_options) {
  return {
    render: vi.fn((md) => `<p>${md}</p>`),
    renderer: {
      rules: {}
    }
  };
};

// Load theme and converter via eval (simulating the plugin's dynamic loading)
const fs = require('fs');
const path = require('path');
const { getBundledThemeSource } = require('./helpers/theme-runtime-source.js');

const converterPath = path.resolve(__dirname, '../converter.js');

// Execute theme first (defines window.AppleTheme)
eval(getBundledThemeSource());

// Execute converter (defines window.AppleStyleConverter and CALLOUT_ICONS)
eval(fs.readFileSync(converterPath, 'utf-8'));

describe('Callout Syntax Support', () => {
  let converter;
  let theme;

  beforeEach(() => {
    theme = new window.AppleTheme({
      theme: 'wechat',
      themeColor: 'blue',
      fontSize: 3,
    });
    converter = new window.AppleStyleConverter(theme, '', true, null, '');
  });

  describe('detectCallout', () => {
    it('should detect basic callout syntax [!note] and clean tokens', () => {
      // Simulate markdown-it tokens for "> [!note] Title\n> Content"
      const tokens = [
        { type: 'blockquote_open', tag: 'blockquote', nesting: 1 },
        { type: 'paragraph_open', tag: 'p', nesting: 1 },
        { type: 'inline', content: '[!note] 这是标题\n内容', children: [{ type: 'text', content: '[!note] 这是标题' }, { type: 'softbreak' }, { type: 'text', content: '内容' }] },
        { type: 'paragraph_close', tag: 'p', nesting: -1 },
        { type: 'blockquote_close', tag: 'blockquote', nesting: -1 },
      ];

      const result = converter.detectCallout(tokens, 0);

      expect(result).not.toBeNull();
      expect(result.type).toBe('note');
      expect(result.title).toBe('这是标题');

      // Verification of token cleaning
      expect(tokens[2].content).toBe('内容');
      // Children after the first line break should be preserved (logic removes up to first break)
      expect(tokens[2].children.length).toBe(1);
      expect(tokens[2].children[0].content).toBe('内容');
    });

    it('should hide paragraph if marker is the only content', () => {
      const tokens = [
        { type: 'blockquote_open', tag: 'blockquote', nesting: 1 },
        { type: 'paragraph_open', tag: 'p', nesting: 1 },
        { type: 'inline', content: '[!info]', children: [] },
        { type: 'paragraph_close', tag: 'p', nesting: -1 },
        { type: 'blockquote_close', tag: 'blockquote', nesting: -1 },
      ];

      converter.detectCallout(tokens, 0);

      expect(tokens[1].hidden).toBe(true); // paragraph_open
      expect(tokens[2].hidden).toBe(true); // inline
      expect(tokens[3].hidden).toBe(true); // paragraph_close
    });

    it('should detect callout without custom title', () => {
      const tokens = [
        { type: 'blockquote_open', tag: 'blockquote', nesting: 1 },
        { type: 'paragraph_open', tag: 'p', nesting: 1 },
        { type: 'inline', content: '[!warning]', children: [] },
        { type: 'paragraph_close', tag: 'p', nesting: -1 },
        { type: 'blockquote_close', tag: 'blockquote', nesting: -1 },
      ];

      const result = converter.detectCallout(tokens, 0);

      expect(result).not.toBeNull();
      expect(result.type).toBe('warning');
      expect(result.title).toBe('Warning'); // Preserve original type name (capitalized)
      expect(result.icon).toBe('⚠️');
    });

    it('should return null for regular blockquote', () => {
      const tokens = [
        { type: 'blockquote_open', tag: 'blockquote', nesting: 1 },
        { type: 'paragraph_open', tag: 'p', nesting: 1 },
        { type: 'inline', content: '这是普通引用块', children: [] },
        { type: 'paragraph_close', tag: 'p', nesting: -1 },
        { type: 'blockquote_close', tag: 'blockquote', nesting: -1 },
      ];

      const result = converter.detectCallout(tokens, 0);

      expect(result).toBeNull();
    });

    it('should handle various callout types with correct icons', () => {
      const testCases = [
        { type: 'tip', expectedIcon: '💡', expectedLabel: '提示' },
        { type: 'danger', expectedIcon: '🚨', expectedLabel: '危险' },
        { type: 'success', expectedIcon: '✅', expectedLabel: '成功' },
        { type: 'question', expectedIcon: '❓', expectedLabel: '问题' },
        { type: 'bug', expectedIcon: '🐛', expectedLabel: 'Bug' },
        { type: 'quote', expectedIcon: '💬', expectedLabel: '引用' },
        { type: 'example', expectedIcon: '📋', expectedLabel: '示例' },
      ];

      for (const { type, expectedIcon, expectedLabel } of testCases) {
        const tokens = [
          { type: 'blockquote_open', tag: 'blockquote', nesting: 1 },
          { type: 'paragraph_open', tag: 'p', nesting: 1 },
          { type: 'inline', content: `[!${type}]`, children: [] },
          { type: 'paragraph_close', tag: 'p', nesting: -1 },
          { type: 'blockquote_close', tag: 'blockquote', nesting: -1 },
        ];

        const result = converter.detectCallout(tokens, 0);

        expect(result.type).toBe(type);
        expect(result.icon).toBe(expectedIcon);
        expect(result.label).toBe(expectedLabel);
      }
    });

    it('should handle unknown callout type with info fallback icon', () => {
      const tokens = [
        { type: 'blockquote_open', tag: 'blockquote', nesting: 1 },
        { type: 'paragraph_open', tag: 'p', nesting: 1 },
        { type: 'inline', content: '[!customtype] Custom Title', children: [] },
        { type: 'paragraph_close', tag: 'p', nesting: -1 },
        { type: 'blockquote_close', tag: 'blockquote', nesting: -1 },
      ];

      const result = converter.detectCallout(tokens, 0);

      expect(result).not.toBeNull();
      expect(result.type).toBe('customtype');
      expect(result.title).toBe('Custom Title');
      expect(result.icon).toBe('ℹ️');
    });

    it('should detect custom Chinese callout type and use info fallback icon', () => {
      const tokens = [
        { type: 'blockquote_open', tag: 'blockquote', nesting: 1 },
        { type: 'paragraph_open', tag: 'p', nesting: 1 },
        { type: 'inline', content: '[!学习研究] 研究内容', children: [] },
        { type: 'paragraph_close', tag: 'p', nesting: -1 },
        { type: 'blockquote_close', tag: 'blockquote', nesting: -1 },
      ];

      const result = converter.detectCallout(tokens, 0);

      expect(result).not.toBeNull();
      expect(result.type).toBe('学习研究');
      expect(result.title).toBe('研究内容');
      expect(result.icon).toBe('ℹ️');
      expect(result.label).toBe('学习研究');
    });

    it('should not detect callout when type is only whitespace', () => {
      const tokens = [
        { type: 'blockquote_open', tag: 'blockquote', nesting: 1 },
        { type: 'paragraph_open', tag: 'p', nesting: 1 },
        { type: 'inline', content: '[!   ] 标题', children: [] },
        { type: 'paragraph_close', tag: 'p', nesting: -1 },
        { type: 'blockquote_close', tag: 'blockquote', nesting: -1 },
      ];

      const result = converter.detectCallout(tokens, 0);
      expect(result).toBeNull();
    });

    it('should handle callout with multiline content (only checks first inline)', () => {
      const tokens = [
        { type: 'blockquote_open', tag: 'blockquote', nesting: 1 },
        { type: 'paragraph_open', tag: 'p', nesting: 1 },
        { type: 'inline', content: '[!info] 信息', children: [] },
        { type: 'paragraph_close', tag: 'p', nesting: -1 },
        { type: 'paragraph_open', tag: 'p', nesting: 1 },
        { type: 'inline', content: '这是第二行内容', children: [] },
        { type: 'paragraph_close', tag: 'p', nesting: -1 },
        { type: 'blockquote_close', tag: 'blockquote', nesting: -1 },
      ];

      const result = converter.detectCallout(tokens, 0);

      expect(result).not.toBeNull();
      expect(result.type).toBe('info');
      expect(result.title).toBe('信息');
    });
  });

  describe('renderCalloutOpen', () => {
    it('should generate correct HTML structure', () => {
      const calloutInfo = {
        type: 'note',
        title: '备注标题',
        icon: 'ℹ️',
        label: '备注',
      };

      const html = converter.renderCalloutOpen(calloutInfo);

      expect(html).toContain('<section');
      expect(html).not.toContain('border-left:');
      expect(html).toContain('border: 1px solid #2f6fdd24');
      expect(html).toContain('background: #2f6fdd14');
      expect(html).toContain('color: #2f6fdd');

      // Check header
      expect(html).toContain('ℹ️');
      expect(html).toContain('备注标题');

      // Check content section opens
      expect(html).toContain('padding: 12px 16px');
    });

    it('should use semantic type color for styling', () => {
      const calloutInfo = {
        type: 'warning',
        title: '警告',
        icon: '⚠️',
        label: '警告',
      };

      const html = converter.renderCalloutOpen(calloutInfo);

      expect(html).not.toContain('border-left:');
      expect(html).toContain('border: 1px solid #b26a0024');
      expect(html).toContain('background: #b26a0014');
      expect(html).toContain('color: #b26a00');
    });

    it('should include flex layout for header', () => {
      const calloutInfo = {
        type: 'tip',
        title: '提示',
        icon: '💡',
        label: '提示',
      };

      const html = converter.renderCalloutOpen(calloutInfo);

      expect(html).toContain('display: flex');
      expect(html).toContain('align-items: center');
    });

    it('should escape HTML in callout title', () => {
      const calloutInfo = {
        type: 'note',
        title: '<img src=x onerror=alert(1)>',
        icon: 'ℹ️',
        label: '备注',
      };

      const html = converter.renderCalloutOpen(calloutInfo);

      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
    });

    it('should render neutral callout with semantic accent color for known types', () => {
      const neutralTheme = new window.AppleTheme({
        theme: 'wechat',
        themeColor: 'blue',
        fontSize: 3,
        quoteCalloutStyleMode: 'neutral',
      });
      const neutralConverter = new window.AppleStyleConverter(neutralTheme, '', true, null, '');

      const html = neutralConverter.renderCalloutOpen({
        type: 'warning',
        title: '警告',
        icon: '⚠️',
        label: '警告',
      });

      expect(html).toContain('background: #f9f9f9');
      expect(html).toContain('margin: 16px 0 16px 8px');
      expect(html).not.toContain('border-left:');
      expect(html).toContain('border: 1px solid #b26a0024');
      expect(html).toContain('background: #b26a0014');
      expect(html).toContain('color: #b26a00');
    });

    it('should fall back to info semantic color for unknown type in neutral mode', () => {
      const neutralTheme = new window.AppleTheme({
        theme: 'github',
        themeColor: 'green',
        fontSize: 3,
        quoteCalloutStyleMode: 'neutral',
      });
      const neutralConverter = new window.AppleStyleConverter(neutralTheme, '', true, null, '');

      const html = neutralConverter.renderCalloutOpen({
        type: 'custom-type',
        title: '自定义',
        icon: 'ℹ️',
        label: '自定义',
      });

      expect(html).not.toContain('border-left:');
      expect(html).toContain('border: 1px solid #2f6fdd24');
      expect(html).toContain('background: #2f6fdd14');
      expect(html).toContain('color: #2f6fdd');
    });
  });

  describe('renderCalloutOpen - Cross-theme Consistency', () => {
    const calloutInfo = {
      type: 'note',
      title: '备注',
      icon: 'ℹ️',
      label: '备注',
    };

    it('should render semantic card style for serif theme', () => {
      const serifTheme = new window.AppleTheme({
        theme: 'serif',
        themeColor: 'purple',
        fontSize: 3,
      });
      const serifConverter = new window.AppleStyleConverter(serifTheme, '', true, null, '');

      const html = serifConverter.renderCalloutOpen(calloutInfo);

      expect(html).not.toContain('border-left:');
      expect(html).toContain('border: 1px solid #2f6fdd24');
      expect(html).toContain('margin: 16px 0 16px 8px');
      expect(html).not.toContain('text-align: center');
      expect(html).not.toContain('margin: 30px 60px');
    });

    it('should render semantic card style for github theme', () => {
      const githubTheme = new window.AppleTheme({
        theme: 'github',
        themeColor: 'blue',
        fontSize: 3,
      });
      const githubConverter = new window.AppleStyleConverter(githubTheme, '', true, null, '');

      const html = githubConverter.renderCalloutOpen(calloutInfo);

      expect(html).not.toContain('border-left:');
      expect(html).toContain('border: 1px solid #2f6fdd24');
      expect(html).toContain('margin: 16px 0 16px 8px');
      expect(html).not.toContain('text-align: center');
    });

    it('should render semantic card style for wechat theme', () => {
      const wechatTheme = new window.AppleTheme({
        theme: 'wechat',
        themeColor: 'blue',
        fontSize: 3,
      });
      const wechatConverter = new window.AppleStyleConverter(wechatTheme, '', true, null, '');

      const html = wechatConverter.renderCalloutOpen(calloutInfo);

      expect(html).not.toContain('border-left:');
      expect(html).toContain('border: 1px solid #2f6fdd24');
      expect(html).toContain('margin: 16px 0 16px 8px');
      expect(html).not.toContain('text-align: center');
    });

    it('should use consistent semantic color for callout type across themes', () => {
      const wechatTheme = new window.AppleTheme({
        theme: 'wechat',
        themeColor: 'blue',
        fontSize: 3,
      });
      const githubTheme = new window.AppleTheme({
        theme: 'github',
        themeColor: 'blue',
        fontSize: 3,
      });
      const wechatConverter = new window.AppleStyleConverter(wechatTheme, '', true, null, '');
      const githubConverter = new window.AppleStyleConverter(githubTheme, '', true, null, '');

      const wechatHtml = wechatConverter.renderCalloutOpen(calloutInfo);
      const githubHtml = githubConverter.renderCalloutOpen(calloutInfo);

      expect(wechatHtml).toContain('border: 1px solid #2f6fdd24');
      expect(githubHtml).toContain('border: 1px solid #2f6fdd24');
      expect(wechatHtml).not.toContain('border-left:');
      expect(githubHtml).not.toContain('border-left:');
    });

    it('should render serif neutral callouts with the same full semantic card sizing', () => {
      const serifTheme = new window.AppleTheme({
        theme: 'serif',
        themeColor: 'purple',
        fontSize: 3,
        quoteCalloutStyleMode: 'neutral',
      });
      const serifConverter = new window.AppleStyleConverter(serifTheme, '', true, null, '');

      const html = serifConverter.renderCalloutOpen(calloutInfo);

      expect(html).not.toContain('text-align: center');
      expect(html).toContain('margin: 16px 0 16px 8px');
      expect(html).toContain('background: #f9f9f9');
      expect(html).not.toContain('background: #6f42c11F');
    });

    it('should use semantic colors for different callout types in serif theme', () => {
      const serifTheme = new window.AppleTheme({
        theme: 'serif',
        themeColor: 'purple',
        fontSize: 3,
      });
      const serifConverter = new window.AppleStyleConverter(serifTheme, '', true, null, '');

      const warningHtml = serifConverter.renderCalloutOpen({
        type: 'warning',
        title: 'Warning',
        icon: '⚠️',
        label: '警告',
      });
      const tipHtml = serifConverter.renderCalloutOpen({
        type: 'tip',
        title: '小技巧',
        icon: '💡',
        label: '提示',
      });

      expect(warningHtml).toContain('border: 1px solid #b26a0024');
      expect(warningHtml).toContain('color: #b26a00');
      expect(tipHtml).toContain('border: 1px solid #1f8c7a24');
      expect(tipHtml).toContain('color: #1f8c7a');
    });
  });

  describe('removeBlockquoteParagraphMargins', () => {
    it('should keep a single blockquote paragraph vertically balanced', () => {
      const html = '<blockquote style="padding: 16px;"><p style="font-size: 16px; margin: 0 0 24px 0; text-align: justify;">单段引用</p></blockquote>';

      const result = converter.removeBlockquoteParagraphMargins(html);

      expect(result).toContain('margin: 0;');
      expect(result).not.toContain('0.8em');
    });

    it('should preserve gaps created by blank lines inside blockquotes', () => {
      const html = [
        '<blockquote style="padding: 16px;">',
        '<p style="font-size: 16px; margin: 0 0 24px 0; text-align: justify;">第一段引用</p>',
        '<p style="font-size: 16px; margin: 0 0 24px 0; text-align: justify;">第二段引用</p>',
        '</blockquote>',
      ].join('');

      const result = converter.removeBlockquoteParagraphMargins(html);

      expect(result).toContain('margin: 0 0 0.8em 0; text-align: justify;">第一段引用');
      expect(result).toContain('margin: 0; text-align: justify;">第二段引用');
    });

    it('should not count nested callout paragraphs as outer blockquote paragraphs', () => {
      const html = [
        '<blockquote style="padding: 16px;">',
        '<p style="font-size: 16px; margin: 0 0 24px 0; text-align: justify;">外层引用</p>',
        '<section style="margin: 16px 0 16px 8px;">',
        '<section style="padding: 12px 16px;">',
        '<p style="font-size: 16px; margin: 0 0 24px 0; text-align: justify;">嵌套 callout</p>',
        '</section>',
        '</section>',
        '</blockquote>',
      ].join('');

      const result = converter.removeBlockquoteParagraphMargins(html);

      expect(result).toContain('margin: 0; text-align: justify;">外层引用');
      expect(result).toContain('margin: 0; text-align: justify;">嵌套 callout');
      expect(result).not.toContain('外层引用</p><section style="margin: 16px 0 16px 8px;"><section style="padding: 12px 16px;"><p style="font-size: 16px; margin: 0 0 0.8em 0;');
    });
  });

  describe('Integration: convert() and Marker Preservation', () => {
    // For these tests, we need a slightly more functional markdown-it mock
    // that actually uses our rules
    beforeEach(() => {
      const rules = {};
      const env = {};
      converter.md = {
        renderer: { rules },
        render: vi.fn((md) => {
          // Simple mock-render that simulates our rule behavior for specific test strings
          if (md.includes('> [!note]')) {
             const open = rules.blockquote_open([{type:'blockquote_open'}], 0, {}, env);
             const close = rules.blockquote_close([{type:'blockquote_close'}], 0, {}, env);
             return `${open}<p>Content</p>${close}`;
          }
          if (md.includes('[!preserve]')) {
             return `<p>[!preserve] text</p>`;
          }
          return md;
        })
      };
      // Re-setup rules on the mock
      converter.setupRenderRules();
    });

    it('should properly manage stack for nested blockquotes', () => {
      const env = { _calloutStack: [] };
      const rules = converter.md.renderer.rules;

      // Layer 1: Callout
      vi.spyOn(converter, 'detectCallout').mockReturnValueOnce({ type: 'note' });
      rules.blockquote_open([{type:'blockquote_open'}], 0, {}, env);

      // Layer 2: Regular quote
      vi.spyOn(converter, 'detectCallout').mockReturnValueOnce(null);
      rules.blockquote_open([{type:'blockquote_open'}], 0, {}, env);

      expect(env._calloutStack.length).toBe(2);
      expect(env._calloutStack[0]).not.toBeNull(); // note
      expect(env._calloutStack[1]).toBeNull();    // regular

      // Close layer 2
      const close2 = rules.blockquote_close([], 0, {}, env);
      expect(close2).toBe('</blockquote>');

      // Close layer 1
      const close1 = rules.blockquote_close([], 0, {}, env);
      expect(close1).toBe('</section></section>');

      expect(env._calloutStack.length).toBe(0);
    });

    it('should preserve [!type] markers in regular paragraphs (Regression Fix)', async () => {
      const markdown = 'This is [!preserve] text, not a callout.';
      const html = await converter.convert(markdown);
      expect(html).toContain('[!preserve]');
    });
  });
});

describe('Classic Theme Blockquote Style Differentiation', () => {
  it('should apply different styles for wechat theme blockquote vs H3', () => {
    const theme = new window.AppleTheme({
      theme: 'wechat',
      themeColor: 'blue',
      fontSize: 3,
    });

    const blockquoteStyle = theme.getStyle('blockquote');
    const h3Style = theme.getStyle('h3');

    expect(blockquoteStyle).toContain('background: #f8fafc');
    expect(blockquoteStyle).toContain('border-left: 3px solid #0366d699');
    expect(blockquoteStyle).not.toContain('border: 1px solid');

    expect(h3Style).toContain('border-left: 3px solid #0366d6');
    expect(h3Style).toContain('background: #0366d60A');
    expect(h3Style).toContain('padding: 6px 10px');
  });

  it('should NOT apply special blockquote style for github theme', () => {
    const theme = new window.AppleTheme({
      theme: 'github',
      themeColor: 'blue',
      fontSize: 3,
    });

    const blockquoteStyle = theme.getStyle('blockquote');

    // Github theme should use standard blockquote style without the special margin
    expect(blockquoteStyle).toContain('margin: 16px 0');
    expect(blockquoteStyle).not.toMatch(/margin.*0.*0.*4px/); // No 4px offset pattern
  });

  it('should keep regular serif blockquotes distinct from callout cards', () => {
    const theme = new window.AppleTheme({
      theme: 'serif',
      themeColor: 'purple',
      fontSize: 3,
    });

    const blockquoteStyle = theme.getStyle('blockquote');

    expect(blockquoteStyle).toContain('border-left: none');
    expect(blockquoteStyle).toContain('border-right: none');
    expect(blockquoteStyle).toContain('font-family: \'Times New Roman\', Georgia, \'SimSun\', serif');
    expect(blockquoteStyle).toContain('width: 92%');
    expect(blockquoteStyle).toContain('border-top: 1px solid #6f42c155');
    expect(blockquoteStyle).toContain('border-bottom: 1px solid #6f42c155');
    expect(blockquoteStyle).not.toContain('text-align: center');
    expect(blockquoteStyle).not.toContain('border: 1px solid');
  });

  it('should use theme color in blockquote border', () => {
    const theme = new window.AppleTheme({
      theme: 'wechat',
      themeColor: 'green',
      fontSize: 3,
    });

    const greenColor = window.AppleTheme.THEME_COLORS.green;
    const blockquoteStyle = theme.getStyle('blockquote');

    expect(blockquoteStyle).toContain(`border-left: 3px solid ${greenColor}99`);
  });

  it('should differentiate blockquote from H3 visually in wechat theme', () => {
    const theme = new window.AppleTheme({
      theme: 'wechat',
      themeColor: 'blue',
      fontSize: 3,
    });

    const blockquoteStyle = theme.getStyle('blockquote');
    const h3Style = theme.getStyle('h3');

    expect(blockquoteStyle).toContain('background: #f8fafc');
    expect(blockquoteStyle).toContain('border-left: 3px solid #0366d699');
    expect(blockquoteStyle).not.toContain('border: 1px solid');
    expect(h3Style).toContain('border-left: 3px solid #0366d6');
    expect(h3Style).toContain('background: #0366d60A');
    expect(h3Style).not.toContain('background: #f8fafc');
  });
});

describe('Neutral Quote And Callout Style Mode', () => {
  it('should use neutral blockquote background with slight indent in wechat theme', () => {
    const theme = new window.AppleTheme({
      theme: 'wechat',
      themeColor: 'blue',
      fontSize: 3,
      quoteCalloutStyleMode: 'neutral',
    });

    const blockquoteStyle = theme.getStyle('blockquote');

    expect(blockquoteStyle).toContain('background: #f9f9f9');
    expect(blockquoteStyle).toContain('margin: 16px 0 16px 8px');
    expect(blockquoteStyle).toContain('border-left: 3px solid #d9d9d9');
    expect(blockquoteStyle).not.toContain('99');
  });

  it('should keep serif blockquote unmarked in neutral mode', () => {
    const theme = new window.AppleTheme({
      theme: 'serif',
      themeColor: 'purple',
      fontSize: 3,
      quoteCalloutStyleMode: 'neutral',
    });

    const blockquoteStyle = theme.getStyle('blockquote');

    expect(blockquoteStyle).toContain('border-left: none');
    expect(blockquoteStyle).toContain('background: #f9f9f9');
    expect(blockquoteStyle).toContain('border-top: 1px solid #d9d9d9');
    expect(blockquoteStyle).toContain('border-bottom: 1px solid #d9d9d9');
    expect(blockquoteStyle).toContain('border-radius: 4px');
    expect(blockquoteStyle).not.toContain('border: 1px solid');
  });
});
