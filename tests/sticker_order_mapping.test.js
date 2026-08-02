/*
## 核心功能

覆盖微信贴图图片排序、排除与文案 [配图 N] 重新编号的 Vitest 测试用例。

## 输入

接收 sticker-extractor / markdown-cleaner 服务、fixture Markdown 与用户排序数据。

## 输出

输出自动化断言结果，保护拖拽排序后文案序号与图片网格顺序一致。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest 与被测的 sticker-extractor / markdown-cleaner 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect } from 'vitest';
import {
  extractStickerData,
  reconcileStickerImageOrder,
  STICKER_MAX_IMAGES,
} from '../services/sticker-extractor.js';
import { cleanMarkdownToPlainText, normalizeImageKey } from '../services/markdown-cleaner.js';

describe('reconcileStickerImageOrder', () => {
  it('should keep the default body order when the user has not touched anything', () => {
    const result = reconcileStickerImageOrder({
      defaultImages: ['a.png', 'b.png', 'c.png'],
      order: [],
      removedKeys: [],
    });
    expect(result).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('should keep the user order and append newly added body images', () => {
    const result = reconcileStickerImageOrder({
      defaultImages: ['a.png', 'b.png', 'c.png', 'd.png'],
      order: ['c.png', 'a.png', 'b.png'],
      removedKeys: [],
    });
    expect(result).toEqual(['c.png', 'a.png', 'b.png', 'd.png']);
  });

  it('should drop images that no longer exist in the note', () => {
    const result = reconcileStickerImageOrder({
      defaultImages: ['a.png', 'c.png'],
      order: ['c.png', 'b.png', 'a.png'],
      removedKeys: [],
    });
    expect(result).toEqual(['c.png', 'a.png']);
  });

  it('should never bring back images the user explicitly excluded', () => {
    const result = reconcileStickerImageOrder({
      defaultImages: ['a.png', 'b.png', 'c.png'],
      order: ['c.png', 'a.png'],
      removedKeys: ['b.png'],
    });
    expect(result).toEqual(['c.png', 'a.png']);
  });

  it('should match images written with different paths but the same file name', () => {
    const result = reconcileStickerImageOrder({
      defaultImages: ['attachments/a.png', 'b.png'],
      order: ['b.png', 'a.png'],
      removedKeys: [],
    });
    // 以正文中的最新写法为准
    expect(result).toEqual(['b.png', 'attachments/a.png']);
  });

  it('should cap the result at the public api image limit', () => {
    const many = Array.from({ length: 25 }, (_, i) => `img-${i}.png`);
    const result = reconcileStickerImageOrder({ defaultImages: many, order: [], removedKeys: [] });
    expect(result).toHaveLength(STICKER_MAX_IMAGES);
  });
});

describe('normalizeImageKey', () => {
  it('should compare by decoded full path and ignore query/anchor noise', () => {
    expect(normalizeImageKey('attachments/My%20Pic.PNG')).toBe('attachments/my pic.png');
    expect(normalizeImageKey('a.png?v=2')).toBe('a.png');
    expect(normalizeImageKey('a.png#anchor')).toBe('a.png');
  });

  it('should not treat 1.png and 11.png as the same image', () => {
    expect(normalizeImageKey('1.png')).not.toBe(normalizeImageKey('11.png'));
  });

  it('should not collapse the same basename from different folders', () => {
    expect(normalizeImageKey('a/cover.png')).not.toBe(normalizeImageKey('b/cover.png'));
  });
});

describe('[配图 N] renumbering after reorder', () => {
  const markdown = [
    '第一段',
    '![[a.png]]',
    '第二段',
    '![[b.png]]',
    '第三段',
    '![[c.png]]',
  ].join('\n\n');

  it('should number markers by body order when no reorder happened', () => {
    const { content } = extractStickerData({ markdown, insertImageIndex: true });
    expect(content).toContain('[配图 1]');
    expect(content.indexOf('[配图 1]')).toBeLessThan(content.indexOf('[配图 2]'));
    expect(content.indexOf('[配图 2]')).toBeLessThan(content.indexOf('[配图 3]'));
  });

  it('should remap markers to the dragged grid order', () => {
    const { content, images } = extractStickerData({
      markdown,
      insertImageIndex: true,
      imageOrder: ['c.png', 'a.png', 'b.png'],
    });

    expect(images).toEqual(['c.png', 'a.png', 'b.png']);
    // a.png 现在排第 2，c.png 排第 1：正文里的序号要跟着图片网格走
    const lines = content.split('\n').filter(Boolean);
    expect(lines).toEqual(['第一段', '[配图 2]', '第二段', '[配图 3]', '第三段', '[配图 1]']);
  });

  it('should drop the marker of an excluded image', () => {
    const { content, images } = extractStickerData({
      markdown,
      insertImageIndex: true,
      removedImageKeys: ['b.png'],
    });

    expect(images).toEqual(['a.png', 'c.png']);
    expect(content).toContain('[配图 1]');
    expect(content).toContain('[配图 2]');
    expect(content).not.toContain('[配图 3]');
  });

  it('should keep markers when the full body paths are present in the grid order', () => {
    const result = cleanMarkdownToPlainText('![GeminiGeneratedImage-a.png](attachments/a.png)\n\n![[attachments/b.png|自定义名称]]', {
      insertImageIndex: true,
      imageOrder: ['attachments/b.png', 'attachments/a.png'],
    });
    expect(result.text.split('\n').filter(Boolean)).toEqual(['[配图 2]', '[配图 1]']);
    expect(result.text).not.toContain('GeminiGeneratedImage');
    expect(result.text).not.toContain('自定义名称');
  });
});
