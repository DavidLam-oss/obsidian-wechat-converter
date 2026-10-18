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
  transformVideosForClipboard,
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

    it('should fallback to direct upload if proxy fails or returns 41005', async () => {
      let callCount = 0;
      let directPayloadOptions = null;
      const fakeRequestUrl = vi.fn(async (opts) => {
        callCount++;
        if (opts.url.includes('proxy.example.com')) {
          // Proxy returns 41005 (media data missing)
          return {
            status: 200,
            json: { errcode: 41005, errmsg: 'media data missing hint: [test] (41005)' },
          };
        }
        // Direct upload to api.weixin.qq.com
        directPayloadOptions = opts;
        return {
          status: 200,
          json: { media_id: 'direct_fallback_vid_123' },
        };
      });

      const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' });

      const result = await uploadVideoMultipartCore({
        url: 'https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=token&type=video',
        blob,
        proxyUrl: 'https://proxy.example.com/proxy',
        fileName: 'fallback.mp4',
        title: '降级视频',
        requestWithRetry: async (fn) => fn(),
        requestUrl: fakeRequestUrl,
      });

      expect(callCount).toBe(2);
      expect(result.media_id).toBe('direct_fallback_vid_123');
      expect(directPayloadOptions).not.toBeNull();
      expect(directPayloadOptions.url).toContain('api.weixin.qq.com');
      expect(directPayloadOptions.headers['Content-Type']).toContain('multipart/form-data; boundary=');
    });
  });

  describe('transformVideosForClipboard', () => {
    it('should replace video elements with WeChat friendly placeholder card', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="content">
          <p>Intro</p>
          <section class="wechat-video-card" data-video-src="attachments/intro.mp4" data-video-title="开篇介绍">
            <video src="attachments/intro.mp4"></video>
          </section>
          <video src="attachments/outro.mp4"></video>
        </div>
      `;

      const count = transformVideosForClipboard(container);
      expect(count).toBe(2);
      expect(container.querySelectorAll('video').length).toBe(0);
      expect(container.querySelectorAll('.wechat-video-card').length).toBe(0);

      const placeholders = container.querySelectorAll('.wechat-video-clipboard-placeholder');
      expect(placeholders.length).toBe(2);
      expect(placeholders[0].textContent).toContain('🎬 视频：开篇介绍');
      expect(placeholders[0].textContent).toContain('微信公众号后台不支持直接粘贴视频');
      expect(placeholders[0].textContent).toContain('请在公众号后台手动插入');
      expect(placeholders[0].textContent).not.toContain('上方');
      expect(placeholders[1].textContent).toContain('🎬 视频：outro');
    });

    it('should return 0 when no videos are present', () => {
      const container = document.createElement('div');
      container.innerHTML = '<p>Normal text</p>';
      const count = transformVideosForClipboard(container);
      expect(count).toBe(0);
    });
  });

  describe('processAllVideos: DOM Transformation to Draft Placeholders', () => {
    it('should replace <video> elements with draft placeholder card', async () => {
      const html = `
        <div class="content">
          <h1>测试文章</h1>
          <video src="attachments/my-demo.mp4" controls></video>
          <p>正文内容</p>
        </div>
      `;

      const onProgress = vi.fn();
      let videoCount = 0;

      const resultHtml = await processAllVideos(html, null, onProgress, {
        onVideoCount: (count) => {
          videoCount = count;
        },
      });

      expect(resultHtml).toContain('wechat-video-draft-placeholder');
      expect(resultHtml).toContain('🎬 视频：my-demo');
      expect(resultHtml).toContain('微信官方接口不支持直接同步视频，请在微信后台点击上方「视频」按钮上传或选择视频');
      expect(resultHtml).not.toContain('<video');
      expect(videoCount).toBe(1);
      expect(onProgress).toHaveBeenCalledWith(1, 1);
    });

    it('should detect .wechat-video-card and replace entire card preserving custom title', async () => {
      const html = `
        <div>
          <section class="wechat-video-card" data-video-src="attachments/feature-demo.mp4" data-video-title="功能演示">
            <video controls src="app://local/attachments/feature-demo.mp4" data-video-src="attachments/feature-demo.mp4"></video>
            <section class="wechat-video-title">🎬 功能演示</section>
          </section>
        </div>
      `;

      let videoCount = 0;
      const resultHtml = await processAllVideos(html, null, null, {
        onVideoCount: (count) => {
          videoCount = count;
        },
      });

      expect(resultHtml).toContain('wechat-video-draft-placeholder');
      expect(resultHtml).toContain('🎬 视频：功能演示');
      expect(resultHtml).not.toContain('wechat-video-card');
      expect(resultHtml).not.toContain('<video');
      expect(videoCount).toBe(1);
    });

    it('should return unchanged html when no videos are present', async () => {
      const html = '<div class="content"><p>纯文本内容</p></div>';
      const resultHtml = await processAllVideos(html);
      expect(resultHtml).toBe(html);
    });
  });
});

