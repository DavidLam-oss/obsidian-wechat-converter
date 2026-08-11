/*
## 核心功能

验证贴图共用图片列表的顺序移动纯函数。

## 输入

接收任意图片项数组与起止索引。

## 输出

输出稳定重排结果和非法索引不改动原数组的断言。

## 定位

位于 tests/，保护侧栏、鼠标、键盘与触屏排序共用的数据行为。

## 依赖

关键依赖：Vitest 与 views/shared/sticker-image-list.js。

## 维护规则

- 新增排序入口时必须继续复用同一移动纯函数并补边界断言。
- 测试不得依赖真实 DOM 或 Obsidian 运行时。
*/

import { describe, expect, it } from 'vitest';
import { moveStickerImageItem, renderStickerImageList } from '../views/shared/sticker-image-list.js';

const { createObsidianLikeElement } = require('./helpers/obsidian-dom.js');

describe('sticker image list ordering', () => {
  it('moves one item while preserving all other relative positions', () => {
    expect(moveStickerImageItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns a copy for invalid moves', () => {
    const source = ['a', 'b'];
    const result = moveStickerImageItem(source, -1, 1);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
  });

  it('does not collapse shared lists unless the caller opts in', () => {
    const container = createObsidianLikeElement();
    const items = Array.from({ length: 7 }, (_, index) => ({
      key: `image-${index + 1}`,
      source: 'body',
      displaySrc: `app://local/image-${index + 1}.png`,
    }));

    renderStickerImageList(container, { items });

    expect(container.querySelector('.sticker-image-list__toggle')).toBeNull();
    expect(Array.from(container.querySelectorAll('.sticker-image-list__item')).every((cell) => !cell.hidden))
      .toBe(true);
  });
});
