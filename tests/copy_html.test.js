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
  let readTextMock;
  let realBlob;
  const blobToText = async (blob) => {
    if (blob && typeof blob.text === 'function') return blob.text();
    return new Response(blob).text();
  };

  beforeEach(() => {
    view = new AppleStyleView(null, null);
    view.currentHtml = '<ol><li><strong>清理时机</strong>：<br>正文</li></ol>';
    view.processImagesToDataURL = vi.fn().mockResolvedValue(false);
    view.cleanHtmlForDraft = vi.fn(() => '<ol><li>清理时机： 正文</li></ol>');

    writeMock = vi.fn().mockResolvedValue(undefined);
    readTextMock = vi.fn().mockResolvedValue('清理时机： 正文');
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { write: writeMock, readText: readTextMock },
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
    expect(Object.keys(item.items)).toEqual(['text/html']);
    const html = await blobToText(item.items['text/html']);
    expect(html).toBe('<ol><li>清理时机： 正文</li></ol>');
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
    await Promise.resolve();

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
    expect(css).toContain('scrollbar-color: rgba(255, 255, 255, 0.58) rgba(255, 255, 255, 0.18)');
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
    expect(codeMatch[1]).toContain('first&nbsp;=');
    expect(codeMatch[1]).toContain('&nbsp;<br');
    expect(codeMatch[1]).toContain('third&nbsp;=');
    expect(html).toContain('<section class="line-numbers"');
    expect(html).toContain('>1</section>');
    expect(html).toContain('>2</section>');
    expect(html).toContain('>3</section>');
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

  it('should fail fast on mobile when rich clipboard write is unavailable', async () => {
    view.app = { isMobile: true };
    Object.defineProperty(global.navigator, 'clipboard', {
      value: {},
      configurable: true,
    });

    await view.copyHTML();

    expect(writeMock).not.toHaveBeenCalled();
    expect(readTextMock).not.toHaveBeenCalled();
  });

  it('should fail on mobile when copy cannot be verified by clipboard readback', async () => {
    view.app = { isMobile: true };
    readTextMock.mockResolvedValue('旧剪贴板内容');

    await view.copyHTML();

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(readTextMock).toHaveBeenCalledTimes(1);
  });

  it('should preserve user selection when using Clipboard API on mobile', async () => {
    view.app = { isMobile: true };
    const textEl = document.createElement('div');
    textEl.textContent = 'abcdef';
    document.body.appendChild(textEl);

    const originalRange = document.createRange();
    originalRange.setStart(textEl.firstChild, 1);
    originalRange.setEnd(textEl.firstChild, 3);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(originalRange);

    await view.copyHTML();

    expect(selection.rangeCount).toBe(1);
    const restored = selection.getRangeAt(0);
    expect(restored.startContainer).toBe(textEl.firstChild);
    expect(restored.startOffset).toBe(1);
    expect(restored.endContainer).toBe(textEl.firstChild);
    expect(restored.endOffset).toBe(3);

    textEl.remove();
  });

  it('should block copy when latest render has failed', async () => {
    view.currentHtml = null;
    view.lastRenderError = 'native boom';

    await view.copyHTML();

    expect(view.processImagesToDataURL).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });
});
