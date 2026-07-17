/*
## 核心功能

覆盖 Obsidian Triplet Serializer images 相关行为的 Vitest 测试用例。

## 输入

接收 serializer、模拟 DOM、主题 converter 和断言数据。

## 输出

输出自动化断言结果，保护 Obsidian Triplet Serializer images 行为不回归。

## 定位

位于 tests/，是 triplet serializer 的分场景回归测试。

## 依赖

关键依赖：Vitest、render-runtime helper 和 obsidian-triplet-serializer。

## 维护规则

- 只收纳 Obsidian Triplet Serializer images 场景，通用转换放在核心测试文件。
- 新增断言时保持用户可见结果和服务契约清晰。
*/

import { describe, it, expect, beforeAll, vi } from 'vitest';
const {
  serializeObsidianRenderedHtml,
  deriveImageCaption,
  safeDecodeCaption,
} = require('../services/obsidian-triplet-serializer');
const { cleanHtmlForDraft } = require('../services/wechat-html-cleaner');
const { createLegacyConverter } = require('./helpers/render-runtime');

describe('Obsidian Triplet Serializer images', () => {
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

  it('should convert marked image-swipe sections into a horizontal gallery', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<section data-owc-image-swipe="1" data-owc-image-swipe-type="image-swipe" data-owc-image-swipe-hint="%E5%B7%A6%E5%8F%B3%E6%BB%91%E5%8A%A8%E6%9F%A5%E7%9C%8B%E5%9B%BE%E7%89%87">',
      '<img src="images/a.png" alt="第一张">',
      '<img src="images/b.png" alt="第二张">',
      '</section>',
    ].join('');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(html).toContain('overflow-x:auto');
    expect(html).toContain('width:200%');
    expect(container.querySelectorAll('figure')).toHaveLength(0);
    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect(container.querySelectorAll('figcaption')).toHaveLength(2);
    expect(container.textContent).toContain('第一张');
    expect(container.textContent).toContain('第二张');
    expect(container.textContent).toContain('左右滑动查看图片');
    expect(html).not.toContain('data-owc-image-swipe');

    const cleanedHtml = cleanHtmlForDraft(html);
    expect(cleanedHtml).toContain('overflow-x:auto');
    expect(cleanedHtml).toContain('width:200%');
  });

  it('should add a default hint for marked image-swipe sections', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<section data-owc-image-swipe="1" data-owc-image-swipe-type="image-swipe">',
      '<img src="images/a.png" alt="第一张">',
      '</section>',
    ].join('');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.textContent).toContain('左右滑动查看图片');
    expect(html).toContain('width:100%');
  });

  it('should preserve remote image-swipe images with no-referrer and Obsidian width hints', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<section data-owc-image-swipe="1" data-owc-image-swipe-type="image-swipe">',
      '<img src="https://cdn.example.com/CleanShot%202026-05-14.png" alt="CleanShot 2026-05-14.png|400">',
      '</section>',
    ].join('');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;
    const img = container.querySelector('img');

    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/CleanShot%202026-05-14.png');
    expect(img?.getAttribute('width')).toBe('400');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(container.textContent).toContain('CleanShot 2026-05-14');
  });

  it('should convert Obsidian-rendered remote image-swipe callouts into swipe blocks', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<div class="callout" data-callout="image-swipe">',
      '<div class="callout-title"><div class="callout-title-inner">左右滑动图片</div></div>',
      '<div class="callout-content">',
      '<p><img src="https://cdn.example.com/CleanShot%202026-05-14.png" alt="CleanShot 2026-05-14.png|400" width="400" referrerpolicy="no-referrer"></p>',
      '</div>',
      '</div>',
    ].join('');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;
    const img = container.querySelector('img');

    expect(html).toContain('overflow-x:auto');
    expect(html).toContain('width:100%');
    expect(html).not.toContain('class="callout"');
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/CleanShot%202026-05-14.png');
    expect(img?.getAttribute('width')).toBe('400');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(container.textContent).toContain('左右滑动图片');
  });

  it('should convert image-sensitive sections into warning-first horizontal panels', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<section data-owc-image-swipe="1" data-owc-image-swipe-type="image-sensitive" data-owc-image-swipe-warning="%E6%AD%A4%E7%B1%BB%E5%9B%BE%E7%89%87%E5%8F%AF%E8%83%BD%E5%BC%95%E5%8F%91%E4%B8%8D%E9%80%82">',
      '<img src="images/a.png" alt="图一">',
      '<img src="images/b.png" alt="图二">',
      '</section>',
    ].join('');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(html).toContain('overflow-x:auto');
    expect(html).toContain('width:300%');
    expect(container.textContent).toContain('敏感图片');
    expect(container.textContent).toContain('此类图片可能引发不适');
    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect(container.querySelectorAll('figure')).toHaveLength(0);
    expect(html).not.toContain('min-height:220px');
    expect(html).not.toContain('padding:22px');
    expect(html).toContain('font-size:14px;line-height:1.55');

    const cleanedHtml = cleanHtmlForDraft(html);
    expect(cleanedHtml).toContain('overflow-x:auto');
    expect(cleanedHtml).toContain('width:300%');
    expect(cleanedHtml).not.toContain('min-height:220px');
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

  it('should keep Mermaid diagram images as plain images instead of wrapping into figure captions', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><img class="mermaid-diagram-image" src="data:image/png;base64,mermaid" alt="Mermaid diagram"></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('img.mermaid-diagram-image')).not.toBeNull();
    expect(container.querySelector('figure')).toBeNull();
  });

  it('should keep plain percent captions without throwing', () => {
    expect(safeDecodeCaption('完成率 100%')).toBe('完成率 100%');
    expect(deriveImageCaption(converter, 'https://example.com/a.png', '完成率 100%')).toBe('完成率 100%');
  });

  it('should decode valid encoded captions and fallback on malformed encoding', () => {
    expect(safeDecodeCaption('hello%20world')).toBe('hello world');
    expect(safeDecodeCaption('broken%2Gvalue')).toBe('broken%2Gvalue');

    // Empty alt returns empty (no fallback to filename)
    expect(deriveImageCaption(converter, 'https://example.com/hello%20world.png', '')).toBe('');
    // Non-empty alt is decoded
    expect(deriveImageCaption(converter, 'https://example.com/b.png', 'hello%20world')).toBe('hello world');
    // Malformed encoding in alt is kept as-is
    expect(deriveImageCaption(converter, 'https://example.com/broken%2Gvalue.png', 'broken%2Gvalue')).toBe('broken%2Gvalue');
  });

  it('should drop query/hash when deriving caption from alt', () => {
    expect(
      deriveImageCaption(converter, 'https://example.com/%E6%B5%8B%E8%AF%95.png?ts=123#v1', '测试?ts=123#v1')
    ).toBe('测试');
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
