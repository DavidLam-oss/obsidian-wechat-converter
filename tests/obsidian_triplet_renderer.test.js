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
const { renderMermaidCodeBlocks } = require('../services/rendered-mermaid');
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
