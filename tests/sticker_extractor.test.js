/*
## 核心功能

覆盖微信贴图正文图片提取、Frontmatter 合并、统一图片项与正文清理标记。

## 输入

接收 Markdown、Frontmatter、路径身份解析器和手动图片项。

## 输出

输出 Vitest 断言结果，保护贴图数据包的图片、标题、内容与清理摘要契约。

## 定位

位于 tests/，是 `services/sticker-extractor.js` 的单元测试。

## 依赖

关键依赖：Vitest、sticker-extractor 与 sticker-image-items。

## 维护规则

- 路径与来源规则变化时必须覆盖同名不同路径和跨来源场景。
- `images` 仅作为兼容适配器，核心断言优先使用 `imageItems`。
*/

import { describe, it, expect } from 'vitest';
import {
  extractMarkdownImageItems,
  extractMarkdownImageSources,
  extractStickerData,
} from '../services/sticker-extractor.js';

describe('sticker-extractor', () => {
  it('should extract images from wiki links and standard markdown images', () => {
    const md = `
# 标题
![[wiki_pic1.png]]
一些文字
![[wiki_pic2.png|alt text]]
![standard](https://example.com/pic3.png)
`;
    const images = extractMarkdownImageSources(md);
    expect(images).toEqual([
      'wiki_pic1.png',
      'wiki_pic2.png',
      'https://example.com/pic3.png'
    ]);
  });

  it('should prioritize Frontmatter images, limit total to 20, and report omitted images', () => {
    const frontmatter = {
      title: 'FM 标题',
      cover: 'cover.jpg',
      images: ['img1.png', 'img2.png']
    };

    const md = Array.from({ length: 22 }, (_, index) => `![[img${index + 2}.png]]`).join('\n');

    const data = extractStickerData({
      markdown: md,
      frontmatter,
      fallbackTitle: '默认标题'
    });

    expect(data.title).toBe('FM 标题');
    expect(data.images[0]).toBe('cover.jpg');
    expect(data.images[1]).toBe('img1.png');
    expect(data.images[2]).toBe('img2.png');
    expect(data.images.length).toBe(20);
    expect(data.imageItems).toHaveLength(20);
    expect(data.omittedImageCount).toBe(4);
    expect(data.imageItems.every((item) => item.source === 'body')).toBe(true);
  });

  it('should report code blocks and tables flag', () => {
    const md = `
\`\`\`js
console.log(1);
\`\`\`
| A | B |
|---|---|
| 1 | 2 |
`;
    const data = extractStickerData({ markdown: md });
    expect(data.hasCodeBlocks).toBe(true);
    expect(data.hasTables).toBe(true);
    expect(data.content).toBe('【代码】\nconsole.log(1);\nA ｜ B\n1 ｜ 2');
    expect(data.removed).toEqual([
      { kind: 'codeBlocks', count: 1 },
      { kind: 'tables', count: 1 },
    ]);
  });

  it('should keep same-name images from different canonical paths', () => {
    const items = extractMarkdownImageItems('![[a/cover.png]]\n![[b/cover.png]]');
    expect(items.map((item) => item.key)).toEqual([
      'body:a/cover.png',
      'body:b/cover.png',
    ]);
  });

  it('should ignore image syntax inside code, mermaid, comments, and frontmatter', () => {
    const md = [
      '---',
      'sample: "![[frontmatter.png]]"',
      '---',
      '```js',
      '![[code.png]]',
      '```',
      '~~~mermaid',
      '![[diagram.png]]',
      '~~~',
      '%% ![[comment.png]] %%',
      '![[real.png]]',
    ].join('\n');
    expect(extractMarkdownImageSources(md)).toEqual(['real.png']);
  });

  it('should not treat note, pdf, or audio embeds as sticker images', () => {
    const md = [
      '![[real.png]]',
      '![[Other Note]]',
      '![[manual.pdf]]',
      '![[recording.mp3]]',
    ].join('\n');
    const data = extractStickerData({ markdown: md, insertImageIndex: true });
    expect(data.images).toEqual(['real.png']);
    expect(data.content).toBe([
      '[配图 1]',
      '【引用：Other Note】',
      '【附件：manual.pdf】',
      '【附件：recording.mp3】',
    ].join('\n'));
  });

  it('should remove a leading H1 when it duplicates the sticker title', () => {
    const data = extractStickerData({
      markdown: '# 同一个标题\n正文内容',
      frontmatter: { title: '同一个标题' },
    });
    expect(data.title).toBe('同一个标题');
    expect(data.content).toBe('正文内容');
  });

  it('should keep a leading H1 when it differs from the sticker title', () => {
    const data = extractStickerData({
      markdown: '# 正文小节\n正文内容',
      frontmatter: { title: '贴图标题' },
    });
    expect(data.content).toBe('正文小节\n正文内容');
  });

  it('should use an injected canonical body identity', () => {
    const items = extractMarkdownImageItems('![[../assets/Cover.PNG]]', {
      resolveBodyImageIdentity: () => 'articles/assets/Cover.PNG',
    });
    expect(items[0].key).toBe('body:articles/assets/cover.png');
  });
});
