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

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
const {
  serializeObsidianRenderedHtml,
} = require('../services/obsidian-triplet-serializer');
const { cleanHtmlForDraft } = require('../services/wechat-html-cleaner');
const { createLegacyConverter } = require('./helpers/render-runtime');
const tripletFixtureRoot = path.resolve(__dirname, 'fixtures', 'triplet');
const tripletCorpusPath = path.resolve(tripletFixtureRoot, 'corpus.json');
const tripletCorpus = JSON.parse(fs.readFileSync(tripletCorpusPath, 'utf8'));

function readTripletFixture(name) {
  return fs.readFileSync(path.resolve(tripletFixtureRoot, name), 'utf8');
}

describe('Obsidian Triplet Serializer core', () => {
  let converter;

  beforeAll(async () => {
    converter = await createLegacyConverter();
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

  it('should inline a stable warm highlight style without overriding text color', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<p><mark>普通高亮</mark> <mark><strong>内层加粗</strong></mark> <strong><mark>外层加粗</mark></strong></p>',
      '<blockquote><p><mark>引用高亮</mark></p></blockquote>',
      '<ul><li><mark>列表高亮</mark></li></ul>',
      '<table><tbody><tr><td><mark>表格高亮</mark></td></tr></tbody></table>',
      '<p><code>==行内代码不解析==</code></p>',
      '<pre><code>==代码块不解析==</code></pre>',
    ].join('');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;
    const marks = Array.from(container.querySelectorAll('mark'));

    expect(marks).toHaveLength(6);
    for (const mark of marks) {
      expect(mark.style.backgroundColor).toBe('rgb(255, 241, 168)');
      expect(mark.style.padding).toBe('0px 2px');
      expect(mark.style.borderRadius).toBe('2px');
      expect(mark.style.color).toBe('');
    }
    expect(container.querySelector('mark strong')?.style.fontWeight).toBe('bold');
    expect(container.querySelector('strong mark')?.closest('strong')?.style.fontWeight).toBe('bold');
    expect(container.querySelector('code')?.textContent).toBe('==行内代码不解析==');
    expect(container.querySelectorAll('code mark')).toHaveLength(0);
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
    const dots = Array.from(header?.querySelectorAll('section') || []);
    expect(dots).toHaveLength(3);
    expect(header?.getAttribute('style') || '').toContain('padding:8px 12px 6px 12px');
    expect(dots[0]?.getAttribute('style') || '').toContain('background:#ff5f57');
    expect(dots[0]?.getAttribute('style') || '').toContain('width:10px');
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
});
