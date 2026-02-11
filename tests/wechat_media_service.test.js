import { describe, it, expect, vi } from 'vitest';
const { processAllImages, processMathFormulas } = require('../services/wechat-media');

describe('Wechat Media Service', () => {
  const serialPMap = async (items, mapper) => {
    for (const item of items) {
      await mapper(item);
    }
  };

  it('processAllImages should de-duplicate src and replace all occurrences', async () => {
    const html = '<p><img src="app://a"><img src="app://a"></p>';
    const srcToBlob = vi.fn(async () => new Blob(['x'], { type: 'image/png' }));
    const uploadImage = vi.fn(async () => ({ url: 'https://wx/image.png' }));

    const output = await processAllImages({
      html,
      api: { uploadImage },
      progressCallback: null,
      pMap: serialPMap,
      srcToBlob,
    });

    expect(srcToBlob).toHaveBeenCalledTimes(1);
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(output.match(/https:\/\/wx\/image\.png/g)?.length).toBe(2);
  });

  it('processMathFormulas should return original html when no svg exists', async () => {
    const html = '<p>plain text</p>';
    const output = await processMathFormulas({
      html,
      api: { uploadImage: vi.fn() },
      progressCallback: null,
      pMap: serialPMap,
      simpleHash: () => 1,
      svgUploadCache: new Map(),
      svgToPngBlob: vi.fn(),
    });

    expect(output).toBe(html);
  });

  it('processAllImages should reuse cache across runs for same account', async () => {
    const html = '<p><img src="app://cached"></p>';
    const srcToBlob = vi.fn(async () => new Blob(['x'], { type: 'image/png' }));
    const uploadImage = vi.fn(async () => ({ url: 'https://wx/cached.png' }));
    const cache = new Map();

    const first = await processAllImages({
      html,
      api: { uploadImage },
      progressCallback: null,
      pMap: serialPMap,
      srcToBlob,
      imageUploadCache: cache,
      cacheNamespace: 'acc-1',
    });

    const second = await processAllImages({
      html,
      api: { uploadImage },
      progressCallback: null,
      pMap: serialPMap,
      srcToBlob,
      imageUploadCache: cache,
      cacheNamespace: 'acc-1',
    });

    expect(first).toContain('https://wx/cached.png');
    expect(second).toContain('https://wx/cached.png');
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(srcToBlob).toHaveBeenCalledTimes(2);
  });

  it('processAllImages cache should be isolated by account namespace', async () => {
    const html = '<p><img src="app://same"></p>';
    const srcToBlob = vi.fn(async () => new Blob(['x'], { type: 'image/png' }));
    const uploadImage = vi.fn(async () => ({ url: 'https://wx/same.png' }));
    const cache = new Map();

    await processAllImages({
      html,
      api: { uploadImage },
      progressCallback: null,
      pMap: serialPMap,
      srcToBlob,
      imageUploadCache: cache,
      cacheNamespace: 'acc-1',
    });

    await processAllImages({
      html,
      api: { uploadImage },
      progressCallback: null,
      pMap: serialPMap,
      srcToBlob,
      imageUploadCache: cache,
      cacheNamespace: 'acc-2',
    });

    expect(uploadImage).toHaveBeenCalledTimes(2);
  });

  it('processAllImages should re-upload when same src content changes', async () => {
    const html = '<p><img src="app://mutable"></p>';
    const srcToBlob = vi
      .fn()
      .mockResolvedValueOnce({
        type: 'image/png',
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      })
      .mockResolvedValueOnce({
        type: 'image/png',
        arrayBuffer: async () => new Uint8Array([2]).buffer,
      });
    const uploadImage = vi
      .fn()
      .mockResolvedValueOnce({ url: 'https://wx/mutable-v1.png' })
      .mockResolvedValueOnce({ url: 'https://wx/mutable-v2.png' });
    const cache = new Map();

    const first = await processAllImages({
      html,
      api: { uploadImage },
      progressCallback: null,
      pMap: serialPMap,
      srcToBlob,
      imageUploadCache: cache,
      cacheNamespace: 'acc-1',
    });

    const second = await processAllImages({
      html,
      api: { uploadImage },
      progressCallback: null,
      pMap: serialPMap,
      srcToBlob,
      imageUploadCache: cache,
      cacheNamespace: 'acc-1',
    });

    expect(first).toContain('https://wx/mutable-v1.png');
    expect(second).toContain('https://wx/mutable-v2.png');
    expect(uploadImage).toHaveBeenCalledTimes(2);
  });

  it('processAllImages should fallback to object cache url when src read fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const html = '<p><img src="app://offline"></p>';
    const srcToBlob = vi.fn().mockRejectedValue(new Error('read failed'));
    const uploadImage = vi.fn();
    const cache = new Map([
      ['acc-1::app://offline', { url: 'https://wx/offline-cached.png', fingerprint: 'x' }],
    ]);

    const output = await processAllImages({
      html,
      api: { uploadImage },
      progressCallback: null,
      pMap: serialPMap,
      srcToBlob,
      imageUploadCache: cache,
      cacheNamespace: 'acc-1',
    });

    expect(output).toContain('https://wx/offline-cached.png');
    expect(uploadImage).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('processAllImages should fallback to legacy string cache url when src read fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const html = '<p><img src="app://legacy-cache"></p>';
    const srcToBlob = vi.fn().mockRejectedValue(new Error('read failed'));
    const uploadImage = vi.fn();
    const cache = new Map([
      ['acc-1::app://legacy-cache', 'https://wx/legacy-cached.png'],
    ]);

    const output = await processAllImages({
      html,
      api: { uploadImage },
      progressCallback: null,
      pMap: serialPMap,
      srcToBlob,
      imageUploadCache: cache,
      cacheNamespace: 'acc-1',
    });

    expect(output).toContain('https://wx/legacy-cached.png');
    expect(uploadImage).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
