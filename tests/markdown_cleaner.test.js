import { describe, it, expect } from 'vitest';
import { cleanMarkdownToPlainText } from '../services/markdown-cleaner.js';

describe('cleanMarkdownToPlainText', () => {
  it('should handle empty or invalid input', () => {
    expect(cleanMarkdownToPlainText(null)).toEqual({
      text: '',
      hasCodeBlocks: false,
      hasTables: false,
      imageCount: 0
    });
    expect(cleanMarkdownToPlainText('')).toEqual({
      text: '',
      hasCodeBlocks: false,
      hasTables: false,
      imageCount: 0
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
    expect(result.text).toBe('文本前\n\n文本后');
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
