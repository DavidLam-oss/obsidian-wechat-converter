/*
## 核心功能

覆盖 render diff budget 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 render diff budget 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
const { getBundledThemeSource } = require('./helpers/theme-runtime-source.js');
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
