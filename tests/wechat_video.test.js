import { describe, it, expect, vi } from 'vitest';
import {
  MAX_VIDEO_SIZE_BYTES,
  validateVideoFormat,
  validateVideoSize,
  computeVideoFingerprint,
  extractVideoTitleFromSrc,
  fetchOnlineVideo,
  uploadVideoMultipartCore,
  processAllVideos,
} from '../services/wechat-video.js';

describe('WeChat Video Service (services/wechat-video.js)', () => {
  describe('Validation: Format & Size', () => {
    it('should define MAX_VIDEO_SIZE_BYTES as exactly 10MB', () => {
      expect(MAX_VIDEO_SIZE_BYTES).toBe(10 * 1024 * 1024);
    });

    it('should accept valid MP4 extensions and mime types', () => {
      expect(() => validateVideoFormat('my_video.mp4', 'video/mp4')).not.toThrow();
      expect(() => validateVideoFormat('path/to/demo.MP4')).not.toThrow();
      expect(() => validateVideoFormat('https://cdn.example.com/stream.mp4?token=123')).not.toThrow();
    });

    it('should reject non-MP4 formats with clear Chinese errors', () => {
      expect(() => validateVideoFormat('clip.mov')).toThrow('仅支持 MP4 格式视频（检测到格式为 .mov，插件无转码能力）');
      expect(() => validateVideoFormat('clip.webm')).toThrow('仅支持 MP4 格式视频（检测到格式为 .webm，插件无转码能力）');
      expect(() => validateVideoFormat('live.m3u8')).toThrow('仅支持 MP4 格式视频（检测到格式为 .m3u8，插件无转码能力）');
      expect(() => validateVideoFormat('video.mp4', 'video/webm')).toThrow('仅支持 MP4 格式视频（检测到 MIME 为 video/webm）');
    });

    it('should validate size against 10MB limit', () => {
      expect(() => validateVideoSize(10 * 1024 * 1024)).not.toThrow();
      expect(() => validateVideoSize(5 * 1024 * 1024)).not.toThrow();
      expect(() => validateVideoSize(10 * 1024 * 1024 + 1)).toThrow('视频超过 10MB（大小约为 10.0MB，微信接口上限为 10MB），请压缩后重试');
      expect(() => validateVideoSize(15 * 1024 * 1024)).toThrow('视频超过 10MB（大小约为 15.0MB，微信接口上限为 10MB），请压缩后重试');
    });
  });

  describe('computeVideoFingerprint', () => {
    it('should compute deterministic fingerprint based on blob size and content', async () => {
      const blob1 = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' });
      const blob2 = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' });
      const fp1 = await computeVideoFingerprint(blob1);
      const fp2 = await computeVideoFingerprint(blob2);
      expect(fp1).toBe(fp2);
      expect(fp1).toContain('video/mp4:4:');
    });
  });

  describe('extractVideoTitleFromSrc', () => {
    it('should extract file basename without extension', () => {
      expect(extractVideoTitleFromSrc('attachments/product-demo.mp4')).toBe('product-demo');
      expect(extractVideoTitleFromSrc('https://example.com/videos/feature_intro.mp4?t=100')).toBe('feature_intro');
      expect(extractVideoTitleFromSrc('')).toBe('视频');
    });
  });

  describe('fetchOnlineVideo', () => {
    it('should abort early during HEAD request if Content-Length exceeds 10MB', async () => {
      const mockRequestUrl = vi.fn().mockImplementation(async (opts) => {
        if (opts.method === 'HEAD') {
          return {
            status: 200,
            headers: {
              'content-type': 'video/mp4',
              'content-length': String(12 * 1024 * 1024), // 12MB
            },
          };
        }
        return { status: 200, arrayBuffer: new ArrayBuffer(100) };
      });

      await expect(fetchOnlineVideo('https://example.com/big.mp4', mockRequestUrl))
        .rejects.toThrow('视频超过 10MB');

      // Crucial: GET request must NOT be called after HEAD fails!
      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({ method: 'HEAD' }));
    });

    it('should report anti-hotlinking or source errors with clear diagnostic message', async () => {
      const mockRequestUrl = vi.fn().mockResolvedValue({
        status: 403,
      });

      await expect(fetchOnlineVideo('https://example.com/private.mp4', mockRequestUrl))
        .rejects.toThrow('拉取在线视频失败 (HTTP 403，可能是源站启用了防盗链)');
    });

    it('should download and return Blob for valid online MP4', async () => {
      const fakeBinary = new Uint8Array([0, 0, 0, 32, 102, 116, 121, 112]).buffer;
      const mockRequestUrl = vi.fn().mockImplementation(async (opts) => {
        if (opts.method === 'HEAD') {
          return {
            status: 200,
            headers: {
              'content-type': 'video/mp4',
              'content-length': String(fakeBinary.byteLength),
            },
          };
        }
        return {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
          arrayBuffer: fakeBinary,
        };
      });

      const blob = await fetchOnlineVideo('https://example.com/valid.mp4', mockRequestUrl);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBe(fakeBinary.byteLength);
      expect(blob.type).toBe('video/mp4');
    });
  });

  describe('uploadVideoMultipartCore', () => {
    it('should format multipart body with media and description for direct uploads', async () => {
      let sentOptions = null;
      const fakeRequestUrl = vi.fn().mockImplementation(async (opts) => {
        sentOptions = opts;
        return {
          status: 200,
          json: { media_id: 'vid_99999', url: 'http://wx.qq.com/video/99999' },
        };
      });

      const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' });

      // Run core directly with requestWithRetry and fakeRequestUrl
      const result = await uploadVideoMultipartCore({
        url: 'https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=token123&type=video',
        blob,
        fileName: 'tutorial.mp4',
        title: '教程视频',
        introduction: '详细操作教程',
        requestWithRetry: async (fn) => fn(),
        requestUrl: fakeRequestUrl,
      });

      expect(result.media_id).toBe('vid_99999');
      expect(sentOptions).not.toBeNull();
      expect(sentOptions.headers['Content-Type']).toContain('multipart/form-data; boundary=');
    });

    it('should forward extraFields containing description JSON when using proxy', async () => {
      let proxyPayload = null;
      const fakeProxyRequestUrl = vi.fn(async (opts) => {
        proxyPayload = JSON.parse(opts.body);
        return {
          status: 200,
          json: { media_id: 'proxy_vid_888' },
        };
      });

      const blob = new Blob([new Uint8Array([5, 6, 7, 8])], { type: 'video/mp4' });

      const result = await uploadVideoMultipartCore({
        url: 'https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=token&type=video',
        blob,
        proxyUrl: 'https://proxy.example.com/proxy?token=wp_123',
        clientId: 'client_device_1',
        fileName: 'demo.mp4',
        title: '功能演示',
        introduction: '演示简介',
        requestWithRetry: async (fn) => fn(),
        requestUrl: fakeProxyRequestUrl,
      });

      expect(result.media_id).toBe('proxy_vid_888');
      expect(proxyPayload).not.toBeNull();
      expect(proxyPayload.method).toBe('UPLOAD');
      expect(proxyPayload.mimeType).toBe('video/mp4');
      expect(proxyPayload.extraFields).toBeDefined();
      const desc = JSON.parse(proxyPayload.extraFields.description);
      expect(desc.title).toBe('功能演示');
      expect(desc.introduction).toBe('演示简介');
    });
  });

  describe('processAllVideos: DOM Transformation & Caching', () => {
    it('should replace <video> elements with <mpvideo> tags upon successful upload', async () => {
      const html = `
        <div class="content">
          <h1>测试文章</h1>
          <video src="attachments/my-demo.mp4" controls></video>
          <p>正文内容</p>
        </div>
      `;

      const mockApi = {
        uploadVideo: vi.fn().mockResolvedValue({ media_id: 'media_mp4_123' }),
      };

      const mockSrcToBlob = vi.fn().mockResolvedValue(
        new Blob([new Uint8Array([10, 20, 30])], { type: 'video/mp4' })
      );

      const cache = new Map();
      const onProgress = vi.fn();

      const resultHtml = await processAllVideos(html, mockApi, onProgress, {
        accountId: 'wx_acc_1',
        videoUploadCache: cache,
        srcToBlob: mockSrcToBlob,
      });

      expect(resultHtml).toContain('<mpvideo data-pluginname="insertvideo" data-mediaid="media_mp4_123" data-title="my-demo"></mpvideo>');
      expect(resultHtml).not.toContain('<video');
      expect(mockApi.uploadVideo).toHaveBeenCalledTimes(1);
      expect(cache.size).toBe(1);

      // Re-run with same cache: should hit cache and NOT call uploadVideo again
      const secondHtml = await processAllVideos(html, mockApi, onProgress, {
        accountId: 'wx_acc_1',
        videoUploadCache: cache,
        srcToBlob: mockSrcToBlob,
      });

      expect(secondHtml).toContain('media_mp4_123');
      expect(mockApi.uploadVideo).toHaveBeenCalledTimes(1); // Still 1!
    });

    it('should replace failed videos with user-friendly placeholder paragraphs', async () => {
      const html = `
        <div>
          <video src="attachments/too-large.mp4"></video>
        </div>
      `;

      const mockApi = {
        uploadVideo: vi.fn(),
      };

      // 11MB file
      const bigBuffer = new Uint8Array(11 * 1024 * 1024);
      const mockSrcToBlob = vi.fn().mockResolvedValue(new Blob([bigBuffer], { type: 'video/mp4' }));

      const onFailures = vi.fn();
      const resultHtml = await processAllVideos(html, mockApi, null, {
        accountId: 'wx_acc_1',
        srcToBlob: mockSrcToBlob,
        onVideoFailure: onFailures,
      });

      expect(resultHtml).not.toContain('<video');
      expect(resultHtml).toContain('视频未同步');
      expect(resultHtml).toContain('视频超过 10MB');
      expect(resultHtml).toContain('请在微信后台手动插入视频：too-large');
      expect(onFailures).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            src: 'attachments/too-large.mp4',
            message: expect.stringContaining('10MB'),
          }),
        ])
      );
    });
  });
});
