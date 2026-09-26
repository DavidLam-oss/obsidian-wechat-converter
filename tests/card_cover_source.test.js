import { describe, it, expect, vi } from 'vitest';
import {
  hashString,
  bufferToBase64,
  resolvePicsumDimensions,
  resolveUnsplashOrientation,
  fetchPicsumCoverImage,
  fetchUnsplashCoverImage,
  extractNoteImageReferences,
  readLocalFileAsDataUrl,
  downloadAsBase64,
} from '../services/card-cover-source.js';

describe('Card Cover Source Service (services/card-cover-source.js)', () => {
  describe('hashString', () => {
    it('produces consistent non-empty hash string for same input', () => {
      const h1 = hashString('technology-nature');
      const h2 = hashString('technology-nature');
      expect(h1).toBe(h2);
      expect(typeof h1).toBe('string');
      expect(h1.length).toBeGreaterThan(0);
    });

    it('produces different hash for different inputs', () => {
      expect(hashString('coffee')).not.toBe(hashString('tea'));
    });
  });

  describe('bufferToBase64', () => {
    it('converts ArrayBuffer to Base64 string correctly', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const b64 = bufferToBase64(bytes.buffer);
      expect(b64).toBe('SGVsbG8=');
    });
  });

  describe('resolvePicsumDimensions & resolveUnsplashOrientation', () => {
    it('resolves correct dimensions for 3:4, 1:1, 9:16 and default', () => {
      expect(resolvePicsumDimensions('3:4')).toEqual({ width: 1200, height: 1600 });
      expect(resolvePicsumDimensions('1:1')).toEqual({ width: 1400, height: 1400 });
      expect(resolvePicsumDimensions('9:16')).toEqual({ width: 1080, height: 1920 });
      expect(resolvePicsumDimensions('unknown')).toEqual({ width: 1200, height: 1600 });
    });

    it('resolves correct Unsplash orientation for different ratios', () => {
      expect(resolveUnsplashOrientation('3:4')).toBe('portrait');
      expect(resolveUnsplashOrientation('9:16')).toBe('portrait');
      expect(resolveUnsplashOrientation('1:1')).toBe('squarish');
      expect(resolveUnsplashOrientation('16:9')).toBe('landscape');
      expect(resolveUnsplashOrientation('unknown')).toBe('portrait');
    });
  });

  describe('fetchPicsumCoverImage', () => {
    it('fetches picsum image and returns Base64 data URL using requestUrl', async () => {
      const fakeBinary = new Uint8Array([255, 216, 255, 224]).buffer; // JPEG magic header
      const mockRequestUrl = vi.fn().mockResolvedValue({
        status: 200,
        arrayBuffer: fakeBinary,
      });

      const dataUrl = await fetchPicsumCoverImage({
        ratioId: '3:4',
        seed: 'test-seed-123',
        requestUrl: mockRequestUrl,
      });

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://picsum.photos/seed/test-seed-123/1200/1600',
          method: 'GET',
        })
      );
      expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    });

    it('handles request failure gracefully', async () => {
      const mockRequestUrl = vi.fn().mockRejectedValue(new Error('Network error'));
      await expect(
        fetchPicsumCoverImage({
          requestUrl: mockRequestUrl,
        })
      ).rejects.toThrow('获取 Picsum 摄影图失败: Network error');
    });
  });

  describe('fetchUnsplashCoverImage', () => {
    it('throws when apiKey is missing', async () => {
      await expect(
        fetchUnsplashCoverImage({ apiKey: '' })
      ).rejects.toThrow('未配置 Unsplash Access Key');
    });

    it('queries Unsplash random API and converts photo to Base64', async () => {
      const fakeBinary = new Uint8Array([255, 216, 255, 225]).buffer;
      const mockRequestUrl = vi.fn().mockImplementation(async (opts) => {
        if (opts.url.includes('api.unsplash.com')) {
          return {
            status: 200,
            json: {
              urls: {
                raw: 'https://images.unsplash.com/photo-12345',
              },
            },
          };
        }
        // Download call
        return {
          status: 200,
          arrayBuffer: fakeBinary,
        };
      });

      const dataUrl = await fetchUnsplashCoverImage({
        apiKey: 'demo-key',
        query: 'minimalist coffee',
        ratioId: '3:4',
        requestUrl: mockRequestUrl,
      });

      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
      expect(mockRequestUrl).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          url: expect.stringContaining('api.unsplash.com/photos/random'),
          headers: { Authorization: 'Client-ID demo-key' },
        })
      );
      expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    });
  });

  describe('extractNoteImageReferences', () => {
    it('extracts both wikilinks and standard markdown images without duplicates', () => {
      const markdown = `
# 笔记标题
![[cover-photo.png|封面图]]
这是一些段落。
![文章配图](attachments/diagram.svg)
![[cover-photo.png]]
![外链图](https://example.com/web.jpg)
      `;

      const images = extractNoteImageReferences(markdown);
      expect(images).toHaveLength(3);
      expect(images[0]).toEqual({
        name: 'cover-photo.png',
        path: 'cover-photo.png',
        isWiki: true,
      });
      expect(images[1]).toEqual({
        name: '文章配图',
        path: 'attachments/diagram.svg',
        isWiki: false,
      });
      expect(images[2]).toEqual({
        name: '外链图',
        path: 'https://example.com/web.jpg',
        isWiki: false,
      });
    });

    it('handles markdown image with Obsidian size suffix and external URL correctly', () => {
      const markdown = `
![WorkBuddy 签到脚本日志显示 401 未登录报错|400](https://davidrepo-1348433231.cos.ap-guangzhou.myqcloud.com/img/20260926101418732.png)
![带双引号标题](https://example.com/img.png "测试图片")
      `;
      const images = extractNoteImageReferences(markdown);
      expect(images).toHaveLength(2);
      expect(images[0]).toEqual({
        name: 'WorkBuddy 签到脚本日志显示 401 未登录报错',
        path: 'https://davidrepo-1348433231.cos.ap-guangzhou.myqcloud.com/img/20260926101418732.png',
        isWiki: false,
      });
      expect(images[1]).toEqual({
        name: '带双引号标题',
        path: 'https://example.com/img.png',
        isWiki: false,
      });
    });

    it('returns empty array when no images exist', () => {
      expect(extractNoteImageReferences('纯文本内容')).toEqual([]);
    });
  });

  describe('downloadAsBase64', () => {
    it('downloads remote image via custom requestUrl and returns Base64 data URL', async () => {
      const fakeBinary = new Uint8Array([137, 80, 78, 71]).buffer; // PNG magic bytes
      const mockReq = vi.fn().mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'image/png' },
        arrayBuffer: fakeBinary,
      });
      const dataUrl = await downloadAsBase64('https://example.com/test.png', mockReq);
      expect(mockReq).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/test.png',
          method: 'GET',
        })
      );
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });
  });

  describe('readLocalFileAsDataUrl', () => {
    it('rejects if no file provided', async () => {
      await expect(readLocalFileAsDataUrl(null)).rejects.toThrow('未传入有效的图片文件');
    });
  });
});
