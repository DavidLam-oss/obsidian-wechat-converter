/*
## 核心功能

验证贴图图片项解析为微信 media_id 时的素材复用、账号隔离与失败重试缓存。

## 输入

接收正文、本地上传、素材库图片项，以及 mock 微信上传 API 和缓存。

## 输出

输出 media_id 顺序、成功缓存复用和跨账号拦截断言。

## 定位

位于 tests/，保护贴图同步的 API 配额与账号安全边界。

## 依赖

关键依赖：Vitest、services/sticker-image-items.js 与 services/sticker-media-resolver.js。

## 维护规则

- 缓存、重试或账号规则变化时必须覆盖成功复用、失败重传和跨账号阻断。
- 所有网络行为必须使用 mock，测试不得调用真实微信接口。
*/

import { describe, expect, it, vi } from 'vitest';
import {
  createBodyStickerImageItem,
  createMaterialStickerImageItem,
  createUploadStickerImageItem,
} from '../services/sticker-image-items.js';
import { resolveStickerMediaIds } from '../services/sticker-media-resolver.js';

describe('sticker media resolver', () => {
  it('reuses account-owned material without uploading', async () => {
    const api = { uploadCover: vi.fn() };
    const material = createMaterialStickerImageItem({
      mediaId: 'material-1',
      accountId: 'acc-1',
    });

    const result = await resolveStickerMediaIds({
      items: [material],
      account: { id: 'acc-1' },
      api,
      srcToBlob: vi.fn(),
    });

    expect(result).toEqual(['material-1']);
    expect(api.uploadCover).not.toHaveBeenCalled();
  });

  it('blocks material selected from another account', async () => {
    const material = createMaterialStickerImageItem({
      mediaId: 'material-1',
      accountId: 'acc-a',
    });

    await expect(resolveStickerMediaIds({
      items: [material],
      account: { id: 'acc-b' },
      api: { uploadCover: vi.fn() },
      srcToBlob: vi.fn(),
    })).rejects.toThrow('属于其他公众号');
  });

  it('keeps successful uploads in retry cache while failed items remain uncached', async () => {
    const first = createBodyStickerImageItem('a.png');
    const second = createUploadStickerImageItem({
      blob: { name: 'b.png' },
      fingerprint: 'b-fingerprint',
      displaySrc: 'blob:b',
      name: 'b.png',
    });
    const cache = new Map();
    const uploadCover = vi.fn()
      .mockResolvedValueOnce({ media_id: 'media-a' })
      .mockRejectedValueOnce(new Error('配额暂不可用'))
      .mockResolvedValueOnce({ media_id: 'media-b' });
    const api = { uploadCover };
    const srcToBlob = vi.fn(async () => ({ name: 'a.png' }));

    await expect(resolveStickerMediaIds({
      items: [first, second],
      account: { id: 'acc-1' },
      api,
      srcToBlob,
      cache,
    })).rejects.toThrow('第 2 张图片上传失败');

    const retry = await resolveStickerMediaIds({
      items: [first, second],
      account: { id: 'acc-1' },
      api,
      srcToBlob,
      cache,
    });

    expect(retry).toEqual(['media-a', 'media-b']);
    expect(uploadCover).toHaveBeenCalledTimes(3);
    expect(srcToBlob).toHaveBeenCalledTimes(1);
  });
});
