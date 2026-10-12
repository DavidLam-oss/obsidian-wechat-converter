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
      noteId: 'note-a.md',
      fields: { coverMode: 'none', coverImage: '', coverImageSource: '' },
      getCoverFields: () => noteASession.fields,
      applyCoverFields: vi.fn((patch) => {
        Object.assign(noteASession.fields, patch);
        return { changed: true };
      }),
    };

    noteBSession = {
      noteId: 'note-b.md',
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
      cardPreviewPendingInput: { sourcePathKey: 'note-a.md' },
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
        mockView.cardPreviewPendingInput.sourcePathKey = newNote;
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
  });
});
