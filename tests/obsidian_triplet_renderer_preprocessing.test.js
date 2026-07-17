/*
## 核心功能

覆盖 Obsidian Triplet Renderer preprocessing 相关行为的 Vitest 测试用例。

## 输入

接收 Markdown、模拟的 Obsidian MarkdownRenderer、converter 与 DOM 断言数据。

## 输出

输出自动化断言结果，保护 Obsidian Triplet Renderer preprocessing 行为不回归。

## 定位

位于 tests/，是 triplet renderer 的分场景回归测试。

## 依赖

关键依赖：Vitest、render-runtime helper 和 obsidian-triplet-renderer。

## 维护规则

- 只收纳 Obsidian Triplet Renderer preprocessing 场景，避免跨文件复制测试逻辑。
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

const {
  neutralizeUnsafeMarkdownLinks,
  normalizeWechatUnsafeTaskListMarkers,
  preprocessMarkdownForTriplet,
  injectHardBreaksForLegacyParity,
  shouldObserveAsyncEmbedWindow,
  shouldObserveMermaidRenderWindow,
} = require('../services/obsidian-triplet-renderer');

describe('Obsidian Triplet Renderer preprocessing', () => {
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

    const { markdown: output } = preprocessMarkdownForTriplet(input, converter);
    expect(output).not.toContain('title: test');
    expect(output).toContain('<img src="folder/a%20b.png" alt="封面">');
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

    const { markdown: output } = preprocessMarkdownForTriplet(input, {});
    expect(output).toContain('正文 \\[[目标文档|别名]]');
    expect(output).toContain('<img src="assets/pic%20a.png" alt="图注">');
    expect(output).toContain('[[code-link]]');
  });

  it('should normalize task list markers before Obsidian rendering', () => {
    const input = [
      '- [ ] 展位设计稿',
      '  - [X] 已确认物料',
      '',
      '```md',
      '- [ ] 代码块不改',
      '```',
    ].join('\n');

    const output = normalizeWechatUnsafeTaskListMarkers(input);
    expect(output).toContain('- ☐ 展位设计稿');
    expect(output).toContain('  - ☑ 已确认物料');
    expect(output).toContain('```md\n- [ ] 代码块不改\n```');
  });

  it('should materialize local markdown images before Obsidian can replace alt text', () => {
    const input = [
      '![300](attachments/做视频.png)',
      '![](attachments/空图注.png)',
      '![paren](attachments/foo(1).png)',
      '![angle](<attachments/foo(2).png>)',
      '![title](attachments/title(3).png "标题")',
      '![title-paren](attachments/title.png "Title with ) paren")',
      '![remote](https://example.com/remote.png)',
      '```',
      '![code](attachments/code.png)',
      '```',
    ].join('\n');

    const { markdown: output } = preprocessMarkdownForTriplet(input, {});
    expect(output).toContain('<img src="attachments/%E5%81%9A%E8%A7%86%E9%A2%91.png" alt="300">');
    expect(output).toContain('<img src="attachments/%E7%A9%BA%E5%9B%BE%E6%B3%A8.png" alt="">');
    expect(output).toContain('<img src="attachments/foo(1).png" alt="paren">');
    expect(output).toContain('<img src="attachments/foo(2).png" alt="angle">');
    expect(output).toContain('<img src="attachments/title(3).png" alt="title">');
    expect(output).toContain('<img src="attachments/title.png" alt="title-paren">');
    expect(output).toContain('![remote](https://example.com/remote.png)');
    expect(output).toContain('![code](attachments/code.png)');
  });

  it('should keep headings after local markdown images renderable on the triplet path', () => {
    const input = [
      '![[attachments/音乐卡点调整.png]]',
      '#### 图片后的标题',
    ].join('\n');

    const { markdown: output } = preprocessMarkdownForTriplet(input, {});

    expect(output).toContain('<img src="attachments/%E9%9F%B3%E4%B9%90%E5%8D%A1%E7%82%B9%E8%B0%83%E6%95%B4.png" alt="音乐卡点调整">\n\n#### 图片后的标题');
  });

  it('should not materialize local markdown images inside non-image syntax contexts', () => {
    const input = [
      '示例 `![alt](attachments/a.png)` 不应变图片',
      '    ![indented](attachments/indented.png)',
      '<div data-example="![html](attachments/html.png)"></div>',
      '<code>![html-code](attachments/html-code.png)</code>',
      '<pre>',
      '![html-block](attachments/html-block.png)',
      '</pre>',
      '<!--',
      '![html-comment](attachments/html-comment.png)',
      '-->',
      '<img src="cover.png">',
      '![after-void-img](attachments/after-void-img.png)',
      '<br>',
      '![after-br](attachments/after-br.png)',
      '<hr>',
      '![after-hr](attachments/after-hr.png)',
      '[![linked](attachments/linked.png)](https://example.com)',
      '[文字 ![linked-mid](attachments/linked-mid.png)](https://example.com)',
      String.raw`\![escaped](attachments/escaped.png)`,
      '正文 ![real](attachments/real.png)',
    ].join('\n');

    const { markdown: output } = preprocessMarkdownForTriplet(input, {});
    expect(output).toContain('`![alt](attachments/a.png)`');
    expect(output).toContain('    ![indented](attachments/indented.png)');
    expect(output).toContain('<div data-example="![html](attachments/html.png)"></div>');
    expect(output).toContain('<code>![html-code](attachments/html-code.png)</code>');
    expect(output).toContain('<pre>\n![html-block](attachments/html-block.png)\n</pre>');
    expect(output).toContain('![html-comment](attachments/html-comment.png)');
    expect(output).not.toContain('<img src="attachments/html-comment.png"');
    expect(output).toContain('<img src="attachments/after-void-img.png" alt="after-void-img">');
    expect(output).toContain('<img src="attachments/after-br.png" alt="after-br">');
    expect(output).toContain('<img src="attachments/after-hr.png" alt="after-hr">');
    expect(output).toContain('[![linked](attachments/linked.png)](https://example.com)');
    expect(output).toContain('[文字 ![linked-mid](attachments/linked-mid.png)](https://example.com)');
    expect(output).toContain(String.raw`\![escaped](attachments/escaped.png)`);
    expect(output).toContain('<img src="attachments/real.png" alt="real">');
  });

  it('should preprocess image-swipe callouts into marked raw html', () => {
    const input = [
      'before',
      '> [!image-swipe] 左右滑动查看步骤图',
      '> ![[assets/first image.png|第一张]]',
      '> ![第二张](<assets/second image.png>)',
      'after',
    ].join('\n');

    const { markdown: output } = preprocessMarkdownForTriplet(input, {});

    expect(output).toContain('data-owc-image-swipe="1"');
    expect(output).toContain('data-owc-image-swipe-type="image-swipe"');
    expect(output).toContain('data-owc-image-swipe-hint="%E5%B7%A6%E5%8F%B3');
    expect(output).toContain('<img src="assets/first%20image.png" alt="第一张">');
    expect(output).toContain('<img src="assets/second%20image.png" alt="第二张">');
    expect(output).not.toContain('[!image-swipe]');
  });

  it('should preprocess image-sensitive callouts with a warning panel and multiple images', () => {
    const input = [
      '> [!image-sensitive] 此类图片可能引发不适，向左滑动查看',
      '> ![图一](images/a.png)',
      '> ![[images/b.png|图二]]',
    ].join('\n');

    const { markdown: output } = preprocessMarkdownForTriplet(input, {});

    expect(output).toContain('data-owc-image-swipe="1"');
    expect(output).toContain('data-owc-image-swipe-type="image-sensitive"');
    expect(output).toContain('data-owc-image-swipe-warning="%E6%AD%A4%E7%B1%BB');
    expect(output).toContain('<img src="images/a.png" alt="图一">');
    expect(output).toContain('<img src="images/b.png" alt="图二">');
  });

  it('should preserve remote image-swipe callouts for Obsidian image rendering', () => {
    const input = [
      '> [!image-swipe] 左右滑动查看图床图片',
      '> ![远程一|400](https://cdn.example.com/a.png?x=1&y=2)',
      '> https://img.example.com/b.jpg',
      '> <//img.example.com/c.webp>',
    ].join('\n');

    const { markdown: output } = preprocessMarkdownForTriplet(input, {});

    expect(output).toContain('> [!image-swipe] 左右滑动查看图床图片');
    expect(output).toContain('> ![远程一|400](https://cdn.example.com/a.png?x=1&y=2)');
    expect(output).toContain('> ![](https://img.example.com/b.jpg)');
    expect(output).toContain('> ![](//img.example.com/c.webp)');
    expect(output).not.toContain('data-owc-image-swipe="1"');
  });

  it('should leave fenced image-sensitive syntax untouched', () => {
    const input = [
      ':::image-sensitive 此类图片可能引发不适，向左滑动查看',
      '![图一](images/a.png)',
      ':::',
    ].join('\n');

    const { markdown: output } = preprocessMarkdownForTriplet(input, {});

    expect(output).toContain(':::image-sensitive 此类图片可能引发不适，向左滑动查看');
    expect(output).not.toContain('data-owc-image-swipe="1"');
  });

  it('should not preprocess image-swipe examples inside fenced code blocks', () => {
    const input = [
      '```markdown',
      '> [!image-swipe] 左右滑动查看图片',
      '> ![A](a.png)',
      '```',
      '',
      '> [!image-sensitive] 此类图片可能引发不适',
      '> ![B](b.png)',
    ].join('\n');

    const { markdown: output } = preprocessMarkdownForTriplet(input, {});

    expect(output).toContain('```markdown');
    expect(output).toContain('> [!image-swipe] 左右滑动查看图片');
    expect(output).toContain('> ![A](a.png)');
    expect(output).toContain('data-owc-image-swipe-type="image-sensitive"');
    expect(output).not.toContain('<img src="a.png" alt="A">');
  });

  it('should keep inline-code wikilinks unescaped while neutralizing plain wikilinks', () => {
    const input = '正文 [[目标文档]] 与 `[[标题]]`';

    const { markdown: output } = preprocessMarkdownForTriplet(input, {});
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

    const { markdown: output } = preprocessMarkdownForTriplet(input, {});
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
    expect(output).toContain('> 引用块第一行<br>\n> *引用块第二行*');
    expect(output).not.toContain('> [!note]<br>\n> callout 内容');
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

  it('should detect Mermaid fences for async observe window', () => {
    expect(shouldObserveMermaidRenderWindow('纯文本')).toBe(false);
    expect(shouldObserveMermaidRenderWindow('```mermaid\ngraph TD\nA-->B\n```')).toBe(true);
    expect(shouldObserveMermaidRenderWindow('~~~mermaid\nflowchart LR\nA-->B\n~~~')).toBe(true);
    expect(shouldObserveMermaidRenderWindow('````markdown\n```mermaid\ngraph TD\nA-->B\n```\n````')).toBe(false);
  });

  describe('escapePseudoHtmlTags edge cases', () => {
    it('should preserve inline code content with pseudo-tags', () => {
      const input = 'Use `<Title>` tag in your code';
      const { markdown: output } = preprocessMarkdownForTriplet(input, {});
      // Inline code should be preserved as-is
      expect(output).toContain('`<Title>`');
      expect(output).not.toContain('`&lt;Title>`');
    });

    it('should escape pseudo-tags outside inline code', () => {
      const input = 'File: <Title>_xxx_MS.pdf and code: `<Title>`';
      const { markdown: output } = preprocessMarkdownForTriplet(input, {});
      // Outside inline code should be escaped
      expect(output).toContain('&lt;Title&gt;_xxx_MS.pdf');
      // Inside inline code should be preserved
      expect(output).toContain('`<Title>`');
    });

    it('should handle nested fences with different lengths (4 backticks outer, 3 inner)', () => {
      const input = [
        '````markdown',
        '```code',
        '<Tag>inside nested fence</Tag>',
        '```',
        '````',
        '<Tag>outside fence</Tag>',
      ].join('\n');
      const { markdown: output } = preprocessMarkdownForTriplet(input, {});
      // Content inside nested fence should be preserved
      expect(output).toContain('<Tag>inside nested fence</Tag>');
      // Content outside fence should be escaped
      expect(output).toContain('&lt;Tag&gt;outside fence');
    });

    it('should handle pseudo-tags with attributes', () => {
      const input = '<CustomTag attr="value">text</CustomTag>';
      const { markdown: output } = preprocessMarkdownForTriplet(input, {});
      expect(output).toContain('&lt;CustomTag');
    });

    it('should preserve known HTML tags', () => {
      const input = '<div class="test"><span>content</span></div>';
      const { markdown: output } = preprocessMarkdownForTriplet(input, {});
      // Known tags should not be escaped
      expect(output).toContain('<div');
      expect(output).toContain('<span');
    });

    it('should not close backtick fence with tilde fence (mixed marker)', () => {
      const input = [
        '```js',
        '<Tag>inside code block</Tag>',
        '~~~',
        'still inside backtick block',
        '```',
        '<Tag>outside fence</Tag>',
      ].join('\n');
      const { markdown: output } = preprocessMarkdownForTriplet(input, {});
      // Content after ~~~ should still be preserved (~~~ didn't close the ``` block)
      expect(output).toContain('<Tag>inside code block</Tag>');
      expect(output).toContain('still inside backtick block');
      // Content after proper closing should be escaped
      expect(output).toContain('&lt;Tag&gt;outside fence');
    });

    it('should preserve multi-backtick inline code spans', () => {
      const input = 'Inline ``<Title>`` and outside <Title>.';
      const { markdown: output } = preprocessMarkdownForTriplet(input, {});
      // Double-backtick code span should be preserved
      expect(output).toContain('``<Title>``');
      // Outside should be escaped
      expect(output).toContain('&lt;Title&gt;.');
      expect(output).not.toContain('&lt;Title&gt;``');
    });

    it('should preserve triple-backtick inline code spans', () => {
      const input = 'Code: ```<Tag>``` and outside <Tag>.';
      const { markdown: output } = preprocessMarkdownForTriplet(input, {});
      // Triple-backtick code span should be preserved
      expect(output).toContain('```<Tag>```');
      // Outside should be escaped
      expect(output).toContain('&lt;Tag&gt;.');
    });

    it('should handle fenced blocks with leading spaces (0-3 spaces)', () => {
      const input = [
        '   ```js',
        '<Tag>inside indented fence</Tag>',
        '   ```',
        '<Tag>outside fence</Tag>',
      ].join('\n');
      const { markdown: output } = preprocessMarkdownForTriplet(input, {});
      // Content inside indented fence should be preserved
      expect(output).toContain('<Tag>inside indented fence</Tag>');
      // Content outside fence should be escaped
      expect(output).toContain('&lt;Tag&gt;outside fence');
    });

    it('should handle fenced blocks with leading spaces + mixed marker', () => {
      const input = [
        '  ```js',
        '<Tag>inside</Tag>',
        '  ~~~',
        'still inside (~~~ does not close ```)',
        '  ```',
        '<Tag>outside</Tag>',
      ].join('\n');
      const { markdown: output } = preprocessMarkdownForTriplet(input, {});
      // ~~~ should not close ``` (different marker)
      expect(output).toContain('<Tag>inside</Tag>');
      expect(output).toContain('still inside (~~~ does not close ```)');
      // After proper close, outside content should be escaped
      expect(output).toContain('&lt;Tag&gt;outside');
    });
  });
});
