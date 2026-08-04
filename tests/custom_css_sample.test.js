/*
## 核心功能

把公开 custom CSS 样例作为 canonical fixture，防止指南链接存在但样例无法编译或匹配真实输出。

## 输入

接收 samples/custom-css-demo.css.example 示例文件。

## 输出

输出示例可编译、无致命诊断及公共 hook 可用性断言。

## 定位

位于 tests/，保护文档示例与运行时能力保持一致。

## 依赖

Vitest、Node 文件读取与 custom-css-compiler。

## 维护规则

更新公开示例或编译器支持范围时同步调整本测试。
*/

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileCustomCss } from '../services/custom-css-compiler.js';
import { applyCompiledCustomCss } from '../services/custom-css-inliner.js';

const sampleCss = readFileSync(
  resolve(process.cwd(), 'samples/custom-css-demo.css.example'),
  'utf8'
);

describe('custom CSS public sample', () => {
  it('样例可编译，并能匹配正文、标题、Callout、代码、表格和图片', () => {
    const compiled = compileCustomCss(sampleCss, { sourceIdentity: 'sample' });
    expect(compiled.usable).toBe(true);
    expect(compiled.diagnostics.some((item) => item.severity === 'fatal')).toBe(false);

    const html = [
      '<h2>标题</h2>',
      '<p>正文 <a href="https://example.com">链接</a></p>',
      '<blockquote><p>引用</p></blockquote>',
      '<section class="owc-callout"><section class="owc-callout-title">提示</section><section class="owc-callout-content"><p>内容</p></section></section>',
      '<pre><code>const a = 1;</code></pre>',
      '<table><tr><th>A</th><td>B</td></tr></table>',
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="图">',
    ].join('');
    const result = applyCompiledCustomCss(html, compiled);

    expect(result.applied).toBe(true);
    expect(result.matchedRuleCount).toBeGreaterThan(8);
    expect(result.html).toContain('pseudo-callout-mark');
    expect(result.html).toContain('border-left: 5px solid #f39c12 !important');
    expect(result.html).toContain('border-radius: 10px !important');
  });
});
