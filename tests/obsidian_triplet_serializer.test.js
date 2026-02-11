import { describe, it, expect, beforeAll, vi } from 'vitest';
const {
  serializeObsidianRenderedHtml,
  deriveImageCaption,
  safeDecodeCaption,
} = require('../services/obsidian-triplet-serializer');
const { createLegacyConverter } = require('./helpers/render-runtime');

describe('Obsidian Triplet Serializer', () => {
  let converter;

  beforeAll(async () => {
    converter = await createLegacyConverter();
  });

  it('should convert standalone image into figure with caption', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><img src="https://example.com/pic.png" alt="示例图"></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const figure = container.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure.querySelector('img[src="https://example.com/pic.png"]')).not.toBeNull();
    expect(figure.querySelector('figcaption')?.textContent).toBe('示例图');
    expect(figure.getAttribute('style')).toBe('display:block;margin:16px 0;text-align:center;');
  });

  it('should convert pre blocks to themed code snippets', () => {
    const root = document.createElement('div');
    root.innerHTML = '<pre><code class="language-js">const x = 1;</code></pre>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    expect(html).toContain('code-snippet__fix');
    const container = document.createElement('div');
    container.innerHTML = html;
    const normalized = (container.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    expect(normalized).toMatch(/const\s+x\s*=\s*1/);
  });

  it('should sanitize dangerous tags and unsafe links', () => {
    const root = document.createElement('div');
    root.innerHTML = '<script>alert(1)</script><a href="javascript:alert(1)">x</a>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    expect(html).not.toContain('<script');
    expect(html).toContain('href="#"');
  });

  it('should canonicalize relative href with non-ascii chars to legacy encoded form', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><a href="喜欢您来！带你在线逛逛我的个人主页.md">主页</a></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const href = container.querySelector('a')?.getAttribute('href') || '';
    expect(href).toBe('%E5%96%9C%E6%AC%A2%E6%82%A8%E6%9D%A5%EF%BC%81%E5%B8%A6%E4%BD%A0%E5%9C%A8%E7%BA%BF%E9%80%9B%E9%80%9B%E6%88%91%E7%9A%84%E4%B8%AA%E4%BA%BA%E4%B8%BB%E9%A1%B5.md');
  });

  it('should convert Obsidian callout DOM to legacy callout sections', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="callout" data-callout="tips"><div class="callout-title"><div class="callout-icon"><svg></svg></div><div class="callout-title-inner">Tips</div></div><div class="callout-content"><p>这是一段 callout 内容。</p></div></div>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(html).not.toContain('class="callout"');
    expect(html).toContain('border-left');
    expect(html).toContain('>📌<');
    expect(html).toContain('>Tips<');
    expect(container.textContent).toContain('这是一段 callout 内容。');
  });

  it('should keep legacy icon mapping for known callout types', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="callout" data-callout="tip"><div class="callout-title"><div class="callout-title-inner">Tip</div></div><div class="callout-content"><p>内容</p></div></div>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    expect(html).toContain('>💡<');
    expect(html).toContain('>Tip<');
  });

  it('should trim trailing spaces before block close tags for legacy parity', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>这是第一句。  </p><p>这是第二句。  </p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    expect(html).not.toContain('。  </p>');
    expect(html).toContain('。</p>');
  });

  it('should trim leading spaces at block start for legacy parity', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p> 夜里 10 点，我对着电脑屏幕发呆。</p><ul><li> 子项 A</li></ul>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('p')?.textContent?.startsWith('夜里 10 点')).toBe(true);
    expect(container.querySelector('li')?.textContent?.startsWith('子项 A')).toBe(true);
  });

  it('should preserve placeholder-like data image urls for legacy parity', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB..." alt="坏图"></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('figure')).not.toBeNull();
    expect(html).toContain('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...');
  });

  it('should align plain text smart quotes with legacy typographer output', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>为了优雅，我用了 "Sequential Shift"（层级顺延）。</p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('p')?.textContent).toContain('“Sequential Shift”');
    expect(container.querySelector('p')?.textContent).not.toContain('"Sequential Shift"');
  });

  it('should linkify plain domain-like text to match legacy markdown-it behavior', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h2>附：skill-updater 的 SKILL.md（可直接复制）</h2><p><code>SKILL.md</code></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const headingLink = container.querySelector('h2 a[href="http://SKILL.md"]');
    expect(headingLink).not.toBeNull();
    expect(headingLink?.textContent).toBe('SKILL.md');
    expect(container.querySelector('code')?.textContent).toBe('SKILL.md');
  });

  it('should not typographize inline code text', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>正文 "会被转换"</p><p><code>"raw-code"</code></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const paragraphs = Array.from(container.querySelectorAll('p')).map((p) => p.textContent || '');
    expect(paragraphs.join(' ')).toContain('“会被转换”');
    expect(container.querySelector('code')?.textContent).toBe('"raw-code"');
  });

  it('should keep plain percent captions without throwing', () => {
    expect(safeDecodeCaption('完成率 100%')).toBe('完成率 100%');
    expect(deriveImageCaption(converter, 'https://example.com/a.png', '完成率 100%')).toBe('完成率 100%');
  });

  it('should decode valid encoded captions and fallback on malformed encoding', () => {
    expect(safeDecodeCaption('hello%20world')).toBe('hello world');
    expect(safeDecodeCaption('broken%2Gvalue')).toBe('broken%2Gvalue');

    expect(deriveImageCaption(converter, 'https://example.com/hello%20world.png', '')).toBe('hello world');
    expect(deriveImageCaption(converter, 'https://example.com/broken%2Gvalue.png', '')).toBe('broken%2Gvalue');
  });

  it('should drop query/hash when deriving caption from src', () => {
    expect(
      deriveImageCaption(converter, 'https://example.com/%E6%B5%8B%E8%AF%95.png?ts=123#v1', '')
    ).toBe('测试');
  });

  it('should prune Obsidian-only attrs from heading-like nodes', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h2 data-heading="title" id="x" dir="auto" class="heading internal">标题</h2>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    expect(html).not.toContain('data-heading=');
    expect(html).not.toContain(' id="x"');
    expect(html).not.toContain(' dir="auto"');
    expect(html).not.toContain('class="heading internal"');
  });

  it('should normalize strike tags to legacy del tag', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><s>旧内容</s></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    expect(html).toContain('<del');
    expect(html).not.toContain('<s>');
  });

  it('should normalize adjacent delete segments into legacy nested delete shape', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><del>删除线：</del> <del>旧的方案已经废弃。</del></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    expect(html).toContain('删除线： <del');
    expect(html).not.toContain('</del> <del');
  });

  it('should normalize app://obsidian.md image src before resolveImagePath', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><img src="app://obsidian.md/x.png" alt=""></p>';
    const resolveSpy = vi.fn((src) => src);
    converter.resolveImagePath = resolveSpy;

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(resolveSpy).toHaveBeenCalledWith('x.png');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('x.png');
  });

  it('should materialize unresolved image-embed placeholders into images', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><span class="internal-embed image-embed" src="app://obsidian.md/x.png"></span></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('figure img')).not.toBeNull();
  });

  it('should keep raw unresolved image as plain img for legacy parity', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><img src="app://obsidian.md/x" onerror="alert(1)"></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('figure')).toBeNull();
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('x');
    expect(img.getAttribute('style')).toBeNull();
    expect(html).not.toContain('onerror=');
  });

  it('should keep width suffix in img alt for legacy parity', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><img src="https://example.com/pic.png" alt="图例" width="400"></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('figure img')?.getAttribute('alt')).toBe('图例|400');
    expect(container.querySelector('figure figcaption')?.textContent).toBe('图例');
  });

  it('should infer width suffix from embed wrapper hints', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><span class="internal-embed image-embed" style="max-width: 400px;" alt="图例"><img src="https://example.com/pic.png" alt="图例"></span></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('figure img')?.getAttribute('alt')).toBe('图例|400');
    expect(container.querySelector('figure figcaption')?.textContent).toBe('图例');
  });

  it('should restore legacy alt suffix from ancestor alt hint', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><span class="image-embed" alt="做视频|400"><img src="https://example.com/pic.png" alt="做视频"></span></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('figure img')?.getAttribute('alt')).toBe('做视频|400');
  });
});
