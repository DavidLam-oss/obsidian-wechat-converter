import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
const {
  preprocessMarkdownForNative,
  renderNativeMarkdown,
} = require('../services/native-renderer');

const readFixture = (name) => fs.readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf8');

describe('Native Renderer', () => {
  let converter;

  beforeAll(async () => {
    if (typeof window === 'undefined') {
      global.window = global;
    }

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

  it('should strip dangerous raw html before markdown parse', () => {
    const input = [
      '<script>alert("x")</script>',
      '<img src="x" onerror="alert(1)">',
      '<iframe src="https://evil.com"></iframe>',
      '正常文本 **保留**',
    ].join('\n');

    const output = preprocessMarkdownForNative(input);
    expect(output).not.toContain('<script');
    expect(output).not.toContain('<iframe');
    expect(output).not.toContain('<img src="x"');
    expect(output).toContain('正常文本 **保留**');
  });

  it('should fix known micro sample issues in native pipeline', async () => {
    const md = readFixture('control-micro.md');
    const html = await renderNativeMarkdown({
      converter,
      markdown: md,
      sourcePath: '',
    });

    const container = document.createElement('div');
    container.innerHTML = html;

    expect(html).not.toContain('正常文本 **保留**');
    expect(html).toMatch(/正常文本\s*<strong[^>]*>保留<\/strong>/);
    expect(container.querySelector('img[src="x"]')).toBeNull();

    const orphanImages = Array.from(container.querySelectorAll('img')).filter((img) => !img.closest('figure'));
    expect(orphanImages.length).toBe(0);
  });
});
