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
      hide() {}
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
    });

    it('should block syncing when the caption exceeds the wechat limit', () => {
      view.previewStickerData = createStickerData({ content: '字'.repeat(1001) });
      view.buildStickerData = vi.fn(async () => view.previewStickerData);

      view.showSyncModal();

      const modal = getLastModal();
      const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');
      expect(syncBtn.disabled).toBe(true);
      expect(syncBtn.textContent).toBe('文字超长，无法同步');
      expect(syncBtn.getAttribute('title')).toContain('1001 字');
    });

    it('should block syncing when there is no image at all', () => {
      view.previewStickerData = createStickerData({ images: [], imageDisplaySources: [] });
      view.buildStickerData = vi.fn(async () => view.previewStickerData);

      view.showSyncModal();

      const modal = getLastModal();
      const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');
      expect(syncBtn.disabled).toBe(true);
      expect(syncBtn.textContent).toBe('图片不足，无法同步');
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
      expect(notices.some((notice) => String(notice.message).includes('贴图已发送到微信草稿箱'))).toBe(true);
    });

    it('should refuse to call the api when the caption is over the limit', async () => {
      view.buildStickerData = vi.fn(async () => createStickerData({ content: '字'.repeat(1001) }));
      view.srcToBlob = vi.fn();

      await view.onSyncStickerToWechat({ id: 'acc-1', name: '账号1', appId: 'wx1', appSecret: 'sec1' });

      expect(view.srcToBlob).not.toHaveBeenCalled();
      expect(notices.some((notice) => String(notice.message).includes('超出微信 1000 字上限'))).toBe(true);
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
    });
  });
});
