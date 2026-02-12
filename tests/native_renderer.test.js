import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
const {
  isSafeRawImageSrc,
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

  it('should accept only approved raw image protocols', () => {
    expect(isSafeRawImageSrc('https://example.com/a.png')).toBe(true);
    expect(isSafeRawImageSrc('http://example.com/a.png')).toBe(true);
    expect(isSafeRawImageSrc('data:image/png;base64,abc')).toBe(true);
    expect(isSafeRawImageSrc('app://local/image.png')).toBe(true);
    expect(isSafeRawImageSrc('capacitor://localhost/_app_file_/x.png')).toBe(true);
    expect(isSafeRawImageSrc('obsidian://open?vault=MyVault')).toBe(true);

    expect(isSafeRawImageSrc('javascript:alert(1)')).toBe(false);
    expect(isSafeRawImageSrc('file:///tmp/x.png')).toBe(false);
    expect(isSafeRawImageSrc('/absolute/path.png')).toBe(false);
    expect(isSafeRawImageSrc('relative/path.png')).toBe(false);
    expect(isSafeRawImageSrc('')).toBe(false);
    expect(isSafeRawImageSrc('#')).toBe(false);
  });

  it('preprocess should preserve safe raw image protocols and remove unsafe ones', () => {
    const input = [
      '<img src="https://example.com/ok.png">',
      '<img src="data:image/png;base64,abc">',
      '<img src="app://ok.png">',
      '<img src="obsidian://ok">',
      '<img src="javascript:alert(1)">',
      '<img src="file:///tmp/x.png">',
      '<img src="/x.png">',
      '<img src="x.png">',
    ].join('\n');

    const output = preprocessMarkdownForNative(input);
    expect(output).toContain('<img src="https://example.com/ok.png">');
    expect(output).toContain('<img src="data:image/png;base64,abc">');
    expect(output).toContain('<img src="app://ok.png">');
    expect(output).toContain('<img src="obsidian://ok">');

    expect(output).not.toContain('javascript:alert(1)');
    expect(output).not.toContain('file:///tmp/x.png');
    expect(output).not.toContain('<img src="/x.png">');
    expect(output).not.toContain('<img src="x.png">');
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

  it('should throw when converter is missing', async () => {
    await expect(
      renderNativeMarkdown({
        converter: null,
        markdown: '# title',
      })
    ).rejects.toThrow('Native converter is not ready');
  });

  it('should keep native preprocessing even when legacy parity option is passed', async () => {
    const md = readFixture('control-micro.md');
    const html = await renderNativeMarkdown({
      converter,
      markdown: md,
      sourcePath: '',
      strictLegacyParity: true, // ignored in native-only mode
    });

    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });
});
