/*
## 核心功能

覆盖 Obsidian Triplet Renderer runtime 相关行为的 Vitest 测试用例。

## 输入

接收 Markdown、模拟的 Obsidian MarkdownRenderer、converter 与 DOM 断言数据。

## 输出

输出自动化断言结果，保护 Obsidian Triplet Renderer runtime 行为不回归。

## 定位

位于 tests/，是 triplet renderer 的分场景回归测试。

## 依赖

关键依赖：Vitest、render-runtime helper 和 obsidian-triplet-renderer。

## 维护规则

- 只收纳 Obsidian Triplet Renderer runtime 场景，避免跨文件复制测试逻辑。
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
const { renderMermaidCodeBlocks, convertRenderedMermaidDiagramsToImages } = require('../services/rendered-mermaid');
const {
  waitForTripletDomToSettle,
  renderByObsidianMarkdownRenderer,
  renderObsidianTripletMarkdown,
} = require('../services/obsidian-triplet-renderer');

describe('Obsidian Triplet Renderer runtime', () => {
  it('should render with renderMarkdown API and serialize output', async () => {
    const renderMarkdown = vi.fn(async (markdown, el) => {
      el.innerHTML = `<p>${markdown}</p>`;
    });
    const serializer = vi.fn(() => '<section>ok</section>');

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter: {},
      markdown: '# title',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
      serializer,
    });

    expect(renderMarkdown).toHaveBeenCalled();
    expect(renderMarkdown.mock.calls[0][0]).toBe('# title');
    expect(serializer).toHaveBeenCalled();
    expect(html).toBe('<section>ok</section>');
  });

  it('should preserve standard local image alt as caption through triplet rendering', async () => {
    const converter = await createLegacyConverter();
    converter.resolveImagePath = (src) => src;
    converter.showImageCaption = true;
    const renderMarkdown = vi.fn(async (markdown, el) => {
      el.innerHTML = markdown;
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter,
      markdown: '![300](attachments/做视频.png)',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
    });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('figure img')?.getAttribute('alt')).toBe('300');
    expect(container.querySelector('figure figcaption')?.textContent).toBe('300');
    expect(container.textContent).not.toContain('attachments/做视频');
  });

  it('should render bold text below image when there is no blank line between them', async () => {
    const converter = await createLegacyConverter();
    converter.resolveImagePath = (src) => src;
    converter.showImageCaption = true;
    const renderMarkdown = vi.fn(async (markdown, el) => {
      el.innerHTML = converter.md.render(markdown);
    });

    const input = [
      '![[attachments/马璐璐.jpg|马璐璐]]',
      '**学习委员 | 马璐璐** 入党积极分子',
      '任班级学习委员、校社联...',
    ].join('\n');

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter,
      markdown: input,
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
    });
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('figure img')?.getAttribute('alt')).toBe('马璐璐');
    expect(container.querySelector('figure figcaption')?.textContent).toBe('马璐璐');
    expect(container.querySelector('strong')?.textContent).toBe('学习委员 | 马璐璐');
    expect(container.textContent).not.toContain('**学习委员');
  });

  it('should pass component into markdown renderer APIs', async () => {
    const component = { name: 'view-component' };
    const renderMarkdown = vi.fn(async (_markdown, el) => {
      el.innerHTML = '<p>x</p>';
    });

    await renderObsidianTripletMarkdown({
      app: {},
      converter: {},
      markdown: 'x',
      sourcePath: 'note.md',
      component,
      markdownRenderer: { renderMarkdown },
      serializer: () => '<section>x</section>',
    });

    expect(renderMarkdown).toHaveBeenCalledWith('x', expect.any(HTMLElement), 'note.md', component);
  });

  it('should wait for async image-embed resolution before serialization', async () => {
    const renderMarkdown = vi.fn(async (_markdown, el) => {
      el.innerHTML = '<p><span class="internal-embed image-embed" src="app://obsidian.md/x"></span></p>';
      setTimeout(() => {
        const span = el.querySelector('span.internal-embed.image-embed');
        if (span) {
          span.innerHTML = '<img src="app://obsidian.md/x">';
        }
      }, 10);
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter: {},
      markdown: '![x](attachments/y.png)',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
      serializer: ({ root }) => root.innerHTML,
    });

    expect(html).toContain('<img');
  });

  it('should support legacy render API', async () => {
    const render = vi.fn(async (_app, markdown, el) => {
      el.innerHTML = `<p>${markdown}</p>`;
    });
    const target = document.createElement('div');

    await renderByObsidianMarkdownRenderer({
      app: { id: 'mock-app' },
      markdown: 'body',
      sourcePath: 'a.md',
      targetEl: target,
      markdownRenderer: { render },
    });

    expect(render).toHaveBeenCalled();
    expect(target.innerHTML).toContain('body');
  });

  it('should throw when legacy render API is used without app', async () => {
    const render = vi.fn(async () => {});
    const target = document.createElement('div');

    await expect(
      renderByObsidianMarkdownRenderer({
        markdown: 'body',
        sourcePath: 'a.md',
        targetEl: target,
        markdownRenderer: { render },
      })
    ).rejects.toThrow('Obsidian app instance is required for MarkdownRenderer.render');
  });

  it('should throw when renderer API is unavailable', async () => {
    await expect(
      renderObsidianTripletMarkdown({
        app: {},
        converter: {},
        markdown: 'x',
        markdownRenderer: {},
      })
    ).rejects.toThrow('renderMarkdown/render');
  });

  it('should throw when triplet renderer runs without DOM environment', async () => {
    const previousDocument = global.document;
    try {
      delete global.document;
      await expect(
        renderObsidianTripletMarkdown({
          app: {},
          converter: {},
          markdown: 'x',
          markdownRenderer: { renderMarkdown: vi.fn(async () => {}) },
        })
      ).rejects.toThrow('Triplet renderer requires DOM environment');
    } finally {
      global.document = previousDocument;
    }
  });

  it('should throw when triplet renderer runs without converter', async () => {
    await expect(
      renderObsidianTripletMarkdown({
        app: {},
        markdown: 'x',
        markdownRenderer: { renderMarkdown: vi.fn(async () => {}) },
      })
    ).rejects.toThrow('Triplet renderer requires converter runtime');
  });

  it('waitForTripletDomToSettle should return quickly for settled dom', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>ok</p>';
    await expect(waitForTripletDomToSettle(root, { timeoutMs: 20, intervalMs: 1 })).resolves.toBeUndefined();
  });

  it('waitForTripletDomToSettle should allow immediate return when observation window is disabled', async () => {
    vi.useFakeTimers();
    try {
      const root = document.createElement('div');
      root.innerHTML = '<p>ok</p>';

      const promise = waitForTripletDomToSettle(root, { timeoutMs: 100, intervalMs: 10, minObserveMs: 0 });
      await Promise.resolve();
      expect(vi.getTimerCount()).toBe(0);
      await expect(promise).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should execute markdown renderer + serializer path by default', async () => {
    const convert = vi.fn();
    const renderMarkdown = vi.fn();
    const serializer = vi.fn(() => '<section>triplet</section>');

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter: { convert },
      markdown: '# triplet',
      sourcePath: 'notes/a.md',
      markdownRenderer: { renderMarkdown },
      serializer,
    });

    expect(html).toBe('<section>triplet</section>');
    expect(renderMarkdown).toHaveBeenCalledTimes(1);
    expect(serializer).toHaveBeenCalledTimes(1);
    expect(convert).not.toHaveBeenCalled();
  });

  it('should preserve Obsidian native mark output without rewriting code literals', async () => {
    const renderMarkdown = vi.fn(async (_markdown, el) => {
      el.innerHTML = '<p><mark>重点</mark> <code>==literal==</code></p>';
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter: {},
      markdown: '==重点== `==literal==`',
      sourcePath: 'notes/highlight.md',
      markdownRenderer: { renderMarkdown },
      serializer: ({ root }) => root.innerHTML,
    });

    expect(html).toContain('<mark>重点</mark>');
    expect(html).toContain('<code>==literal==</code>');
  });

  it('should wait for delayed async image-embed injection before serialization', async () => {
    const renderMarkdown = vi.fn(async (_markdown, el) => {
      el.innerHTML = '<p>start</p>';
      setTimeout(() => {
        el.innerHTML = '<p><span class="internal-embed image-embed" src="app://obsidian.md/y"></span></p>';
        setTimeout(() => {
          const span = el.querySelector('span.internal-embed.image-embed');
          if (span) {
            span.innerHTML = '<img src="app://obsidian.md/y">';
          }
        }, 10);
      }, 5);
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter: {},
      markdown: '![x](attachments/y.png)',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
      serializer: ({ root }) => root.innerHTML,
    });

    expect(html).toContain('<img');
  });

  it('should preserve native Mermaid node styles and arrow markers through preview and export', async () => {
    const converter = await createLegacyConverter();
    const html = await renderObsidianTripletMarkdown({
      app: {}, converter,
      markdown: '~~~mermaid\nflowchart TD\nA -- 开始 --> B\n~~~',
      markdownRenderer: { renderMarkdown: async (_markdown, el) => {
        el.innerHTML = [
          '<div class="mermaid"><svg id="chart-1" width="100%" viewBox="0 0 240 120">',
          '<style>#chart-1 .node rect { fill: #efeaff; }</style>',
          '<g><marker id="chart-1-arrow" markerUnits="userSpaceOnUse"><path d="M0,0 L6,3 L0,6 Z"/></marker></g>',
          '<g class="node"><rect width="40" height="20"/></g>',
          '<path marker-end="url(#chart-1-arrow)" d="M30,20 L120,90"/></svg></div>',
        ].join('');
      } },
      mermaidCodeRenderer: renderMermaidCodeBlocks,
      rasterizeMermaid: false,
      preserveSvgStyleTags: true,
    });
    const preview = document.createElement('div');
    preview.innerHTML = html;
    expect(preview.querySelector('svg rect')?.getAttribute('style')).toContain('fill: #efeaff');
    expect(preview.querySelector('marker#chart-1-arrow')?.getAttribute('markerUnits')).toBe('userSpaceOnUse');
    expect(preview.querySelector('path[marker-end]')?.getAttribute('marker-end')).toBe('url(#chart-1-arrow)');
    const rasterizeSvg = vi.fn(async () => ({ dataUrl: 'data:image/png;base64,AA==', width: 240, height: 120 }));
    await convertRenderedMermaidDiagramsToImages(preview, { rasterizeSvg });
    expect(rasterizeSvg).toHaveBeenCalledOnce();
    expect(preview.querySelector('img.mermaid-diagram-image')?.getAttribute('src')).toBe('data:image/png;base64,AA==');
  });

  it('should render pasted Excalidraw SVG as an isolated image without losing fonts or masks', async () => {
    const converter = await createLegacyConverter();
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" viewBox="0 0 160 80">',
      '<!-- svg-source:excalidraw --><defs><style>@font-face { font-family: Sketch; src: url(data:font/woff2;base64,AA==); }</style>',
      '<mask id="mask-a"><rect fill="white" width="160" height="80"/></mask></defs>',
      '<text mask="url(#mask-a)" font-family="Sketch">流程</text></svg>',
    ].join('\n');
    const markdownRenderer = { renderMarkdown: async (markdown, el) => { el.innerHTML = markdown; } };
    const html = await renderObsidianTripletMarkdown({ app: {}, converter, markdown: svg, markdownRenderer });
    const preview = document.createElement('div');
    preview.innerHTML = html;
    const src = preview.querySelector('img')?.getAttribute('src') || '';
    expect(src).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(src.split(',')[1])).toBe(svg);
    expect(preview.querySelector('svg')).toBeNull();
  });

  it('should rasterize rendered Mermaid diagrams before serialization', async () => {
    const renderMarkdown = vi.fn(async (_markdown, el) => {
      el.innerHTML = '<div class="mermaid"><svg id="mermaid-1"></svg></div>';
    });
    const mermaidRasterizer = vi.fn(async (root) => {
      const svg = root.querySelector('svg#mermaid-1');
      const img = document.createElement('img');
      img.setAttribute('src', 'data:image/png;base64,mermaid');
      img.setAttribute('class', 'mermaid-diagram-image');
      svg.replaceWith(img);
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter: {},
      markdown: '```mermaid\ngraph TD\nA-->B\n```',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
      mermaidRasterizer,
      serializer: ({ root }) => root.innerHTML,
    });

    expect(mermaidRasterizer).toHaveBeenCalledTimes(1);
    expect(html).toContain('mermaid-diagram-image');
    expect(html).not.toContain('<svg');
  });

  it('should render Mermaid code fences before rasterization when MarkdownRenderer leaves them as code blocks', async () => {
    const renderMarkdown = vi.fn(async (_markdown, el) => {
      el.innerHTML = '<pre><code class="language-mermaid">graph TD\\nA-->B</code></pre>';
    });
    const mermaidApi = {
      render: vi.fn(async () => ({
        svg: '<svg id="rendered-from-code"></svg>',
      })),
    };
    const mermaidRasterizer = vi.fn(async (root) => {
      const svg = root.querySelector('svg#rendered-from-code');
      if (!svg) return;
      const img = document.createElement('img');
      img.setAttribute('src', 'data:image/png;base64,rendered-from-code');
      img.setAttribute('class', 'mermaid-diagram-image');
      svg.replaceWith(img);
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter: {},
      markdown: '```mermaid\ngraph TD\nA-->B\n```',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
      mermaidCodeRenderer: renderMermaidCodeBlocks,
      mermaidApi,
      mermaidRasterizer,
      serializer: ({ root }) => root.innerHTML,
    });

    expect(mermaidApi.render).toHaveBeenCalledTimes(1);
    expect(mermaidRasterizer).toHaveBeenCalledTimes(1);
    expect(html).toContain('mermaid-diagram-image');
    expect(html).not.toContain('language-mermaid');
  });

  it('should keep raw Mermaid svg when preview path disables rasterization', async () => {
    const renderMarkdown = vi.fn(async (_markdown, el) => {
      el.innerHTML = '<pre><code class="language-mermaid">graph TD\\nA-->B</code></pre>';
    });
    const mermaidApi = {
      render: vi.fn(async () => ({
        svg: '<svg id="preview-mermaid" viewBox="0 0 100 60"><rect width="100" height="60"></rect></svg>',
      })),
    };
    const mermaidRasterizer = vi.fn(async () => {});

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter: {},
      markdown: '```mermaid\ngraph TD\nA-->B\n```',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
      mermaidCodeRenderer: renderMermaidCodeBlocks,
      mermaidApi,
      mermaidRasterizer,
      rasterizeMermaid: false,
      serializer: ({ root }) => root.innerHTML,
    });

    expect(mermaidApi.render).toHaveBeenCalledTimes(1);
    expect(mermaidRasterizer).not.toHaveBeenCalled();
    expect(html).toContain('preview-mermaid');
    expect(html).toContain('<svg');
    expect(html).toContain('max-width: 100%');
    expect(html).toContain('width: 100%');
  });

  it('should wait for delayed Mermaid svg injection before rasterization and serialization', async () => {
    const renderMarkdown = vi.fn(async (_markdown, el) => {
      el.innerHTML = '<p>placeholder</p>';
      setTimeout(() => {
        el.innerHTML = '<div class="mermaid"><svg id="late-mermaid"></svg></div>';
      }, 80);
    });
    const mermaidRasterizer = vi.fn(async (root) => {
      const svg = root.querySelector('svg#late-mermaid');
      if (!svg) return;
      const img = document.createElement('img');
      img.setAttribute('src', 'data:image/png;base64,late-mermaid');
      img.setAttribute('class', 'mermaid-diagram-image');
      svg.replaceWith(img);
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter: {},
      markdown: '```mermaid\ngraph TD\nA-->B\n```',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
      mermaidRasterizer,
      serializer: ({ root }) => root.innerHTML,
    });

    expect(mermaidRasterizer).toHaveBeenCalledTimes(1);
    expect(html).toContain('mermaid-diagram-image');
    expect(html).not.toContain('placeholder');
  });

  it('should keep observe window for reference-style local image and wait delayed embed injection', async () => {
    const renderMarkdown = vi.fn(async (_markdown, el) => {
      el.innerHTML = '<p>start</p>';
      setTimeout(() => {
        el.innerHTML = '<p><span class="internal-embed image-embed" src="app://obsidian.md/ref"></span></p>';
        setTimeout(() => {
          const span = el.querySelector('span.internal-embed.image-embed');
          if (span) {
            span.innerHTML = '<img src="app://obsidian.md/ref">';
          }
        }, 10);
      }, 5);
    });

    const html = await renderObsidianTripletMarkdown({
      app: {},
      converter: {},
      markdown: '![封面][img]\n\n[img]: attachments/ref-local.png',
      sourcePath: 'note.md',
      markdownRenderer: { renderMarkdown },
      serializer: ({ root }) => root.innerHTML,
    });

    expect(html).toContain('<img');
  });
});
