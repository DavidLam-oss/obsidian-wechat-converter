import { describe, it, expect, vi } from 'vitest';
const { createWechatSyncService } = require('../services/wechat-sync');

describe('Wechat Sync Service', () => {
  function createMockApi() {
    return {
      uploadCover: vi.fn(async () => ({ media_id: 'thumb-1' })),
      uploadImage: vi.fn(async () => ({ url: 'https://wx.image/1' })),
      createDraft: vi.fn(async () => ({ media_id: 'draft-1' })),
    };
  }

  it('should run full sync pipeline and return cleanup result', async () => {
    const api = createMockApi();
    const createApi = vi.fn(() => api);

    const service = createWechatSyncService({
      createApi,
      srcToBlob: vi.fn(async () => new Blob(['cover'], { type: 'image/png' })),
      processAllImages: vi.fn(async () => '<p>with <svg></svg></p>'),
      processMathFormulas: vi.fn(async () => '<p>done</p>'),
      cleanHtmlForDraft: vi.fn(() => '<p>done</p>'),
      cleanupConfiguredDirectory: vi.fn(async () => ({ attempted: true, success: true })),
      getFirstImageFromArticle: vi.fn(() => 'app://fallback-cover'),
    });

    const onStatus = vi.fn();
    const onImageProgress = vi.fn();
    const onMathProgress = vi.fn();

    const result = await service.syncToDraft({
      account: { appId: 'wx1', appSecret: 'sec', author: 'author1' },
      proxyUrl: 'https://proxy.example',
      currentHtml: '<p>x</p>',
      activeFile: { basename: 'note-title' },
      publishMeta: { coverSrc: null },
      sessionCoverBase64: 'data:image/png;base64,abc',
      sessionDigest: 'digest',
      onStatus,
      onImageProgress,
      onMathProgress,
    });

    expect(createApi).toHaveBeenCalledWith('wx1', 'sec', 'https://proxy.example');
    expect(api.uploadCover).toHaveBeenCalledTimes(1);
    expect(api.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      title: 'note-title',
      thumb_media_id: 'thumb-1',
      author: 'author1',
      digest: 'digest',
      content: '<p>done</p>',
    }));
    expect(onStatus).toHaveBeenCalledWith('cover');
    expect(onStatus).toHaveBeenCalledWith('images');
    expect(onStatus).toHaveBeenCalledWith('math');
    expect(onStatus).toHaveBeenCalledWith('draft');
    expect(result.cleanupResult).toEqual({ attempted: true, success: true });
  });

  it('should pass accountId cache context into image processing', async () => {
    const api = createMockApi();
    const createApi = vi.fn(() => api);
    const processAllImages = vi.fn(async () => '<p>x</p>');
    const service = createWechatSyncService({
      createApi,
      srcToBlob: vi.fn(async () => new Blob(['cover'], { type: 'image/png' })),
      processAllImages,
      processMathFormulas: vi.fn(async () => '<p>x</p>'),
      cleanHtmlForDraft: vi.fn((html) => html),
      cleanupConfiguredDirectory: vi.fn(async () => ({ attempted: false })),
      getFirstImageFromArticle: vi.fn(() => 'app://fallback-cover'),
    });

    await service.syncToDraft({
      account: { id: 'acc-1', appId: 'wx1', appSecret: 'sec' },
      proxyUrl: '',
      currentHtml: '<p>x</p>',
      activeFile: { basename: 'note-title' },
      publishMeta: { coverSrc: null },
      sessionCoverBase64: 'data:image/png;base64,abc',
      sessionDigest: '',
    });

    expect(processAllImages).toHaveBeenCalledWith(
      '<p>x</p>',
      api,
      expect.any(Function),
      { accountId: 'acc-1' }
    );
  });

  it('should throw when no cover source is available', async () => {
    const service = createWechatSyncService({
      createApi: vi.fn(() => createMockApi()),
      srcToBlob: vi.fn(),
      processAllImages: vi.fn(),
      processMathFormulas: vi.fn(),
      cleanHtmlForDraft: vi.fn(),
      cleanupConfiguredDirectory: vi.fn(),
      getFirstImageFromArticle: vi.fn(() => null),
    });

    await expect(service.syncToDraft({
      account: { appId: 'wx1', appSecret: 'sec' },
      proxyUrl: '',
      currentHtml: '<p>x</p>',
      activeFile: null,
      publishMeta: { coverSrc: null },
      sessionCoverBase64: '',
      sessionDigest: '',
    })).rejects.toThrow('未设置封面图，同步失败。请在弹窗中上传封面。');
  });

  it('should block when cleaned html still contains base64 images', async () => {
    const service = createWechatSyncService({
      createApi: vi.fn(() => createMockApi()),
      srcToBlob: vi.fn(async () => new Blob(['cover'], { type: 'image/png' })),
      processAllImages: vi.fn(async () => '<p>x</p>'),
      processMathFormulas: vi.fn(async () => '<p>x</p>'),
      cleanHtmlForDraft: vi.fn(() => '<img src="data:image/png;base64,abc">'),
      cleanupConfiguredDirectory: vi.fn(async () => ({})),
      getFirstImageFromArticle: vi.fn(() => 'app://fallback-cover'),
    });

    await expect(service.syncToDraft({
      account: { appId: 'wx1', appSecret: 'sec' },
      proxyUrl: '',
      currentHtml: '<p>x</p>',
      activeFile: { basename: 't' },
      publishMeta: { coverSrc: null },
      sessionCoverBase64: 'data:image/png;base64,abc',
      sessionDigest: '',
    })).rejects.toThrow('检测到 1 张图片未成功上传');
  });
});
