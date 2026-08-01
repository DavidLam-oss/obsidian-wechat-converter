/*
## 核心功能

覆盖图文志在 Obsidian Triplet Serializer 中的 hero、regular、caption 与特殊媒体保护合同。

## 输入

接收模拟 DOM、图文志 converter 和代表 Markdown Renderer 输出的 HTML 片段。

## 输出

输出自动化断言结果，保护 `hero:` 显式语义、无图降级和微信公众号内联输出不回归。

## 定位

位于 tests/，是图文志图片语义的专属序列化回归测试；颜色角色测试保留在 theme_pictorial.test.js。

## 依赖

关键依赖：Vitest、render-runtime helper、obsidian-triplet-serializer。

## 维护规则

- 只验证显式 `hero:`，不引入尺寸、文件名或位置推断的测试前提。
- 每次扩展图片角色时，补充特殊媒体、空 caption 和草稿清洗边界。
- 断言输出使用标签级内联样式，不能把 class 或 data 属性当成主题合同。
*/

import { beforeAll, describe, expect, it } from 'vitest';
const { serializeObsidianRenderedHtml } = require('../services/obsidian-triplet-serializer');
const { cleanHtmlForDraft } = require('../services/wechat-html-cleaner');
const { createLegacyConverter } = require('./helpers/render-runtime');

describe('图文志 Obsidian Triplet Serializer', () => {
  let converter;

  beforeAll(async () => {
    converter = await createLegacyConverter({
      themeOptions: {
        theme: 'pictorial',
        themeColor: 'teal',
        coloredHeader: true,
      },
    });
    converter.resolveImagePath = (src) => src;
    converter.showImageCaption = true;
  });

  function serialize(markup) {
    const root = document.createElement('div');
    root.innerHTML = markup;
    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;
    return { html, container };
  }

  it('consumes hero marker, renders a full-width hero, and keeps only the author caption', () => {
    const { html, container } = serialize('<p><img src="https://example.com/cover.png" alt="hero: 开篇的海岸"></p>');
    const figure = container.querySelector('figure');
    const img = figure?.querySelector('img');
    const caption = figure?.querySelector('figcaption');

    expect(figure?.getAttribute('style')).toContain('margin:36px 0 32px');
    expect(img?.getAttribute('style')).toContain('width:100%');
    expect(img?.getAttribute('alt')).toBe('开篇的海岸');
    expect(caption?.textContent).toBe('开篇的海岸');
    expect(html).not.toContain('hero:');
  });

  it('keeps every unmarked picture as a regular image even if its name implies a role', () => {
    const { html, container } = serialize('<p><img src="https://example.com/wide-cover-large.png" alt="普通图片"></p>');
    const figure = container.querySelector('figure');
    const img = figure?.querySelector('img');

    expect(figure?.getAttribute('style')).toContain('margin:28px 0 30px');
    expect(img?.getAttribute('style')).not.toContain('width:100%;max-width:100%');
    expect(container.querySelector('figcaption')?.textContent).toBe('普通图片');
    expect(html).not.toContain('hero:');
  });

  it('does not generate an empty caption for an uncaptioned hero or regular image', () => {
    const hero = serialize('<p><img src="https://example.com/cover.png" alt="hero:"></p>');
    const regular = serialize('<p><img src="https://example.com/regular.png" alt=""></p>');

    expect(hero.container.querySelector('figure img')?.getAttribute('alt')).toBe('');
    expect(hero.container.querySelector('figcaption')).toBeNull();
    expect(hero.html).not.toContain('hero:');
    expect(regular.container.querySelector('figcaption')).toBeNull();
  });

  it('preserves width-hint compatibility after consuming a hero marker', () => {
    const { container } = serialize('<p><img src="https://example.com/cover.png" alt="hero: 开篇图片|400"></p>');
    const img = container.querySelector('figure img');

    expect(img?.getAttribute('alt')).toBe('开篇图片|400');
    expect(container.querySelector('figcaption')?.textContent).toBe('开篇图片');
    expect(img?.getAttribute('style')).toContain('width:100%');
  });

  it('does not rewrite Mermaid, math, swipe, sensitive, avatar, or complex media figures', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<p><img class="mermaid-diagram-image" src="data:image/png;base64,mermaid" alt="hero: Mermaid"></p>',
      '<figure style="avatar-figure"><div><img src="https://example.com/avatar.png" alt="logo"></div><img src="https://example.com/body.png" alt="hero: 正文"></figure>',
      '<section data-owc-image-swipe="1" data-owc-image-swipe-type="image-swipe"><img src="https://example.com/swipe.png" alt="hero: 轮播"></section>',
      '<figure><img class="math-formula-image" src="data:image/png;base64,math" alt="hero: 数学"></figure>',
      '<figure><img src="https://example.com/a.png" alt="hero: 一"><img src="https://example.com/b.png" alt="hero: 二"></figure>',
    ].join('');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('img.mermaid-diagram-image')?.getAttribute('alt')).toBe('hero: Mermaid');
    expect(container.querySelector('img.math-formula-image')?.getAttribute('alt')).toBe('hero: 数学');
    expect(container.querySelector('section[style*="overflow-x:auto"] img')?.getAttribute('alt')).toBe('hero: 轮播');
    expect(container.querySelector('section[style*="overflow-x:auto"] img')?.getAttribute('style')).not.toContain('width:100%;max-width:100%');
    expect(Array.from(container.querySelectorAll('figure')).some((figure) => (figure.getAttribute('style') || '').includes('avatar-figure'))).toBe(true);
    expect(container.querySelector('figure img[src="https://example.com/a.png"]')?.getAttribute('alt')).toBe('hero: 一');
  });

  it('keeps no-image documents stable and lets draft cleanup retain the same inline output boundary', () => {
    const { html, container } = serialize('<h2>无图长文</h2><p>这是一段正文。</p><blockquote><p>引用内容。</p></blockquote>');
    const cleaned = cleanHtmlForDraft(html);

    expect(container.querySelector('figure')).toBeNull();
    expect(container.querySelector('section')?.getAttribute('style')).toContain('background:#ffffff');
    expect(cleaned).toContain('font-family:');
    expect(cleaned).not.toContain('<style');
  });
});
