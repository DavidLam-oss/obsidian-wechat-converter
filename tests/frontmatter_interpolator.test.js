/*
## 核心功能

覆盖 frontmatter-interpolator.js 的自动化测试：
- 标准模板变量与中英文别名插值（{{date}}/{{日期}}, {{author}}/{{作者}}, {{column}}/{{专栏}}, {{title}}/{{标题}}）
- 自定义 Frontmatter 标量字段插值
- 围栏代码块与行内代码免疫保护
- 未配置变量高亮（预览提示）与导出保留
- 严格隔离卡片封面模型（不影响卡片封面日期恒为空的底线）

## 输入

被测模块、模拟上下文与各类测试 Markdown 文本。

## 输出

Vitest 断言结果。
*/

import { describe, it, expect } from 'vitest';
import {
  parseMarkdownFrontmatter,
  resolveVariableValue,
  findUnresolvedVariables,
  interpolateMarkdownVariables,
  stripUnresolvedVariableHighlights,
  DEFAULT_UNRESOLVED_TAG_CLASS,
} from '../services/frontmatter-interpolator.js';
import { createNoteCardSession } from '../services/card-session.js';
import { EMPTY_COVER_FIELDS } from '../services/card-cover-model.js';

describe('Frontmatter Interpolator - parseMarkdownFrontmatter', () => {
  it('should parse standard yaml frontmatter scalars', () => {
    const md = `---
title: 测试标题
author: "乔木"
date: '2026-10-18'
column: AI周刊 # 忽略行内注释
issue: 15
---
# 正文内容`;
    const fm = parseMarkdownFrontmatter(md);
    expect(fm.title).toBe('测试标题');
    expect(fm.author).toBe('乔木');
    expect(fm.date).toBe('2026-10-18');
    expect(fm.column).toBe('AI周刊');
    expect(fm.issue).toBe('15');
  });

  it('should return empty object if no frontmatter present', () => {
    expect(parseMarkdownFrontmatter('# 纯正文')).toEqual({});
    expect(parseMarkdownFrontmatter('')).toEqual({});
  });
});

