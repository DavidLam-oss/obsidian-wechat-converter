/*
## 核心功能

覆盖 copy html 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 copy html 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Alias configured in vitest.config.mjs handles the mock
const obsidian = require('obsidian');
const { loadInputModule } = require('./helpers/input-module.cjs');
const { AppleStyleView } = loadInputModule();
const { createLegacyConverter } = require('./helpers/render-runtime');

describe('AppleStyleView - copyHTML clipboard behavior', () => {
  let view;
  let writeMock;
  let realBlob;
  const blobToText = async (blob) => {
    if (blob && typeof blob.text === 'function') return blob.text();
    return new Response(blob).text();
  };

  beforeEach(() => {
    view = new AppleStyleView(null, null);
    view.currentHtml = '<ol><li><strong>清理时机</strong>：<br>正文</li></ol>';
    view.baseRenderedHtml = view.currentHtml;
    view.resolveArticleHtmlSource = vi.fn(() => ({
      html: view.currentHtml,
      layoutMode: 'native',
      sourceKind: 'base',
    }));
    view.processImagesToDataURL = vi.fn().mockResolvedValue(false);
    view.cleanHtmlForDraft = vi.fn(() => '<ol><li>清理时机： 正文</li></ol>');

    writeMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { write: writeMock },
      configurable: true,
    });

    global.ClipboardItem = class ClipboardItemMock {
      constructor(items) {
        this.items = items;
        this.types = Object.keys(items);
      }
    };

    realBlob = global.Blob;
    global.Blob = class BlobMock {
      constructor(parts = [], options = {}) {
        this.parts = parts;
        this.type = options.type || '';
      }
      async text() {
        return this.parts
          .map((part) => (typeof part === 'string' ? part : String(part)))
          .join('');
      }
    };

    window.__OWC_LAST_CLIPBOARD_HTML = undefined;
    window.__OWC_LAST_CLIPBOARD_TEXT = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.ClipboardItem;
    global.Blob = realBlob;
  });

  it('should use clipboard html on desktop and expose debug snapshots', async () => {
    await view.copyHTML();

    expect(writeMock).toHaveBeenCalledTimes(1);
    const item = writeMock.mock.calls[0][0][0];
    expect(Object.keys(item.items)).toEqual(['text/html', 'text/plain']);
    const html = await blobToText(item.items['text/html']);
    const plainText = await blobToText(item.items['text/plain']);
    expect(html).toBe('<ol><li>清理时机： 正文</li></ol>');
    expect(plainText).toBe('清理时机： 正文');
    expect(window.__OWC_LAST_CLIPBOARD_TEXT).toBe('清理时机： 正文');
  });

  it('should show a CSS spinner before success feedback on the copy icon', async () => {
    vi.useFakeTimers();
    const copyBtn = document.createElement('div');
    copyBtn.innerHTML = '<svg data-old-copy-stroke="true"><path d="M0 0H10"></path></svg>';
    const setIconSpy = vi.spyOn(obsidian, 'setIcon');
    view.copyBtn = copyBtn;
    let resolveImages;
    view.processImagesToDataURL = vi.fn(() => new Promise((resolve) => {
      resolveImages = resolve;
    }));

    const copyPromise = view.copyHTML();
    await vi.waitFor(() => {
      expect(resolveImages).toBeTypeOf('function');
    });

    expect(copyBtn.classList.contains('is-copying')).toBe(true);
    expect(copyBtn.classList.contains('active')).toBe(false);
    expect(copyBtn.querySelector('[data-old-copy-stroke]')).toBeNull();
    expect(copyBtn.querySelector('.apple-copy-spinner')).not.toBeNull();
    expect(setIconSpy).not.toHaveBeenCalledWith(copyBtn, 'copy');
    expect(setIconSpy).not.toHaveBeenCalledWith(copyBtn, 'refresh-cw');
    expect(setIconSpy).not.toHaveBeenCalledWith(copyBtn, 'loader-circle');

    resolveImages(false);
    await copyPromise;

    expect(copyBtn.classList.contains('is-copying')).toBe(false);
    expect(setIconSpy).toHaveBeenCalledWith(copyBtn, 'check');

    vi.advanceTimersByTime(2000);
    expect(setIconSpy).toHaveBeenLastCalledWith(copyBtn, 'copy');
    vi.useRealTimers();
  });

  it('should convert mac code blocks to pre/code layout for WeChat mobile scrolling', async () => {
    view.currentHtml = '<section class="code-snippet__fix" style="width:100% !important;margin:12px 0 !important;background:#0d1117 !important;border:1px solid #30363d !important;border-radius:8px !important;overflow:hidden !important;display:block !important;"><section style="display:block !important;background:#161b22 !important;padding:10px !important;border-bottom:1px solid #30363d !important;"><span><svg xmlns="http://www.w3.org/2000/svg" width="45" height="13"><ellipse cx="5" cy="6" rx="5" ry="5"></ellipse></svg></span></section><section><pre style="margin:0 !important;"><section>const x = 1;</section></pre></section></section>';
    view.cleanHtmlForDraft = vi.fn((html) => html);

    await view.copyHTML();

    const item = writeMock.mock.calls[0][0][0];
    const html = await blobToText(item.items['text/html']);
    expect(html).toContain('<pre class="hljs code__pre"');
    expect(html).toContain('<code style=');
    expect(html).toContain('overflow-x:scroll');
    expect(html).toContain('scrollbar-gutter:stable');
    expect(html).toContain('scrollbar-color:rgba(255,255,255,0.58) rgba(255,255,255,0.18)');
    expect(html).toContain('width:max-content');
    expect(html).toContain('background:#161b22');
    expect(html).toContain('background:#ff5f57');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<svg');

    const container = document.createElement('div');
    container.innerHTML = html;
    const exportBlock = container.querySelector('.code-snippet__export');
    const pre = exportBlock?.querySelector('pre');
    const toolbar = exportBlock?.querySelector('section');
    expect(exportBlock).not.toBeNull();
    expect(pre).not.toBeNull();
    expect(toolbar).not.toBeNull();
    expect(pre.contains(toolbar)).toBe(false);
    expect(pre.querySelector('code')?.textContent).toBe('const x = 1;');
    expect(pre.textContent?.charCodeAt(0)).toBe('c'.charCodeAt(0));
  });

  it('should render preview code blocks with fixed line numbers outside the scroll container', async () => {
    const converter = await createLegacyConverter();
    const html = await converter.convert([
      '```js',
      'const veryLongIdentifierName = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz";',
      'console.log(veryLongIdentifierName);',
      '```',
    ].join('\n'));

    const container = document.createElement('div');
    container.innerHTML = html;
    const codeBlock = container.querySelector('.code-snippet__fix');
    const lineNumbers = codeBlock?.querySelector('.code-line-numbers');
    const codeScroll = codeBlock?.querySelector('.code-scroll');
    const codeLines = codeBlock?.querySelector('.code-lines');

    expect(lineNumbers).not.toBeNull();
    expect(codeScroll).not.toBeNull();
    expect(codeLines).not.toBeNull();
    expect(codeScroll.contains(lineNumbers)).toBe(false);
    expect(codeScroll.contains(codeLines)).toBe(true);
    expect(codeScroll.getAttribute('style')).toContain('overflow-x:scroll');
    expect(codeScroll.getAttribute('style')).toContain('width:0');
    expect(codeScroll.getAttribute('style')).toContain('scrollbar-gutter:stable');
    expect(codeScroll.getAttribute('style')).toContain('scrollbar-color:rgba(255,255,255,0.58) rgba(255,255,255,0.18)');
    expect(codeScroll.getAttribute('style')).toContain('padding:12px 12px 16px 16px');
    expect(codeLines.getAttribute('style')).toContain('width:max-content');
  });

  it('should keep preview code scrollbars visible inside the hidden preview scrollbar container', () => {
    const css = readFileSync('styles/preview.css', 'utf8');
    expect(css).toContain('.apple-converter-preview::-webkit-scrollbar');
    expect(css).toContain('.apple-converter-preview .code-snippet__fix .code-scroll::-webkit-scrollbar');
    expect(css).toContain('display: block');
    expect(css).toContain('height: 8px');
    expect(css).toContain('scrollbar-gutter: stable');
    expect(css).toContain('background: rgba(255, 255, 255, 0.18)');
    expect(css).toContain('background: rgba(255, 255, 255, 0.58)');
  });

  it('should render visible URL links as their own mobile-friendly line', async () => {
    const converter = await createLegacyConverter();
    const html = await converter.convert('参考 https://example.com/a/very/long/path?with=query&and=more 后续文字');

    const container = document.createElement('div');
    container.innerHTML = html;
    const link = container.querySelector('a');

    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://example.com/a/very/long/path?with=query&and=more');
    expect(link.textContent).toBe('https://example.com/a/very/long/path?with=query&and=more');
    expect(link.getAttribute('style')).toContain('display:block');
    expect(link.getAttribute('style')).toContain('word-break:break-all');
    expect(link.getAttribute('style')).toContain('overflow-wrap:anywhere');
  });

  it('should prepare Wechatsync article code blocks as light plain pre/code without line numbers', async () => {
    const sourceHtml = [
      '<section>',
      '<section class="code-snippet__fix" style="width:100% !important;margin:12px 0 !important;background:#0d1117 !important;border:1px solid #30363d !important;border-radius:8px !important;overflow:hidden !important;display:block !important;">',
      '<section style="display:block !important;background:#161b22 !important;padding:6px 10px !important;"><span></span></section>',
      '<section style="background:#0d1117 !important;color:#f0f6fc !important;">',
      '<pre style="margin:0 !important;">',
      '<section style="display:flex !important;">',
      '<section style="border-right:1px solid rgba(255,255,255,0.1) !important;user-select:none !important;"><section>1</section><section>2</section></section>',
      '<section style="padding:12px 12px 12px 16px !important;">',
      '<section style="white-space:nowrap !important;display:inline-block !important;">const&nbsp;x = 1;<br/>console.log(x);</section>',
      '</section>',
      '</section>',
      '</pre>',
      '</section>',
      '</section>',
      '</section>',
    ].join('');

    const html = await view.prepareHtmlForWechatsyncArticle(sourceHtml);

    expect(view.processImagesToDataURL).toHaveBeenCalledTimes(1);
    expect(html).toContain('<pre style=');
    expect(html).toContain('<code style=');
    expect(html).toContain('background:#f6f8fa');
    expect(html).toContain('color:#24292f');
    expect(html).toContain('const x = 1;');
    expect(html).toContain('console.log(x);');
    expect(html).not.toContain('code-snippet__fix');
    expect(html).not.toContain('line-numbers');
    expect(html).not.toContain('background:#0d1117');
    expect(html).not.toContain('background:#161b22');
    expect(html).not.toContain('user-select:none');
    expect(html).not.toContain('<section>1</section>');
    expect(html).not.toContain('<section>2</section>');
  });

  it('should keep long code blocks horizontally scrollable after clipboard conversion', async () => {
    const converter = await createLegacyConverter({
      themeOptions: {
        macCodeBlock: true,
        codeLineNumber: true,
      },
    });
    const longIdentifier = 'really_long_identifier_' + 'abcdef_'.repeat(24);
    view.currentHtml = await converter.convert([
      '```js',
      `const ${longIdentifier} = "scroll me sideways";`,
      'console.log(' + longIdentifier + ');',
      '```',
    ].join('\n'));
    view.cleanHtmlForDraft = vi.fn((html) => html);

    await view.copyHTML();

    const item = writeMock.mock.calls[0][0][0];
    const html = await blobToText(item.items['text/html']);
    expect(html).toContain('<pre class="hljs code__pre"');
    expect(html).toContain('overflow-x:scroll');
    expect(html).toContain('-webkit-overflow-scrolling:touch');
    expect(html).toContain('scrollbar-gutter:stable');
    expect(html).toContain('scrollbar-color:rgba(255,255,255,0.58) rgba(255,255,255,0.18)');
    expect(html).toContain('class="line-numbers"');
    expect(html).toContain('class="code-scroll"');
    expect(html).toContain('min-width:max-content');
    expect(html).toContain('padding:12px 12px 16px 16px');
    expect(html).toContain('height:1.75em');
    expect(html).toContain('<br');
    expect(html).toContain('color:#95989C');
    expect(html).toContain('really_long_identifier');
    expect(html).not.toContain('<table');
    expect(html).not.toMatch(/<code\b[^>]*>\s+<section/i);
  });

  it('should preserve blank code lines and avoid a leading empty clipboard line', async () => {
    const converter = await createLegacyConverter({
      themeOptions: {
        macCodeBlock: true,
        codeLineNumber: true,
      },
    });
    view.currentHtml = await converter.convert([
      '```js',
      'const first = 1;',
      '',
      'const third = 3;',
      '```',
    ].join('\n'));
    view.cleanHtmlForDraft = vi.fn((html) => html);

    await view.copyHTML();

    const item = writeMock.mock.calls[0][0][0];
    const html = await blobToText(item.items['text/html']);
    const codeMatch = html.match(/<code\b[^>]*>([\s\S]*?)<\/code>/i);
    expect(codeMatch).not.toBeNull();
    expect(codeMatch[1].startsWith('<section')).toBe(true);
    expect(codeMatch[1]).toContain('first =');
    expect(codeMatch[1]).toContain(' <br');
    expect(codeMatch[1]).toContain('third =');
    expect(codeMatch[1]).not.toContain('&nbsp;');
    expect(codeMatch[1]).not.toContain('\u00a0');
    expect(html).toContain('<section class="line-numbers"');
    expect(html).toContain('>1</section>');
    expect(html).toContain('>2</section>');
    expect(html).toContain('>3</section>');

    const container = document.createElement('div');
    container.innerHTML = html;
    const pre = container.querySelector('.code-snippet__export > pre');
    const code = pre?.querySelector('code');
    const toolbar = container.querySelector('.code-snippet__export > section');
    const copiedCodeText = code?.textContent || '';
    expect(pre).not.toBeNull();
    expect(toolbar).not.toBeNull();
    expect(pre.contains(toolbar)).toBe(false);
    expect(copiedCodeText).not.toContain('\u00a0');
    expect(copiedCodeText).toContain('const first = 1;');
    expect(copiedCodeText).toContain('const third = 3;');
  });

  it('should export executable code with ordinary spaces', async () => {
    const converter = await createLegacyConverter({
      themeOptions: {
        macCodeBlock: true,
        codeLineNumber: false,
      },
    });
    const command = 'git clone --branch master --depth 1';
    view.currentHtml = await converter.convert(['```sh', command, '```'].join('\n'));
    view.cleanHtmlForDraft = vi.fn((html) => html);

    await view.copyHTML();

    const item = writeMock.mock.calls[0][0][0];
    const html = await blobToText(item.items['text/html']);
    const container = document.createElement('div');
    container.innerHTML = html;
    const code = container.querySelector('.code-snippet__export > pre > code');
    const copiedText = code?.textContent || '';

    expect(copiedText).toBe(command);
    expect(copiedText).not.toContain('\u00a0');
    expect(Array.from(copiedText).filter((char) => char === ' ')).toHaveLength(5);
  });

  it('should convert Mermaid diagrams to images before writing clipboard html', async () => {
    view.currentHtml = '<div class="mermaid"><svg viewBox="0 0 120 80"><rect width="120" height="80"></rect></svg></div>';
    view.cleanHtmlForDraft = vi.fn((html) => html);
    view.enhanceHtmlForWechatPublishing = vi.fn(async (root) => {
      root.innerHTML = '<img class="mermaid-diagram-image" src="data:image/png;base64,portrait" style="display:block;width:78%;max-width:120px;height:auto;margin:0 auto;">';
    });

    await view.copyHTML();

    const item = writeMock.mock.calls[0][0][0];
    const html = await blobToText(item.items['text/html']);
    expect(html).toContain('mermaid-diagram-image');
    expect(html).toContain('data:image/png;base64');
    expect(html).not.toContain('<svg');
    expect(view.enhanceHtmlForWechatPublishing).toHaveBeenCalled();
  });

  it('should fail clearly when rich clipboard html write is unavailable', async () => {
    Object.defineProperty(global.navigator, 'clipboard', {
      value: {},
      configurable: true,
    });

    await view.copyHTML();

    expect(writeMock).not.toHaveBeenCalled();
  });


  it('should block copy when latest render has failed', async () => {
    view.currentHtml = null;
    view.lastRenderError = 'native boom';

    await view.copyHTML();

    expect(view.processImagesToDataURL).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });
});
