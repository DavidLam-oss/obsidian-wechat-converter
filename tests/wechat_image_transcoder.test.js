/*
## 核心功能

覆盖微信上传前 WebP 容器识别、静态 PNG/JPEG 转换合同、动画拒绝和 active realm 资源清理。

## 输入

接收构造的 RIFF/WebP Blob，以及 mock Image、Canvas、Document 和 Object URL 能力。

## 输出

输出格式分类、Blob 透传、编码参数、文件签名和错误路径断言。

## 定位

位于 tests/，是微信图片格式兼容服务的单元测试。

## 依赖

关键依赖：Vitest、`../services/wechat-image-transcoder.js`。

## 维护规则

- RIFF fixture 必须按 chunk 长度和 padding 生成，避免用无效伪数据掩盖解析错误。
- Mock 测试只验证服务合同；真实 WebP 像素、透明背景和微信草稿结果仍需人工验收。
*/

import { beforeAll, describe, expect, it, vi } from 'vitest';

const {
  inspectWebpBlob,
  normalizeWechatUploadImageBlob,
} = require('../services/wechat-image-transcoder.js');

beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer === 'function') return;
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
});

function asciiBytes(text) {
  return Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0)));
}

function uint32Le(value) {
  return Uint8Array.from([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concatBytes(...parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function createChunk(type, payload = new Uint8Array()) {
  const padding = payload.length % 2 ? new Uint8Array([0]) : new Uint8Array();
  return concatBytes(asciiBytes(type), uint32Le(payload.length), payload, padding);
}

function createWebpBlob(chunks, mimeType = 'image/webp') {
  const body = concatBytes(...chunks);
  const bytes = concatBytes(asciiBytes('RIFF'), uint32Le(body.length + 4), asciiBytes('WEBP'), body);
  return new Blob([bytes], { type: mimeType });
}

function createVp8xPayload(flags = 0) {
  return Uint8Array.from([flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb]);

function createTranscodeHarness(outputBytes, outputMimeType) {
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
  const image = {
    naturalWidth: 1280,
    naturalHeight: 720,
    onload: null,
    onerror: null,
    set src(value) {
      this.currentSrc = value;
      this.onload?.();
    },
  };
  const createObjectURL = vi.fn(() => 'blob:active-webp');
  const revokeObjectURL = vi.fn();
  const ImageCtor = vi.fn(function ActiveImageMock() {
    return image;
  });
  const document = {
    defaultView: {
      Image: ImageCtor,
      URL: { createObjectURL, revokeObjectURL },
    },
    createElement: vi.fn((tagName) => {
      if (tagName !== 'canvas') throw new Error(`Unexpected element: ${tagName}`);
      return canvas;
    }),
  };
  return {
    canvas,
    document,
    drawImage,
    image,
    ImageCtor,
    createObjectURL,
    revokeObjectURL,
    toBlob,
  };
}

describe('wechat image transcoder', () => {
  it('passes PNG, JPEG, and GIF blobs through without decoding', async () => {
    for (const mimeType of ['image/png', 'image/jpeg', 'image/gif']) {
      const source = new Blob([asciiBytes('not-webp')], { type: mimeType });
      const createImage = vi.fn();

      const result = await normalizeWechatUploadImageBlob(source, { createImage });

      expect(result).toBe(source);
      expect(createImage).not.toHaveBeenCalled();
    }
  });

  it('falls back to the original Blob arrayBuffer when sliced Blobs cannot be read', async () => {
    const source = {
      type: 'image/png',
      slice: vi.fn(() => ({})),
      arrayBuffer: vi.fn(async () => asciiBytes('not-webp').buffer),
    };

    const result = await normalizeWechatUploadImageBlob(source);

    expect(result).toBe(source);
    expect(source.slice).toHaveBeenCalledWith(0, 12);
    expect(source.arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it('detects lossy VP8 WebP despite an incorrect JPEG MIME', async () => {
    const source = createWebpBlob([createChunk('VP8 ', Uint8Array.from([1, 2, 3, 4]))], 'image/jpeg');

    await expect(inspectWebpBlob(source)).resolves.toEqual(expect.objectContaining({
      isWebp: true,
      isAnimated: false,
      hasAlpha: false,
      isLossless: false,
      targetMimeType: 'image/jpeg',
      imageChunk: 'VP8 ',
    }));
  });

  it('classifies VP8L and extended alpha WebP as PNG', async () => {
    const lossless = createWebpBlob([createChunk('VP8L', Uint8Array.from([1, 2, 3, 4]))]);
    const alpha = createWebpBlob([
      createChunk('VP8X', createVp8xPayload(0x10)),
      createChunk('ALPH', Uint8Array.from([1, 2])),
      createChunk('VP8 ', Uint8Array.from([1, 2, 3, 4])),
    ]);

    await expect(inspectWebpBlob(lossless)).resolves.toEqual(expect.objectContaining({
      targetMimeType: 'image/png',
      isLossless: true,
    }));
    await expect(inspectWebpBlob(alpha)).resolves.toEqual(expect.objectContaining({
      targetMimeType: 'image/png',
      hasAlpha: true,
    }));
  });

  it('parses chunk boundaries instead of treating metadata text as animation', async () => {
    const source = createWebpBlob([
      createChunk('EXIF', asciiBytes('metadata contains ANIM and ANMF text')),
      createChunk('VP8 ', Uint8Array.from([1, 2, 3, 4])),
    ]);

    await expect(inspectWebpBlob(source)).resolves.toEqual(expect.objectContaining({
      isAnimated: false,
      targetMimeType: 'image/jpeg',
    }));
  });

  it('rejects duplicate image chunks even when they use the same FourCC', async () => {
    const source = createWebpBlob([
      createChunk('VP8 ', Uint8Array.from([1, 2])),
      createChunk('VP8 ', Uint8Array.from([3, 4])),
    ]);

    await expect(inspectWebpBlob(source)).rejects.toThrow('WebP 包含冲突的图像数据');
  });

  it('rejects malformed RIFF lengths and invalid image/webp headers', async () => {
    const malformedBytes = concatBytes(
      asciiBytes('RIFF'),
      uint32Le(9999),
      asciiBytes('WEBP'),
      createChunk('VP8 ', Uint8Array.from([1, 2]))
    );

    await expect(inspectWebpBlob(new Blob([malformedBytes], { type: 'image/webp' })))
      .rejects.toThrow('WebP RIFF 长度无效或图片数据不完整');
    await expect(normalizeWechatUploadImageBlob(new Blob(['broken'], { type: 'image/webp' })))
      .rejects.toThrow('WebP 转换失败：WebP 文件头无效或图片已损坏');
  });

  it('rejects animated WebP before creating Image or Canvas', async () => {
    const source = createWebpBlob([
      createChunk('VP8X', createVp8xPayload(0x02)),
      createChunk('ANIM', new Uint8Array(6)),
      createChunk('ANMF', new Uint8Array(16)),
    ]);
    const createImage = vi.fn();

    await expect(normalizeWechatUploadImageBlob(source, { createImage }))
      .rejects.toThrow('暂不支持动画 WebP');
    expect(createImage).not.toHaveBeenCalled();
  });

  it('uses activeDocument.defaultView and converts lossy WebP to a signed JPEG', async () => {
    const source = createWebpBlob([createChunk('VP8 ', Uint8Array.from([1, 2, 3, 4]))]);
    const harness = createTranscodeHarness(JPEG_SIGNATURE, 'image/jpeg');

    const result = await normalizeWechatUploadImageBlob(source, { document: harness.document });

    expect(result.type).toBe('image/jpeg');
    expect(harness.ImageCtor).toHaveBeenCalledTimes(1);
    expect(harness.createObjectURL).toHaveBeenCalledWith(source);
    expect(harness.canvas.width).toBe(1280);
    expect(harness.canvas.height).toBe(720);
    expect(harness.drawImage).toHaveBeenCalledWith(harness.image, 0, 0, 1280, 720);
    expect(harness.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:active-webp');
  });

  it('converts lossless WebP to a signed PNG and preserves its pixel dimensions', async () => {
    const source = createWebpBlob([createChunk('VP8L', Uint8Array.from([1, 2, 3, 4]))]);
    const harness = createTranscodeHarness(PNG_SIGNATURE, 'image/png');

    const result = await normalizeWechatUploadImageBlob(source, { document: harness.document });

    expect(result.type).toBe('image/png');
    expect(harness.canvas.width).toBe(1280);
    expect(harness.canvas.height).toBe(720);
    expect(harness.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined);
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:active-webp');
  });

  it('rejects a mismatched output MIME instead of relabeling bytes', async () => {
    const source = createWebpBlob([createChunk('VP8L', Uint8Array.from([1, 2, 3, 4]))]);
    const harness = createTranscodeHarness(JPEG_SIGNATURE, 'image/jpeg');

    await expect(normalizeWechatUploadImageBlob(source, { document: harness.document }))
      .rejects.toThrow('Canvas 输出格式错误：预期 image/png，实际 image/jpeg');
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:active-webp');
  });

  it('rejects an invalid output signature and revokes the Object URL', async () => {
    const source = createWebpBlob([createChunk('VP8 ', Uint8Array.from([1, 2, 3, 4]))]);
    const harness = createTranscodeHarness(Uint8Array.from([1, 2, 3, 4]), 'image/jpeg');

    await expect(normalizeWechatUploadImageBlob(source, { document: harness.document }))
      .rejects.toThrow('Canvas 输出的 JPEG 文件签名无效');
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:active-webp');
  });

  it('reports decode and Canvas failures while always cleaning up the Object URL', async () => {
    const source = createWebpBlob([createChunk('VP8 ', Uint8Array.from([1, 2, 3, 4]))]);
    const decodeHarness = createTranscodeHarness(JPEG_SIGNATURE, 'image/jpeg');
    decodeHarness.image.src = '';
    Object.defineProperty(decodeHarness.image, 'src', {
      configurable: true,
      set() {
        this.onerror?.();
      },
    });

    await expect(normalizeWechatUploadImageBlob(source, { document: decodeHarness.document }))
      .rejects.toThrow('WebP 图片解码失败');
    expect(decodeHarness.revokeObjectURL).toHaveBeenCalledWith('blob:active-webp');

    const canvasHarness = createTranscodeHarness(JPEG_SIGNATURE, 'image/jpeg');
    canvasHarness.canvas.getContext.mockReturnValue(null);
    await expect(normalizeWechatUploadImageBlob(source, { document: canvasHarness.document }))
      .rejects.toThrow('无法创建 Canvas 2D 上下文');
    expect(canvasHarness.revokeObjectURL).toHaveBeenCalledWith('blob:active-webp');
  });
});
