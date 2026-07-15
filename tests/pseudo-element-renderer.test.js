/*
## 核心功能

验证 services/pseudo-element-renderer.js 的伪元素 / CSS 计数器自动转换逻辑，
以及 services/custom-css-inliner.js 接入后的集成行为。

## 输入

- 构造的文章 HTML 片段与用户自定义 CSS 文本（含 / 不含 `::before`/`::after` 与计数器）。

## 输出

- vitest 断言：解析、计数器计算、span 注入、CSS 剥离，以及 inlineCustomCss 集成产物正确。

## 定位

位于 tests/，属于伪元素转换功能的单元测试；jsdom 环境下运行（document 可用）。

## 依赖

- vitest（environment: 'jsdom'）+ services/pseudo-element-renderer.js + services/custom-css-inliner.js。

## 维护规则

- 新增伪元素 / 计数器行为时，在此补充对应断言。
- 解析 / 计数器 / 剥离的纯函数优先单测，DOM 注入走 inlineCustomCss 集成断言。
*/

import { describe, it, expect } from 'vitest';
import {
    parsePseudoRules,
    parseCounterConfig,
    formatCounterValue,
    resolveContent,
    removePseudoRulesFromCSS,
    prerenderPseudoElementsIntoHtml,
} from '../services/pseudo-element-renderer';
import { inlineCustomCss } from '../services/custom-css-inliner';

const ROOT = 'owc-article-root';
const wrap = (inner) => `<div class="${ROOT}">${inner}</div>`;

describe('parsePseudoRules', () => {
    it('提取 ::before 规则的基础选择器与属性', () => {
        const rules = parsePseudoRules('h2::before { content: "01 "; color: #999 }');
        expect(rules).toHaveLength(1);
        expect(rules[0].baseSelector).toBe('h2');
        expect(rules[0].pseudoType).toBe('before');
        expect(rules[0].properties.content).toBe('"01 "');
        expect(rules[0].properties.color).toBe('#999');
    });

    it('提取 ::after 规则并忽略普通块', () => {
        const rules = parsePseudoRules('p{color:red} blockquote::after { content: "\\201D" }');
        expect(rules).toHaveLength(1);
        expect(rules[0].baseSelector).toBe('blockquote');
        expect(rules[0].pseudoType).toBe('after');
    });

    it('不匹配出现在选择器中间的 ::', () => {
        const rules = parsePseudoRules('a:hover::before { content: "x" }');
        // hover::before 末尾匹配 ::before，baseSelector 为 a:hover，仍算一条
        expect(rules).toHaveLength(1);
        expect(rules[0].baseSelector).toBe('a:hover');
    });
});

describe('parseCounterConfig', () => {
    it('提取 counter-increment / counter-reset', () => {
        const cfg = parseCounterConfig('h2 { counter-increment: h2 } .wrap { counter-reset: sec 3 }');
        expect(cfg.increments).toEqual([{ selector: 'h2', name: 'h2', value: 1 }]);
        expect(cfg.resets).toEqual([{ selector: '.wrap', name: 'sec', value: 3 }]);
    });

    it('跳过 CSS-wide 关键字 none', () => {
        const cfg = parseCounterConfig('h2 { counter-reset: none }');
        expect(cfg.resets).toHaveLength(0);
    });

    it('跳过伪元素块里的计数器声明', () => {
        const cfg = parseCounterConfig('h2::before { counter-increment: h2 }');
        expect(cfg.increments).toHaveLength(0);
    });
});

describe('formatCounterValue', () => {
    it('decimal-leading-zero', () => {
        expect(formatCounterValue(5, 'decimal-leading-zero')).toBe('05');
        expect(formatCounterValue(12, 'decimal-leading-zero')).toBe('12');
    });
    it('roman / alpha', () => {
        expect(formatCounterValue(4, 'upper-roman')).toBe('IV');
        expect(formatCounterValue(3, 'lower-alpha')).toBe('c');
    });
});

