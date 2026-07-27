/*
## 核心功能

覆盖微信贴图 Markdown 清洗顺序、保守边界与结构化清理摘要。

## 输入

接收 Markdown fixture、图片顺序与插入配图序号选项。

## 输出

输出 Vitest 断言结果，保护纯文本文案不泄漏代码/表格等结构，也不误伤货币和行内代码。

## 定位

位于 tests/，是 `services/markdown-cleaner.js` 的单元测试。

## 依赖

关键依赖：Vitest 与 markdown-cleaner 纯函数。

## 维护规则

- 新增清洗类型时同步覆盖正向、负向和未闭合边界。
- 不用 snapshot 掩盖具体清洗语义。
*/

import { describe, it, expect } from 'vitest';
import { cleanMarkdownToPlainText } from '../services/markdown-cleaner.js';

describe('cleanMarkdownToPlainText', () => {
  it('should handle empty or invalid input', () => {
    expect(cleanMarkdownToPlainText(null)).toEqual({
      text: '',
      hasCodeBlocks: false,
      hasTables: false,
      hasMath: false,
      hasFootnotes: false,
      imageCount: 0,
      removed: [],
    });
    expect(cleanMarkdownToPlainText('')).toEqual({
      text: '',
      hasCodeBlocks: false,
      hasTables: false,
      hasMath: false,
      hasFootnotes: false,
      imageCount: 0,
      removed: [],
    });
  });

  it('should strip frontmatter YAML completely', () => {
    const md = `---\ntitle: "测试文章"\ndate: "2026-07-26"\ntags:\n  - test\n---\n这是真正的正文内容。`;
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('这是真正的正文内容。');
    expect(result.text).not.toContain('title:');
    expect(result.text).not.toContain('2026-07-26');
  });

  it('should clean headers, bold, italic, and inline code', () => {
    const md = `# 标题一\n## 标题二\n这是**粗体**和*斜体*，以及\`const a = 1\`。`;
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toContain('标题一');
    expect(result.text).toContain('标题二');
    expect(result.text).toContain('这是粗体和斜体，以及const a = 1。');
    expect(result.text).not.toContain('#');
    expect(result.text).not.toContain('**');
  });

  it('should completely remove strikethrough text', () => {
    const md = '这是正常的段落。~~这行是被划掉删除的内容~~后面接着正常。';
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('这是正常的段落。后面接着正常。');
    expect(result.text).not.toContain('这行是被划掉删除的内容');
  });

  it('should remove code blocks and set hasCodeBlocks to true', () => {
    const md = '文本前\n```javascript\nconsole.log("hello");\n```\n文本后';
    const result = cleanMarkdownToPlainText(md);
    expect(result.hasCodeBlocks).toBe(true);
    expect(result.text).not.toContain('console.log');
    expect(result.text).toBe('文本前\n文本后');
    expect(result.removed).toContainEqual({ kind: 'codeBlocks', count: 1 });
  });

  it('should remove tables and set hasTables to true', () => {
    const md = '表格前\n| 姓名 | 年龄 |\n| --- | --- |\n| 张三 | 18 |\n表格后';
    const result = cleanMarkdownToPlainText(md);
    expect(result.hasTables).toBe(true);
    expect(result.text).not.toContain('张三');
    expect(result.text).toBe('表格前\n表格后');
  });

  it('should clean links and wiki links', () => {
    const md = '点击[官网](https://google.com)或查看[[MyNote|笔记别名]]和[[SoloNote]]';
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('点击官网或查看笔记别名和SoloNote');
  });

  it('should protect underscores in inline code and link labels before emphasis cleanup', () => {
    const md = '保留 `foo_bar_baz`、[a_b](https://example.com) 和 [[note|c_d]]，清理 _斜体_。';
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('保留 foo_bar_baz、a_b 和 c_d，清理 斜体。');
  });

  it('should remove tilde, mermaid, and unclosed fenced blocks', () => {
    const md = [
      '前文',
      '~~~js',
      'const hidden = true',
      '~~~',
      '```mermaid',
      'graph TD',
      '```',
      '后文',
      '```txt',
      '未闭合内容',
    ].join('\n');
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('前文\n后文');
    expect(result.removed).toEqual([
      { kind: 'codeBlocks', count: 2 },
      { kind: 'mermaid', count: 1 },
    ]);
  });

  it('should remove bounded math without treating currency or escaped dollars as math', () => {
    const md = '价格是 $12，转义是 \\$20，公式 $x+y$。\n$$z=1$$';
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('价格是 $12，转义是 \\$20，公式 。');
    expect(result.hasMath).toBe(true);
    expect(result.removed).toContainEqual({ kind: 'math', count: 2 });
  });

  it('should remove multiline footnotes but keep ordinary pipe text', () => {
    const md = [
      '正文[^note]',
      '',
      '[^note]: 第一行',
      '  第二行',
      '',
      '这不是表格 A | B。',
    ].join('\n');
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('正文\n\n这不是表格 A | B。');
    expect(result.hasFootnotes).toBe(true);
    expect(result.hasTables).toBe(false);
    expect(result.removed).toContainEqual({ kind: 'footnotes', count: 1 });
  });

  it('should clean comments, callout markers, highlights, tasks, and html', () => {
    const md = [
      '%%隐藏注释%%',
      '> [!note]+ 提醒',
      '> ==重点==',
      '- [x] 已完成',
      '<span>普通文字</span>',
    ].join('\n');
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('提醒\n重点\n• 已完成\n普通文字');
  });

  it('should count images and handle insertImageIndex option', () => {
    const md = '段落一\n![[pic1.png]]\n段落二\n![alt](https://example.com/pic2.jpg)';
    
    // 不插入索引
    const resultWithoutIndex = cleanMarkdownToPlainText(md, { insertImageIndex: false });
    expect(resultWithoutIndex.imageCount).toBe(2);
    expect(resultWithoutIndex.text).toBe('段落一\n\n段落二');

    // 插入索引
    const resultWithIndex = cleanMarkdownToPlainText(md, { insertImageIndex: true });
    expect(resultWithIndex.imageCount).toBe(2);
    expect(resultWithIndex.text).toBe('段落一\n[配图 1]\n段落二\n[配图 2]');
  });
});
