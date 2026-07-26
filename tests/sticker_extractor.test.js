import { describe, it, expect } from 'vitest';
import { extractMarkdownImageSources, extractStickerData } from '../services/sticker-extractor.js';

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
  });
});
