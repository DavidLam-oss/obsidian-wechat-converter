/*
## 核心功能

覆盖微信图片上传前 WebP 转 PNG 服务的格式识别、尺寸保持、透传和失败反馈。

## 输入

接收 WebP/PNG Blob，以及 mock 的图片解码、Canvas 和 Object URL 能力。

## 输出

输出 PNG Blob、原始非 WebP Blob或明确错误断言，保护微信媒体兼容链路。

## 定位

位于 tests/，是微信媒体格式兼容的单元测试。

## 依赖

关键依赖：Vitest、`../services/wechat-image-transcoder.js`。

## 维护规则

- 覆盖 MIME 与 RIFF/WEBP 文件头两种识别路径。
- 转码测试必须验证原始像素尺寸和 Object URL 清理。
*/

import { describe, expect, it, vi } from 'vitest';

const {
  isWebpBlob,
  normalizeWechatUploadImageBlob,
} = require('../services/wechat-image-transcoder.js');

function createWebpBytes() {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20,
  ]);
}

function createTranscodeHarness({ failDecode = false, pngBlob = new Blob(['png'], { type: 'image/png' }) } = {}) {
  const drawImage = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage })),
    toBlob: vi.fn((callback, mimeType) => callback(
      pngBlob ? new Blob([pngBlob], { type: mimeType }) : null
    )),
  };
  const document = {
    createElement: vi.fn((tagName) => {
      if (tagName !== 'canvas') throw new Error(`Unexpected element: ${tagName}`);
      return canvas;
    }),
  };
  const createObjectUrl = vi.fn(() => 'blob:webp-source');
  const revokeObjectUrl = vi.fn();
  const image = {
    naturalWidth: 1280,
    naturalHeight: 720,
    width: 1280,
    height: 720,
    onload: null,
    onerror: null,
    set src(value) {
      this.currentSrc = value;
      if (failDecode) this.onerror?.();
      else this.onload?.();
    },
  };

  return {
    canvas,
    drawImage,
    image,
    options: {
      document,
      createImage: () => image,
      createObjectUrl,
      revokeObjectUrl,
    },
    createObjectUrl,
    revokeObjectUrl,
  };
}

describe('wechat image transcoder', () => {
  it('converts image/webp to PNG while preserving pixel dimensions', async () => {
    const source = new Blob([createWebpBytes()], { type: 'image/webp' });
    const harness = createTranscodeHarness();

    const result = await normalizeWechatUploadImageBlob(source, harness.options);

    expect(result.type).toBe('image/png');
    expect(harness.canvas.width).toBe(1280);
    expect(harness.canvas.height).toBe(720);
    expect(harness.drawImage).toHaveBeenCalledWith(harness.image, 0, 0, 1280, 720);
    expect(harness.createObjectUrl).toHaveBeenCalledWith(source);
    expect(harness.revokeObjectUrl).toHaveBeenCalledWith('blob:webp-source');
  });

  it('detects WebP by RIFF/WEBP header when MIME is incorrect', async () => {
    const source = new Blob([createWebpBytes()], { type: 'application/octet-stream' });

    expect(await isWebpBlob(source)).toBe(true);

    const result = await normalizeWechatUploadImageBlob(source, createTranscodeHarness().options);
    expect(result.type).toBe('image/png');
  });

  it('passes non-WebP images through without decoding', async () => {
    const source = new Blob(['png'], { type: 'image/png' });
    const createImage = vi.fn();

    const result = await normalizeWechatUploadImageBlob(source, { createImage });

    expect(result).toBe(source);
    expect(createImage).not.toHaveBeenCalled();
  });

  it('reports a clear error and revokes the Object URL when WebP decoding fails', async () => {
    const source = new Blob([createWebpBytes()], { type: 'image/webp' });
    const harness = createTranscodeHarness({ failDecode: true });

    await expect(normalizeWechatUploadImageBlob(source, harness.options))
      .rejects.toThrow('WebP 转 PNG 失败：WebP 图片解码失败');
    expect(harness.revokeObjectUrl).toHaveBeenCalledWith('blob:webp-source');
  });

  it('reports a clear error when Canvas cannot produce a PNG Blob', async () => {
    const source = new Blob([createWebpBytes()], { type: 'image/webp' });
    const harness = createTranscodeHarness({ pngBlob: null });

    await expect(normalizeWechatUploadImageBlob(source, harness.options))
      .rejects.toThrow('WebP 转 PNG 失败：Canvas 未生成 PNG 数据');
  });
});
