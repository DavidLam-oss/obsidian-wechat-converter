/*
## 核心功能

覆盖 sync modal UI 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 sync modal UI 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');
function createObsidianLikeElement(tag = 'div') {
  const el = document.createElement(tag);
  el.empty = function empty() {
    this.innerHTML = '';
  };
  el.addClass = function addClass(cls) {
    this.classList.add(cls);
  };
  el.removeClass = function removeClass(cls) {
    this.classList.remove(cls);
  };
  el.setText = function setText(text) {
    this.textContent = text;
  };
  el.createEl = function createEl(childTag, opts = {}) {
    const child = createObsidianLikeElement(childTag);
    if (opts.cls) child.className = opts.cls;
    if (opts.text !== undefined) child.textContent = opts.text;
    if (opts.attr) {
      Object.entries(opts.attr).forEach(([key, value]) => {
        child.setAttribute(key, String(value));
      });
    }
    this.appendChild(child);
    return child;
  };
  el.createDiv = function createDiv(opts = {}) {
    return this.createEl('div', opts);
  };
  return el;
}

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
  return {
    getLastModal: () => openedModals[openedModals.length - 1],
  };
}

describe('AppleStyleView - sync modal mobile UI', () => {
  let AppleStyleView;
  let view;
  let getLastModal;

  beforeEach(() => {
    vi.resetModules();
    const obsidianMock = require('obsidian');
    ({ getLastModal } = installModalMock(obsidianMock));

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

    view.app = { isMobile: true };
    view.currentHtml = '<p>同步内容</p>';
    view.getPublishContextFile = vi.fn(() => ({ path: 'note-a.md', basename: 'note-a' }));
  });

  it('should auto-expand advanced options on mobile when cover is missing', () => {
    view.getFrontmatterPublishMeta = vi.fn(() => ({ excerpt: '', coverSrc: null }));
    view.getFirstImageFromArticle = vi.fn(() => null);

    view.showSyncModal();

    const modal = getLastModal();
    const advanced = modal.contentEl.querySelector('details.wechat-sync-advanced');
    const hint = modal.contentEl.querySelector('.wechat-sync-mobile-quick-hint');
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');

    expect(advanced).not.toBeNull();
    expect(advanced.hasAttribute('open')).toBe(true);
    expect(hint.textContent).toContain('未检测到封面');
    expect(syncBtn.disabled).toBe(true);
    expect(syncBtn.textContent).toBe('请先设置封面');
  });

  it('should keep advanced options collapsed on mobile when cover exists', () => {
    const coverSrc = 'data:image/png;base64,abc';
    view.getFrontmatterPublishMeta = vi.fn(() => ({ excerpt: '', coverSrc }));
    view.getFirstImageFromArticle = vi.fn(() => null);

    view.showSyncModal();

    const modal = getLastModal();
    const advanced = modal.contentEl.querySelector('details.wechat-sync-advanced');
    const hint = modal.contentEl.querySelector('.wechat-sync-mobile-quick-hint');
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');
    const previewImg = modal.contentEl.querySelector('.wechat-modal-cover-preview img');

    expect(advanced).not.toBeNull();
    expect(advanced.hasAttribute('open')).toBe(false);
    expect(hint.textContent).toContain('可直接同步');
    expect(syncBtn.disabled).toBe(false);
    expect(syncBtn.textContent).toBe('开始同步');
    expect(previewImg.getAttribute('src')).toBe(coverSrc);
  });

  it('should show associated draft state and pass draft media id into sync', async () => {
    const coverSrc = 'data:image/png;base64,abc';
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
    view.getFrontmatterPublishMeta = vi.fn(() => ({ excerpt: '', coverSrc }));
    view.getFirstImageFromArticle = vi.fn(() => null);
    const syncSpy = vi.spyOn(view, 'onSyncToWechat').mockResolvedValue(undefined);

    view.showSyncModal();

    const modal = getLastModal();
    const status = modal.contentEl.querySelector('.wechat-draft-status');
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');

    expect(status.textContent).toContain('已关联微信草稿');
    expect(syncBtn.textContent).toBe('更新草稿');

    await syncBtn.onclick();

    expect(view.sessionDraftMediaId).toBe('draft-existing');
    expect(view.sessionDraftIndex).toBe(0);
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });

  it('should clear associated draft from the modal before creating a new draft', async () => {
    const coverSrc = 'data:image/png;base64,abc';
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
    view.getFrontmatterPublishMeta = vi.fn(() => ({ excerpt: '', coverSrc }));
    view.getFirstImageFromArticle = vi.fn(() => null);

    view.showSyncModal();

    const modal = getLastModal();
    const unlinkBtn = modal.contentEl.querySelector('.wechat-draft-unlink');
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');
    expect(unlinkBtn).not.toBeNull();

    await unlinkBtn.onclick();

    expect(view.plugin.settings.draftCache.articles['note-a.md']).toBeDefined();
    expect(view.plugin.saveSettings).not.toHaveBeenCalled();
    expect(modal.contentEl.querySelector('.wechat-draft-status').textContent).toContain('确认取消');

    await unlinkBtn.onclick();

    expect(view.plugin.settings.draftCache.articles).toEqual({});
    expect(view.plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(modal.contentEl.querySelector('.wechat-draft-status').textContent).toBe('');
    expect(syncBtn.textContent).toBe('开始同步');
  });
});
