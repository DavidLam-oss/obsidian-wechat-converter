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

  it('should prioritize Frontmatter images and limit total to 9', () => {
    const frontmatter = {
      title: 'FM 标题',
      cover: 'cover.jpg',
      images: ['img1.png', 'img2.png']
    };

    const md = `
![[img2.png]]
![[img3.png]]
![[img4.png]]
![[img5.png]]
![[img6.png]]
![[img7.png]]
![[img8.png]]
![[img9.png]]
![[img10.png]]
![[img11.png]]
`;

    const data = extractStickerData({
      markdown: md,
      frontmatter,
      fallbackTitle: '默认标题'
    });

    expect(data.title).toBe('FM 标题');
    expect(data.images[0]).toBe('cover.jpg');
    expect(data.images[1]).toBe('img1.png');
    expect(data.images[2]).toBe('img2.png');
    expect(data.images.length).toBe(9); // 最多 9 张
    expect(data.imageItems).toHaveLength(9);
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
    expect(data.content).toBe('');
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

  it('should use an injected canonical body identity', () => {
    const items = extractMarkdownImageItems('![[../assets/Cover.PNG]]', {
      resolveBodyImageIdentity: () => 'articles/assets/Cover.PNG',
    });
    expect(items[0].key).toBe('body:articles/assets/cover.png');
  });
});
