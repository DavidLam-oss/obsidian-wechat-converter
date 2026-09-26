/**
 * ## 核心功能
 *
 * 测试小红书卡片封面独立选图工作台（Media Picker Modal）。
 * 覆盖 Unsplash 批量候选抓取、宿主 Modal 容器、Tab 切换状态机、
 * 笔记插图提取平铺、本地上传入口以及 AI 生图风格画廊交互。
 *
 * ## 约束
 *
 * - 严禁包含任何 emoji；
 * - 遵守单文件软线 800 行约束；
 * - 使用 Obsidian DOM 操作与事件监听。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

require('obsidian');
const obsidian = require('obsidian');
const { __applyExtensions: applyExtensions } = obsidian;

const {
  fetchUnsplashPhotos,
} = await import('../services/card-cover-source.js');

const {
  showCardMediaPickerModal,
} = await import('../views/converter/card-media-picker-modal.js');

const {
  renderUnsplashMediaPickerTab,
} = await import('../views/converter/card-media-picker-unsplash.js');

const {
  renderNoteMediaPickerTab,
} = await import('../views/converter/card-media-picker-note.js');

const {
  renderAiMediaPickerTab,
} = await import('../views/converter/card-media-picker-ai.js');

describe('卡片独立选图工作台 (Media Picker Modal)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.__obsidianModalRegistry = [];
  });

  describe('fetchUnsplashPhotos 接口服务', () => {
    it('缺少 apiKey 时抛出清晰的中文错误', async () => {
      await expect(
        fetchUnsplashPhotos({ apiKey: '' })
      ).rejects.toThrow('未配置 Unsplash Access Key');
    });

    it('携带 query 时调用 search/photos 接口并解析结果列表', async () => {
      const mockRequestUrl = vi.fn().mockResolvedValue({
        status: 200,
        json: {
          total: 100,
          total_pages: 10,
          results: [
            {
              id: 'photo-1',
              urls: {
                small: 'https://images.unsplash.com/thumb-1',
                regular: 'https://images.unsplash.com/regular-1',
                raw: 'https://images.unsplash.com/raw-1',
              },
              user: {
                name: '摄影师张三',
                username: 'zhangsan',
                links: { html: 'https://unsplash.com/@zhangsan' },
              },
              alt_description: '壮丽山河风景',
            },
          ],
        },
      });

      const res = await fetchUnsplashPhotos({
        apiKey: 'test-key-abc',
        query: 'landscape',
        page: 1,
        perPage: 12,
        ratioId: '3:4',
        requestUrl: mockRequestUrl,
      });

      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
      const reqArgs = mockRequestUrl.mock.calls[0][0];
      expect(reqArgs.url).toContain('https://api.unsplash.com/search/photos');
      expect(reqArgs.url).toContain('query=landscape');
      expect(reqArgs.headers.Authorization).toBe('Client-ID test-key-abc');

      expect(res.total).toBe(100);
      expect(res.totalPages).toBe(10);
      expect(res.results).toHaveLength(1);
      expect(res.results[0]).toEqual({
        id: 'photo-1',
        thumbUrl: 'https://images.unsplash.com/thumb-1',
        regularUrl: 'https://images.unsplash.com/regular-1',
        rawUrl: 'https://images.unsplash.com/raw-1',
        authorName: '摄影师张三',
        authorUsername: 'zhangsan',
        authorLink: 'https://unsplash.com/@zhangsan',
        altDescription: '壮丽山河风景',
      });
    });

    it('未携带 query 时调用 photos/random 接口批量获取随机候选', async () => {
      const mockRequestUrl = vi.fn().mockResolvedValue({
        status: 200,
        json: [
          {
            id: 'random-1',
            urls: {
              small: 'https://images.unsplash.com/rand-thumb-1',
              regular: 'https://images.unsplash.com/rand-reg-1',
              raw: 'https://images.unsplash.com/rand-raw-1',
            },
            user: { name: 'Alice' },
          },
        ],
      });

      const res = await fetchUnsplashPhotos({
        apiKey: 'test-key-abc',
        query: '',
        perPage: 12,
        ratioId: '3:4',
        requestUrl: mockRequestUrl,
      });

      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
      const reqArgs = mockRequestUrl.mock.calls[0][0];
      expect(reqArgs.url).toContain('https://api.unsplash.com/photos/random');
      expect(reqArgs.url).toContain('count=12');
      expect(res.results).toHaveLength(1);
      expect(res.results[0].id).toBe('random-1');
    });

    it('接口返回 HTTP 错误时抛出异常', async () => {
      const mockRequestUrl = vi.fn().mockResolvedValue({
        status: 403,
        text: 'Rate Limit Exceeded',
      });

      await expect(
        fetchUnsplashPhotos({
          apiKey: 'test-key-abc',
          query: 'nature',
          requestUrl: mockRequestUrl,
        })
      ).rejects.toThrow('Unsplash 检索失败 (403): Rate Limit Exceeded');
    });
  });

  describe('showCardMediaPickerModal 宿主弹窗与 Tab 调度', () => {
    it('能够成功唤起 Modal 并渲染 3 个选项卡', () => {
      const mockView = {
        app: {
          setting: {
            open: vi.fn(),
            openTabById: vi.fn(),
          },
        },
        plugin: {
          settings: {
            unsplashAccessKey: 'test-key',
          },
        },
        getCurrentCardLayoutSettings: vi.fn().mockReturnValue({ ratioId: '3:4' }),
        getCurrentDocContent: vi.fn().mockReturnValue('# 标题\n这是一段正文。'),
      };

      const onSelect = vi.fn();
      showCardMediaPickerModal({
        view: mockView,
        initialTab: 'unsplash',
        onSelect,
      });

      const modal = globalThis.__obsidianModalRegistry[globalThis.__obsidianModalRegistry.length - 1];
      expect(modal).toBeDefined();

      const modalEl = modal.modalEl;
      expect(modalEl.classList.contains('card-media-picker-modal')).toBe(true);

      const contentEl = modal.contentEl;
      const titleEl = contentEl.querySelector('.card-media-picker-title');
      expect(titleEl?.textContent).toBe('选择封面配图');

      const tabs = Array.from(contentEl.querySelectorAll('.card-media-picker-tab-btn'));
      expect(tabs.map((t) => t.textContent)).toEqual([
        'Unsplash 摄影',
        '笔记与本地',
        'AI 生图',
      ]);

      // 默认初始选中 Unsplash
      expect(tabs[0].classList.contains('is-active')).toBe(true);

      // 模拟点击切换到「笔记与本地」
      tabs[1].dispatchEvent(new MouseEvent('click'));
      expect(tabs[1].classList.contains('is-active')).toBe(true);
      expect(tabs[0].classList.contains('is-active')).toBe(false);

      // 模拟点击切换到「AI 生图」
      tabs[2].dispatchEvent(new MouseEvent('click'));
      expect(tabs[2].classList.contains('is-active')).toBe(true);
    });
  });

  describe('renderUnsplashMediaPickerTab 交互', () => {
    it('在未配置 Unsplash Key 时展示配置引导卡片与随机降级入口', () => {
      const container = applyExtensions(document.createElement('div'));
      const mockView = {
        plugin: {
          settings: {
            unsplashAccessKey: '',
          },
        },
      };

      const onOpenSettings = vi.fn();
      const onSelect = vi.fn();

      renderUnsplashMediaPickerTab({
        container,
        view: mockView,
        ratioId: '3:4',
        onSelect,
        onOpenSettings,
      });

      const promptCard = container.querySelector('.card-media-picker-empty');
      expect(promptCard).not.toBeNull();
      expect(promptCard.textContent).toContain('尚未配置 Unsplash Access Key');

      const settingsBtn = promptCard.querySelector('button:not(.mod-cta)');
      expect(settingsBtn?.textContent).toBe('前往设置配置 Key');
      settingsBtn.dispatchEvent(new MouseEvent('click'));
      expect(onOpenSettings).toHaveBeenCalled();
    });

    it('在已配置 Key 时展示搜索框、推荐标签并可发起检索', async () => {
      const container = applyExtensions(document.createElement('div'));
      const mockView = {
        plugin: {
          settings: {
            unsplashAccessKey: 'valid-api-key',
          },
        },
      };

      renderUnsplashMediaPickerTab({
        container,
        view: mockView,
        ratioId: '3:4',
        onSelect: vi.fn(),
        onOpenSettings: vi.fn(),
      });

      const searchInput = container.querySelector('.card-media-picker-search-input');
      expect(searchInput).not.toBeNull();

      const chips = container.querySelectorAll('.card-media-picker-chip');
      expect(chips.length).toBeGreaterThan(0);

      // 点击热门标签芯片，应将关键词同步到输入框中
      const firstChip = chips[0];
      firstChip.dispatchEvent(new MouseEvent('click'));
      expect(searchInput.value).toBe(firstChip.textContent);
    });
  });

  describe('renderNoteMediaPickerTab 交互', () => {
    it('能够提取并平铺当前笔记中的图片', () => {
      const container = applyExtensions(document.createElement('div'));
      const markdown = `
# 测试笔记
![[photo1.jpg]]
![配图](https://example.com/banner.png)
      `;

      const mockView = {
        app: {
          metadataCache: {
            getFirstLinkpathDest: vi.fn(),
          },
          vault: {
            readBinary: vi.fn(),
          },
        },
        getCurrentDocContent: vi.fn().mockReturnValue(markdown),
      };

      renderNoteMediaPickerTab({
        container,
        view: mockView,
        onSelect: vi.fn(),
      });

      const noteItems = container.querySelectorAll('.card-media-picker-item');
      expect(noteItems.length).toBe(2);

      const dropzone = container.querySelector('.card-media-picker-dropzone');
      expect(dropzone).not.toBeNull();
      expect(dropzone.textContent).toContain('拖拽本地图片至此处，或点击浏览文件');
    });

    it('能够优先从 cardPreviewPendingInput 中读取当前活跃 Markdown 正文', () => {
      const container = applyExtensions(document.createElement('div'));
      const mockView = {
        app: {
          metadataCache: {
            getFirstLinkpathDest: vi.fn(),
          },
          vault: {
            readBinary: vi.fn(),
          },
        },
        cardPreviewPendingInput: {
          markdown: '# 实时待预览笔记\n![[gallery.png]]\n<img src="https://example.com/cover.png">',
          sourcePath: 'Notes/Daily.md',
        },
      };

      renderNoteMediaPickerTab({
        container,
        view: mockView,
        onSelect: vi.fn(),
      });

      const noteItems = container.querySelectorAll('.card-media-picker-item');
      expect(noteItems.length).toBe(2);
    });

    it('点击笔记中的本地图片时能够读取二进制并触发 onSelect 回调', async () => {
      const container = applyExtensions(document.createElement('div'));
      const fakeBinary = new Uint8Array([137, 80, 78, 71]).buffer;
      const fakeFile = { path: 'attachments/diagram.png', extension: 'png' };

      const mockView = {
        app: {
          metadataCache: {
            getFirstLinkpathDest: vi.fn().mockReturnValue(fakeFile),
          },
          vault: {
            readBinary: vi.fn().mockResolvedValue(fakeBinary),
          },
        },
        lastResolvedMarkdown: '![流程架构](attachments/diagram.png)',
        lastResolvedSourcePath: 'Posts/Tech.md',
      };

      const onSelect = vi.fn();
      renderNoteMediaPickerTab({
        container,
        view: mockView,
        onSelect,
      });

      const noteItems = container.querySelectorAll('.card-media-picker-item');
      expect(noteItems.length).toBe(1);

      // 触发点击项
      await noteItems[0].dispatchEvent(new MouseEvent('click'));
      // 等待微任务加载完成
      await Promise.resolve();
      await Promise.resolve();

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'note',
          dataUrl: expect.stringContaining('data:image/png;base64,'),
        })
      );
    });

    it('能够正确解析笔记中的相对路径图片 (../assets/img.png) 并展示与选择', async () => {
      const container = applyExtensions(document.createElement('div'));
      const fakeBinary = new Uint8Array([255, 216, 255, 224]).buffer;
      const fakeFile = { path: 'Notes/assets/banner.jpg', extension: 'jpg' };

      const mockView = {
        app: {
          metadataCache: {
            getFirstLinkpathDest: vi.fn().mockReturnValue(null),
          },
          vault: {
            getAbstractFileByPath: vi.fn((p) => (p === 'Notes/assets/banner.jpg' ? fakeFile : null)),
            readBinary: vi.fn().mockResolvedValue(fakeBinary),
            getResourcePath: vi.fn().mockReturnValue('app://obsidian.md/Notes/assets/banner.jpg'),
          },
        },
        lastResolvedMarkdown: '![父级相对配图](../assets/banner.jpg)',
        lastResolvedSourcePath: 'Notes/SubFolder/Article.md',
      };

      const onSelect = vi.fn();
      renderNoteMediaPickerTab({
        container,
        view: mockView,
        onSelect,
      });

      const noteItems = container.querySelectorAll('.card-media-picker-item');
      expect(noteItems.length).toBe(1);

      await noteItems[0].dispatchEvent(new MouseEvent('click'));
      await Promise.resolve();
      await Promise.resolve();

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'note',
          dataUrl: expect.stringContaining('data:image/jpeg;base64,'),
        })
      );
    });

    it('点击笔记中的图床网络图片时能够下载为 Base64 并触发 onSelect 回调', async () => {
      const container = applyExtensions(document.createElement('div'));
      const fakeBinary = new Uint8Array([137, 80, 78, 71]).buffer;

      // Mock obsidian.requestUrl for downloadAsBase64
      const origObsidianReq = obsidian.requestUrl;
      obsidian.requestUrl = vi.fn().mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'image/png' },
        arrayBuffer: fakeBinary,
      });

      try {
        const mockView = {
          app: {
            metadataCache: { getFirstLinkpathDest: vi.fn() },
            vault: { readBinary: vi.fn() },
          },
          lastResolvedMarkdown: '![CDN图床](https://cdn.example.com/images/hero.png)',
          lastResolvedSourcePath: 'Notes/Article.md',
        };

        const onSelect = vi.fn();
        renderNoteMediaPickerTab({
          container,
          view: mockView,
          onSelect,
        });

        const noteItems = container.querySelectorAll('.card-media-picker-item');
        expect(noteItems.length).toBe(1);

        await noteItems[0].dispatchEvent(new MouseEvent('click'));
        await Promise.resolve();
        await Promise.resolve();

        expect(onSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            source: 'note',
            dataUrl: expect.stringContaining('data:image/png;base64,'),
          })
        );
      } finally {
        obsidian.requestUrl = origObsidianReq;
      }
    });

    it('笔记中无图片时展示提示占位', () => {
      const container = applyExtensions(document.createElement('div'));
      const mockView = {
        app: {},
        getCurrentDocContent: vi.fn().mockReturnValue('纯文本，没有插图。'),
      };

      renderNoteMediaPickerTab({
        container,
        view: mockView,
        onSelect: vi.fn(),
      });

      const emptyEl = container.querySelector('.card-media-picker-empty');
      expect(emptyEl).not.toBeNull();
      expect(emptyEl.textContent).toContain('当前笔记暂无插图');
    });
  });

  describe('renderAiMediaPickerTab 交互', () => {
    it('渲染 AI 封面风格卡片并支持选择与提示词响应', () => {
      const container = applyExtensions(document.createElement('div'));
      const mockView = {
        plugin: {
          settings: {
            ai: {
              providers: [
                {
                  id: 'p-1',
                  name: 'OpenAI 图像服务',
                  enabled: true,
                  apiKey: 'sk-123',
                  supportsImage: true,
                  imageModel: 'dall-e-3',
                },
              ],
              defaultImageProviderId: 'p-1',
            },
          },
        },
        getCurrentCardCoverFields: vi.fn().mockReturnValue({}),
        getActiveFileTitle: vi.fn().mockReturnValue('深度思考与写作'),
        getActiveDocExcerpt: vi.fn().mockReturnValue('这是一篇探讨深度写作方法的文章。'),
      };

      renderAiMediaPickerTab({
        container,
        view: mockView,
        ratioId: '3:4',
        onSelect: vi.fn(),
        onOpenSettings: vi.fn(),
      });

      const styleCards = container.querySelectorAll('.card-media-picker-ai-card');
      expect(styleCards.length).toBeGreaterThan(0);

      const textarea = container.querySelector('.card-media-picker-prompt-textarea');
      expect(textarea).not.toBeNull();
      expect(textarea.value.length).toBeGreaterThan(0);
      expect(textarea.value).toContain('深度思考与写作');

      // 切换风格卡片
      const secondCard = styleCards[1];
      secondCard.dispatchEvent(new MouseEvent('click'));
      expect(secondCard.classList.contains('is-selected')).toBe(true);

      const generateBtn = container.querySelector('.mod-cta');
      expect(generateBtn?.textContent).toBe('开始生成封面');
    });

    it('点击开始生成封面时透传正确的提示词与比例并调用生图服务', async () => {
      const container = applyExtensions(document.createElement('div'));
      const mockView = {
        plugin: {
          settings: {
            ai: {
              providers: [
                {
                  id: 'p-1',
                  name: '测试提供商',
                  baseUrl: 'https://api.openai.com/v1',
                  apiKey: 'sk-123',
                  supportsImage: true,
                  imageModel: 'dall-e-3',
                },
              ],
              defaultImageProviderId: 'p-1',
            },
          },
        },
        getCurrentCardCoverFields: vi.fn().mockReturnValue({}),
        getActiveFileTitle: vi.fn().mockReturnValue('测试笔记标题'),
        getActiveDocExcerpt: vi.fn().mockReturnValue('测试笔记摘要'),
      };

      const mockRequestUrl = vi.fn().mockResolvedValue({
        status: 200,
        json: {
          data: [{ b64_json: 'aW1n' }],
        },
      });

      renderAiMediaPickerTab({
        container,
        view: mockView,
        ratioId: '3:5',
        onSelect: vi.fn(),
        onOpenSettings: vi.fn(),
      });

      // 提取输入框内容
      const textarea = container.querySelector('.card-media-picker-prompt-textarea');
      expect(textarea.value).toContain('测试笔记标题');

      // 替身覆盖 requestUrl
      const originalRequestUrl = obsidian.requestUrl;
      obsidian.requestUrl = mockRequestUrl;

      try {
        const generateBtn = container.querySelector('.mod-cta');
        await generateBtn.dispatchEvent(new MouseEvent('click'));

        // 等待微任务
        await new Promise((r) => setTimeout(r, 50));

        expect(mockRequestUrl).toHaveBeenCalled();
        const callArgs = mockRequestUrl.mock.calls[0][0];
        const bodyObj = JSON.parse(callArgs.body);
        expect(bodyObj.prompt).toBeDefined();
        expect(bodyObj.prompt.length).toBeGreaterThan(0);
        expect(bodyObj.prompt).toContain('测试笔记标题');
        expect(bodyObj.size).toBe('1024x1792');
      } finally {
        obsidian.requestUrl = originalRequestUrl;
      }
    });

    it('未配置任何 AI 生图 Provider 时展示引导配置提示', () => {
      const container = applyExtensions(document.createElement('div'));
      const mockView = {
        plugin: {
          settings: {
            ai: {
              providers: [],
            },
          },
        },
      };

      const onOpenSettings = vi.fn();
      renderAiMediaPickerTab({
        container,
        view: mockView,
        ratioId: '3:4',
        onSelect: vi.fn(),
        onOpenSettings,
      });

      const emptyCard = container.querySelector('.card-media-picker-empty');
      expect(emptyCard).not.toBeNull();
      expect(emptyCard.textContent).toContain('尚未配置可用的 AI 生图服务商');

      const configBtn = emptyCard.querySelector('.mod-cta');
      configBtn.dispatchEvent(new MouseEvent('click'));
      expect(onOpenSettings).toHaveBeenCalled();
    });
  });
});
