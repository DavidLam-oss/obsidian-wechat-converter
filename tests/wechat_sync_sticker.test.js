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
