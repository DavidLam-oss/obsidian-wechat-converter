/*
## 核心功能

覆盖 native renderer 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 native renderer 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
const {
  canUseNativePreviewFastPath,
  isSafeRawImageSrc,
  normalizeWechatUnsafeTaskListMarkersForNative,
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

  it('should normalize task list markers for WeChat without touching fenced code', () => {
    const input = [
      '- [ ] 展位设计稿',
      '  - [x] 已确认物料',
      '',
      '```md',
      '- [ ] 代码块不改',
      '```',
    ].join('\n');

    const output = normalizeWechatUnsafeTaskListMarkersForNative(input);
    expect(output).toContain('- ☐ 展位设计稿');
    expect(output).toContain('  - ☑ 已确认物料');
    expect(output).toContain('```md\n- [ ] 代码块不改\n```');
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

  it('should route custom image swipe blocks away from native fast path', () => {
    expect(canUseNativePreviewFastPath([
      '> [!image-swipe] 左右滑动查看图片',
      '> ![A](https://example.com/a.png)',
      '> ![B](https://example.com/b.png)',
    ].join('\n'))).toBe(false);

    expect(canUseNativePreviewFastPath([
      '> [!image-sensitive] 向左滑动查看',
      '> ![A](https://example.com/a.png)',
    ].join('\n'))).toBe(false);
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

  it('should keep wide tables horizontally scrollable in native output', async () => {
    const html = await renderNativeMarkdown({
      converter,
      markdown: [
        '| 缩写 | 英文全称 | 中文全称 |',
        '| --- | --- | --- |',
        '| CRE | Carbapenem-Resistant Enterobacterales | 碳青霉烯类耐药肠杆菌目细菌 |',
      ].join('\n'),
      sourcePath: '',
    });

    const container = document.createElement('div');
    container.innerHTML = html;
    const table = container.querySelector('table');
    const wrapper = table?.parentElement;

    expect(wrapper?.tagName).toBe('SECTION');
    expect(wrapper?.getAttribute('style') || '').toContain('overflow-x: scroll');
    expect(table?.getAttribute('style') || '').toContain('width: 770px');
    expect(container.querySelector('th')?.getAttribute('style') || '').toContain('white-space: nowrap');
  });

  it('should throw when converter is missing', async () => {
    await expect(
      renderNativeMarkdown({
        converter: null,
        markdown: '# title',
      })
    ).rejects.toThrow('Native converter is not ready');
  });

  it('should separate block html and following headings in native preprocessing', () => {
    const output = preprocessMarkdownForNative([
      '<figure><img src="https://example.com/a.png"></figure>',
      '## 紧随其后的标题',
    ].join('\n'));

    expect(output).toContain('</figure>\n\n## 紧随其后的标题');
  });

  it('should separate markdown images and following headings in native preprocessing', () => {
    const output = preprocessMarkdownForNative([
      '![[attachments/音乐卡点调整.png]]',
      '#### 图片后的四级标题',
      '',
      '![远程图](https://example.com/a.png)',
      '### 远程图后的标题',
    ].join('\n'));

    expect(output).toContain('![[attachments/音乐卡点调整.png]]\n\n#### 图片后的四级标题');
    expect(output).toContain('![远程图](https://example.com/a.png)\n\n### 远程图后的标题');
  });

  it('should not separate image-like lines and headings inside fenced code', () => {
    const output = preprocessMarkdownForNative([
      '```md',
      '![[attachments/code.png]]',
      '#### 代码里的标题',
      '```',
    ].join('\n'));

    expect(output).toContain('![[attachments/code.png]]\n#### 代码里的标题');
    expect(output).not.toContain('![[attachments/code.png]]\n\n#### 代码里的标题');
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

  it('should allow fast preview for ordinary markdown with remote images', () => {
    const markdown = [
      '# 标题',
      '',
      '普通段落。',
      '',
      '![CleanShot 2026-04-07 at 21.58.50.gif|400](https://example.com/CleanShot%202026.gif)',
      '![image](data:image/png;base64,abc)',
      '参考 [[Obsidian 入门15：搜索完全指南，让笔记永远找得到]]。',
    ].join('\n');

    expect(canUseNativePreviewFastPath(markdown)).toBe(true);
  });

  it('should keep Obsidian-specific markdown on the triplet path', () => {
    expect(canUseNativePreviewFastPath('![[local image.png|400]]')).toBe(false);
    expect(canUseNativePreviewFastPath('![local](images/a.png)')).toBe(false);
    expect(canUseNativePreviewFastPath('![ref][image-ref]\n\n[image-ref]: images/a.png')).toBe(false);
    expect(canUseNativePreviewFastPath('```mermaid\ngraph TD; A-->B;\n```')).toBe(false);
    expect(canUseNativePreviewFastPath('行内公式 $a+b$')).toBe(false);
  });
});
