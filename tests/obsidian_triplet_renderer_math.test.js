/*
## 核心功能

覆盖 Obsidian Triplet Renderer math 相关行为的 Vitest 测试用例。

## 输入

接收 Markdown、模拟的 Obsidian MarkdownRenderer、converter 与 DOM 断言数据。

## 输出

输出自动化断言结果，保护 Obsidian Triplet Renderer math 行为不回归。

## 定位

位于 tests/，是 triplet renderer 的分场景回归测试。

## 依赖

关键依赖：Vitest、render-runtime helper 和 obsidian-triplet-renderer。

## 维护规则

- 只收纳 Obsidian Triplet Renderer math 场景，避免跨文件复制测试逻辑。
- 新增断言时保持预处理、渲染和异步等待边界清晰。
*/

import { describe, it, expect, vi } from 'vitest';
vi.mock('obsidian', () => ({
  MarkdownRenderer: {
    async renderMarkdown(markdown, el) {
      const safe = String(markdown || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      el.innerHTML = `<p>${safe}</p>`;
    },
  },
}));

const { createLegacyConverter } = require('./helpers/render-runtime');
const {
  preprocessMarkdownForTriplet,
  renderObsidianTripletMarkdown,
} = require('../services/obsidian-triplet-renderer');

describe('Obsidian Triplet Renderer math', () => {
  it('should preserve inline and block math markers inside fenced code blocks', async () => {
    const converter = await createLegacyConverter();
    const input = [
      '```js',
      'const inline = "$text$";',
      'const block = "$$value$$";',
      '```',
      '',
      '~~~txt',
      '$tilde$',
      '~~~',
    ].join('\n');

    const result = preprocessMarkdownForTriplet(input, converter);

    expect(result.mathFormulas).toHaveLength(0);
    expect(result.markdown).toContain('const inline = "$text$";');
    expect(result.markdown).toContain('const block = "$$value$$";');
    expect(result.markdown).toContain('~~~txt\n$tilde$\n~~~');
  });

  it('should preserve math markers inside inline code spans', async () => {
    const converter = await createLegacyConverter();
    const input = '保留 `$text$` 和 ``code `with` $value$``，正文 $outside$ 仍渲染。';

    const result = preprocessMarkdownForTriplet(input, converter);

    expect(result.mathFormulas).toHaveLength(1);
    expect(result.markdown).toContain('`$text$`');
    expect(result.markdown).toContain('``code `with` $value$``');
    expect(result.markdown).not.toContain('$outside$');
  });

  it('should preserve math markers inside indented code blocks', async () => {
    const converter = await createLegacyConverter();
    const input = [
      '代码示例：',
      '',
      '    const value = "$text$";',
      '    const total = "$$amount$$";',
      '',
      '正文 $outside$。',
    ].join('\n');

    const result = preprocessMarkdownForTriplet(input, converter);

    expect(result.mathFormulas).toHaveLength(1);
    expect(result.markdown).toContain('    const value = "$text$";');
    expect(result.markdown).toContain('    const total = "$$amount$$";');
    expect(result.markdown).not.toContain('$outside$');
  });

  it('should render unresolved inline math formulas via markdown-it MathJax', async () => {
    const converter = await createLegacyConverter();

    // Simulate Obsidian MarkdownRenderer not rendering math (leaves $...$ as-is)
    const renderMarkdown = vi.fn(async (_markdown, el) => {
      el.innerHTML = '<p>Energy is $E=mc^2$.</p>';
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter,
      markdown: 'Energy is $E=mc^2$.',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
      // Use default serializer (serializeObsidianRenderedHtml) which calls renderUnresolvedMathFormulas
    });

    // MathJax should render to mjx-container or span with SVG
    expect(html).toMatch(/mjx-container|<svg/);
  });

  it('should render unresolved block math formulas via markdown-it MathJax', async () => {
    const converter = await createLegacyConverter();

    // The preprocessMarkdownForTriplet will convert $$...$$ to placeholders
    // Obsidian will render the placeholder as plain text in a paragraph
    const renderMarkdown = vi.fn(async (markdown, el) => {
      // Simulate Obsidian rendering the placeholder as-is
      el.innerHTML = `<p>Here is a formula:</p><p>${markdown.split('\n\n')[1] || markdown}</p>`;
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter,
      markdown: 'Here is a formula:\n\n$$\nE=mc^2\n$$',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
    });

    // Block math should render to mjx-container or section with SVG
    expect(html).toMatch(/mjx-container|<svg/);
    expect(html).toContain('text-align:center');
  });

  it('should render blockquote block math without quote marker artifacts', async () => {
    const converter = await createLegacyConverter();

    const renderMarkdown = vi.fn(async (markdown, el) => {
      const parsed = converter.md.render(markdown);
      el.innerHTML = parsed;
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter,
      markdown: [
        '> $$',
        '> \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
        '> $$',
      ].join('\n'),
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
    });

    expect(html).toMatch(/mjx-container|<svg/);
    expect(html).not.toContain('&gt;');
  });

  it('should render callout block math without quote marker artifacts', async () => {
    const converter = await createLegacyConverter();

    const renderMarkdown = vi.fn(async (markdown, el) => {
      const parsed = converter.md.render(markdown);
      el.innerHTML = parsed;
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter,
      markdown: [
        '> [!note]',
        '> $$',
        '> E = mc^2',
        '> $$',
      ].join('\n'),
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
    });

    expect(html).toMatch(/mjx-container|<svg/);
    expect(html).not.toContain('&gt;');
  });

  it('should handle multiple inline math formulas in preprocessing', async () => {
    const converter = await createLegacyConverter();

    const renderMarkdown = vi.fn(async (markdown, el) => {
      // markdown now contains placeholders like %%OWC_MATH_INLINE_0%%
      el.innerHTML = `<p>${markdown}</p>`;
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter,
      markdown: '$a+b$ and $c+d$ and $e+f$',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
    });

    // All three formulas should be rendered (check for SVG or mjx-container)
    // Note: fixMathJaxTags converts mjx-container to span/section, so check for svg
    const svgMatches = html.match(/<svg/g) || [];
    expect(svgMatches.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle mixed inline and block math in preprocessing', async () => {
    const converter = await createLegacyConverter();

    const renderMarkdown = vi.fn(async (markdown, el) => {
      el.innerHTML = `<p>${markdown.replace(/\n/g, '<br>')}</p>`;
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter,
      markdown: 'Inline $x=1$ and block:\n\n$$y=2$$',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
    });

    // Both inline and block should be rendered
    expect(html).toMatch(/mjx-container|<svg/);
  });

  it('should preserve text around math formulas', async () => {
    const converter = await createLegacyConverter();

    const renderMarkdown = vi.fn(async (markdown, el) => {
      el.innerHTML = `<p>${markdown}</p>`;
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter,
      markdown: 'Before $E=mc^2$ after',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
    });

    expect(html).toContain('Before');
    expect(html).toContain('after');
    expect(html).toMatch(/mjx-container|<svg/);
  });

  it('should nudge inline math formulas upward in preview output', async () => {
    const converter = await createLegacyConverter();

    const renderMarkdown = vi.fn(async (markdown, el) => {
      el.innerHTML = converter.md.render(markdown);
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter,
      markdown: 'Energy $E=mc^2$ test',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
      rasterizeMermaid: false,
      preserveSvgStyleTags: true,
    });

    expect(html).toContain('vertical-align:middle');
    expect(html).toContain('translateY(-0.12em)');
  });

  it('should handle empty or invalid math gracefully', async () => {
    const converter = await createLegacyConverter();

    const renderMarkdown = vi.fn(async (markdown, el) => {
      el.innerHTML = `<p>${markdown}</p>`;
    });

    // Empty formula and text with dollar signs that are not math
    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter,
      markdown: 'Price is $100 and $$',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
    });

    // Should not crash, content should be preserved
    expect(html).toContain('Price');
  });

  it('should preserve placeholders through real markdown-it rendering and inject correctly', async () => {
    // This test simulates the real Obsidian MarkdownRenderer path more closely
    // by using converter.md.render() to parse markdown, ensuring placeholders
    // survive the markdown parsing phase.
    const converter = await createLegacyConverter();

    // Simulate real Obsidian MarkdownRenderer behavior: parse markdown with markdown-it
    const renderMarkdown = vi.fn(async (markdown, el) => {
      // Use converter.md.render to simulate real markdown parsing
      // This is closer to what Obsidian's MarkdownRenderer.renderMarkdown does
      const parsed = converter.md.render(markdown);
      el.innerHTML = parsed;
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter,
      markdown: 'Inline $E=mc^2$ and block:\n\n$$\\sum_{i=1}^{n} i$$',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
    });

    // Both formulas should be rendered (not just placeholders surviving)
    expect(html).toMatch(/mjx-container|<svg/);
    // Should not contain raw placeholder patterns (zero-width space + BLOCK/INLINE markers)
    // Current placeholder format: \u200B{session}_{counter}_{random}_{BLOCK|INLINE}\u200B
    expect(html).not.toMatch(/\u200B\w+_\d+_[a-z0-9]+_(BLOCK|INLINE)\u200B/);
  });

  it('should isolate math placeholders across concurrent renders', async () => {
    // This test ensures that concurrent render calls don't pollute each other's
    // math formula placeholders. Previously, a global shared state caused
    // cross-request contamination.
    const converter = await createLegacyConverter();

    // Track execution overlap to ensure we're testing concurrent scenarios
    let render1Active = false;
    let render2Active = false;
    let hadOverlap = false;

    const createRenderMarkdown = (marker) => vi.fn(async (markdown, el) => {
      // Set active flag and check for overlap
      if (marker === 1) render1Active = true;
      if (marker === 2) render2Active = true;
      if (render1Active && render2Active) hadOverlap = true;

      // Simulate work that takes time (ensures overlap)
      await new Promise((resolve) => setTimeout(resolve, 10));

      const parsed = converter.md.render(markdown);
      el.innerHTML = parsed;

      // Clear active flag
      if (marker === 1) render1Active = false;
      if (marker === 2) render2Active = false;
    });

    // Two different documents with different formulas
    const doc1 = 'Document 1: $a+b$';
    const doc2 = 'Document 2: $x+y$';

    // Start both renders simultaneously (no delay before starting)
    const [html1, html2] = await Promise.all([
      renderObsidianTripletMarkdown({
        app: {},
        converter,
        markdown: doc1,
        sourcePath: 'doc1.md',
        markdownRenderer: { renderMarkdown: createRenderMarkdown(1) },
      }),
      renderObsidianTripletMarkdown({
        app: {},
        converter,
        markdown: doc2,
        sourcePath: 'doc2.md',
        markdownRenderer: { renderMarkdown: createRenderMarkdown(2) },
      }),
    ]);

    // Verify we actually had concurrent execution (overlap detected)
    expect(hadOverlap).toBe(true);

    // Both should render successfully without cross-contamination
    expect(html1).toMatch(/mjx-container|<svg/);
    expect(html2).toMatch(/mjx-container|<svg/);
    // Neither should contain raw placeholders
    expect(html1).not.toMatch(/\u200B\w+_\d+_[a-z0-9]+_(BLOCK|INLINE)\u200B/);
    expect(html2).not.toMatch(/\u200B\w+_\d+_[a-z0-9]+_(BLOCK|INLINE)\u200B/);
  });
});
