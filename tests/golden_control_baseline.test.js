import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

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

    const themeCode = fs.readFileSync(path.resolve(__dirname, '../themes/apple-theme.js'), 'utf8');
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
