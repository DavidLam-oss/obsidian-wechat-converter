/*
## 核心功能

覆盖微信贴图统一图片项的来源身份、交错排序、删除与九宫格裁剪。

## 输入

接收正文、Blob 上传、公众号素材图片项，以及顺序、删除记录和数量上限。

## 输出

输出 Vitest 断言结果，保护 `imageItems` 作为唯一图片顺序事实源。

## 定位

位于 tests/，是 `services/sticker-image-items.js` 的单元测试。

## 依赖

关键依赖：Vitest 与 sticker-image-items 纯函数。

## 维护规则

- 默认只验证同来源去重；不得新增跨来源自动去重。
- 超限策略变化时必须证明手动项相对顺序仍被保留。
*/

import { describe, expect, it } from 'vitest';
import {
  createBodyStickerImageItem,
  createMaterialStickerImageItem,
  createUploadStickerImageItem,
  reconcileStickerImageItems,
} from '../services/sticker-image-items.js';

describe('sticker image items', () => {
  it('should keep body, upload, and material copies as separate sources', () => {
    const body = createBodyStickerImageItem('assets/a.png');
    const upload = createUploadStickerImageItem({
      blob: new Blob(['same']),
      fingerprint: 'same-content',
      displaySrc: 'blob:preview',
      name: 'a.png',
    });
    const material = createMaterialStickerImageItem({
      accountId: 'account-a',
      mediaId: 'media-a',
      displaySrc: 'https://example.com/a.png',
    });
    const result = reconcileStickerImageItems({
      defaultItems: [body],
      manualItems: [upload, material],
    });
    expect(result.map((item) => item.source)).toEqual(['body', 'upload', 'material']);
  });

  it('should preserve the interleaved user order when body images change', () => {
    const bodyA = createBodyStickerImageItem('a.png');
    const bodyB = createBodyStickerImageItem('b.png');
    const upload = createUploadStickerImageItem({
      blob: new Blob(['upload']),
      fingerprint: 'upload-1',
      displaySrc: 'blob:upload-1',
    });
    const result = reconcileStickerImageItems({
      defaultItems: [bodyA, bodyB],
      manualItems: [upload],
      order: [bodyB.key, upload.key, bodyA.key],
    });
    expect(result.map((item) => item.key)).toEqual([bodyB.key, upload.key, bodyA.key]);
  });

  it('should prefer trimming body items from the tail when over the limit', () => {
    const bodyItems = Array.from({ length: 9 }, (_, index) => createBodyStickerImageItem(`body-${index}.png`));
    const upload = createUploadStickerImageItem({
      blob: new Blob(['upload']),
      fingerprint: 'manual',
      displaySrc: 'blob:manual',
    });
    const result = reconcileStickerImageItems({
      defaultItems: bodyItems,
      manualItems: [upload],
      order: [bodyItems[0].key, upload.key, ...bodyItems.slice(1).map((item) => item.key)],
      limit: 9,
    });
    expect(result).toHaveLength(9);
    expect(result[1].key).toBe(upload.key);
    expect(result.some((item) => item.key === bodyItems[8].key)).toBe(false);
  });

  it('should keep material identity scoped to the owning account', () => {
    const accountA = createMaterialStickerImageItem({ accountId: 'a', mediaId: 'same' });
    const accountB = createMaterialStickerImageItem({ accountId: 'b', mediaId: 'same' });
    expect(accountA.key).not.toBe(accountB.key);
  });
});
