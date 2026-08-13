/*
## 核心功能

覆盖 wechat api 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 wechat api 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');
// Note: We don't use vi.mock('obsidian') here because we use the alias in vitest.config.mjs
// to resolve 'obsidian' to our __mocks__/obsidian.js file.
// To mock specific methods like requestUrl, we modify the required module object directly
// BEFORE importing the module under test (input.js).

describe('WechatAPI - Upload & MIME Logic', () => {
  let WechatAPI;
  let AppleStyleView;
  let obsidianMock;

  const blobToText = async (blob) => {
    if (blob && typeof blob.text === 'function') return blob.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read Blob'));
      reader.readAsText(blob);
    });
  };

  const blobToArrayBuffer = async (blob) => {
    if (blob && typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to read Blob'));
      reader.readAsArrayBuffer(blob);
    });
  };

  const asciiBytes = (text) => Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0)));
  const uint32Le = (value) => Uint8Array.from([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
  const concatBytes = (...parts) => {
    const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let offset = 0;
    parts.forEach((part) => {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  };
  const createChunk = (type, payload) => {
    const padding = payload.length % 2 ? new Uint8Array([0]) : new Uint8Array();
    return concatBytes(asciiBytes(type), uint32Le(payload.length), payload, padding);
  };
  const createWebpBlob = (imageChunk, mimeType = 'image/webp') => {
    const chunk = createChunk(imageChunk, Uint8Array.from([1, 2, 3, 4]));
    const bytes = concatBytes(asciiBytes('RIFF'), uint32Le(chunk.length + 4), asciiBytes('WEBP'), chunk);
    return new Blob([bytes], { type: mimeType });
  };

  const installWebpCanvasHarness = ({ outputMimeType, outputBytes }) => {
    const originalImage = window.Image;
    const originalCreateObjectUrl = window.URL.createObjectURL;
    const originalRevokeObjectUrl = window.URL.revokeObjectURL;
    const createElement = document.createElement.bind(document);
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback, mimeType) => {
      callback(new Blob([outputBytes], { type: outputMimeType || mimeType }));
    });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob,
    };

    class MockImage {
      constructor() {
        this.naturalWidth = 640;
        this.naturalHeight = 360;
        this.onload = null;
        this.onerror = null;
      }

      set src(value) {
        this.currentSrc = value;
        this.onload?.();
      }
    }

    window.Image = MockImage;
    window.URL.createObjectURL = vi.fn(() => 'blob:wechat-webp');
    window.URL.revokeObjectURL = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (tagName === 'canvas') return canvas;
      return createElement(tagName, options);
    });

    return {
      canvas,
      drawImage,
      toBlob,
      restore() {
        createElementSpy.mockRestore();
        window.Image = originalImage;
        window.URL.createObjectURL = originalCreateObjectUrl;
        window.URL.revokeObjectURL = originalRevokeObjectUrl;
      },
    };
  };

  beforeEach(async () => {
    if (typeof Blob.prototype.arrayBuffer !== 'function') {
      Object.defineProperty(Blob.prototype, 'arrayBuffer', {
        configurable: true,
        value() {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('Failed to read Blob'));
            reader.readAsArrayBuffer(this);
          });
        },
      });
    }

    // 1. Reset modules to ensure we get a fresh import of input.js
    vi.resetModules();

    // 2. Get the obsidian mock object (resolved via alias)
    obsidianMock = require('obsidian');

    // 3. Setup the spy on requestUrl
    // We overwrite the method on the exported object so that when input.js
    // does `const { requestUrl } = require('obsidian')`, it grabs this spy.
    obsidianMock.requestUrl = vi.fn().mockResolvedValue({
      json: {},
      status: 200,
      headers: {}
    });

    // 4. Import the module under test
    // This must happen AFTER mocking obsidian.requestUrl
    const inputModule = loadInputModule();
    WechatAPI = inputModule.WechatAPI;
    AppleStyleView = inputModule.AppleStyleView;
  });

  // === Task A: Proxy Upload Optimization (FileReader) ===
  it('should use FileReader for proxy uploads (Perf Optimization)', async () => {
    const api = new WechatAPI('appid', 'secret', 'https://proxy.com');
    const mockBlob = new Blob(['fake-image-data'], { type: 'image/png' });

    obsidianMock.requestUrl.mockResolvedValue({
      json: { media_id: '123', url: 'http://img.com' }
    });

    await api.uploadMultipart('http://wx-api.com', mockBlob, 'media');

    expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(1);
    const callArg = obsidianMock.requestUrl.mock.calls[0][0];
    const body = JSON.parse(callArg.body);

    expect(body.method).toBe('UPLOAD');
    expect(body.fileData).toBe('ZmFrZS1pbWFnZS1kYXRh');
  });

  it('should proxy a lossless WebP as real PNG bytes', async () => {
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
    const harness = installWebpCanvasHarness({ outputMimeType: 'image/png', outputBytes: pngBytes });
    const api = new WechatAPI('appid', 'secret', 'https://proxy.com');
    obsidianMock.requestUrl.mockResolvedValue({ json: { url: 'https://mmbiz.qpic.cn/png' } });

    try {
      await api.uploadMultipart('https://api.weixin.qq.com/cgi-bin/media/uploadimg', createWebpBlob('VP8L'), 'media');

      const body = JSON.parse(obsidianMock.requestUrl.mock.calls[0][0].body);
      expect(body.mimeType).toBe('image/png');
      expect(body.fileName).toBe('image.png');
      expect(body.fileData).toBe(Buffer.from(pngBytes).toString('base64'));
      expect(harness.canvas.width).toBe(640);
      expect(harness.canvas.height).toBe(360);
    } finally {
      harness.restore();
    }
  });

  it('should proxy a lossy WebP as real JPEG bytes even when its source MIME is wrong', async () => {
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 1, 2]);
    const harness = installWebpCanvasHarness({ outputMimeType: 'image/jpeg', outputBytes: jpegBytes });
    const api = new WechatAPI('appid', 'secret', 'https://proxy.com');
    obsidianMock.requestUrl.mockResolvedValue({ json: { url: 'https://mmbiz.qpic.cn/jpeg' } });

    try {
      await api.uploadMultipart('https://api.weixin.qq.com/cgi-bin/media/uploadimg', createWebpBlob('VP8 ', 'image/png'), 'media');

      const body = JSON.parse(obsidianMock.requestUrl.mock.calls[0][0].body);
      expect(body.mimeType).toBe('image/jpeg');
      expect(body.fileName).toBe('image.jpg');
      expect(body.fileData).toBe(Buffer.from(jpegBytes).toString('base64'));
      expect(harness.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
    } finally {
      harness.restore();
    }
  });

  it('should send converted WebP bytes and matching headers through direct multipart upload', async () => {
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6]);
    const harness = installWebpCanvasHarness({ outputMimeType: 'image/png', outputBytes: pngBytes });
    const api = new WechatAPI('appid', 'secret');
    obsidianMock.requestUrl.mockResolvedValue({ json: { media_id: 'media-png' } });

    try {
      await api.uploadMultipart('https://api.weixin.qq.com/cgi-bin/material/add_material', createWebpBlob('VP8L'), 'media');

      const request = obsidianMock.requestUrl.mock.calls[0][0];
      const body = new Uint8Array(request.body);
      const bodyText = new TextDecoder('latin1').decode(body);
      expect(bodyText).toContain('filename="image.png"');
      expect(bodyText).toContain('Content-Type: image/png');
      expect(Array.from(body).join(',')).toContain(Array.from(pngBytes).join(','));
    } finally {
      harness.restore();
    }
  });

  it('should transcode once while network retry attempts reuse the same output Blob', async () => {
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 7, 8]);
    const harness = installWebpCanvasHarness({ outputMimeType: 'image/jpeg', outputBytes: jpegBytes });
    const api = new WechatAPI('appid', 'secret', 'https://proxy.com');
    obsidianMock.requestUrl
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({ json: { url: 'https://mmbiz.qpic.cn/retry' } });
    api.requestWithRetry = async (operation) => {
      try {
        return await operation();
      } catch {
        return await operation();
      }
    };

    try {
      await api.uploadMultipart('https://api.weixin.qq.com/cgi-bin/media/uploadimg', createWebpBlob('VP8 '), 'media');

      expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(2);
      expect(harness.toBlob).toHaveBeenCalledTimes(1);
      expect(harness.drawImage).toHaveBeenCalledTimes(1);
    } finally {
      harness.restore();
    }
  });

  // === Task B: Remote MIME Parsing ===
  it('should detect MIME type from headers for http images', async () => {
    const view = new AppleStyleView(null, null);

    obsidianMock.requestUrl.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      headers: { 'content-type': 'image/gif' }
    });

    const blob = await view.srcToBlob('http://example.com/anim.gif');
    expect(blob.type).toBe('image/gif');
  });

  it('should fallback to image/jpeg if header is missing', async () => {
    const view = new AppleStyleView(null, null);

    obsidianMock.requestUrl.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      headers: {}
    });

    const blob = await view.srcToBlob('http://example.com/unknown.jpg');
    expect(blob.type).toBe('image/jpeg');
  });

  it('should handle Content-Type case insensitively', async () => {
    const view = new AppleStyleView(null, null);

    obsidianMock.requestUrl.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      headers: { 'Content-Type': 'image/png' }
    });

    const blob = await view.srcToBlob('http://example.com/icon.png');
    expect(blob.type).toBe('image/png');
  });

  it('should convert base64 data URL images to Blob without fetch', async () => {
    const view = new AppleStyleView(null, null);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const blob = await view.srcToBlob('data:image/png;base64,aGVsbG8=');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(blob.type).toBe('image/png');
    expect(await blobToText(blob)).toBe('hello');
  });

  it('should preserve MIME and decoded bytes for non-base64 data URL images', async () => {
    const view = new AppleStyleView(null, null);

    const blob = await view.srcToBlob('data:image/svg+xml,%3Csvg%3Eok%3C%2Fsvg%3E');

    expect(blob.type).toBe('image/svg+xml');
    expect(await blobToText(blob)).toBe('<svg>ok</svg>');
  });

  it('should reject invalid data URL image sources', async () => {
    const view = new AppleStyleView(null, null);

    await expect(view.srcToBlob('data:not-valid')).rejects.toThrow('无效的 data URL 图片来源');
  });

  it('should read note-relative local images from the vault', async () => {
    const imageFile = {
      path: 'notes/images/local.png',
      name: 'local.png',
      extension: 'png',
      bytes: new Uint8Array([1, 2, 3]).buffer,
    };
    const view = new AppleStyleView(null, null);
    view.lastResolvedSourcePath = 'notes/post.md';
    view.app = {
      metadataCache: {
        getFirstLinkpathDest: vi.fn(() => null),
      },
      vault: {
        getAbstractFileByPath: vi.fn((filePath) => (filePath === imageFile.path ? imageFile : null)),
        readBinary: vi.fn(async (file) => file.bytes),
      },
    };

    const blob = await view.srcToBlob('images/local.png');

    expect(blob.type).toBe('image/png');
    expect(await blobToArrayBuffer(blob)).toEqual(imageFile.bytes);
    expect(view.app.vault.readBinary).toHaveBeenCalledWith(imageFile);
  });

  it('should reject file URLs outside the current vault', async () => {
    const view = new AppleStyleView(null, null);
    view.app = {
      vault: {
        adapter: { basePath: '/tmp/vault' },
        getAbstractFileByPath: vi.fn(),
        readBinary: vi.fn(),
      },
    };

    await expect(view.srcToBlob('file:///tmp/outside/local.png')).rejects.toThrow('只支持读取当前 vault 内的 file:// 图片');
  });

  it('should request permanent image materials with pagination', async () => {
    const api = new WechatAPI('appid', 'secret');
    api.accessToken = 'token-1';
    api.expireTime = Date.now() + 3600_000;
    obsidianMock.requestUrl.mockResolvedValue({
      json: { item: [], item_count: 0, total_count: 0 }
    });

    await api.batchGetMaterials('image', 20, 10);

    expect(obsidianMock.requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token=token-1',
      method: 'POST',
      body: JSON.stringify({ type: 'image', offset: 20, count: 10 }),
    }));
  });

  it('should request draft count, list, and detail with expected bodies', async () => {
    const api = new WechatAPI('appid', 'secret');
    api.accessToken = 'token-1';
    api.expireTime = Date.now() + 3600_000;
    obsidianMock.requestUrl.mockResolvedValue({ json: { total_count: 1, item: [] } });

    await api.getDraftCount();
    await api.batchGetDrafts(40, 20, 1);
    await api.getDraft('draft-media');

    expect(obsidianMock.requestUrl).toHaveBeenNthCalledWith(1, expect.objectContaining({
      url: 'https://api.weixin.qq.com/cgi-bin/draft/count?access_token=token-1',
      method: 'POST',
      body: JSON.stringify({}),
    }));
    expect(obsidianMock.requestUrl).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: 'https://api.weixin.qq.com/cgi-bin/draft/batchget?access_token=token-1',
      method: 'POST',
      body: JSON.stringify({ offset: 40, count: 20, no_content: 1 }),
    }));
    expect(obsidianMock.requestUrl).toHaveBeenNthCalledWith(3, expect.objectContaining({
      url: 'https://api.weixin.qq.com/cgi-bin/draft/get?access_token=token-1',
      method: 'POST',
      body: JSON.stringify({ media_id: 'draft-media' }),
    }));
  });

  it('should update draft without network retry wrapper', async () => {
    const api = new WechatAPI('appid', 'secret');
    api.accessToken = 'token-1';
    api.expireTime = Date.now() + 3600_000;
    const requestWithRetrySpy = vi.spyOn(api, 'requestWithRetry');
    obsidianMock.requestUrl.mockResolvedValue({ json: { errcode: 0, errmsg: 'ok' } });

    const result = await api.updateDraft('draft-media', 0, { title: 'Title' });

    expect(result).toEqual({ media_id: 'draft-media' });
    expect(requestWithRetrySpy).not.toHaveBeenCalled();
    expect(obsidianMock.requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.weixin.qq.com/cgi-bin/draft/update?access_token=token-1',
      method: 'POST',
      body: JSON.stringify({
        media_id: 'draft-media',
        index: 0,
        articles: { title: 'Title' },
      }),
    }));
  });

  it('should include X-Client-Id header in sendRequest when clientId is provided and proxy is used', async () => {
    const api = new WechatAPI('appid', 'secret', 'https://proxy.com', 'client-123456');
    obsidianMock.requestUrl.mockResolvedValue({ json: { success: true } });

    await api.sendRequest('https://api.weixin.qq.com/test');

    expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(1);
    expect(obsidianMock.requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://proxy.com',
      headers: expect.objectContaining({
        'X-Client-Id': 'client-123456'
      })
    }));
  });

  it('should include X-Client-Id header in uploadMultipart when clientId is provided and proxy is used', async () => {
    const api = new WechatAPI('appid', 'secret', 'https://proxy.com', 'client-123456');
    const mockBlob = new Blob(['fake-image-data'], { type: 'image/png' });
    obsidianMock.requestUrl.mockResolvedValue({ json: { url: 'http://wx.com', media_id: 'media-123' } });

    await api.uploadMultipart('https://api.weixin.qq.com/upload', mockBlob, 'media');

    expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(1);
    expect(obsidianMock.requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://proxy.com',
      headers: expect.objectContaining({
        'X-Client-Id': 'client-123456'
      })
    }));
  });

  it('should NOT include X-Client-Id header when clientId is empty', async () => {
    const api = new WechatAPI('appid', 'secret', 'https://proxy.com', '');
    obsidianMock.requestUrl.mockResolvedValue({ json: { success: true } });

    await api.sendRequest('https://api.weixin.qq.com/test');

    expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(1);
    const callArg = obsidianMock.requestUrl.mock.calls[0][0];
    expect(callArg.headers).not.toHaveProperty('X-Client-Id');
  });

  it('should createImageDraft with newspic article_type and image_info', async () => {
    const api = new WechatAPI('appid', 'secret');
    vi.spyOn(api, 'getAccessToken').mockResolvedValue('fake-token');

    obsidianMock.requestUrl.mockResolvedValue({
      json: { media_id: 'draft-media-123' },
      status: 200
    });

    const result = await api.createImageDraft({
      title: '贴图标题',
      content: '贴图纯文本描述',
      imageMediaIds: ['img-1', 'img-2', 'img-3'],
      needOpenComment: 1
    });

    expect(result).toEqual({ media_id: 'draft-media-123' });
    expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(1);

    const callArg = obsidianMock.requestUrl.mock.calls[0][0];
    expect(callArg.url).toContain('/cgi-bin/draft/add?access_token=fake-token');
    
    const body = JSON.parse(callArg.body);
    expect(body.articles).toHaveLength(1);

    const article = body.articles[0];
    expect(article.article_type).toBe('newspic');
    expect(article.title).toBe('贴图标题');
    expect(article.content).toBe('贴图纯文本描述');
    expect(article.need_open_comment).toBe(1);
    expect(article.image_info.image_list).toEqual([
      { image_media_id: 'img-1' },
      { image_media_id: 'img-2' },
      { image_media_id: 'img-3' }
    ]);
  });

  it('should throw error when createImageDraft has no title or empty images', async () => {
    const api = new WechatAPI('appid', 'secret');

    await expect(api.createImageDraft({ title: '', imageMediaIds: ['img-1'] })).rejects.toThrow('标题 (title) 为必填项');
    await expect(api.createImageDraft({ title: '有标题', imageMediaIds: [] })).rejects.toThrow('微信贴图要求至少包含 1 张图片素材');
  });

  it('should accept 20 newspic images and reject the 21st without truncating', async () => {
    const api = new WechatAPI('appid', 'secret');
    vi.spyOn(api, 'createDraft').mockResolvedValue({ media_id: 'draft-20' });
    const twentyIds = Array.from({ length: 20 }, (_, index) => `img-${index + 1}`);

    await api.createImageDraft({ title: '二十张贴图', imageMediaIds: twentyIds });

    expect(api.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      image_info: {
        image_list: twentyIds.map((id) => ({ image_media_id: id })),
      },
    }));

    await expect(api.createImageDraft({
      title: '二十一张贴图',
      imageMediaIds: [...twentyIds, 'img-21'],
    })).rejects.toThrow('微信贴图最多支持 20 张图片素材');
    expect(api.createDraft).toHaveBeenCalledTimes(1);
  });
});
