/*
## 核心功能

覆盖多平台发布中的本地图片、封面资源、远程微信素材封面和缓存行为。
*/

/*
## 核心功能

覆盖多平台发布的本地图片、封面和微信素材资源回归行为。

## 输入

Vitest、发布弹窗 fixture、模拟的 Vault 文件和素材下载响应。

## 输出

资源转换、缓存复用、封面校验和错误提示的回归断言。

## 定位

位于 tests/，是多平台发布资源处理回归测试。

## 依赖

关键依赖：Vitest、`./helpers/multi-platform-modal-fixtures.js`。

## 维护规则

- 只使用本地 fixture 和模拟请求，不触达真实网络或凭据。
- 修改资源字段或缓存策略时同步更新对应断言。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  obsidian,
  makeView,
  installModalCapture,
} from './helpers/multi-platform-modal-fixtures.js';

describe('multi-platform modal image and cover assets', () => {
  let modalCapture;

  beforeEach(() => {
    modalCapture = installModalCapture();
  });

  it('sends local markdown images as bridge assets and rewrites local HTML src values', async () => {
    const imageFile = {
      path: 'notes/assets/local.png',
      name: 'local.png',
      extension: 'png',
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]),
    };
    const app = {
      isMobile: false,
      metadataCache: {
        getFirstLinkpathDest: vi.fn((linkpath) => (linkpath === 'assets/local.png' ? imageFile : null)),
      },
      vault: {
        readBinary: vi.fn(async () => imageFile.bytes),
        getResourcePath: vi.fn(() => 'app://local/notes%2Fassets%2Flocal.png'),
        getAbstractFileByPath: vi.fn(() => null),
      },
    };
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge, app });
    view.lastResolvedMarkdown = '![图](assets/local.png)';
    view.getCurrentExportHtml = vi.fn(() => '<p><img src="app://local/notes%2Fassets%2Flocal.png" alt="图"></p>');
    view.prepareHtmlForWechatsyncArticle = vi.fn(async (html) => html);
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      markdown: '![图](asset://image-1)',
      content: '<p><img src="asset://image-1" alt="图"></p>',
      cover: 'asset://image-1',
      assets: [expect.objectContaining({
        id: 'image-1',
        filename: 'local.png',
        mimeType: 'image/png',
        base64: imageFile.bytes.toString('base64'),
      })],
    }));
  });

  it('uses frontmatter local cover as a bridge asset and reuses it for the first body image', async () => {
    const imageFile = {
      path: 'notes/assets/cover.png',
      name: 'cover.png',
      extension: 'png',
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 5, 6, 7, 8]),
    };
    const app = {
      isMobile: false,
      metadataCache: {
        getFirstLinkpathDest: vi.fn((linkpath) => (linkpath === 'assets/cover.png' ? imageFile : null)),
      },
      vault: {
        readBinary: vi.fn(async () => imageFile.bytes),
        getResourcePath: vi.fn(() => 'app://local/notes%2Fassets%2Fcover.png'),
        getAbstractFileByPath: vi.fn(() => null),
      },
    };
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge, app });
    view.lastResolvedMarkdown = '![封面](assets/cover.png)';
    view.getFrontmatterPublishMeta = vi.fn(() => ({ cover: 'assets/cover.png', coverSrc: 'app://local/notes%2Fassets%2Fcover.png' }));
    view.getCurrentExportHtml = vi.fn(() => '<p><img src="app://local/notes%2Fassets%2Fcover.png" alt="封面"></p>');
    view.prepareHtmlForWechatsyncArticle = vi.fn(async (html) => html);
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      markdown: '![封面](asset://image-1)',
      content: '<p><img src="asset://image-1" alt="封面"></p>',
      cover: 'asset://image-1',
      assets: [expect.objectContaining({ id: 'image-1', filename: 'cover.png' })],
    }));
  });

  it('ignores app resource session cover and resolves the original frontmatter cover path', async () => {
    const imageFile = {
      path: 'Wechat/published/img/cover-combined.jpg',
      name: 'cover-combined.jpg',
      extension: 'jpg',
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00, 9, 10]),
    };
    const app = {
      isMobile: false,
      metadataCache: {
        getFirstLinkpathDest: vi.fn((linkpath) => (
          linkpath === 'Wechat/published/img/cover-combined.jpg' ? imageFile : null
        )),
      },
      vault: {
        readBinary: vi.fn(async () => imageFile.bytes),
        getResourcePath: vi.fn(() => 'app://local/Users/demo/Vault/Wechat/published/img/cover-combined.jpg?123'),
        getAbstractFileByPath: vi.fn(() => null),
      },
    };
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge, app });
    view.sessionCoverBase64 = 'app://local/Users/demo/Vault/Wechat/published/img/cover-combined.jpg?123';
    view.lastResolvedMarkdown = '正文';
    view.getFrontmatterPublishMeta = vi.fn(() => ({
      cover: 'Wechat/published/img/cover-combined.jpg',
      coverSrc: 'app://local/Users/demo/Vault/Wechat/published/img/cover-combined.jpg?123',
    }));
    view.prepareHtmlForWechatsyncArticle = vi.fn(async (html) => html);
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      cover: 'asset://image-1',
      assets: [expect.objectContaining({
        id: 'image-1',
        filename: 'cover-combined.jpg',
        mimeType: 'image/jpeg',
      })],
    }));
  });

  it('downloads selected WeChat material cover and sends it as a bridge asset', async () => {
    obsidian.requestUrl = vi.fn(async () => ({
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0x11]).buffer,
      headers: { 'content-type': 'image/jpeg' },
    }));
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge });
    view.sessionThumbMediaId = 'thumb-from-material';
    view.sessionCoverBase64 = 'https://mmbiz.qpic.cn/mmbiz_jpg/material-cover/0?wx_fmt=jpeg';
    view.lastResolvedMarkdown = '正文';
    view.getFrontmatterPublishMeta = vi.fn(() => ({ cover: 'assets/fallback.png', coverSrc: '' }));
    view.getFirstImageFromArticle = vi.fn(() => 'https://example.com/fallback.png');
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    expect(obsidian.requestUrl).toHaveBeenCalledWith({
      url: 'https://mmbiz.qpic.cn/mmbiz_jpg/material-cover/0?wx_fmt=jpeg',
      method: 'GET',
    });
    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      cover: 'asset://image-1',
      assets: [expect.objectContaining({
        id: 'image-1',
        filename: '0.jpg',
        mimeType: 'image/jpeg',
        source: expect.objectContaining({ kind: 'wechat-material-cover', thumbMediaId: 'thumb-from-material' }),
      })],
    }));
  });

  it('reuses cached downloaded WeChat material cover assets for later bridge sends', async () => {
    obsidian.requestUrl = vi.fn(async () => ({
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0x22]).buffer,
      headers: { 'content-type': 'image/jpeg' },
    }));
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge });
    view.sessionThumbMediaId = 'thumb-from-material';
    view.sessionCoverBase64 = 'https://mmbiz.qpic.cn/mmbiz_jpg/material-cover/1?wx_fmt=jpeg';
    view.lastResolvedMarkdown = '正文';
    view.getFrontmatterPublishMeta = vi.fn(() => ({ cover: '', coverSrc: '' }));
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    let modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();
    await view.showMultiPlatformSyncModal();
    modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    const materialRequests = obsidian.requestUrl.mock.calls
      .map((call) => call[0])
      .filter((request) => String(request?.url || '').includes('mmbiz.qpic.cn'));
    expect(materialRequests).toHaveLength(1);
    expect(bridge.enqueueSyncArticle).toHaveBeenCalledTimes(2);
    expect(view.wechatMaterialCoverAssetCache.size).toBe(1);
    expect(bridge.enqueueSyncArticle.mock.calls[1][0]).toEqual(expect.objectContaining({
      cover: 'asset://image-1',
      assets: [expect.objectContaining({
        id: 'image-1',
        filename: '1.jpg',
        base64: Buffer.from([0xff, 0xd8, 0xff, 0x22]).toString('base64'),
      })],
    }));
  });

  it('does not enqueue when a selected WeChat material cover has no downloadable URL', async () => {
    obsidian.requestUrl = vi.fn();
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge });
    view.sessionThumbMediaId = 'thumb-from-material';
    view.sessionCoverBase64 = '';
    view.lastResolvedMarkdown = '正文';
    view.showMultiPlatformSyncResultModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    const materialRequests = obsidian.requestUrl.mock.calls
      .map((call) => call[0])
      .filter((request) => String(request?.url || '').includes('mmbiz.qpic.cn'));
    expect(materialRequests).toHaveLength(0);
    expect(bridge.enqueueSyncArticle).not.toHaveBeenCalled();
    expect(view.showMultiPlatformSyncResultModal).toHaveBeenCalledWith(expect.objectContaining({
      fatalError: expect.any(Error),
    }));
  });

  it('does not enqueue when a selected WeChat material cover downloads as a non-image', async () => {
    obsidian.requestUrl = vi.fn(async () => ({
      arrayBuffer: async () => new TextEncoder().encode('<html></html>').buffer,
      headers: { 'content-type': 'text/html' },
    }));
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge });
    view.sessionThumbMediaId = 'thumb-from-material';
    view.sessionCoverBase64 = 'https://mmbiz.qpic.cn/material-cover/not-image';
    view.lastResolvedMarkdown = '正文';
    view.showMultiPlatformSyncResultModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    const materialRequests = obsidian.requestUrl.mock.calls
      .map((call) => call[0])
      .filter((request) => String(request?.url || '').includes('mmbiz.qpic.cn'));
    expect(materialRequests).toHaveLength(1);
    expect(bridge.enqueueSyncArticle).not.toHaveBeenCalled();
    expect(view.showMultiPlatformSyncResultModal.mock.calls[0][0].fatalError.message).toContain('格式不支持');
  });
});