describe('Frontmatter Interpolator - resolveVariableValue', () => {
  it('should resolve standard aliases', () => {
    const vars = {
      date: '2026-10-18',
      author: '乔木',
      column: '技术专栏',
      title: '文章标题',
    };

    expect(resolveVariableValue('date', vars)).toBe('2026-10-18');
    expect(resolveVariableValue('日期', vars)).toBe('2026-10-18');
    expect(resolveVariableValue('author', vars)).toBe('乔木');
    expect(resolveVariableValue('作者', vars)).toBe('乔木');
    expect(resolveVariableValue('column', vars)).toBe('技术专栏');
    expect(resolveVariableValue('专栏', vars)).toBe('技术专栏');
    expect(resolveVariableValue('专栏名', vars)).toBe('技术专栏');
    expect(resolveVariableValue('栏目', vars)).toBe('技术专栏');
    expect(resolveVariableValue('title', vars)).toBe('文章标题');
    expect(resolveVariableValue('标题', vars)).toBe('文章标题');
  });

  it('should fallback to context when not in frontmatter', () => {
    const emptyVars = {};
    const context = {
      account: { author: '公众号主笔' },
      sourcePath: 'notes/weekly-summary.md',
    };

    expect(resolveVariableValue('author', emptyVars, context)).toBe('公众号主笔');
    expect(resolveVariableValue('title', emptyVars, context)).toBe('weekly-summary');
    // date 自动补齐为有效日期格式 YYYY-MM-DD
    const dateVal = resolveVariableValue('date', emptyVars, context);
    expect(dateVal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should return null for completely unconfigured variable', () => {
    expect(resolveVariableValue('column', {}, {})).toBeNull();
    expect(resolveVariableValue('专栏', {}, {})).toBeNull();
    expect(resolveVariableValue('unknown_field', {}, {})).toBeNull();
  });
});

describe('Frontmatter Interpolator - interpolateMarkdownVariables', () => {
  it('should replace configured variables in markdown body', () => {
    const md = `---
title: 独立开发指南
author: 乔木
column: 独立开发日记
date: 2026-10-18
---
欢迎阅读《{{title}}》，本文由 {{author}} 撰写，收录于 {{column}}，发布于 {{date}}。`;

    const result = interpolateMarkdownVariables(md);
    expect(result).toContain('欢迎阅读《独立开发指南》，本文由 乔木 撰写，收录于 独立开发日记，发布于 2026-10-18。');
  });

  it('should NOT replace variables inside fenced code blocks', () => {
    const md = `---
column: 真实专栏
---
正文专栏：{{column}}

\`\`\`python
# 代码块内不应被替换
column = "{{column}}"
print(f"专栏: {column}")
\`\`\`

正文结尾。`;

    const result = interpolateMarkdownVariables(md);
    expect(result).toContain('正文专栏：真实专栏');
    expect(result).toContain('column = "{{column}}"');
  });

  it('should NOT replace variables inside inline code spans', () => {
    const md = `---
author: 乔木
---
正文作者是 {{author}}，而在代码中引用 \`{{author}}\` 保持原样。`;

    const result = interpolateMarkdownVariables(md);
    expect(result).toContain('正文作者是 乔木，而在代码中引用 `{{author}}` 保持原样。');
  });

  it('should highlight unresolved variables in preview mode', () => {
    const md = `本文属于 {{column}} 专栏。`;
    const result = interpolateMarkdownVariables(md, {
      highlightUnresolved: true,
    });

    expect(result).toContain(`class="${DEFAULT_UNRESOLVED_TAG_CLASS}"`);
    expect(result).toContain('{{column（待填写）}}');
  });

  it('should keep raw unresolved variables in export mode without highlight', () => {
    const md = `本文属于 {{column}} 专栏。`;
    const result = interpolateMarkdownVariables(md, {
      context: { isExport: true },
    });

    expect(result).toBe('本文属于 {{column}} 专栏。');
    expect(result).not.toContain(DEFAULT_UNRESOLVED_TAG_CLASS);
  });

  it('should find unresolved variables accurately', () => {
    const md = `作者是 {{author}}，专栏是 {{column}}，日期是 {{date}}，代码块里有 \`{{ignore}}\`。`;
    const unresolved = findUnresolvedVariables(md, {
      variables: { author: '张三' },
    });

    expect(unresolved).toContain('column');
    expect(unresolved).not.toContain('author');
    expect(unresolved).not.toContain('ignore');
  });

  it('should strip unresolved variable highlights from HTML for export', () => {
    const inputHtml = `<p>正文内容，所属专栏：<span class="${DEFAULT_UNRESOLVED_TAG_CLASS}" style="background-color: #FEF08A; color: #854D0E;">{{专栏（待填写）}}</span>，结束。</p>`;
    const stripped = stripUnresolvedVariableHighlights(inputHtml);

    expect(stripped).toBe('<p>正文内容，所属专栏：{{专栏}}，结束。</p>');
    expect(stripped).not.toContain(DEFAULT_UNRESOLVED_TAG_CLASS);
    expect(stripped).not.toContain('#FEF08A');
    expect(stripped).not.toContain('待填写');
  });
});

describe('Frontmatter Interpolator - Strict Card Cover Isolation (Round 14 B6)', () => {
  it('should NEVER touch or mutate card cover fields or default date', () => {
    const md = `---
title: 文章标题
date: 2026-10-18
---
正文发布于 {{date}}。`;

    // 运行正文变量插值
    const interpolated = interpolateMarkdownVariables(md);
    expect(interpolated).toContain('正文发布于 2026-10-18。');

    // 断言卡片封面模型的日期依然严格为空（保护 tests/card_cover.test.js:48 底线）
    expect(EMPTY_COVER_FIELDS.date).toBe('');
    const session = createNoteCardSession();
    expect(session.getCoverFields().date).toBe('');
  });
});
