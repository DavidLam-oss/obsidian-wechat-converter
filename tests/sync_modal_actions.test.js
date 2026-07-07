/*
## 核心功能

覆盖 sync modal actions 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 sync modal actions 模块。

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

function findButtonByText(root, text) {
  return Array.from(root.querySelectorAll('button')).find((btn) => btn.textContent === text) || null;
}

describe('AppleStyleView - sync action modal flows', () => {
  let AppleStyleView;
  let view;
  let getLastModal;
  let notices;

  beforeEach(() => {
    vi.resetModules();
    const obsidianMock = require('obsidian');
    ({ getLastModal } = installModalMock(obsidianMock));

    notices = [];
    obsidianMock.Notice = class {
      constructor(message = '', duration = 0) {
        this.message = message;
        this.duration = duration;
        notices.push({ message, duration, instance: this });
      }
      setMessage(message) {
        this.message = message;
      }
      hide() {
        this.hidden = true;
      }
    };

    AppleStyleView = loadInputModule().AppleStyleView;
    view = new AppleStyleView(null, {
      manifest: { id: 'wechat-converter' },
      settings: {},
      saveSettings: vi.fn(),
    });
    view.app = { isMobile: true };
  });

  it('openPluginSettings should return false when app.setting api is unavailable', () => {
    view.app = {};

    const opened = view.openPluginSettings();

    expect(opened).toBe(false);
  });

  it('showAccountSetupEmptyState should fallback to notice when config action cannot open settings', () => {
    vi.spyOn(view, 'openPluginSettings').mockReturnValue(false);

    view.showAccountSetupEmptyState();

    const modal = getLastModal();
    const configBtn = findButtonByText(modal.contentEl, '去配置账号');
    expect(configBtn).not.toBeNull();

    configBtn.onclick();

    expect(notices.length).toBeGreaterThan(0);
    expect(notices[notices.length - 1].message).toContain('请在设置中打开 Obsidian 发布助手并配置公众号账号');
  });

  it('showSyncFailureActions should trigger retry callback when user clicks retry', async () => {
    const retrySpy = vi.spyOn(view, 'onSyncToWechat').mockResolvedValue(undefined);

    view.showSyncFailureActions('network error');

    const modal = getLastModal();
    const retryBtn = findButtonByText(modal.contentEl, '重试同步');
    expect(retryBtn).not.toBeNull();

    await retryBtn.onclick();

    expect(retrySpy).toHaveBeenCalledTimes(1);
  });

  it('showSyncFailureActions should fallback to notice when settings action cannot open settings', () => {
    vi.spyOn(view, 'openPluginSettings').mockReturnValue(false);

    view.showSyncFailureActions('network error');

    const modal = getLastModal();
    const settingsBtn = findButtonByText(modal.contentEl, '去配置账号');
    expect(settingsBtn).not.toBeNull();

    settingsBtn.onclick();

    expect(notices.length).toBeGreaterThan(0);
    expect(notices[notices.length - 1].message).toContain('请在设置中打开 Obsidian 发布助手并配置公众号账号');
  });

  it('showSyncFailureActions should let users unlink a stale draft and retry as a new draft', async () => {
    const retrySpy = vi.spyOn(view, 'onSyncToWechat').mockResolvedValue(undefined);
    view.plugin.settings = {
      draftCache: {
        version: 1,
        articles: {
          'folder/note.md': {
            sourcePath: 'folder/note.md',
            mediaId: 'draft-stale',
            accountId: 'acc-1',
            title: 'Note',
            index: 0,
            updatedAt: 100,
          },
        },
      },
    };
    view.sessionDraftMediaId = 'draft-stale';
    view.sessionDraftIndex = 0;

    view.showSyncFailureActions('更新草稿失败', {
      draftAssociation: {
        sourcePath: 'folder/note.md',
        mediaId: 'draft-stale',
        accountId: 'acc-1',
      },
    });

    const modal = getLastModal();
    expect(modal.contentEl.textContent).toContain('取消关联后新建草稿');
    const resetBtn = findButtonByText(modal.contentEl, '取消关联并新建草稿');
    expect(resetBtn).not.toBeNull();

    await resetBtn.onclick();

    expect(view.plugin.settings.draftCache.articles).toEqual({});
    expect(view.sessionDraftMediaId).toBe('');
    expect(view.sessionDraftIndex).toBe(0);
    expect(view.plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(retrySpy).toHaveBeenCalledTimes(1);
  });

  it('showSyncFailureActions should show proxy auth error message and hide unlink button', () => {
    view.showSyncFailureActions('Token 无效，请联系作者获取', {
      isProxyAuth: true,
      draftAssociation: {
        sourcePath: 'folder/note.md',
        mediaId: 'draft-stale',
        accountId: 'acc-1',
      },
    });

    const modal = getLastModal();
    expect(modal.contentEl.textContent).toContain('请检查您的 API 代理地址和 Token 配置是否正确');
    expect(modal.contentEl.textContent).not.toContain('取消关联后新建草稿');
    const resetBtn = findButtonByText(modal.contentEl, '取消关联并新建草稿');
    expect(resetBtn).toBeNull();
  });
});
