import { describe, it, expect, vi } from 'vitest';
import {
  isVideoPath,
  extractVideoTitleFromPath,
  preProcessVideoEmbeds,
  buildWechatVideoCardHtml,
  renderVideoPlaceholders,
  injectVideoCardHtml,
} from '../services/obsidian-triplet-renderer-videos.js';
import {
  preprocessMarkdownForTriplet,
  renderObsidianTripletMarkdown,
} from '../services/obsidian-triplet-renderer.js';

describe('Triplet Video Support (services/obsidian-triplet-renderer-videos.js)', () => {
  describe('isVideoPath', () => {
    it('should correctly identify video file extensions', () => {
      expect(isVideoPath('video.mp4')).toBe(true);
      expect(isVideoPath('path/to/my_demo.MP4')).toBe(true);
      expect(isVideoPath('attachments/cut.webm')).toBe(true);
      expect(isVideoPath('video.mov?token=123#t=10')).toBe(true);
      expect(isVideoPath('clip.m4v')).toBe(true);
      expect(isVideoPath('stream.ogg')).toBe(true);
    });

    it('should reject non-video files and empty input', () => {
      expect(isVideoPath('image.png')).toBe(false);
      expect(isVideoPath('photo.jpg')).toBe(false);
      expect(isVideoPath('document.pdf')).toBe(false);
      expect(isVideoPath('note.md')).toBe(false);
      expect(isVideoPath('')).toBe(false);
      expect(isVideoPath(null)).toBe(false);
    });
  });

  describe('extractVideoTitleFromPath', () => {
    it('should prefer custom alt title when provided', () => {
      expect(extractVideoTitleFromPath('video.mp4', '精彩回顾')).toBe('精彩回顾');
      expect(extractVideoTitleFromPath('attachments/demo.mp4', '产品演示')).toBe('产品演示');
    });

    it('should derive title from filename when alt is missing', () => {
      expect(extractVideoTitleFromPath('attachments/dsh-mg-cut-preview.mp4')).toBe('dsh-mg-cut-preview');
      expect(extractVideoTitleFromPath('https://cdn.example.com/videos/feature_showcase.mp4?t=10')).toBe('feature_showcase');
      expect(extractVideoTitleFromPath('')).toBe('视频');
    });
  });

  describe('preProcessVideoEmbeds', () => {
    it('should protect Obsidian wikilink video embeds with placeholder', () => {
      const markdown = '前言\n\n![[dsh-mg-cut-preview.mp4]]\n\n后记';
      const { markdown: processed, videos } = preProcessVideoEmbeds(markdown);

      expect(videos.length).toBe(1);
      expect(videos[0].src).toBe('dsh-mg-cut-preview.mp4');
      expect(videos[0].title).toBe('dsh-mg-cut-preview');
      expect(processed).toContain('<section data-owc-video-placeholder="OWC_VID_0"></section>');
      expect(processed).not.toContain('![[dsh-mg-cut-preview.mp4]]');
    });

    it('should protect Obsidian wikilink video embeds with custom title', () => {
      const markdown = '![[attachments/demo.mp4|我的自定义视频标题]]';
      const { markdown: processed, videos } = preProcessVideoEmbeds(markdown);

      expect(videos.length).toBe(1);
      expect(videos[0].src).toBe('attachments/demo.mp4');
      expect(videos[0].title).toBe('我的自定义视频标题');
      expect(processed).toContain('<section data-owc-video-placeholder="OWC_VID_0"></section>');
    });

    it('should protect Markdown image syntax pointing to videos', () => {
      const markdown = '![演示视频](attachments/tutorial.mp4)';
      const { markdown: processed, videos } = preProcessVideoEmbeds(markdown);

      expect(videos.length).toBe(1);
      expect(videos[0].src).toBe('attachments/tutorial.mp4');
      expect(videos[0].title).toBe('演示视频');
      expect(processed).toContain('<section data-owc-video-placeholder="OWC_VID_0"></section>');
    });

    it('should protect raw HTML video tags', () => {
      const markdown = '<video src="https://example.com/clip.mp4" controls></video>';
      const { markdown: processed, videos } = preProcessVideoEmbeds(markdown);

      expect(videos.length).toBe(1);
      expect(videos[0].src).toBe('https://example.com/clip.mp4');
      expect(videos[0].title).toBe('clip');
      expect(processed).toContain('<section data-owc-video-placeholder="OWC_VID_0"></section>');
    });

    it('should NOT alter ordinary image wikilinks or links', () => {
      const markdown = '![[picture.png]]\n[Link to video](clip.mp4)';
      const { markdown: processed, videos } = preProcessVideoEmbeds(markdown);

      expect(videos.length).toBe(0);
      expect(processed).toBe(markdown);
    });
  });

  describe('buildWechatVideoCardHtml', () => {
    it('should generate stylish WeChat video card with player and title', () => {
      const html = buildWechatVideoCardHtml({
        id: 'OWC_VID_0',
        src: 'attachments/demo.mp4',
        title: '产品介绍',
        original: '',
      });

      expect(html).toContain('class="wechat-video-card"');
      expect(html).toContain('data-video-src="attachments/demo.mp4"');
      expect(html).toContain('data-video-title="产品介绍"');
      expect(html).toContain('<video class="wechat-video-player" controls="controls"');
      expect(html).toContain('🎬 产品介绍');
    });

    it('should resolve vault resource src when app is provided', () => {
      const mockApp = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue({ path: 'attachments/demo.mp4' }),
          getResourcePath: vi.fn().mockReturnValue('app://local/attachments/demo.mp4'),
        },
      };

      const html = buildWechatVideoCardHtml({
        id: 'OWC_VID_0',
        src: 'attachments/demo.mp4',
        title: '产品介绍',
        original: '',
      }, { app: mockApp });

      expect(html).toContain('src="app://local/attachments/demo.mp4"');
      expect(html).toContain('data-video-src="attachments/demo.mp4"');
    });
  });

  describe('renderVideoPlaceholders & injectVideoCardHtml', () => {
    it('should replace placeholders in DOM container', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p>Hello</p><section data-owc-video-placeholder="OWC_VID_0"></section><p>World</p>';

      renderVideoPlaceholders(div, [{
        id: 'OWC_VID_0',
        src: 'demo.mp4',
        title: 'Demo',
        original: '',
      }]);

      expect(div.querySelector('section[data-owc-video-placeholder]')).toBeNull();
      const card = div.querySelector('.wechat-video-card');
      expect(card).not.toBeNull();
      expect(card?.getAttribute('data-video-src')).toBe('demo.mp4');
      expect(div.querySelector('video')?.getAttribute('src')).toBe('demo.mp4');
    });

    it('should replace leftover placeholders via string injection', () => {
      const html = '<div><section data-owc-video-placeholder="OWC_VID_0"></section></div>';
      const result = injectVideoCardHtml(html, [{
        id: 'OWC_VID_0',
        src: 'demo.mp4',
        title: 'Demo',
        original: '',
      }]);

      expect(result).not.toContain('data-owc-video-placeholder');
      expect(result).toContain('class="wechat-video-card"');
      expect(result).toContain('data-video-src="demo.mp4"');
    });
  });

  describe('Integration with Triplet Renderer', () => {
    it('should protect video embeds during preprocessMarkdownForTriplet', () => {
      const markdown = '### 视频测试\n\n![[dsh-mg-cut-preview.mp4]]';
      const mockConverter = {
        stripFrontmatter: (md) => md,
      };

      const { markdown: processed, videos } = preprocessMarkdownForTriplet(markdown, mockConverter);

      expect(videos.length).toBe(1);
      expect(videos[0].src).toBe('dsh-mg-cut-preview.mp4');
      expect(processed).not.toContain('![[dsh-mg-cut-preview.mp4]]');
      expect(processed).not.toContain('<img src="dsh-mg-cut-preview.mp4"');
      expect(processed).toContain('data-owc-video-placeholder');
    });

    it('should render video embed note into wechat-video-card through renderObsidianTripletMarkdown', async () => {
      const markdown = '### 视频测试\n\n![[dsh-mg-cut-preview.mp4|特效剪辑演示]]';
      const mockApp = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue({ path: 'attachments/dsh-mg-cut-preview.mp4' }),
          getResourcePath: vi.fn().mockReturnValue('app://local/attachments/dsh-mg-cut-preview.mp4'),
        },
      };

      const mockConverter = {
        stripFrontmatter: (md) => md,
        getInlineStyle: () => 'color:#333;',
      };

      const mockMarkdownRenderer = {
        renderMarkdown: vi.fn().mockImplementation((md, el) => {
          // MarkdownRenderer should receive the placeholder safely, without network requests
          el.innerHTML = md;
        }),
      };

      const html = await renderObsidianTripletMarkdown({
        app: mockApp,
        converter: mockConverter,
        markdown,
        markdownRenderer: mockMarkdownRenderer,
      });

      expect(html).toContain('class="wechat-video-card"');
      expect(html).toContain('data-video-src="dsh-mg-cut-preview.mp4"');
      expect(html).toContain('data-video-title="特效剪辑演示"');
      expect(html).toContain('src="app://local/attachments/dsh-mg-cut-preview.mp4"');
      expect(html).toContain('🎬 特效剪辑演示');
      expect(html).not.toContain('data-owc-video-placeholder');
      expect(html).not.toContain('<img src="dsh-mg-cut-preview.mp4"');
    });
  });
});
