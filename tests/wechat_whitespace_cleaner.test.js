/*
## 核心功能

覆盖 wechat whitespace cleaner 相关行为的 Vitest 测试用例。

## 输入

接收 HTML 片段、带有 softbreak/换行符/全角缩进/代码块的 DOM 容器。

## 输出

输出自动化断言结果，保证消除 `<br>\n` 行首空格问题的同时保护代码块格式与全角空格缩进。

## 定位

位于 tests/，是排版与富文本清理相关的回归测试层。

## 依赖

关键依赖：Vitest、`../services/wechat-whitespace-cleaner.js`、`../services/wechat-html-cleaner.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书。
- 绝不能修改 `<pre>`/`<code>` 等代码块内部的任何换行与空格。
- 绝不能将中文全角空格 `\u3000` 或 `&emsp;` 作为普通空白误删。
*/

import { describe, it, expect } from 'vitest';
import {
  collapseWhitespaceAroundBreak,
  trimBlockEdgeWhitespace,
  cleanHtmlWhitespaceForWechat,
} from '../services/wechat-whitespace-cleaner.js';
import { cleanHtmlForDraft } from '../services/wechat-html-cleaner.js';
import { createHtmlContainer } from '../services/dom-utils.js';

describe('Wechat Whitespace Cleaner', () => {
  it('should remove newline and ascii spaces immediately following <br>', () => {
    const input = '<p>规避、开拓、转移、减轻、接受。<br>\n是信息系统项目管理教科书上关于风险的五大应对方式。<br>\n  也是我面对风险时用过的一切手段。</p>';
    const output = cleanHtmlWhitespaceForWechat(input);

    expect(output).toBe(
      '<p>规避、开拓、转移、减轻、接受。<br>是信息系统项目管理教科书上关于风险的五大应对方式。<br>也是我面对风险时用过的一切手段。</p>'
    );
  });

  it('should preserve fullwidth Chinese spaces (\u3000) as paragraph indent', () => {
    const input = '<p>\u3000\u3000引子 为了规避风险<br>\n\u3000\u3000第二行内容</p>';
    const output = cleanHtmlWhitespaceForWechat(input);

    expect(output).toBe('<p>\u3000\u3000引子 为了规避风险<br>\u3000\u3000第二行内容</p>');
  });

  it('should never mutate indentation or newlines inside code blocks', () => {
    const codeHtml = '<pre><code class="language-js">function test() {\n  const a = 1;\n  return a;\n}</code></pre>';
    const output = cleanHtmlWhitespaceForWechat(codeHtml);

    expect(output).toBe(codeHtml);

    const codeWithBr = '<pre><code>line 1<br>\n    line 2<br>\n    line 3</code></pre>';
    const output2 = cleanHtmlWhitespaceForWechat(codeWithBr);
    expect(output2).toBe(codeWithBr);
  });

  it('should preserve multiple consecutive <br> while collapsing newlines between them', () => {
    const input = '<p>第一段落尾<br>\n<br>\n第二段落头</p>';
    const output = cleanHtmlWhitespaceForWechat(input);

    expect(output).toBe('<p>第一段落尾<br><br>第二段落头</p>');
  });

  it('should handle <br> followed by inline elements like <strong> or <span>', () => {
    const input = '<p>普通第一行<br>\n<strong>重点第二行</strong></p>';
    const output = cleanHtmlWhitespaceForWechat(input);

    expect(output).toBe('<p>普通第一行<br><strong>重点第二行</strong></p>');
  });

  it('should trim edge whitespace of block elements', () => {
    const input = '<p>\n  段落首部有空白和换行  \n</p>';
    const output = cleanHtmlWhitespaceForWechat(input);

    expect(output).toBe('<p>段落首部有空白和换行</p>');
  });

  it('should collapse whitespace around break directly on element container', () => {
    const container = createHtmlContainer('div', '<p>行1<br>\n行2</p>');
    collapseWhitespaceAroundBreak(container);
    expect(container.innerHTML).toBe('<p>行1<br>行2</p>');
  });

  it('should trim block edge whitespace directly on element container', () => {
    const container = createHtmlContainer('div', '<p>\n  测试  \n</p>');
    trimBlockEdgeWhitespace(container);
    expect(container.innerHTML).toBe('<p>测试</p>');
  });

  it('should operate correctly through cleanHtmlForDraft pipeline', () => {
    const input = '<p>首行文本<br>\n次行文本<br>\n末行文本</p>';
    const output = cleanHtmlForDraft(input);

    expect(output).toContain('<p');
    expect(output).toContain('首行文本<br>次行文本<br>末行文本</p>');
    expect(output).not.toContain('<br>\n');
  });
});
