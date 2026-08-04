/*
## 核心功能

验证 AST 选择器编译、资源安全策略、伪元素与缓存合同。

## 输入

接收 CSS 字符串、来源标识和 jsdom 文章节点。

## 输出

输出编译结果、结构化诊断及内联后的 DOM 断言。

## 定位

位于 tests/，覆盖自定义 CSS 编译与安全边界。

## 依赖

Vitest、custom-css-compiler 与 custom-css-inliner。

## 维护规则

新增选择器、值语法或安全限制时同步补充正反例。
*/

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCustomCssCompileCache,
  compileCustomCss,
} from '../services/custom-css-compiler.js';
import { applyCompiledCustomCss } from '../services/custom-css-inliner.js';

describe('custom-css-compiler', () => {
  beforeEach(() => clearCustomCssCompileCache());

  it('安全展开 :is() / :where()，保留 :not() 与属性值逗号', () => {
    const compiled = compileCustomCss([
      ':is(h2, h3), :where(p.lead, p.note) { color: red; }',
      'p:not(.muted) { font-weight: bold; }',
      '[data-label="a,b"] { padding: 2px; }',
    ].join('\n'));

    expect(compiled.usable).toBe(true);
    expect(compiled.scopedCss).toContain('.owc-article-root h2');
    expect(compiled.scopedCss).toContain('.owc-article-root h3');
    expect(compiled.scopedCss).toContain('.owc-article-root p.lead');
    expect(compiled.scopedCss).toContain('.owc-article-root p:not(.muted)');
    expect(compiled.fallbackRules).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: '[data-label="a,b"]' }),
    ]));

    const html = '<h2>A</h2><p class="lead">B</p><p>C</p><p class="muted">D</p><span data-label="a,b">E</span>';
    const result = applyCompiledCustomCss(html, compiled);
    expect(result.html).toContain('<h2 style="color: red;">');
    expect(result.html).toContain('<p class="lead" style="color: red; font-weight: bold;">');
    expect(result.html).toContain('<p style="font-weight: bold;">C</p>');
    expect(result.html).toContain('data-label="a,b" style="padding: 2px;"');
    expect(result.matchedRuleCount).toBeGreaterThanOrEqual(4);
  });

  it('明确跳过 :has() 并给 warning', () => {
    const compiled = compileCustomCss('section:has(h2) { color: red; } p { color: blue; }');
    expect(compiled.usable).toBe(true);
    expect(compiled.scopedCss).not.toContain(':has');
    expect(compiled.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'custom-css-selector-not-inlineable' }),
    ]));
  });

  it('移除外部、相对、file 与 SVG data URL，允许片段和小型安全位图', () => {
    const compiled = compileCustomCss([
      'a { background:url(https://example.com/a.png); }',
      'b { background:url(../a.png); }',
      'c { background:url(file:///tmp/a.png); }',
      'd { background:url(data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=); }',
      'e { filter:url(#shadow); }',
      'f { background:url(data:image/png;base64,iVBORw0KGgo=); }',
    ].join('\n'));

    expect(compiled.scopedCss).not.toContain('https://');
    expect(compiled.scopedCss).not.toContain('../a.png');
    expect(compiled.scopedCss).not.toContain('file:///');
    expect(compiled.scopedCss).not.toContain('image/svg+xml');
    expect(compiled.scopedCss).toContain('url(#shadow)');
    expect(compiled.scopedCss).toContain('data:image/png');
    expect(compiled.diagnostics.filter((item) => item.code === 'custom-css-resource-url-blocked')).toHaveLength(4);
  });

  it('规范化 CSS escape、percent encoding 与控制字符后再拦截资源', () => {
    const nul = String.fromCodePoint(0);
    const unitSeparator = String.fromCodePoint(31);
    const compiled = compileCustomCss([
      String.raw`a { background: url(\68 ttps://example.com/a.png); }`,
      'b { background: url(%68%74%74%70%73%3A%2F%2Fexample.com/b.png); }',
      String.raw`c { background: url(j\61vascript:alert(1)); }`,
      `d { background: url(java${nul}${unitSeparator}script:alert(1)); }`,
    ].join('\n'));

    expect(compiled.scopedCss).toBe('');
    expect(compiled.diagnostics.filter((item) => item.code === 'custom-css-resource-url-blocked')).toHaveLength(4);
  });

  it('拦截超过单项或总量限制的 data image，且限制参与 cache identity', () => {
    const css = [
      'a { background: url(data:image/png;base64,QUFBQUFB); }',
      'b { background: url(data:image/png;base64,QkJCQkJC); }',
    ].join('\n');
    const strict = compileCustomCss(css, {
      sourceIdentity: 'limits',
      maxDataImageBytes: 4,
      maxTotalDataImageBytes: 8,
    });
    const relaxed = compileCustomCss(css, {
      sourceIdentity: 'limits',
      maxDataImageBytes: 8,
      maxTotalDataImageBytes: 16,
    });

    expect(strict).not.toBe(relaxed);
    expect(strict.scopedCss).toBe('');
    expect(relaxed.scopedCss).toContain('data:image/png');
  });

  it('编译伪元素和 counter，且相同输入复用缓存对象', () => {
    const css = [
      'ol { counter-reset: step; }',
      'li { counter-increment: step; }',
      'li::before { content: counter(step) "."; color: red; }',
    ].join('\n');
    const first = compileCustomCss(css, { sourceIdentity: 'note:demo.md' });
    const second = compileCustomCss(css, { sourceIdentity: 'note:demo.md' });

    expect(second).toBe(first);
    expect(first.counterConfig.resets[0]).toMatchObject({ selector: 'ol', name: 'step', value: 0 });
    expect(first.counterConfig.increments[0]).toMatchObject({ selector: 'li', name: 'step', value: 1 });
    expect(first.pseudoRules[0]).toMatchObject({ baseSelector: 'li', pseudoType: 'before' });
  });

  it('解析错误返回 fatal 而不是抛出', () => {
    const compiled = compileCustomCss('p { color: red;');
    expect(compiled.usable).toBe(false);
    expect(compiled.diagnostics[0]).toMatchObject({
      severity: 'fatal',
      code: 'custom-css-parse-failed',
    });
  });
});
