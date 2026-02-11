import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
const { renderNativeMarkdown } = require('../services/native-renderer');

const readFixture = (name) => fs.readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf8');

function getTagMetrics(container) {
  const tags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'pre', 'blockquote', 'ol', 'ul', 'li', 'a'];
  const metrics = {};
  for (const tag of tags) {
    metrics[tag] = container.querySelectorAll(tag).length;
  }
  return metrics;
}

describe('Render Diff Budget (Legacy vs Experimental Phase 1)', () => {
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

  it('main control sample should keep the same structural metrics', async () => {
    const md = readFixture('control-main.md');
    const legacyHtml = await converter.convert(md);
    const nativeHtml = await renderNativeMarkdown({
      converter,
      markdown: md,
      sourcePath: '',
    });

    const legacyContainer = document.createElement('div');
    legacyContainer.innerHTML = legacyHtml;
    const nativeContainer = document.createElement('div');
    nativeContainer.innerHTML = nativeHtml;

    expect(getTagMetrics(nativeContainer)).toEqual(getTagMetrics(legacyContainer));
    expect((nativeContainer.textContent || '').replace(/\s+/g, ' ').trim()).toBe(
      (legacyContainer.textContent || '').replace(/\s+/g, ' ').trim()
    );
  });

  it('micro control sample should only differ in approved phase-1 changes', async () => {
    const md = readFixture('control-micro.md');
    const legacyHtml = await converter.convert(md);
    const nativeHtml = await renderNativeMarkdown({
      converter,
      markdown: md,
      sourcePath: '',
    });

    const legacyContainer = document.createElement('div');
    legacyContainer.innerHTML = legacyHtml;
    const nativeContainer = document.createElement('div');
    nativeContainer.innerHTML = nativeHtml;

    expect(nativeContainer.querySelectorAll('a').length).toBe(legacyContainer.querySelectorAll('a').length);
    expect(nativeContainer.querySelectorAll('ol').length).toBe(legacyContainer.querySelectorAll('ol').length);
    expect(nativeContainer.querySelectorAll('ul').length).toBe(legacyContainer.querySelectorAll('ul').length);

    // Approved behavior differences for Phase 1.
    expect(legacyContainer.querySelector('img[src="x"]')).not.toBeNull();
    expect(nativeContainer.querySelector('img[src="x"]')).toBeNull();
    expect(legacyHtml).toContain('正常文本 **保留**');
    expect(nativeHtml).toMatch(/正常文本\s*<strong[^>]*>保留<\/strong>/);

    const normalizedLegacyText = (legacyContainer.textContent || '')
      .replace(/\*\*保留\*\*/g, '保留')
      .replace(/\s+/g, ' ')
      .trim();
    const normalizedNativeText = (nativeContainer.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(normalizedNativeText).toBe(normalizedLegacyText);
  });
});