describe('resolveContent', () => {
    it('纯字符串', () => {
        expect(resolveContent('"§ "', undefined)).toBe('§ ');
    });
    it('混合字符串 + counter()', () => {
        expect(resolveContent('"第" counter(h2) "章"', new Map([['h2', 3]]))).toBe('第3章');
    });
    it('Unicode 转义', () => {
        expect(resolveContent('"\\201C"', undefined)).toBe('“');
    });
    it('none / normal 返回 null', () => {
        expect(resolveContent('none', undefined)).toBeNull();
        expect(resolveContent('normal', undefined)).toBeNull();
    });
});

describe('removePseudoRulesFromCSS', () => {
    it('剥离 ::before / ::after 块，保留普通块', () => {
        const out = removePseudoRulesFromCSS('h2 { color: red } h2::before { content: "x" }');
        expect(out).toContain('color: red');
        expect(out).not.toContain('::before');
        expect(out).not.toContain('content: "x"');
    });
});

describe('prerenderPseudoElementsIntoHtml (DOM)', () => {
    it('h2::before 注入带 inline style 的真实 span', () => {
        const out = prerenderPseudoElementsIntoHtml(
            wrap('<h2>标题</h2>'),
            'h2::before { content: "§ "; color: #999 }',
        );
        expect(out).toContain('<span class="pseudo-h2-num"');
        expect(out).toContain('style="color: #999"');
        expect(out).toContain('>§ </span>');
        expect(out.indexOf('<span')).toBeLessThan(out.indexOf('标题'));
    });

    it('无伪元素时原样返回', () => {
        const html = wrap('<p>hi</p>');
        expect(prerenderPseudoElementsIntoHtml(html, 'p { color: red }')).toBe(html);
    });

    it('blockquote::before 注入大引号', () => {
        const out = prerenderPseudoElementsIntoHtml(
            wrap('<blockquote>引用</blockquote>'),
            'blockquote::before { content: "\\201C" }',
        );
        expect(out).toContain('class="pseudo-bq-mark"');
        expect(out).toContain('“');
    });

    it('纯视觉伪元素（无文本）注入带背景的 span + nbsp', () => {
        const out = prerenderPseudoElementsIntoHtml(
            wrap('<h2>x</h2>'),
            'h2::before { content: ""; background: #eee; width: 4px; height: 4px }',
        );
        expect(out).toContain('class="pseudo-h2-num"');
        expect(out).toContain('background: #eee');
    });
});

describe('inlineCustomCss 集成', () => {
    it('计数器自动编号：第 1 个 01，第 2 个 02', () => {
        const html = '<h2>甲</h2><h2>乙</h2>';
        const css =
            'h2 { counter-increment: h2 } h2::before { content: counter(h2, decimal-leading-zero) }';
        const out = inlineCustomCss(html, css);
        expect(out).toContain('>01<');
        expect(out).toContain('>02<');
        // h2 自身仍拿到作用域样式（counter-increment 被内联）
        expect(out).toContain('counter-increment: h2');
    });

    it('回归：无伪元素时行为不变，不注入 span', () => {
        const html = '<p>hi</p>';
        const css = 'p { color: red !important }';
        const out = inlineCustomCss(html, css);
        expect(out).toContain('color: red');
        expect(out).not.toContain('<span');
    });

    it('::before 装饰 + 普通规则共存：span 与元素样式都生效', () => {
        const html = '<h2>标题</h2>';
        const css = 'h2 { color: #333 } h2::before { content: "· "; color: #f00 }';
        const out = inlineCustomCss(html, css);
        expect(out).toContain('class="pseudo-h2-num"');
        expect(out).toContain('>· </span>');
        // h2 自身仍拿到作用域样式（juice 可能把 #333 归一化为 rgb，两种都认）
        expect(out).toMatch(/<h2[^>]*style="[^"]*color:/);
        // 作用域后 CSS 已无伪元素块，juice 不会残留 ::before
        expect(out).not.toMatch(/\{\s*content:/);
    });
});
