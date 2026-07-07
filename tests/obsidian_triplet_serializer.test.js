/*
## 核心功能

覆盖 obsidian triplet serializer 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 obsidian triplet serializer 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
const {
  serializeObsidianRenderedHtml,
  deriveImageCaption,
  safeDecodeCaption,
} = require('../services/obsidian-triplet-serializer');
const { cleanHtmlForDraft } = require('../services/wechat-html-cleaner');
const { createLegacyConverter } = require('./helpers/render-runtime');
const tripletFixtureRoot = path.resolve(__dirname, 'fixtures', 'triplet');
const tripletCorpusPath = path.resolve(tripletFixtureRoot, 'corpus.json');
const tripletCorpus = JSON.parse(fs.readFileSync(tripletCorpusPath, 'utf8'));

function readTripletFixture(name) {
  return fs.readFileSync(path.resolve(tripletFixtureRoot, name), 'utf8');
}

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

  it('should not inject browser-only adaptive colors into styled list text wrappers', async () => {
    const gridConverter = await createLegacyConverter({
      themeOptions: {
        theme: 'grid',
        themeColor: 'teal',
      },
    });
    const root = document.createElement('div');
    root.innerHTML = [
      '<ul>',
      '<li>',
      '<span style="display:block;margin:0;padding:0;line-height: 1.82;">',
      '<span style="font-weight:bold;color:#20c997;">重点：</span> 外层列表正文',
      '</span>',
      '<p style="font-size:16px;line-height:1.82;color:#344054;margin:0 0 4px 20px;padding:0;">',
      '嵌套列表正文 <code>code</code>',
      '</p>',
      '</li>',
      '</ul>',
    ].join('');

    const html = serializeObsidianRenderedHtml({ root, converter: gridConverter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const blockSpan = container.querySelector('li > span');
    const nestedParagraph = container.querySelector('li > p');
    const accentSpan = container.querySelector('li > span > span');
    const code = container.querySelector('code');

    expect(blockSpan?.getAttribute('style')).not.toContain('light-dark(');
    expect(nestedParagraph?.getAttribute('style')).not.toContain('light-dark(');
    expect(nestedParagraph?.getAttribute('style')).not.toContain('color:');
    expect(accentSpan?.getAttribute('style')).not.toContain('light-dark(');
    expect(accentSpan?.getAttribute('style')).toContain('color:#20c997');
    expect(code?.getAttribute('style')).not.toContain('light-dark(');
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

  it('should wrap native-rendered tables for horizontal scrolling', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<table>',
      '<thead><tr><th>缩写</th><th>英文全称</th><th>中文全称</th></tr></thead>',
      '<tbody><tr><td>CRE</td><td>Carbapenem-Resistant Enterobacterales</td><td>碳青霉烯类耐药肠杆菌目细菌</td></tr></tbody>',
      '</table>',
    ].join('');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const table = container.querySelector('table');
    const wrapper = table?.parentElement;
    expect(wrapper?.tagName).toBe('SECTION');
    expect(wrapper?.getAttribute('style') || '').toContain('overflow-x: scroll');
    expect(wrapper?.getAttribute('style') || '').toContain('-webkit-overflow-scrolling: touch');
    expect(table?.getAttribute('style') || '').toContain('width: 770px');
    expect(table?.getAttribute('style') || '').toContain('min-width: 100%');
    expect(container.querySelector('td')?.getAttribute('style') || '').toContain('white-space: nowrap');
  });

  it('should keep Mac code window controls as inline circle lights through draft cleaning', () => {
    const root = document.createElement('div');
    root.innerHTML = '<pre><code class="language-js">const x = 1;</code></pre>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const cleanedHtml = cleanHtmlForDraft(html);
    const container = document.createElement('div');
    container.innerHTML = cleanedHtml;

    const header = container.querySelector('.code-snippet__fix > section');
    const dots = Array.from(header?.querySelectorAll('span') || []);
    expect(dots).toHaveLength(3);
    expect(header?.getAttribute('style') || '').toContain('padding:6px 10px 6px 10px');
    expect(dots[0]?.getAttribute('style') || '').toContain('background:#ff5f57');
    expect(dots[0]?.getAttribute('style') || '').toContain('width:9px');
    expect(dots[1]?.getAttribute('style') || '').toContain('background:#ffbd2e');
    expect(dots[2]?.getAttribute('style') || '').toContain('background:#28c840');
  });

  it('should preserve Mermaid svg attributes when raw svg is kept for preview/export fallback', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<div class="mermaid">',
      '<svg class="owc-mermaid-diagram" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">',
      '<g transform="translate(10,10)" alignment-baseline="middle" dominant-baseline="middle">',
      '<rect x="0" y="0" width="100" height="40" fill="#ecebff" stroke="#8b7cf6"></rect>',
      '<text x="50" y="25" text-anchor="middle"><tspan x="50" y="-0.1em" dx="0" dy="1.1em">Mermaid</tspan></text>',
      '</g>',
      '</svg>',
      '</div>',
    ].join('');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const svg = container.querySelector('svg');
    const rect = container.querySelector('rect');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 120 80');
    expect(svg?.getAttribute('width')).toBe('120');
    expect(svg?.getAttribute('class')).toBe('owc-mermaid-diagram');
    expect(rect?.getAttribute('fill')).toBe('#ecebff');
    expect(rect?.getAttribute('stroke')).toBe('#8b7cf6');
    expect(container.querySelector('g')?.getAttribute('alignment-baseline')).toBe('middle');
    expect(container.querySelector('g')?.getAttribute('dominant-baseline')).toBe('middle');
    expect(container.querySelector('tspan')?.getAttribute('dx')).toBe('0');
    expect(container.querySelector('tspan')?.getAttribute('dy')).toBe('1.1em');
  });

  it('should not apply article theme styles inside Mermaid foreignObject labels', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<p>文章正文</p>',
      '<div class="mermaid">',
      '<svg class="owc-mermaid-diagram" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">',
      '<foreignObject x="10" y="10" width="100" height="30">',
      '<div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>发现并解决问题</p></span></div>',
      '</foreignObject>',
      '</svg>',
      '</div>',
    ].join('');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const articleParagraph = Array.from(container.querySelectorAll('p'))
      .find((p) => p.textContent === '文章正文');
    const mermaidParagraph = container.querySelector('foreignObject p');

    expect(articleParagraph?.getAttribute('style') || '').toContain('font-size: 16px');
    expect(mermaidParagraph).not.toBeNull();
    expect(mermaidParagraph?.hasAttribute('style')).toBe(false);
  });

  it('should preserve Mermaid svg style tags for preview when requested', () => {
    const previewConverter = {
      ...converter,
      sanitizeHtml: (html) => html.replace(/<(script|iframe|object|embed|form|input|button|style)[^>]*>[\s\S]*?<\/\1>/gi, ''),
    };
    const root = document.createElement('div');
    root.innerHTML = [
      '<div class="mermaid">',
      '<svg id="mermaid-preview" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">',
      '<style>#mermaid-preview .node rect { fill:#efeaff; stroke:#b197fc; }</style>',
      '<g class="node"><rect x="0" y="0" width="100" height="40"></rect></g>',
      '</svg>',
      '</div>',
    ].join('');

    const html = serializeObsidianRenderedHtml({
      root,
      converter: previewConverter,
      preserveSvgStyleTags: true,
    });

    expect(html).toContain('<style>#mermaid-preview .node rect { fill:#efeaff; stroke:#b197fc; }</style>');
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

  it('should canonicalize non-ascii http host to legacy punycode form without forcing trailing slash', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><a href="http://dontbesilent小红书标题方法论.md">A</a><a href="http://开头的关系详解.md">B</a></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('http://xn--dontbesilent-nw5s334mlk4ayyhqjvrh7e188bh1zc.md');
    expect(hrefs).toContain('http://xn--d6qv2qg5ebq2aqfho8t8gd.md');
  });

  it('should keep claude-code workflow fixture normalized for link+empty-heading+whitespace parity', () => {
    for (const sample of tripletCorpus) {
      const root = document.createElement('div');
      root.innerHTML = readTripletFixture(sample.fixture);

      const html = serializeObsidianRenderedHtml({ root, converter });
      const container = document.createElement('div');
      container.innerHTML = html;

      const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('http://xn--dontbesilent-nw5s334mlk4ayyhqjvrh7e188bh1zc.md');
      expect(hrefs).toContain('http://xn--d6qv2qg5ebq2aqfho8t8gd.md');

      const emptyHeadings = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(
        (heading) => !(heading.textContent || '').replace(/\u00a0/g, ' ').trim()
      );
      expect(emptyHeadings).toHaveLength(0);

      const paragraphs = Array.from(container.querySelectorAll('p')).map((p) => p.textContent || '');
      expect(paragraphs).toContain('夜里 10 点，我对着电脑屏幕发呆。');
      expect(paragraphs).toContain('下一句收尾。');
    }
  });

  it('should convert Obsidian callout DOM to legacy callout sections', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="callout" data-callout="tips"><div class="callout-title"><div class="callout-icon"><svg></svg></div><div class="callout-title-inner">Tips</div></div><div class="callout-content"><p>这是一段 callout 内容。</p></div></div>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(html).not.toContain('class="callout"');
    expect(html).not.toContain('border-left');
    expect(html).toContain('border: 1px solid #2f6fdd24');
    expect(html).toContain('>ℹ️<');
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

  it('should apply neutral semantic styling when converting Obsidian callouts', async () => {
    const neutralConverter = await createLegacyConverter({
      themeOptions: {
        quoteCalloutStyleMode: 'neutral',
        themeColor: 'blue',
      },
    });
    const root = document.createElement('div');
    root.innerHTML = '<div class="callout" data-callout="warning"><div class="callout-title"><div class="callout-title-inner">Warning</div></div><div class="callout-content"><p>内容</p></div></div>';

    const html = serializeObsidianRenderedHtml({ root, converter: neutralConverter });

    expect(html).not.toContain('border-left:');
    expect(html).toContain('border: 1px solid #b26a0024');
    expect(html).toContain('background: #f9f9f9');
    expect(html).toContain('background: #b26a0014');
  });

  it('should fall back to info semantic styling for unknown Obsidian callout types in neutral mode', async () => {
    const neutralConverter = await createLegacyConverter({
      themeOptions: {
        quoteCalloutStyleMode: 'neutral',
        themeColor: 'green',
      },
    });
    const root = document.createElement('div');
    root.innerHTML = '<div class="callout" data-callout="tips"><div class="callout-title"><div class="callout-title-inner">Tips</div></div><div class="callout-content"><p>内容</p></div></div>';

    const html = serializeObsidianRenderedHtml({ root, converter: neutralConverter });

    expect(html).toContain('>ℹ️<');
    expect(html).not.toContain('border-left:');
    expect(html).toContain('border: 1px solid #2f6fdd24');
    expect(html).toContain('background: #2f6fdd14');
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

  it('should keep Mermaid diagram images as plain images instead of wrapping into figure captions', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><img class="mermaid-diagram-image" src="data:image/png;base64,mermaid" alt="Mermaid diagram"></p>';

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('img.mermaid-diagram-image')).not.toBeNull();
    expect(container.querySelector('figure')).toBeNull();
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

  it('should serialize unchecked and checked task lists using the formatTaskListItems helper', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<ul>',
      '  <li>☐ 待办任务</li>',
      '  <li>☑ 已完成任务</li>',
      '  <li>普通列表项</li>',
      '</ul>'
    ].join('\n');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const liElements = container.querySelectorAll('li');
    expect(liElements.length).toBe(3);

    // Unchecked list item asserts
    const uncheckedLi = liElements[0];
    expect(uncheckedLi.getAttribute('style')).toContain('list-style-type: none');
    expect(uncheckedLi.getAttribute('style')).toContain('margin-left: -20px');
    expect(uncheckedLi.querySelector('span')?.getAttribute('style')).toContain('color: #0366d6');
    expect(uncheckedLi.querySelector('span')?.textContent).toBe('☐');
    expect(uncheckedLi.textContent).toContain('待办任务');

    // Checked list item asserts
    const checkedLi = liElements[1];
    expect(checkedLi.getAttribute('style')).toContain('list-style-type: none');
    expect(checkedLi.getAttribute('style')).toContain('margin-left: -20px');
    expect(checkedLi.querySelector('span')?.getAttribute('style')).toContain('color: #8f959e');
    expect(checkedLi.querySelector('span')?.textContent).toBe('☑');
    
    // Strikethrough wrapper asserts
    const strikethroughSpan = checkedLi.querySelector('span[style*="text-decoration: line-through"]');
    expect(strikethroughSpan).not.toBeNull();
    expect(strikethroughSpan?.textContent).toBe('已完成任务');

    // Normal list item asserts
    const normalLi = liElements[2];
    expect(normalLi.getAttribute('style') || '').not.toContain('list-style-type: none');
  });

  it('should serialize loose task list items containing paragraphs correctly', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<ul>',
      '  <li><p>☐ 宽松待办任务</p></li>',
      '  <li><p>☑ 宽松已完成任务</p></li>',
      '</ul>'
    ].join('\n');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const liElements = container.querySelectorAll('li');
    
    // Loose unchecked
    const uncheckedLi = liElements[0];
    expect(uncheckedLi.getAttribute('style')).toContain('list-style-type: none');
    const uncheckedP = uncheckedLi.querySelector('p');
    expect(uncheckedP?.querySelector('span')?.textContent).toBe('☐');
    expect(uncheckedP?.textContent).toContain('宽松待办任务');

    // Loose checked
    const checkedLi = liElements[1];
    expect(checkedLi.getAttribute('style')).toContain('list-style-type: none');
    const checkedP = checkedLi.querySelector('p');
    expect(checkedP?.querySelector('span')?.textContent).toBe('☑');
    expect(checkedP?.querySelector('span[style*="text-decoration: line-through"]')?.textContent).toBe('宽松已完成任务');
  });

  it('should serialize checked task list items containing inline formatting correctly', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<ul>',
      '  <li>☑ <strong>重要</strong> 任务内容</li>',
      '</ul>'
    ].join('\n');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const li = container.querySelector('li');
    expect(li?.getAttribute('style')).toContain('list-style-type: none');
    expect(li?.querySelector('span')?.textContent).toBe('☑');

    const strikethroughSpan = li?.querySelector('span[style*="text-decoration: line-through"]');
    expect(strikethroughSpan?.querySelector('strong')?.textContent).toBe('重要');
    expect(strikethroughSpan?.textContent).toBe('重要 任务内容');
  });

  it('should serialize checked task lists with nested lists without wrapping nested items in strikethrough', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<ul>',
      '  <li>☑ 父级已完成任务',
      '    <ul>',
      '      <li>☐ 子级待办任务</li>',
      '    </ul>',
      '  </li>',
      '</ul>'
    ].join('\n');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const parentLi = container.querySelector('li');
    expect(parentLi?.getAttribute('style')).toContain('list-style-type: none');
    expect(parentLi?.querySelector('span')?.textContent).toBe('☑');

    // Verify parent text is strikethrough
    const strikethroughSpan = parentLi?.querySelector('span[style*="text-decoration: line-through"]');
    expect(strikethroughSpan?.textContent).toContain('父级已完成任务');

    // Verify child list is NOT wrapped in the parent's strikethrough span
    const childUl = parentLi?.querySelector('ul');
    expect(childUl?.parentElement).toBe(parentLi); // It is a direct child of parentLi, not of strikethroughSpan
    expect(strikethroughSpan?.contains(childUl)).toBe(false);

    // Verify child task item is not struck through
    const childLi = childUl?.querySelector('li');
    expect(childLi?.getAttribute('style')).toContain('list-style-type: none');
    expect(childLi?.querySelector('span')?.textContent).toBe('☐');
    expect(childLi?.querySelector('span[style*="text-decoration: line-through"]')).toBeNull();
  });
});
