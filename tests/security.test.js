/*
## 核心功能

覆盖 security 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 security 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeEach } from 'vitest';
const fs = require('fs');
const path = require('path');

// Mock markdown-it and global environment
if (typeof window === 'undefined') {
    global.window = global;
}

global.markdownit = function(_options) {
  return {
    render: (md) => md,
    renderer: {
      rules: {}
    }
  };
};

// Load converter via eval
const converterPath = path.resolve(__dirname, '../converter.js');
eval(fs.readFileSync(converterPath, 'utf-8'));

describe('Security Sanitization', () => {
  let converter;

  beforeEach(() => {
    const mockTheme = {
      getThemeColorValue: () => '#000',
      getSizes: () => ({ base: 14 }),
      getFontFamily: () => 'sans-serif',
      getStyle: () => '',
      themeName: 'github'
    };
    converter = new window.AppleStyleConverter(mockTheme);
    // Initialize md manually for testing since we mocked markdownit
    converter.md = global.markdownit();
    converter.setupRenderRules();
  });

  it('should neutralize javascript: links via validateLink', () => {
    expect(converter.validateLink('javascript:alert(1)')).toBe('#');
    expect(converter.validateLink('data:text/html,<html>')).toBe('#unsafe'); // Context is link, should be neutralized
    expect(converter.validateLink('https://google.com')).toBe('https://google.com');
    expect(converter.validateLink('obsidian://open?vault=test')).toBe('obsidian://open?vault=test');
  });

  it('should strip dangerous tags and content', () => {
    const malicious = '<script>alert("xss")</script><div>Safe</div><iframe src="malicious.com"></iframe>';
    const sanitized = converter.sanitizeHtml(malicious);
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('<iframe');
    expect(sanitized).toContain('<div>Safe</div>');
  });

  it('should strip pasted document wrapper tags and fragment comments', () => {
    const pasted = '<html><body><!--StartFragment--><p>Safe</p><!--EndFragment--></body></html>';
    const sanitized = converter.sanitizeHtml(pasted);
    expect(sanitized).toBe('<p>Safe</p>');
  });

  it('should remove onerror and other event handlers', () => {
    const malicious = '<img src=x onerror=alert(1) onclick="malicious()">';
    const sanitized = converter.sanitizeHtml(malicious);
    // The sanitizer adds quotes and validates protocol.
    // "x" is an internal path (no colon), allowed by validateLink for Obsidian compatibility.
    expect(sanitized).toContain('src="x"');
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('onclick');
  });

  it('should neutralize links in the actual render rules', () => {
    const tokens = [{
      attrGet: () => 'javascript:alert(1)',
      type: 'link_open'
    }];
    // Mock getInlineStyle
    converter.getInlineStyle = () => '';
    const html = converter.md.renderer.rules.link_open(tokens, 0);
    expect(html).toContain('href="#"');
    expect(html).not.toContain('javascript:');
  });
});
