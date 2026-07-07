/*
## 核心功能

覆盖 markdown frontmatter 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 markdown frontmatter 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect } from 'vitest';

const { stripMarkdownFrontmatter } = require('../services/markdown-utils.js');

describe('stripMarkdownFrontmatter', () => {
  it('removes YAML frontmatter at the start of a note', () => {
    const markdown = [
      '---',
      'title: Demo',
      'tags:',
      '  - obsidian',
      '---',
      '# 正文',
      '',
      '内容',
    ].join('\n');

    expect(stripMarkdownFrontmatter(markdown)).toBe('# 正文\n\n内容');
  });

  it('supports CRLF and YAML document end markers', () => {
    const markdown = '---\r\ntitle: Demo\r\n...\r\n# 正文';

    expect(stripMarkdownFrontmatter(markdown)).toBe('# 正文');
  });

  it('does not remove horizontal rules outside the opening frontmatter block', () => {
    const markdown = '# 正文\n\n---\n\n后续内容';

    expect(stripMarkdownFrontmatter(markdown)).toBe(markdown);
  });
});
