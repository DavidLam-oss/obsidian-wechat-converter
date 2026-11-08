/**
 * ## 核心功能
 *
 * 测试卡片封面异步选图与切篇会话安全机制（H3, H4, M4）。
 * 覆盖：
 * 1. 切换笔记时 AI 生图与 Unsplash 选图结果安全隔离，避免污染当前活跃笔记；
 * 2. 切换笔记时 AI 提炼观点结果防污染；
 * 3. AI 生图取消机制与弹窗关闭清理；
 * 4. 历史记录容量上限（单笔记最多 10 张，总笔记最多 10 篇）防内存泄漏。
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
  showCardMediaPickerModal,
} = await import('../views/converter/card-media-picker-modal.js');

const {
  renderAiMediaPickerTab,
} = await import('../views/converter/card-media-picker-ai.js');

const {
  renderUnsplashMediaPickerTab,
} = await import('../views/converter/card-media-picker-unsplash.js');

describe('卡片封面选图切篇安全与取消机制 (H3, H4, M4)', () => {
  let mockView;
  let noteASession;
  let noteBSession;
  let sessionStore;

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.__obsidianModalRegistry = [];

    noteASession = {
      noteId: 'note-1-2isfeea',
      sourcePath: 'note-a.md',
      getSourcePath: () => 'note-a.md',
      fields: { coverMode: 'none', coverImage: '', coverImageSource: '' },
      getCoverFields: () => noteASession.fields,
      applyCoverFields: vi.fn((patch) => {
        Object.assign(noteASession.fields, patch);
        return { changed: true };
      }),
    };

    noteBSession = {
      noteId: 'note-2-9qkfeeb',
      sourcePath: 'note-b.md',
      getSourcePath: () => 'note-b.md',
      fields: { coverMode: 'none', coverImage: '', coverImageSource: '' },
      getCoverFields: () => noteBSession.fields,
      applyCoverFields: vi.fn((patch) => {
        Object.assign(noteBSession.fields, patch);
        return { changed: true };
      }),
    };

    sessionStore = {
      'note-a.md': noteASession,
      'note-b.md': noteBSession,
    };

    let currentActiveNote = 'note-a.md';

    mockView = {
      app: {},
      lastResolvedSourcePath: 'note-a.md',
      cardPreviewPendingInput: { sourcePathKey: 'note-a.md', sourcePath: 'note-a.md' },
      plugin: {
        settings: {
          ai: {
            providers: [
              {
                id: 'ai-img-p',
                name: 'Test AI Provider',
                baseUrl: 'https://api.example.com/v1',
                apiKey: 'sk-test',
                imageModel: 'flux',
                textModel: 'gpt-4o-mini',
                enabled: true,
                supportsImage: true,
                supportsText: true,
              },
            ],
            defaultImageProviderId: 'ai-img-p',
            defaultTextProviderId: 'ai-img-p',
          },
          unsplashAccessKey: 'test-key',
        },
      },
      getCardSessions: () => ({
        has: (key) => Object.prototype.hasOwnProperty.call(sessionStore, key),
        getSession: (key) => sessionStore[key] || null,
      }),
      getCardSettingsSession: () => sessionStore[currentActiveNote] || null,
      applyCardCoverField: vi.fn((key, val) => {
        const sess = sessionStore[currentActiveNote];
        if (sess) {
          sess.fields[key] = val;
        }
      }),
      switchToNote: (newNote) => {
        currentActiveNote = newNote;
        mockView.lastResolvedSourcePath = newNote;
        mockView.cardPreviewPendingInput = { sourcePathKey: newNote, sourcePath: newNote };
      },
    };

    obsidian.requestUrl = vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'image/png' },
      json: {
        data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }],
      },
      arrayBuffer: new Uint8Array([137, 80, 78, 71]).buffer,
    });
  });

  describe('H3: 跨文章切换会话竞态隔离', () => {
    it('在笔记 A 发起生图后切换到笔记 B，生成结果写入笔记 A 会话，不污染笔记 B', async () => {
      const container = applyExtensions(document.createElement('div'));
      const onSelect = vi.fn();

      renderAiMediaPickerTab({
        container,
        view: mockView,
        sourcePathKey: 'note-a.md',
        ratioId: '3:4',
        onSelect,
      });

      const generateBtn = container.querySelector('.card-media-picker-ai-actions button');
      expect(generateBtn).not.toBeNull();

      // 在后台网络请求开始前/开始时切走活跃笔记
      mockView.switchToNote('note-b.md');

      // 触发点击生成
      generateBtn.click();
      await vi.waitFor(() => {
        expect(generateBtn.disabled).toBe(false);
      });

      // 验证：当前活跃笔记 B 的 onSelect 没有被触发
      expect(onSelect).not.toHaveBeenCalled();
      expect(noteBSession.applyCoverFields).not.toHaveBeenCalled();

      // 验证：原笔记 A 的会话被正确更新
      expect(noteASession.applyCoverFields).toHaveBeenCalled();
      expect(noteASession.fields.coverImageSource).toBe('ai');
      expect(noteASession.fields.coverImage).toContain('data:image/png;base64,');

      // 验证：原笔记 A 的历史记录中包含了该图片
      expect(mockView._cardAiImageHistory['note-a.md']).toHaveLength(1);
    });

    it('在笔记 A 搜索 Unsplash 后切换到笔记 B 点击图片，结果保存到笔记 A', async () => {
      const container = applyExtensions(document.createElement('div'));
      const onSelect = vi.fn();

      obsidian.requestUrl = vi.fn()
        // search photos response
        .mockResolvedValueOnce({
          status: 200,
          json: {
            results: [
              {
                id: 'unsplash-1',
                urls: { small: 'https://img.example/1-thumb', raw: 'https://img.example/1-raw' },
                user: { name: 'Photographer' },
              },
            ],
          },
        })
        // download image binary response
        .mockResolvedValueOnce({
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
          arrayBuffer: new Uint8Array([255, 216, 255]).buffer,
        });

      renderUnsplashMediaPickerTab({
        container,
        view: mockView,
        sourcePathKey: 'note-a.md',
        ratioId: '3:4',
        onSelect,
      });

      await vi.waitFor(() => {
        expect(container.querySelectorAll('.card-media-picker-item').length).toBe(1);
      });

      // 用户切到笔记 B
      mockView.switchToNote('note-b.md');

      const photoItem = container.querySelector('.card-media-picker-item');
      photoItem.click();

      await vi.waitFor(() => {
        expect(noteASession.applyCoverFields).toHaveBeenCalled();
      });

      expect(onSelect).not.toHaveBeenCalled();
      expect(noteASession.fields.coverImageSource).toBe('unsplash');
      expect(noteBSession.applyCoverFields).not.toHaveBeenCalled();
    });

    it('在笔记 A 提炼核心观点期间切换到笔记 B，丢弃提炼结果不覆盖输入框', async () => {
      const container = applyExtensions(document.createElement('div'));

      obsidian.requestUrl = vi.fn().mockImplementation(async () => {
        // 模拟网络延迟
        await new Promise((res) => setTimeout(res, 20));
        return {
          status: 200,
          json: {
            choices: [{ message: { content: '提炼得到的笔记 A 观点' } }],
          },
        };
      });

      renderAiMediaPickerTab({
        container,
        view: mockView,
        sourcePathKey: 'note-a.md',
        ratioId: '3:4',
        onSelect: vi.fn(),
      });

      const extractBtn = container.querySelector('.card-media-picker-ai-extract-btn');
      const topicInput = container.querySelector('.card-media-picker-topic-input');
      const originalVal = topicInput.value;

      extractBtn.click();
      // 用户在网络响应返回前切到笔记 B
      mockView.switchToNote('note-b.md');

      await vi.waitFor(() => {
        expect(extractBtn.disabled).toBe(false);
      });

      // 验证输入框没有被篡改
      expect(topicInput.value).toBe(originalVal);
    });

    it('在笔记 A 未切换笔记时，AI 生图完成正常触发 onSelect 回调并设为封面', async () => {
      const container = applyExtensions(document.createElement('div'));
      const onSelect = vi.fn();

      renderAiMediaPickerTab({
        container,
        view: mockView,
        sourcePathKey: 'note-a.md',
        ratioId: '3:4',
        onSelect,
      });

      const generateBtn = container.querySelector('.card-media-picker-ai-actions button');
      generateBtn.click();

      await vi.waitFor(() => {
        expect(generateBtn.disabled).toBe(false);
      });

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'ai',
          dataUrl: expect.stringContaining('data:image/png;base64,'),
        }),
      );
      expect(noteASession.applyCoverFields).not.toHaveBeenCalled();
    });

    it('在笔记 A 未切换笔记时，Unsplash 选图完成正常触发 onSelect 回调', async () => {
      const container = applyExtensions(document.createElement('div'));
      const onSelect = vi.fn();

      obsidian.requestUrl = vi.fn().mockImplementation(async ({ url }) => {
        if (url.includes('api.unsplash.com/search') || url.includes('api.unsplash.com/photos/random')) {
          return {
            status: 200,
            json: {
              results: [
                {
                  id: 'unsplash-1',
                  urls: { small: 'https://img.example/1-thumb', raw: 'https://img.example/1-raw' },
                  user: { name: 'Photographer' },
                  links: { download_location: 'https://api.unsplash.com/photos/unsplash-1/download' },
                },
              ],
            },
          };
        }
        if (url.includes('download')) {
          return { status: 200, json: { url: 'https://img.example/1-raw' } };
        }
        return {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
          arrayBuffer: new Uint8Array([255, 216, 255]).buffer,
        };
      });

      renderUnsplashMediaPickerTab({
        container,
        view: mockView,
        sourcePathKey: 'note-a.md',
        ratioId: '3:4',
        onSelect,
      });

      await vi.waitFor(() => {
        expect(container.querySelectorAll('.card-media-picker-item').length).toBe(1);
      });

      const photoItem = container.querySelector('.card-media-picker-item');
      photoItem.click();

      await vi.waitFor(() => {
        expect(onSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            source: 'unsplash',
            dataUrl: expect.stringContaining('data:image/jpeg;base64,'),
          }),
        );
      });
    });

    it('在笔记 A 未切换笔记时，AI 提炼观点成功写入输入框', async () => {
      const container = applyExtensions(document.createElement('div'));

      obsidian.requestUrl = vi.fn().mockResolvedValue({
        status: 200,
        json: {
          choices: [{ message: { content: '提炼得到的笔记 A 观点' } }],
        },
      });

      renderAiMediaPickerTab({
        container,
        view: mockView,
        sourcePathKey: 'note-a.md',
        ratioId: '3:4',
        onSelect: vi.fn(),
      });

      const extractBtn = container.querySelector('.card-media-picker-ai-extract-btn');
      const topicInput = container.querySelector('.card-media-picker-topic-input');

      extractBtn.click();
      await vi.waitFor(() => {
        expect(extractBtn.disabled).toBe(false);
      });

      expect(topicInput.value).toBe('提炼得到的笔记 A 观点');
    });

    it('切走笔记且原笔记会话已被销毁时，安全提示会话已失效并不抛错', async () => {
      const container = applyExtensions(document.createElement('div'));
      const onSelect = vi.fn();

      renderAiMediaPickerTab({
        container,
        view: mockView,
        sourcePathKey: 'note-a.md',
        ratioId: '3:4',
        onSelect,
      });

      const generateBtn = container.querySelector('.card-media-picker-ai-actions button');

      // 切走笔记且原笔记从 registry 中被注销
      mockView.switchToNote('note-b.md');
      delete sessionStore['note-a.md'];

      generateBtn.click();
      await vi.waitFor(() => {
        expect(generateBtn.disabled).toBe(false);
      });

      expect(onSelect).not.toHaveBeenCalled();
      expect(noteBSession.applyCoverFields).not.toHaveBeenCalled();
    });
  });

  describe('H4: AI 生图取消机制与生命周期清理', () => {
    it('点击取消按钮可主动中止生图任务并清理进度状态', async () => {
      const container = applyExtensions(document.createElement('div'));

      obsidian.requestUrl = vi.fn().mockImplementation(async () => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), 500);
        });
      });

      renderAiMediaPickerTab({
        container,
        view: mockView,
        sourcePathKey: 'note-a.md',
        ratioId: '3:4',
        onSelect: vi.fn(),
      });

      const generateBtn = container.querySelector('.card-media-picker-ai-actions button');
      const cancelBtn = container.querySelector('.card-media-picker-cancel-btn');
      const progressWrap = container.querySelector('.card-media-picker-progress-wrap');

      generateBtn.click();
      expect(progressWrap.classList.contains('is-hidden')).toBe(false);

      // 点击取消按钮
      cancelBtn.click();

      expect(progressWrap.classList.contains('is-hidden')).toBe(true);
      expect(generateBtn.disabled).toBe(false);
    });

    it('关闭 Modal 弹窗时自动触发 cleanup 取消后台生图任务', async () => {
      showCardMediaPickerModal({
        view: mockView,
        sourcePathKey: 'note-a.md',
        initialTab: 'ai',
        onSelect: vi.fn(),
      });

      const activeModal = globalThis.__obsidianModalRegistry?.[0];
      expect(activeModal).toBeDefined();

      // 关闭弹窗
      activeModal.close();
      // 确认 onClose 执行没有抛错且清理完成
      expect(activeModal.isOpen).toBe(false);
    });
  });

  describe('M4: AI 历史记录容量上限与内存防泄漏', () => {
    it('单笔记历史记录最多保留 10 张，超出时 FIFO 淘汰最旧项', async () => {
      const container = applyExtensions(document.createElement('div'));
      mockView._cardAiImageHistory = {
        'note-a.md': Array.from({ length: 10 }, (_, i) => ({
          id: `id_${i}`,
          dataUrl: `data:image/png;base64,test_${i}`,
          prompt: `prompt_${i}`,
          timestamp: i,
        })),
      };

      obsidian.requestUrl = vi.fn().mockResolvedValue({
        status: 200,
        json: {
          data: [{ b64_json: 'new_image_b64' }],
        },
      });

      renderAiMediaPickerTab({
        container,
        view: mockView,
        sourcePathKey: 'note-a.md',
        ratioId: '3:4',
        onSelect: vi.fn(),
      });

      const generateBtn = container.querySelector('.card-media-picker-ai-actions button');
      generateBtn.click();

      await vi.waitFor(() => {
        expect(generateBtn.disabled).toBe(false);
      });

      const history = mockView._cardAiImageHistory['note-a.md'];
      expect(history).toHaveLength(10);
      expect(history[0].dataUrl).toBe('data:image/png;base64,new_image_b64');
      // 最旧的项被淘汰
      expect(history.find((h) => h.id === 'id_9')).toBeUndefined();
    });

    it('跨笔记缓存最多保留 10 篇笔记的历史记录', () => {
      const container = applyExtensions(document.createElement('div'));
      mockView._cardAiImageHistory = {};
      for (let i = 0; i < 10; i++) {
        mockView._cardAiImageHistory[`note-${i}.md`] = [];
      }

      mockView.switchToNote('note-new.md');

      renderAiMediaPickerTab({
        container,
        view: mockView,
        sourcePathKey: 'note-new.md',
        ratioId: '3:4',
        onSelect: vi.fn(),
      });

      const keys = Object.keys(mockView._cardAiImageHistory);
      expect(keys.length).toBeLessThanOrEqual(10);
      expect(keys).toContain('note-new.md');
      expect(keys).not.toContain('note-0.md');
    });

    it('关闭侧边栏重新打开后（新建 view 实例共享同一 plugin），AI 历史灵感与封面状态依然保留', async () => {
      const container1 = applyExtensions(document.createElement('div'));
      const onSelect1 = vi.fn();

      obsidian.requestUrl = vi.fn().mockResolvedValue({
        status: 200,
        json: {
          data: [{ b64_json: 'persisted_image_b64' }],
        },
      });

      renderAiMediaPickerTab({
        container: container1,
        view: mockView,
        sourcePathKey: 'note-a.md',
        ratioId: '3:4',
        onSelect: onSelect1,
      });

      const generateBtn = container1.querySelector('.card-media-picker-ai-actions button');
      generateBtn.click();

      await vi.waitFor(() => {
        expect(generateBtn.disabled).toBe(false);
      });

      expect(mockView.plugin._cardAiImageHistory['note-a.md']).toHaveLength(1);
      expect(mockView.plugin._cardCoverStateCache['note-a.md']?.coverImage).toBe('data:image/png;base64,persisted_image_b64');

      // 模拟侧边栏被彻底关闭后重新打开：创建全新的 newView 实例，但挂载同一个 plugin 实例
      const newView = {
        ...mockView,
        _cardAiImageHistory: undefined,
      };
      const container2 = applyExtensions(document.createElement('div'));

      renderAiMediaPickerTab({
        container: container2,
        view: newView,
        sourcePathKey: 'note-a.md',
        ratioId: '3:4',
        onSelect: vi.fn(),
      });

      const historyItems = container2.querySelectorAll('.card-media-picker-history-item');
      expect(historyItems).toHaveLength(1);
      const thumbImg = historyItems[0].querySelector('.card-media-picker-history-thumb');
      expect(thumbImg?.getAttribute('src')).toBe('data:image/png;base64,persisted_image_b64');
    });

    it('历史灵感缩略图提供复制图片、存入仓库与另存为操作按钮，点击操作按钮不误触发切换封面', async () => {
      const container = applyExtensions(document.createElement('div'));
      const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      mockView.plugin._cardAiImageHistory = {
        'note-a.md': [
          {
            id: 'ai_1',
            dataUrl: `data:image/png;base64,${pngB64}`,
            prompt: 'test prompt',
            styleId: '3d-clay',
            coverMode: 'adaptive',
            timestamp: Date.now(),
          },
          {
            id: 'ai_2',
            dataUrl: `data:image/png;base64,${pngB64}`,
            prompt: 'test prompt 2',
            styleId: 'minimal-vector',
            coverMode: 'mixed',
            timestamp: Date.now() - 1000,
          },
        ],
      };

      const writeBinaryMock = vi.fn().mockResolvedValue(undefined);
      const mkdirMock = vi.fn().mockResolvedValue(undefined);
      const existsMock = vi.fn().mockResolvedValue(false);
      mockView.app = {
        vault: {
          configDir: '.obsidian',
          adapter: {
            exists: existsMock,
            mkdir: mkdirMock,
            writeBinary: writeBinaryMock,
          },
        },
      };

      const onSelect = vi.fn();
      renderAiMediaPickerTab({
        container,
        view: mockView,
        sourcePathKey: 'note-a.md',
        ratioId: '3:4',
        onSelect,
      });

      const secondCard = container.querySelectorAll('.card-media-picker-history-item')[1];
      expect(secondCard).toBeDefined();

      const copyBtn = secondCard.querySelector('[data-action="copy"]');
      const vaultSaveBtn = secondCard.querySelector('[data-action="save-vault"]');
      const downloadBtn = secondCard.querySelector('[data-action="download"]');
      expect(copyBtn).not.toBeNull();
      expect(vaultSaveBtn).not.toBeNull();
      expect(downloadBtn).not.toBeNull();

      // 点击「存入仓库」按钮，应写入卡片导出目录，且不触发卡片选图的 onSelect
      vaultSaveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.waitFor(() => {
        expect(writeBinaryMock).toHaveBeenCalledTimes(1);
      });
      const savedPath = writeBinaryMock.mock.calls[0][0];
      expect(savedPath).toMatch(/^卡片导出\/note-a\/ai-cover-.*\.png$/);
      expect(onSelect).not.toHaveBeenCalled();

      // 点击「另存为」按钮，不触发卡片选图的 onSelect
      downloadBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});
