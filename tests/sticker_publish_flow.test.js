/*
## 核心功能

覆盖微信贴图发布链路（弹窗拦截 + 草稿发送）的 Vitest 测试用例。

## 输入

接收 AppleStyleView、mock 的 Obsidian Modal/Notice 环境与贴图提取结果。

## 输出

输出自动化断言结果，保护贴图发布的字数拦截、图片上传与草稿隔离行为。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、tests/helpers 与被测的发布弹窗/同步动作模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { loadInputModule } = require('./helpers/input-module.cjs');
const { createObsidianLikeElement } = require('./helpers/obsidian-dom.js');

function installModalMock(obsidianMock) {
  const openedModals = [];

  class ModalMock {
    constructor(app) {
      this.app = app;
      this.titleEl = createObsidianLikeElement('h2');
      this.contentEl = createObsidianLikeElement('div');
      this.modalEl = createObsidianLikeElement('div');
      openedModals.push(this);
    }

    open() {
      this.isOpen = true;
    }

    close() {
      this.isOpen = false;
      this.onClose?.();
    }
  }

  obsidianMock.Modal = ModalMock;
  return { getLastModal: () => openedModals[openedModals.length - 1] };
}

function createStickerData(overrides = {}) {
  return {
    title: '贴图标题',
    content: '一段文案',
    images: ['a.png', 'b.png'],
    imageDisplaySources: ['app://vault/a.png', 'app://vault/b.png'],
    hasCodeBlocks: false,
    hasTables: false,
    sourcePath: 'note-a.md',
    ...overrides,
  };
}

describe('WeChat sticker publish flow', () => {
  let AppleStyleView;
  let view;
  let getLastModal;
  let notices;

  beforeEach(() => {
    vi.resetModules();
    const obsidianMock = require('obsidian');
    ({ getLastModal } = installModalMock(obsidianMock));

    notices = [];
    obsidianMock.Notice = class NoticeMock {
      constructor(message) {
        this.message = message;
        notices.push(this);
      }
      setMessage(message) {
        this.message = message;
      }
      hide() {
        this.hidden = true;
      }
    };

    const inputModule = loadInputModule();
    AppleStyleView = inputModule.AppleStyleView;

    view = new AppleStyleView(null, {
      settings: {
        wechatAccounts: [{ id: 'acc-1', name: '账号1', appId: 'wx1', appSecret: 'sec1' }],
        defaultAccountId: 'acc-1',
        proxyUrl: '',
      },
      saveSettings: vi.fn(),
    });

    view.app = { isMobile: false };
    view.previewMode = 'sticker';
    view.getPublishContextFile = vi.fn(() => ({ path: 'note-a.md', basename: 'note-a' }));
    view.getFrontmatterPublishMeta = vi.fn(() => ({ excerpt: '', coverSrc: null, title: '' }));
    view.getFirstImageFromArticle = vi.fn(() => null);
  });

  describe('showSyncModal in sticker mode', () => {
    it('should render sticker thumbnails with displayable resource paths', () => {
      view.previewStickerData = createStickerData();
      view.buildStickerData = vi.fn(async () => view.previewStickerData);

      view.showSyncModal();

      const modal = getLastModal();
      const thumbs = Array.from(modal.contentEl.querySelectorAll('.wechat-modal-sticker-grid-preview img'));
      expect(thumbs.map((img) => img.getAttribute('src'))).toEqual([
        'app://vault/a.png',
        'app://vault/b.png',
      ]);
      expect(thumbs.every((img) => img.getAttribute('decoding') === 'async')).toBe(true);
      expect(view.buildStickerData).not.toHaveBeenCalled();
    });

    it('should keep publish thumbnails out of nested modal compositor effects', () => {
      const css = readFileSync(
        resolve(process.cwd(), 'styles/sticker-publish.css'),
        'utf8'
      );

      expect(css).toMatch(
        /\.sticker-publish-image-body \.sticker-image-list__item\s*\{[\s\S]*?transition:\s*border-color 140ms ease,\s*box-shadow 140ms ease;/
      );
      expect(css).toMatch(
        /\.sticker-publish-image-body \.sticker-image-list__order,[\s\S]*?\.sticker-publish-image-body \.sticker-image-list__move-controls button\s*\{[\s\S]*?backdrop-filter:\s*none;/
      );
    });

    it('should wait for sticker data before opening when the current source has no cache', async () => {
      view.previewStickerData = null;
      let resolveStickerData;
      view.buildStickerData = vi.fn(() => new Promise((resolve) => {
        resolveStickerData = resolve;
      }));

      view.showSyncModal();

      const modal = getLastModal();
      expect(modal.isOpen).not.toBe(true);

      resolveStickerData(createStickerData());
      await Promise.resolve();
      await Promise.resolve();

      expect(modal.isOpen).toBe(true);
      expect(modal.contentEl.querySelectorAll('.wechat-modal-sticker-grid-preview img')).toHaveLength(2);
    });

    it('should show a 20-character title counter and block over-limit titles', () => {
      view.previewStickerData = createStickerData();
      view.buildStickerData = vi.fn(async () => view.previewStickerData);

      view.showSyncModal();

      const modal = getLastModal();
      const titleInput = modal.contentEl.querySelector('.sticker-publish-title .wechat-modal-title-input');
      const titleCount = modal.contentEl.querySelector('.sticker-publish-title .sticker-publish-count');
      const titleCountValue = titleCount.querySelector('.sticker-publish-count-value');
      const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');
      expect(titleCount.textContent).toBe('6/20 字');
      expect(titleCountValue.textContent).toBe('6');
      expect(titleCountValue.classList.contains('is-error')).toBe(false);

      titleInput.value = '字'.repeat(21);
      titleInput.dispatchEvent(new Event('input'));

      expect(titleCount.textContent).toBe('21/20 字');
      expect(titleCountValue.textContent).toBe('21');
      expect(titleCountValue.classList.contains('is-error')).toBe(true);
      expect(titleCount.classList.contains('is-error')).toBe(false);
      expect(syncBtn.disabled).toBe(true);
      expect(syncBtn.textContent).toBe('标题超长，无法同步');
      expect(syncBtn.getAttribute('title')).toContain('21 字');
    });

    it('should reuse article-mode image action copy and button styling', () => {
      view.previewStickerData = createStickerData();
      view.buildStickerData = vi.fn(async () => view.previewStickerData);

      view.showSyncModal();

      const modal = getLastModal();
      const imageActions = modal.contentEl.querySelector('.sticker-publish-image-actions');
      const actionButtons = Array.from(imageActions.querySelectorAll('button'));

      expect(imageActions.classList.contains('wechat-modal-cover-btns')).toBe(true);
      expect(actionButtons.map((button) => button.textContent)).toEqual(['上传', '从素材库选择']);
      expect(actionButtons[1].classList.contains('wechat-cover-select-material-btn')).toBe(true);
      expect(actionButtons.every((button) => button.querySelector('svg') === null)).toBe(true);
    });

    it('should keep lightweight content metadata before the image area and disable adding at 20 images', () => {
      const images = Array.from({ length: 20 }, (_, index) => `img-${index + 1}.png`);
      view.previewStickerData = createStickerData({
        images,
        imageDisplaySources: images.map((src) => `app://vault/${src}`),
      });
      view.buildStickerData = vi.fn(async () => view.previewStickerData);

      view.showSyncModal();

      const modal = getLastModal();
      const status = modal.contentEl.querySelector('.sticker-publish-status');
      const contentMeta = modal.contentEl.querySelector('.sticker-publish-content-meta');
      const imageSection = modal.contentEl.querySelector('.sticker-publish-images');
      const actionButtons = Array.from(modal.contentEl.querySelectorAll('.sticker-publish-image-actions button'));
      expect(status).toBeNull();
      expect(contentMeta.nextElementSibling).toBe(imageSection);
      expect(contentMeta.textContent).toContain('发布文案');
      expect(contentMeta.textContent).toContain('4/1000 字');
      expect(imageSection.textContent).toContain('20 / 20');
      expect(actionButtons).toHaveLength(2);
      expect(actionButtons.every((button) => button.disabled)).toBe(true);
      expect(actionButtons[0].getAttribute('title')).toContain('最多 20 张');
    });

    it('should refresh the sidebar preview once the modal closes after an image edit', async () => {
      view.previewStickerData = createStickerData();
      view.buildStickerData = vi.fn(async () => view.previewStickerData);
      view.renderStickerPreview = vi.fn();

      view.showSyncModal();

      const modal = getLastModal();
      modal.contentEl.querySelector('.sticker-image-list__remove').click();
      await Promise.resolve();
      modal.close();

      expect(view.renderStickerPreview).toHaveBeenCalledTimes(1);
    });

    it('should only accept the remaining local-image slot and report overflow', () => {
      const images = Array.from({ length: 19 }, (_, index) => `img-${index + 1}.png`);
      view.previewStickerData = createStickerData({
        images,
        imageDisplaySources: images.map((src) => `app://vault/${src}`),
      });
      view.buildStickerData = vi.fn(async () => view.previewStickerData);
      view.showSyncModal();

      const modal = getLastModal();
      const originalCreateElement = document.createElement.bind(document);
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
        const element = originalCreateElement(tagName, options);
        if (String(tagName).toLowerCase() !== 'input') return element;
        const files = [
          new File(['a'], 'new-a.png', { type: 'image/png', lastModified: 1 }),
          new File(['b'], 'new-b.png', { type: 'image/png', lastModified: 2 }),
        ];
        Object.defineProperty(element, 'files', { configurable: true, value: files });
        element.click = () => element.onchange?.();
        return element;
      });
      const originalCreateObjectUrl = window.URL.createObjectURL;
      const originalRevokeObjectUrl = window.URL.revokeObjectURL;
      window.URL.createObjectURL = vi.fn((file) => `blob:${file.name}`);
      window.URL.revokeObjectURL = vi.fn();

      try {
        modal.contentEl.querySelector('.sticker-publish-image-actions button').click();
      } finally {
        createElementSpy.mockRestore();
        window.URL.createObjectURL = originalCreateObjectUrl;
        window.URL.revokeObjectURL = originalRevokeObjectUrl;
      }

      const uiState = view.getStickerUiState('note-a.md');
      expect(uiState.manualItems).toHaveLength(1);
      expect(uiState.manualItems[0].name).toBe('new-a.png');
      expect(notices.some((notice) => String(notice.message).includes('另有 1 张超过 20 张上限，未添加'))).toBe(true);
    });

    it('should block syncing when the caption exceeds the wechat limit', () => {
      view.previewStickerData = createStickerData({ content: '字'.repeat(1001) });
      view.buildStickerData = vi.fn(async () => view.previewStickerData);

      view.showSyncModal();

      const modal = getLastModal();
      const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');
      expect(syncBtn.disabled).toBe(true);
      expect(syncBtn.textContent).toBe('文案超长，无法同步');
      expect(syncBtn.getAttribute('title')).toContain('1001 字');
    });

    it('should block syncing when there is no image at all', () => {
      view.previewStickerData = createStickerData({ images: [], imageDisplaySources: [] });
      view.buildStickerData = vi.fn(async () => view.previewStickerData);

      view.showSyncModal();

      const modal = getLastModal();
      const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');
      const emptyText = modal.contentEl.querySelector('.sticker-image-list__empty-text');
      expect(syncBtn.disabled).toBe(true);
      expect(syncBtn.textContent).toBe('图片不足，无法同步');
      expect(emptyText.textContent).toContain('贴图至少需要 1 张图片');
      expect(modal.contentEl.querySelectorAll('.sticker-publish-image-actions button')).toHaveLength(2);
    });

    it('should describe semantic conversions without exposing internal keys', () => {
      view.previewStickerData = createStickerData({
        removed: [
          { kind: 'codeBlocks', count: 1 },
          { kind: 'tables', count: 2 },
        ],
      });
      view.buildStickerData = vi.fn(async () => view.previewStickerData);

      view.showSyncModal();

      const modal = getLastModal();
      const summary = modal.contentEl.querySelector('.sticker-publish-cleaning-note');
      expect(summary.textContent)
        .toBe('已转换为纯文本：代码块 1 处、表格 2 处。笔记原文未改动。');
      expect(summary.textContent).not.toContain('codeBlocks');
    });

    it('should not reuse the article draft association and should not require a cover', async () => {
      view.previewStickerData = createStickerData();
      view.buildStickerData = vi.fn(async () => view.previewStickerData);
      view.plugin.settings.draftCache = {
        version: 1,
        articles: {
          'note-a.md': {
            sourcePath: 'note-a.md',
            mediaId: 'draft-existing',
            accountId: 'acc-1',
            title: 'note-a',
            index: 0,
            updatedAt: 100,
          },
        },
      };
      const syncSpy = vi.spyOn(view, 'onSyncToWechat').mockResolvedValue(undefined);

      view.showSyncModal();

      const modal = getLastModal();
      const status = modal.contentEl.querySelector('.wechat-draft-status');
      const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');

      expect(status.textContent).toBe('');
      expect(syncBtn.disabled).toBe(false);

      await syncBtn.onclick();

      expect(syncSpy).toHaveBeenCalledTimes(1);
      expect(view.sessionDraftMediaId).toBe('');
      expect(view.sessionDraftIndex).toBe(0);
    });
  });

  describe('onSyncToWechat in sticker mode', () => {
    it('should keep article and sticker wechat notices free of emoji and success media ids', () => {
      const noticeSources = [
        'views/publish-modal/wechat-sync-action.js',
        'views/publish-modal/wechat-account-state.js',
        'views/publish-modal/wechat-sync-modal.js',
      ].map((filePath) => readFileSync(resolve(process.cwd(), filePath), 'utf8')).join('\n');

      expect(noticeSources).not.toMatch(/🚀|✅|⚠️|❌/u);
      expect(noticeSources).not.toContain('MediaID');
      expect(noticeSources).toContain(
        "new Notice(isUpdate ? WECHAT_UPDATE_SUCCESS_NOTICE : WECHAT_SYNC_SUCCESS_NOTICE)"
      );
      expect(noticeSources).toContain('new Notice(WECHAT_SYNC_SUCCESS_NOTICE)');
    });

    it('should publish without a rendered article html', async () => {
      view.currentHtml = '';
      const stickerSpy = vi.spyOn(view, 'onSyncStickerToWechat').mockResolvedValue(undefined);

      await view.onSyncToWechat();

      expect(stickerSpy).toHaveBeenCalledTimes(1);
    });

    it('should upload every image through the permanent material api and create a newspic draft', async () => {
      view.buildStickerData = vi.fn(async () => createStickerData());
      view.srcToBlob = vi.fn(async (src) => ({ type: 'image/png', src }));
      view.sessionTitle = '弹窗里改过的标题';

      const uploadCover = vi.fn(async () => ({ media_id: 'media-x' }));
      const createImageDraft = vi.fn(async () => ({ media_id: 'sticker-draft-1' }));
      const obsidianMock = require('obsidian');
      obsidianMock.requestUrl = vi.fn(async () => ({ json: {}, status: 200 }));

      const inputModule = loadInputModule();
      const { WechatAPI } = inputModule;
      vi.spyOn(WechatAPI.prototype, 'uploadCover').mockImplementation(uploadCover);
      vi.spyOn(WechatAPI.prototype, 'createImageDraft').mockImplementation(createImageDraft);

      await view.onSyncStickerToWechat({ id: 'acc-1', name: '账号1', appId: 'wx1', appSecret: 'sec1' });

      expect(uploadCover).toHaveBeenCalledTimes(2);
      expect(createImageDraft).toHaveBeenCalledTimes(1);
      expect(createImageDraft.mock.calls[0][0]).toMatchObject({
        title: '弹窗里改过的标题',
        content: '一段文案',
        imageMediaIds: ['media-x', 'media-x'],
      });
      const successNotice = notices.at(-1);
      expect(successNotice.message).toBe('同步成功！请前往微信公众号后台草稿箱查看');
      expect(successNotice.message).not.toContain('MediaID');
      expect(notices.map((notice) => String(notice.message)).join('')).not.toMatch(/🚀|✅|⚠️|❌/u);
    });

    it('should refuse to call the api when the caption is over the limit', async () => {
      view.buildStickerData = vi.fn(async () => createStickerData({ content: '字'.repeat(1001) }));
      view.srcToBlob = vi.fn();

      await view.onSyncStickerToWechat({ id: 'acc-1', name: '账号1', appId: 'wx1', appSecret: 'sec1' });

      expect(view.srcToBlob).not.toHaveBeenCalled();
      expect(notices.some((notice) => String(notice.message).includes('超出微信 1000 字上限'))).toBe(true);
    });

    it('should refuse to upload images when the sticker title exceeds 20 characters', async () => {
      view.buildStickerData = vi.fn(async () => createStickerData());
      view.sessionTitle = '字'.repeat(21);
      view.srcToBlob = vi.fn();

      await view.onSyncStickerToWechat({ id: 'acc-1', name: '账号1', appId: 'wx1', appSecret: 'sec1' });

      expect(view.srcToBlob).not.toHaveBeenCalled();
      expect(notices.some((notice) => String(notice.message).includes('超出 20 字上限'))).toBe(true);
    });

    it('should report which image failed to upload', async () => {
      view.buildStickerData = vi.fn(async () => createStickerData());
      view.srcToBlob = vi.fn(async () => {
        throw new Error('读取失败');
      });

      await view.onSyncStickerToWechat({ id: 'acc-1', name: '账号1', appId: 'wx1', appSecret: 'sec1' });

      const failure = notices.find((notice) => String(notice.message).includes('贴图同步失败'));
      expect(failure).toBeTruthy();
      expect(String(failure.message)).toContain('第 1 张图片上传失败');
      expect(String(failure.message)).not.toMatch(/🚀|✅|⚠️|❌/u);
    });
  });
});
