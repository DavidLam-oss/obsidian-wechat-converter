import { describe, it, expect, vi } from 'vitest';
const { createLegacyConverter } = require('./helpers/render-runtime');
const {
  neutralizeUnsafeMarkdownLinks,
  neutralizePlainWikilinks,
  preprocessMarkdownForTriplet,
  injectHardBreaksForLegacyParity,
  shouldObserveAsyncEmbedWindow,
  waitForTripletDomToSettle,
  renderByObsidianMarkdownRenderer,
  renderObsidianTripletMarkdown,
} = require('../services/obsidian-triplet-renderer');

describe('Obsidian Triplet Renderer', () => {
  it('should preprocess markdown with frontmatter strip and wikilink image transform', () => {
    const converter = {
      stripFrontmatter: (md) => md.replace(/^---\n[\s\S]*?\n---\n?/, ''),
    };
    const input = [
      '---',
      'title: test',
      '---',
      '',
      '![[]] ignored',
      '![[folder/a b.png|封面]]',
      '   $$',
      'x+y',
      '$$',
    ].join('\n');

    const output = preprocessMarkdownForTriplet(input, converter);
    expect(output).not.toContain('title: test');
    expect(output).toContain('![封面](folder/a%20b.png)');
    expect(output).toContain('$$');
    expect(output).not.toContain('   $$');
  });

  it('should neutralize unsafe markdown links into literal text form', () => {
    const input = [
      '[ok](https://example.com)',
      '[bad-js](javascript:alert(1))',
      '![img](data:image/png;base64,abc)',
    ].join('\n');

    const output = neutralizeUnsafeMarkdownLinks(input);
    expect(output).toContain('[ok](https://example.com)');
    expect(output).toContain('\\[bad-js](javascript:alert(1))');
    expect(output).toContain('![img](data:image/png;base64,abc)');
  });

  it('should neutralize plain wikilinks but keep image wikilinks untouched for image transform', () => {
    const input = [
      '正文 [[目标文档|别名]]',
      '![[assets/pic a.png|图注]]',
      '```',
      '[[code-link]]',
      '```',
    ].join('\n');

    const output = preprocessMarkdownForTriplet(input, {});
    expect(output).toContain('正文 \\[[目标文档|别名]]');
    expect(output).toContain('![图注](assets/pic%20a.png)');
    expect(output).toContain('[[code-link]]');
  });

  it('should keep inline-code wikilinks unescaped while neutralizing plain wikilinks', () => {
    const input = '正文 [[目标文档]] 与 `[[标题]]`';

    const output = preprocessMarkdownForTriplet(input, {});
    expect(output).toContain('正文 \\[[目标文档]] 与 `[[标题]]`');
    expect(output).not.toContain('`\\[[标题]]`');
  });

  it('should keep nested-fence content untouched and still neutralize outside wikilinks', () => {
    const input = [
      '````markdown',
      '```',
      '[[inside-fence]]',
      '```',
      '````',
      '正文 [[outside-fence]]',
    ].join('\n');

    const output = preprocessMarkdownForTriplet(input, {});
    expect(output).toContain('[[inside-fence]]');
    expect(output).not.toContain('\\[[inside-fence]]');
    expect(output).toContain('正文 \\[[outside-fence]]');
  });

  it('should inject hard breaks for plain soft line breaks', () => {
    const input = [
      '**加粗：** 我们需要**立即启动**项目。',
      '*斜体：* *这是对重要概念的补充。*',
      '~~删除线：~~ ~~旧的方案已经废弃。~~',
      '> 引用',
    ].join('\n');

    const output = injectHardBreaksForLegacyParity(input);
    expect(output).toContain('项目。<br>\n*斜体');
    expect(output).toContain('补充。*<br>\n~~删除线');
    expect(output).toContain('废弃。~~\n> 引用');
  });

  it('should not inject hard breaks inside fenced code or math blocks', () => {
    const input = [
      '普通文本',
      '第二行',
      '```js',
      'const x = 1',
      'const y = 2',
      '```',
      '$$',
      'a+b',
      '$$',
      '尾部文本',
      '继续',
    ].join('\n');

    const output = injectHardBreaksForLegacyParity(input);
    expect(output).toContain('普通文本<br>\n第二行');
    expect(output).toContain('const x = 1\nconst y = 2');
    expect(output).toContain('$$\na+b\n$$');
    expect(output).toContain('尾部文本<br>\n继续');
  });

  it('should not inject hard breaks inside outer 4-backtick fenced blocks', () => {
    const input = [
      '````markdown',
      '行一',
      '行二',
      '```js',
      'const x = 1',
      'const y = 2',
      '```',
      '````',
      '尾部文本',
      '继续',
    ].join('\n');

    const output = injectHardBreaksForLegacyParity(input);
    expect(output).toContain('行一\n行二');
    expect(output).toContain('const x = 1\nconst y = 2');
    expect(output).toContain('尾部文本<br>\n继续');
  });

  it('should inject hard breaks between quote lines but skip callout markers', () => {
    const input = [
      '> 引用块第一行',
      '> *引用块第二行*',
      '> [!note]',
      '> callout 内容',
    ].join('\n');

    const output = injectHardBreaksForLegacyParity(input);
    expect(output).toContain('> 引用块第一行\\\n> *引用块第二行*');
    expect(output).not.toContain('> [!note]\\\n> callout 内容');
  });

  it('should not inject hard breaks on heading lines but keep breaks before image lines', () => {
    const input = [
      '### 标题',
      '![图](a.png)',
      '普通文本',
      '![图](b.png)',
    ].join('\n');

    const output = injectHardBreaksForLegacyParity(input);
    expect(output).toContain('### 标题\n![图](a.png)');
    expect(output).toContain('普通文本<br>\n![图](b.png)');
  });

  it('should inject hard break for ordered-list item continuation lines', () => {
    const input = [
      '1. 呼出命令，弹窗里输入我想要的名字，回车即可。',
      '   脚本会自动帮我建好那两个文件。',
      '2. 第二项',
    ].join('\n');

    const output = injectHardBreaksForLegacyParity(input);
    expect(output).toContain('回车即可。<br>\n   脚本会自动帮我建好那两个文件。');
    expect(output).toContain('脚本会自动帮我建好那两个文件。\n2. 第二项');
  });

  it('should only observe settle window for local-like image targets', () => {
    expect(shouldObserveAsyncEmbedWindow('纯文本')).toBe(false);
    expect(shouldObserveAsyncEmbedWindow('![remote](https://example.com/a.png)')).toBe(false);
    expect(shouldObserveAsyncEmbedWindow('![data](data:image/png;base64,abc)')).toBe(false);
    expect(shouldObserveAsyncEmbedWindow('![local](attachments/a.png)')).toBe(true);
    expect(shouldObserveAsyncEmbedWindow('![app](app://obsidian.md/a.png)')).toBe(true);
    expect(shouldObserveAsyncEmbedWindow('![ref][img]\n[img]: https://example.com/a.png')).toBe(false);
    expect(shouldObserveAsyncEmbedWindow('![ref][img]\n[img]: attachments/a.png')).toBe(true);
    expect(shouldObserveAsyncEmbedWindow('![ref][img]')).toBe(true);
  });

  it('should handle shortcut reference images with definitions', () => {
    // Shortcut reference with remote target - no observe window needed
    expect(shouldObserveAsyncEmbedWindow('![img]\n\n[img]: https://example.com/a.png')).toBe(false);
    // Shortcut reference with local target - needs observe window
    expect(shouldObserveAsyncEmbedWindow('![img]\n\n[img]: attachments/a.png')).toBe(true);
  });

  it('should handle angle-bracket wrapped reference definitions', () => {
    expect(shouldObserveAsyncEmbedWindow('![ref][img]\n[img]: <https://example.com/a.png>')).toBe(false);
    expect(shouldObserveAsyncEmbedWindow('![ref][img]\n[img]: <attachments/a.png>')).toBe(true);
  });

  it('should normalize reference labels case-insensitively', () => {
    // Labels are case-insensitive per CommonMark spec
    expect(shouldObserveAsyncEmbedWindow('![My Image][IMG]\n[img]: https://example.com/a.png')).toBe(false);
    expect(shouldObserveAsyncEmbedWindow('![My Image]\n\n[my image]: attachments/a.png')).toBe(true);
  });

  it('should handle mixed local and remote images', () => {
    // Mixed: local + remote should still need observe window (local triggers it)
    expect(shouldObserveAsyncEmbedWindow('![local](a.png) and ![remote](https://b.png)')).toBe(true);
    // All remote: no observe window needed
    expect(shouldObserveAsyncEmbedWindow('![a](https://a.png) and ![b](https://b.png)')).toBe(false);
  });

  it('should handle edge cases gracefully', () => {
    // Empty target: conservative - needs observe window
    expect(shouldObserveAsyncEmbedWindow('![]()')).toBe(true);
    // Inline image with title (space after URL)
    expect(shouldObserveAsyncEmbedWindow('![alt](https://example.com/a.png "title")')).toBe(false);
    // Reference with title
    expect(shouldObserveAsyncEmbedWindow('![ref][img]\n[img]: https://example.com/a.png "title"')).toBe(false);
  });

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
  });
});
