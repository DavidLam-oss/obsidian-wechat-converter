/*
## 核心功能

覆盖微信贴图 Markdown 清洗顺序、保守边界与结构化清理摘要。

## 输入

接收 Markdown fixture、图片顺序与插入配图序号选项。

## 输出

输出 Vitest 断言结果，保护纯文本文案保留作者语义、降级复杂结构，也不误伤货币和行内代码。

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

  it('should preserve strikethrough text while removing its formatting markers', () => {
    const md = '这是正常的段落。~~这行是被划掉删除的内容~~后面接着正常。';
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('这是正常的段落。这行是被划掉删除的内容后面接着正常。');
    expect(result.text).not.toContain('~~');
  });

  it('should preserve horizontal-rule semantics across Obsidian forms', () => {
    const md = ['第一节', '---', '第二节', '* * *', '第三节', '___', '第四节'].join('\n');
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe([
      '第一节',
      '────────',
      '第二节',
      '────────',
      '第三节',
      '────────',
      '第四节',
    ].join('\n'));
  });

  it('should preserve ordinary code block content as plain text', () => {
    const md = '文本前\n```javascript\nconsole.log("hello");\n```\n文本后';
    const result = cleanMarkdownToPlainText(md);
    expect(result.hasCodeBlocks).toBe(true);
    expect(result.text).toBe('文本前\n【代码】\nconsole.log("hello");\n文本后');
    expect(result.removed).toContainEqual({ kind: 'codeBlocks', count: 1 });
  });

  it('should flatten tables without losing cell content', () => {
    const md = '表格前\n| 姓名 | 年龄 |\n| --- | --- |\n| 张三 | 18 |\n表格后';
    const result = cleanMarkdownToPlainText(md);
    expect(result.hasTables).toBe(true);
    expect(result.text).toBe('表格前\n姓名 ｜ 年龄\n张三 ｜ 18\n表格后');
    expect(result.removed).toContainEqual({ kind: 'tables', count: 1 });
  });

  it('should clean links and wiki links', () => {
    const md = '点击[官网](https://google.com)或查看[[MyNote|笔记别名]]和[[SoloNote]]';
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('点击官网：https://google.com或查看笔记别名和SoloNote');
  });

  it('should protect underscores in inline code and link labels before emphasis cleanup', () => {
    const md = '保留 `foo_bar_baz`、[a_b](https://example.com) 和 [[note|c_d]]，清理 _斜体_。';
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('保留 foo_bar_baz、a_b：https://example.com 和 c_d，清理 斜体。');
  });

  it('should preserve ordinary fences and replace mermaid with a readable placeholder', () => {
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
    expect(result.text).toBe([
      '前文',
      '【代码】',
      'const hidden = true',
      '[流程图]',
      '后文',
      '【代码】',
      '未闭合内容',
    ].join('\n'));
    expect(result.removed).toEqual([
      { kind: 'codeBlocks', count: 2 },
      { kind: 'mermaid', count: 1 },
    ]);
  });

  it('should preserve simple math, mark complex math, and keep currency', () => {
    const md = '价格是 $12，转义是 \\$20，公式 $x+y$。\n$$z=1$$';
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('价格是 $12，转义是 \\$20，公式 x+y。\n[公式]');
    expect(result.hasMath).toBe(true);
    expect(result.removed).toContainEqual({ kind: 'math', count: 2 });
  });

  it('should convert multiline footnotes and keep ordinary pipe text', () => {
    const md = [
      '正文[^note]',
      '',
      '[^note]: 第一行',
      '  第二行',
      '',
      '这不是表格 A | B。',
    ].join('\n');
    const result = cleanMarkdownToPlainText(md);
    expect(result.text).toBe('正文[1]\n\n这不是表格 A | B。\n\n注1：第一行 第二行');
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
    expect(result.text).toBe('提醒\n重点\n☑ 已完成\n普通文字');
  });

  it('should preserve checked and unchecked task states', () => {
    const result = cleanMarkdownToPlainText('- [x] 已完成\n- [ ] 未完成');
    expect(result.text).toBe('☑ 已完成\n☐ 未完成');
  });

  it('should not count non-image wiki embeds as sticker images', () => {
    const result = cleanMarkdownToPlainText('![[pic.png]]\n![[Other Note]]\n![[manual.pdf]]', {
      insertImageIndex: true,
    });
    expect(result.imageCount).toBe(1);
    expect(result.text).toBe('[配图 1]\n【引用：Other Note】\n【附件：manual.pdf】');
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
    expect(resultWithIndex.text).not.toContain('alt');
  });

  it('should replace plugin query blocks without leaking executable source', () => {
    const result = cleanMarkdownToPlainText([
      '前文',
      '```dataviewjs',
      'dv.pages().where(page => page.secret)',
      '```',
      '后文',
    ].join('\n'));
    expect(result.text).toBe('前文\n[查询内容未展开]\n后文');
    expect(result.text).not.toContain('dv.pages');
    expect(result.removed).toContainEqual({ kind: 'pluginBlocks', count: 1 });
  });

  it('should preserve HTML block boundaries and remove dangerous HTML content', () => {
    const result = cleanMarkdownToPlainText(
      '<p>第一段<br>换行</p><div>第二段 &amp; 内容</div><script>alert(1)</script>'
    );
    expect(result.text).toBe('第一段\n换行\n第二段 & 内容');
    expect(result.text).not.toContain('alert');
  });

  it('should use a placeholder for complex inline math', () => {
    const result = cleanMarkdownToPlainText('复杂公式 $\\frac{x_1}{y^2}$，简单公式 $a+b$。');
    expect(result.text).toBe('复杂公式 [公式]，简单公式 a+b。');
    expect(result.removed).toContainEqual({ kind: 'math', count: 2 });
  });
});
