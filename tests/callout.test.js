import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock markdown-it globally before importing converter
global.markdownit = function(options) {
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

const themePath = path.resolve(__dirname, '../themes/apple-theme.js');
const converterPath = path.resolve(__dirname, '../converter.js');

// Execute theme first (defines window.AppleTheme)
eval(fs.readFileSync(themePath, 'utf-8'));

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

    it('should handle unknown callout type with fallback icon', () => {
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
      expect(result.icon).toBe('📌'); // Fallback icon
    });

    it('should detect custom Chinese callout type and use fallback icon', () => {
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
      expect(result.icon).toBe('📌'); // 未映射类型走默认图标
      expect(result.label).toBe('学习研究');
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

      // Check container structure
      expect(html).toContain('<section');
      expect(html).toContain('border-left: 3px solid');
      expect(html).toContain('99'); // 60% opacity suffix

      // Check header
      expect(html).toContain('ℹ️');
      expect(html).toContain('备注标题');

      // Check content section opens
      expect(html).toContain('padding: 12px 16px');
    });

    it('should use theme color for styling', () => {
      // Get the theme color
      const themeColor = theme.getThemeColorValue();

      const calloutInfo = {
        type: 'warning',
        title: '警告',
        icon: '⚠️',
        label: '警告',
      };

      const html = converter.renderCalloutOpen(calloutInfo);

      // Should contain theme color with opacity
      expect(html).toContain(`${themeColor}99`); // Border color (60% opacity)
      expect(html).toContain(`${themeColor}1A`); // Background (light tint)
      expect(html).toContain(`${themeColor}26`); // Header background
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
  });

  describe('renderCalloutOpen - Cross-theme Consistency', () => {
    const calloutInfo = {
      type: 'note',
      title: '备注',
      icon: 'ℹ️',
      label: '备注',
    };

    it('should render centered style for serif theme', () => {
      const serifTheme = new window.AppleTheme({
        theme: 'serif',
        themeColor: 'purple',
        fontSize: 3,
      });
      const serifConverter = new window.AppleStyleConverter(serifTheme, '', true, null, '');

      const html = serifConverter.renderCalloutOpen(calloutInfo);

      // Centered style: no left border, centered text
      expect(html).toContain('text-align: center');
      expect(html).not.toContain('border-left:');
      // Wider margins for centered style
      expect(html).toContain('margin: 30px 60px');
    });

    it('should render left-border style for github theme', () => {
      const githubTheme = new window.AppleTheme({
        theme: 'github',
        themeColor: 'blue',
        fontSize: 3,
      });
      const githubConverter = new window.AppleStyleConverter(githubTheme, '', true, null, '');

      const html = githubConverter.renderCalloutOpen(calloutInfo);

      // Left border style: 4px border, no margin offset
      expect(html).toContain('border-left: 4px solid');
      expect(html).toContain('margin: 16px 0 16px 0');
      expect(html).not.toContain('text-align: center');
    });

    it('should render left-border style with offset for wechat theme', () => {
      const wechatTheme = new window.AppleTheme({
        theme: 'wechat',
        themeColor: 'blue',
        fontSize: 3,
      });
      const wechatConverter = new window.AppleStyleConverter(wechatTheme, '', true, null, '');

      const html = wechatConverter.renderCalloutOpen(calloutInfo);

      // Wechat style: 3px border with 4px left margin offset
      expect(html).toContain('border-left: 3px solid');
      expect(html).toContain('margin: 16px 0 16px 4px');
      expect(html).not.toContain('text-align: center');
    });

    it('should use 60% opacity border for wechat, full opacity for github', () => {
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

      const themeColor = wechatTheme.getThemeColorValue();

      // Wechat uses 60% opacity (99 suffix)
      expect(wechatHtml).toContain(`${themeColor}99`);
      // Github uses full opacity (no suffix)
      expect(githubHtml).toContain(`solid ${themeColor};`);
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
      const html1 = rules.blockquote_open([{type:'blockquote_open'}], 0, {}, env);

      // Layer 2: Regular quote
      vi.spyOn(converter, 'detectCallout').mockReturnValueOnce(null);
      const html2 = rules.blockquote_open([{type:'blockquote_open'}], 0, {}, env);

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

    // Blockquote should have:
    // - 3px border (not 4px like H3)
    // - 99 suffix (60% opacity)
    // - 4px left margin
    expect(blockquoteStyle).toContain('border-left: 3px solid');
    expect(blockquoteStyle).toContain('99'); // 60% opacity
    expect(blockquoteStyle).toMatch(/margin.*4px/); // Has 4px margin offset

    // H3 should have:
    // - 4px border
    // - Full opacity color (no 99 suffix in border definition)
    expect(h3Style).toContain('border-left: 4px solid');
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

  it('should NOT apply special blockquote style for serif theme', () => {
    const theme = new window.AppleTheme({
      theme: 'serif',
      themeColor: 'purple',
      fontSize: 3,
    });

    const blockquoteStyle = theme.getStyle('blockquote');

    // Serif theme uses centered blockquote style
    expect(blockquoteStyle).toContain('text-align: center');
  });

  it('should use theme color in blockquote border', () => {
    const theme = new window.AppleTheme({
      theme: 'wechat',
      themeColor: 'green',
      fontSize: 3,
    });

    const greenColor = window.AppleTheme.THEME_COLORS.green;
    const blockquoteStyle = theme.getStyle('blockquote');

    expect(blockquoteStyle).toContain(`${greenColor}99`);
  });

  it('should differentiate blockquote from H3 visually in wechat theme', () => {
    const theme = new window.AppleTheme({
      theme: 'wechat',
      themeColor: 'blue',
      fontSize: 3,
    });

    const blockquoteStyle = theme.getStyle('blockquote');
    const h3Style = theme.getStyle('h3');

    // Extract border width from both
    const blockquoteBorderMatch = blockquoteStyle.match(/border-left:\s*(\d+)px/);
    const h3BorderMatch = h3Style.match(/border-left:\s*(\d+)px/);

    expect(blockquoteBorderMatch).not.toBeNull();
    expect(h3BorderMatch).not.toBeNull();

    const blockquoteBorderWidth = parseInt(blockquoteBorderMatch[1]);
    const h3BorderWidth = parseInt(h3BorderMatch[1]);

    // H3 should have thicker border than blockquote
    expect(h3BorderWidth).toBeGreaterThan(blockquoteBorderWidth);
    expect(h3BorderWidth).toBe(4);
    expect(blockquoteBorderWidth).toBe(3);
  });
});
