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
});
