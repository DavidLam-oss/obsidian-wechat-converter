/*
## 核心功能

验证微信贴图草稿服务会按账号评论设置调用 createImageDraft。

## 输入

接收 mock 微信 API、公众号账号、贴图标题文案与 media_id 列表。

## 输出

输出草稿结果映射与不支持 API 时的错误断言。

## 定位

位于 tests/，保护 services/wechat-sync.js 的贴图草稿契约。

## 依赖

关键依赖：Vitest 与 services/wechat-sync.js。

## 维护规则

- 贴图草稿 API 参数或错误语义变化时同步更新契约断言。
- 所有 API 行为必须使用 mock，测试不得访问真实公众号。
*/

import { describe, it, expect, vi } from 'vitest';
import { syncStickerDraft } from '../services/wechat-sync.js';

describe('wechat-sync - syncStickerDraft', () => {
  it('should call api.createImageDraft with account comments options', async () => {
    const mockApi = {
      createImageDraft: vi.fn().mockResolvedValue({ media_id: 'sticker-123' })
    };

    const account = {
      appId: 'wx123',
      appSecret: 'secret123',
      openComment: true,
      onlyFansCanComment: false
    };

    const result = await syncStickerDraft({
      account,
      api: mockApi,
      title: '测试贴图',
      content: '纯文本内容',
      imageMediaIds: ['media-1', 'media-2']
    });

    expect(result).toEqual({ mediaId: 'sticker-123' });
    expect(mockApi.createImageDraft).toHaveBeenCalledWith({
      title: '测试贴图',
      content: '纯文本内容',
      imageMediaIds: ['media-1', 'media-2'],
      needOpenComment: 1,
      onlyFansCanComment: 0
    });
  });

  it('should throw error when api instance does not support createImageDraft', async () => {
    const invalidApi = {};
    const account = { appId: 'wx123', appSecret: 'secret123' };

    await expect(
      syncStickerDraft({
        account,
        api: invalidApi,
        title: '测试',
        imageMediaIds: ['m1']
      })
    ).rejects.toThrow('当前微信 API 实例未支持 createImageDraft 方法');
  });
});
