import { describe, it, expect, beforeEach, vi } from 'vitest';

// Note: We don't use vi.mock('obsidian') here because we use the alias in vitest.config.mjs
// to resolve 'obsidian' to our __mocks__/obsidian.js file.
// To mock specific methods like requestUrl, we modify the required module object directly
// BEFORE importing the module under test (input.js).

describe('WechatAPI - Upload & MIME Logic', () => {
  let WechatAPI;
  let AppleStyleView;
  let obsidianMock;

  beforeEach(async () => {
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
    const inputModule = require('../input.js');
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
});
