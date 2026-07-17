/*
## 核心功能

覆盖 golden control baseline 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 golden control baseline 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
const { getBundledThemeSource } = require('./helpers/theme-runtime-source.js');

const readFixture = (name) => fs.readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf8');

describe('Golden Control Baseline (Main + Micro Samples)', () => {
  let converter;

  beforeAll(async () => {
    if (typeof window === 'undefined') {
      global.window = global;
    }

    // Match plugin runtime dependencies without relying on eval-based dynamic loading in tests.
    global.markdownit = require('../lib/markdown-it.min.js');
    global.hljs = require('../lib/highlight.min.js');
    require('../lib/mathjax-plugin.js');

    const themeCode = getBundledThemeSource();
    const converterCode = fs.readFileSync(path.resolve(__dirname, '../converter.js'), 'utf8');
    (0, eval)(themeCode);
    (0, eval)(converterCode);

    const theme = new window.AppleTheme({
      theme: 'wechat',
      themeColor: 'blue',
      fontSize: 3,
      macCodeBlock: true,
      codeLineNumber: true,
      sidePadding: 16,
      coloredHeader: false,
    });

    converter = new window.AppleStyleConverter(theme, '', true, null, '');
    await converter.initMarkdownIt();
  });

  it('main control sample should keep key structure stable', async () => {
    const md = readFixture('control-main.md');
    const html = await converter.convert(md);

    const container = document.createElement('div');
    container.innerHTML = html;

    // Structural assertions (not full string equality)
    expect(container.querySelectorAll('h1, h2, h3, h4, h5, h6').length).toBeGreaterThan(10);
    expect(container.querySelectorAll('table').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('pre').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('blockquote, section').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('img').length).toBeGreaterThanOrEqual(4);

    // Key content anchors from the user's primary control note.
    expect(html).toContain('测试数学公式');
    expect(html).toContain('列表嵌套示例');
    expect(html).toContain('代码块测试区');

    // Security invariants
    expect(html).not.toContain('<script');
  });

  it('embedded markdown-it should keep linkify and non-ascii host normalization stable', () => {
    const normalized = converter.md.normalizeLink('https://例子.测试/path');
    expect(normalized).toBe('https://xn--fsqu00a.xn--0zwm56d/path');

    const rendered = converter.md.render('访问 example.com 和 https://例子.测试/path');
    const container = document.createElement('div');
    container.innerHTML = rendered;
    const links = Array.from(container.querySelectorAll('a')).map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent,
    }));

    expect(links).toContainEqual({ href: 'http://example.com', text: 'example.com' });
    expect(links).toContainEqual({
      href: 'https://xn--fsqu00a.xn--0zwm56d/path',
      text: 'https://例子.测试/path',
    });
  });

  it('legacy converter should render markdown tables as swipeable wide blocks', async () => {
    const html = await converter.convert([
      '| 缩写 | 英文全称 | 中文全称 |',
      '| --- | --- | --- |',
      '| CRE | Carbapenem-Resistant Enterobacterales | 碳青霉烯类耐药肠杆菌目细菌 |',
    ].join('\n'));

    const container = document.createElement('div');
    container.innerHTML = html;
    const table = container.querySelector('table');
    const wrapper = table?.parentElement;

    expect(wrapper?.tagName).toBe('SECTION');
    expect(wrapper?.getAttribute('style') || '').toContain('overflow-x: scroll');
    expect(wrapper?.getAttribute('style') || '').toContain('-webkit-overflow-scrolling: touch');
    expect(table?.getAttribute('style') || '').toContain('width: 770px');
    expect(table?.getAttribute('style') || '').toContain('min-width: 100%');
    expect(container.querySelector('th')?.getAttribute('style') || '').toContain('white-space: nowrap');
  });

  it('micro control sample should preserve current sanitization baseline', async () => {
    const md = readFixture('control-micro.md');
    const html = await converter.convert(md);

    const container = document.createElement('div');
    container.innerHTML = html;

    // 1) Link protocol hardening
    const anchors = Array.from(container.querySelectorAll('a'));
    expect(anchors.length).toBeGreaterThanOrEqual(3);
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('javascript:alert(1)"');

    // 2) Nested list structure is still present
    expect(container.querySelectorAll('ol').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('ul').length).toBeGreaterThanOrEqual(1);
    expect(html).toMatch(/标签[：:]<\/strong>\s*主项/);

    // 3) Sanitization (freeze current behavior)
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();

    // Known existing behavior baseline: image tag remains with src="x" after event stripping.
    expect(container.querySelector('img[src="x"]')).not.toBeNull();

    // Known existing behavior baseline: markdown strong markers can remain literal after raw HTML block.
    expect(html).toContain('正常文本 **保留**');
  });
});
