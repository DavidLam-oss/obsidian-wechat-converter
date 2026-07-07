/*
## 核心功能

覆盖 multi platform modal 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 multi platform modal 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// tests/multi_platform_modal.test.js
//
// Locks the DOM contract of the「其他平台发布」modal opened via
// AppleStyleView.showMultiPlatformSyncModal(). Mirrors the chip contract
// in tests/settings_platform_chip.test.js: name and status sit inside the
// label as stacked spans, and is-selected toggles correctly.
//
// Failing this test means a refactor changed the publish-modal platform row
// layout; review styles.css `.wechat-multiplatform-platform*` rules before
// adjusting the test.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');
const { AppleStyleView } = loadInputModule();
const obsidian = require('obsidian');
const { __applyExtensions: applyExtensions } = obsidian;

function installModalCapture() {
  const opened = [];
  class CapturingModal {
    constructor(app) {
      this.app = app;
      this.titleEl = applyExtensions(document.createElement('h2'));
      this.contentEl = applyExtensions(document.createElement('div'));
      this.modalEl = applyExtensions(document.createElement('div'));
      opened.push(this);
    }
    open() { this.isOpen = true; }
    close() { this.isOpen = false; }
  }
  obsidian.Modal = CapturingModal;
  return {
    getLastModal: () => opened[opened.length - 1],
    reset: () => { opened.length = 0; },
  };
}

function makeView({ selectedPlatforms = ['zhihu'], cachedPlatforms = null, bridge = null, app = null } = {}) {
  const platforms = cachedPlatforms || [
    { id: 'zhihu', name: '知乎', authKnown: true, authenticated: true, username: 'Lin' },
    { id: 'juejin', name: '掘金', authKnown: true, authenticated: false, error: '登录已失效' },
  ];
  const view = new AppleStyleView(null, {
    settings: {
      wechatAccounts: [{ id: 'acc-1', name: '账号1', appId: 'wx1', appSecret: 'sec1' }],
      defaultAccountId: 'acc-1',
      proxyUrl: '',
      multiPlatformSync: {
        enabled: true,
        port: 9527,
        token: 'test-token',
        supportedPlatforms: [],
        selectedPlatforms,
        connection: {
          status: 'connected',
          checkedAt: Date.now(),
          platforms,
          capabilities: {},
          message: '',
        },
        recentTasks: [],
      },
    },
    getWechatSyncBridgeService: vi.fn(() => ({})),
    saveSettings: vi.fn(),
  });
  if (bridge) view.plugin.getWechatSyncBridgeService = vi.fn(() => bridge);
  view.app = app || { isMobile: false };
  if (view.app.isMobile === undefined) view.app.isMobile = false;
  view.currentHtml = '<p>hello</p>';
  view.lastResolvedMarkdown = '';
  view.getPublishContextFile = vi.fn(() => ({ path: 'a.md', basename: 'a' }));
  view.getCurrentExportHtml = vi.fn(() => '<p>hello</p>');
  view.getFrontmatterPublishMeta = vi.fn(() => ({ coverSrc: '' }));
  view.getFirstImageFromArticle = vi.fn(() => '');
  view.prepareHtmlForWechatsyncArticle = vi.fn(async (html) => html);
  view.generateCoverThumbnailFromAsset = vi.fn(async () => '');
  view.getWechatsyncTaskSnapshot = vi.fn(async () => null);
  view.showMultiPlatformQuotaBlockedModal = vi.fn();
  return view;
}

function findRow(modal, platformId) {
  return Array.from(modal.contentEl.querySelectorAll('.wechat-multiplatform-platform'))
    .find((row) => row.querySelector(`input[value="${platformId}"]`));
}

describe('AppleStyleView - showMultiPlatformSyncModal platform rows', () => {
  let modalCapture;

  beforeEach(() => {
    modalCapture = installModalCapture();
  });

  it('renders selected rows with name + status both inside the label (stacked)', async () => {
    const view = makeView({ selectedPlatforms: ['zhihu'] });
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();

    const row = findRow(modal, 'zhihu');
    expect(row).toBeDefined();

    const label = row.querySelector('.wechat-multiplatform-platform-label');
    const name = label && label.querySelector('.wechat-multiplatform-platform-name');
    const status = label && label.querySelector('.wechat-multiplatform-platform-status');

    expect(label).not.toBeNull();
    expect(name).not.toBeNull();
    expect(status).not.toBeNull();
    expect(status.parentElement).toBe(label);
  });

  it('selected row carries is-selected + auth-status class', async () => {
    const view = makeView({ selectedPlatforms: ['zhihu'] });
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const row = findRow(modal, 'zhihu');
    expect(row.classList.contains('is-selected')).toBe(true);
    expect(row.classList.contains('is-ok')).toBe(true);
  });

  it('marks platform rows disabled when the browser bridge is not ready', async () => {
    const view = makeView({ selectedPlatforms: ['zhihu'] });
    view.plugin.settings.multiPlatformSync.connection.status = 'disconnected';
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const row = findRow(modal, 'zhihu');
    const checkbox = row.querySelector('input[type="checkbox"]');

    expect(row.classList.contains('is-disabled')).toBe(true);
    expect(row.classList.contains('is-selected')).toBe(false);
    expect(checkbox.disabled).toBe(true);
  });

  it('orders displayed platforms by authenticated state and featured platform order', async () => {
    const view = makeView({
      selectedPlatforms: ['xiaohongshu', 'zhihu', 'weibo', 'douban'],
      cachedPlatforms: [
        { id: 'douban', name: '豆瓣', authKnown: true, authenticated: true },
        { id: 'xiaohongshu', name: '小红书', authKnown: true, authenticated: false },
        { id: 'zhihu', name: '知乎', authKnown: true, authenticated: false },
        { id: 'weibo', name: '微博', authKnown: true, authenticated: true },
      ],
    });

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const rowIds = Array.from(modal.contentEl.querySelectorAll('.wechat-multiplatform-platform input'))
      .map((input) => input.value);

    expect(rowIds).toEqual(['weibo', 'douban', 'xiaohongshu', 'zhihu']);
  });

  it('login_required row gets is-error class when selected', async () => {
    const view = makeView({ selectedPlatforms: ['juejin'] });
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const row = findRow(modal, 'juejin');
    expect(row.classList.contains('is-selected')).toBe(true);
    expect(row.classList.contains('is-error')).toBe(true);
  });

  it('toggling checkbox flips is-selected on the row', async () => {
    const view = makeView({ selectedPlatforms: ['zhihu'] });
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const row = findRow(modal, 'zhihu');
    const checkbox = row.querySelector('input[type="checkbox"]');

    expect(row.classList.contains('is-selected')).toBe(true);

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    expect(row.classList.contains('is-selected')).toBe(false);
    expect(row.classList.contains('is-ok')).toBe(false);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(row.classList.contains('is-selected')).toBe(true);
    expect(row.classList.contains('is-ok')).toBe(true);
  });

  it('keeps temporary platform choices when returning to the tab inside the same modal', async () => {
    const cachedPlatforms = [
      { id: 'zhihu', name: '知乎', authKnown: true, authenticated: true },
      { id: 'juejin', name: '掘金', authKnown: true, authenticated: true },
      { id: 'csdn', name: 'CSDN', authKnown: true, authenticated: true },
    ];
    const view = makeView({
      selectedPlatforms: ['zhihu', 'juejin', 'csdn'],
      cachedPlatforms,
    });
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();

    const juejinRow = findRow(modal, 'juejin');
    const juejinCheckbox = juejinRow.querySelector('input[type="checkbox"]');
    juejinCheckbox.checked = false;
    juejinCheckbox.dispatchEvent(new Event('change'));

    await view.showMultiPlatformSyncModal({ modal });

    const returnedZhihu = findRow(modal, 'zhihu').querySelector('input[type="checkbox"]');
    const returnedJuejin = findRow(modal, 'juejin').querySelector('input[type="checkbox"]');
    const returnedCsdn = findRow(modal, 'csdn').querySelector('input[type="checkbox"]');

    expect(returnedZhihu.checked).toBe(true);
    expect(returnedJuejin.checked).toBe(false);
    expect(returnedCsdn.checked).toBe(true);
    expect(findRow(modal, 'juejin').classList.contains('is-selected')).toBe(false);
  });

  it('hides bridge-not-enabled empty state when enabled', async () => {
    const view = makeView({ selectedPlatforms: ['zhihu'] });
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const empty = modal.contentEl.querySelector('.wechat-sync-empty-state');
    expect(empty).toBeNull();
  });

  it('row exposes a tooltip with full platform name + status when selected', async () => {
    const view = makeView({ selectedPlatforms: ['zhihu'] });
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const row = findRow(modal, 'zhihu');
    const title = row.getAttribute('title');
    expect(title).toContain('知乎');
    expect(title).toContain('上次可用');
  });

  it('renders exactly one connection status bar (Phase 2 helper) above the platform list', async () => {
    const view = makeView({ selectedPlatforms: ['zhihu'] });
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const bars = modal.contentEl.querySelectorAll('.wechat-multiplatform-status');
    expect(bars.length).toBe(1);

    const bar = bars[0];
    const dot = bar.querySelector('.wechat-multiplatform-status-dot');
    expect(dot).not.toBeNull();
    expect(dot.classList.contains('is-ok')).toBe(true);

    // Bar must come before the platform list in DOM order.
    const list = modal.contentEl.querySelector('.wechat-multiplatform-list');
    expect(list).not.toBeNull();
    const followers = bar.compareDocumentPosition(list);
    expect(followers & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the free quota hint with a Pro upgrade action', async () => {
    const view = makeView({ selectedPlatforms: ['zhihu'] });
    view.openPublisherProPage = vi.fn();
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();

    const hint = modal.contentEl.querySelector('.wechat-multiplatform-quota-hint');
    expect(hint).not.toBeNull();
    expect(hint.classList.contains('is-free')).toBe(true);
    expect(hint.textContent).toContain('免费版每天 1 个平台额度');
    expect(hint.querySelector('.wechat-multiplatform-quota-pill')?.textContent).toBe('免费版');
    const upgradeBtn = hint.querySelector('button');
    expect(upgradeBtn.textContent).toBe('升级 Pro');

    upgradeBtn.click();
    expect(view.openPublisherProPage).toHaveBeenCalled();
  });

  it('hides the Pro upgrade button and shows a Pro-specific quota hint when the bridge reports proLicensed', async () => {
    const view = makeView({ selectedPlatforms: ['zhihu'] });
    view.plugin.settings.multiPlatformSync.connection.capabilities = { proLicensed: true };
    view.openPublisherProPage = vi.fn();
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();

    const hint = modal.contentEl.querySelector('.wechat-multiplatform-quota-hint');
    expect(hint).not.toBeNull();
    expect(hint.classList.contains('is-pro')).toBe(true);
    expect(hint.querySelector('.wechat-pro-identity-badge')?.textContent).toBe('Pro');
    expect(hint.textContent).toContain('Pro 已激活');
    expect(hint.textContent).not.toContain('免费版每天');
    expect(modal.contentEl.querySelector('.wechat-publish-mode-tab.is-active .wechat-pro-identity-badge')).toBeNull();
    expect(hint.querySelector('button')).toBeNull();
    expect(view.openPublisherProPage).not.toHaveBeenCalled();
  });

  it('uses live active client capabilities to hide the Pro upgrade button even when cached connection capabilities are stale', async () => {
    const bridge = {
      getActiveClientDescriptor: vi.fn(() => ({
        capabilities: { proLicensed: true },
      })),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge });
    view.plugin.settings.multiPlatformSync.connection.capabilities = {};
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();

    const hint = modal.contentEl.querySelector('.wechat-multiplatform-quota-hint');
    expect(hint.textContent).toContain('Pro 已激活');
    expect(hint.querySelector('button')).toBeNull();
  });

  it('falls back to live connectedClients capabilities when no active client descriptor is available', async () => {
    const bridge = {
      getStatus: vi.fn(() => ({
        connectedClients: [
          { status: 'connected', capabilities: { proLicensed: true } },
        ],
      })),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge });
    view.plugin.settings.multiPlatformSync.connection.capabilities = {};
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();

    const hint = modal.contentEl.querySelector('.wechat-multiplatform-quota-hint');
    expect(hint.textContent).toContain('Pro 已激活');
    expect(hint.querySelector('button')).toBeNull();
  });

  it('updates quota hint when the selected platforms exactly match the free quota', async () => {
    const cachedPlatforms = [
      { id: 'zhihu', name: '知乎', authKnown: true, authenticated: true },
      { id: 'juejin', name: '掘金', authKnown: true, authenticated: true },
      { id: 'csdn', name: 'CSDN', authKnown: true, authenticated: true },
      { id: 'bilibili', name: '哔哩哔哩', authKnown: true, authenticated: true },
    ];
    const view = makeView({ selectedPlatforms: ['zhihu'], cachedPlatforms });
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const hint = modal.contentEl.querySelector('.wechat-multiplatform-quota-hint');

    expect(hint.textContent).toContain('已选 1 个平台');
    expect(hint.textContent).toContain('刚好达到免费版每天 1 个平台额度');
  });

  it('updates quota hint when selected platforms exceed the free quota', async () => {
    const cachedPlatforms = [
      { id: 'zhihu', name: '知乎', authKnown: true, authenticated: true },
      { id: 'juejin', name: '掘金', authKnown: true, authenticated: true },
      { id: 'csdn', name: 'CSDN', authKnown: true, authenticated: true },
      { id: 'bilibili', name: '哔哩哔哩', authKnown: true, authenticated: true },
      { id: 'xiaohongshu', name: '小红书', authKnown: true, authenticated: true },
    ];
    const view = makeView({
      selectedPlatforms: ['zhihu', 'juejin', 'csdn', 'bilibili', 'xiaohongshu'],
      cachedPlatforms,
    });
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const hint = modal.contentEl.querySelector('.wechat-multiplatform-quota-hint');

    expect(hint.textContent).toContain('已选 5 个平台');
    expect(hint.textContent).toContain('超出部分会自动跳过');
  });

  it('passes truncate quotaPolicy and shows quota modal when the extension blocks the task', async () => {
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({
        accepted: false,
        reason: 'daily_limit',
        quotaBlocked: true,
        skippedPlatforms: ['zhihu', 'juejin'],
        message: '免费版今日平台额度不足，明天 0:00 重置，或升级 Pro。',
      }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu', 'juejin'], bridge });
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');

    await syncBtn.onclick();

    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      platforms: ['zhihu', 'juejin'],
      source: 'obsidian',
      quotaPolicy: 'truncate',
    }));
    expect(view.showMultiPlatformQuotaBlockedModal).toHaveBeenCalledWith(expect.objectContaining({
      requestedPlatformIds: ['zhihu', 'juejin'],
      quotaResult: expect.objectContaining({
        accepted: false,
        reason: 'daily_limit',
      }),
    }));
  });

  it('pre-truncates a Free remote-policy request before enqueueing selected platforms', async () => {
    const cachedPlatforms = [
      { id: 'zhihu', name: '知乎', authKnown: true, authenticated: true },
      { id: 'juejin', name: '掘金', authKnown: true, authenticated: true },
      { id: 'csdn', name: 'CSDN', authKnown: true, authenticated: true },
    ];
    const bridge = {
      health: vi.fn().mockResolvedValue({
        ok: true,
        version: '0.3.0',
        proLicensed: false,
        policyVersion: 1,
        quota: { mode: 'daily_platform_count', freeLimit: 1 },
        capabilities: {
          quotaPolicy: true,
          remotePolicy: true,
          proLicensed: false,
          policyVersion: 1,
          quota: { mode: 'daily_platform_count', freeLimit: 1 },
        },
      }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({
        accepted: true,
        syncId: 'sync-remote-policy',
        publishedPlatforms: ['zhihu'],
      }),
    };
    const view = makeView({
      selectedPlatforms: ['zhihu', 'juejin', 'csdn'],
      cachedPlatforms,
      bridge,
    });
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');

    await syncBtn.onclick();

    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      platforms: ['zhihu'],
      source: 'obsidian',
      quotaPolicy: 'truncate',
    }));
    expect(view.showWechatsyncEnqueueAcceptedModal).toHaveBeenCalledWith(expect.objectContaining({
      platforms: ['zhihu', 'csdn', 'juejin'],
      quotaResult: expect.objectContaining({
        quotaBlocked: true,
        maxPlatforms: 1,
        publishedPlatforms: ['zhihu'],
        skippedPlatforms: ['csdn', 'juejin'],
      }),
    }));
  });

  it('does not pre-truncate when remote policy confirms an active Pro license', async () => {
    const cachedPlatforms = [
      { id: 'zhihu', name: '知乎', authKnown: true, authenticated: true },
      { id: 'juejin', name: '掘金', authKnown: true, authenticated: true },
    ];
    const bridge = {
      health: vi.fn().mockResolvedValue({
        ok: true,
        version: '0.3.0',
        proLicensed: true,
        quota: { mode: 'daily_platform_count', freeLimit: 1 },
        capabilities: {
          quotaPolicy: true,
          remotePolicy: true,
          proLicensed: true,
          quota: { mode: 'daily_platform_count', freeLimit: 1 },
        },
      }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({
        accepted: true,
        syncId: 'sync-pro-policy',
      }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu', 'juejin'], cachedPlatforms, bridge });
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      platforms: ['zhihu', 'juejin'],
      quotaPolicy: 'truncate',
    }));
    expect(view.showWechatsyncEnqueueAcceptedModal.mock.calls[0][0].quotaResult.quotaBlocked).not.toBe(true);
  });

  it('sends local markdown images as bridge assets and rewrites local HTML src values', async () => {
    const imageFile = {
      path: 'notes/assets/local.png',
      name: 'local.png',
      extension: 'png',
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]),
    };
    const app = {
      isMobile: false,
      metadataCache: {
        getFirstLinkpathDest: vi.fn((linkpath) => (linkpath === 'assets/local.png' ? imageFile : null)),
      },
      vault: {
        readBinary: vi.fn(async () => imageFile.bytes),
        getResourcePath: vi.fn(() => 'app://local/notes%2Fassets%2Flocal.png'),
        getAbstractFileByPath: vi.fn(() => null),
      },
    };
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge, app });
    view.lastResolvedMarkdown = '![图](assets/local.png)';
    view.getCurrentExportHtml = vi.fn(() => '<p><img src="app://local/notes%2Fassets%2Flocal.png" alt="图"></p>');
    view.prepareHtmlForWechatsyncArticle = vi.fn(async (html) => html);
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');

    await syncBtn.onclick();

    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      markdown: '![图](asset://image-1)',
      content: '<p><img src="asset://image-1" alt="图"></p>',
      cover: 'asset://image-1',
      assets: [
        expect.objectContaining({
          id: 'image-1',
          filename: 'local.png',
          mimeType: 'image/png',
          base64: imageFile.bytes.toString('base64'),
        }),
      ],
    }));
  });

  it('uses frontmatter local cover as a bridge asset and reuses it for the first body image', async () => {
    const imageFile = {
      path: 'notes/assets/cover.png',
      name: 'cover.png',
      extension: 'png',
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 5, 6, 7, 8]),
    };
    const app = {
      isMobile: false,
      metadataCache: {
        getFirstLinkpathDest: vi.fn((linkpath) => (linkpath === 'assets/cover.png' ? imageFile : null)),
      },
      vault: {
        readBinary: vi.fn(async () => imageFile.bytes),
        getResourcePath: vi.fn(() => 'app://local/notes%2Fassets%2Fcover.png'),
        getAbstractFileByPath: vi.fn(() => null),
      },
    };
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge, app });
    view.lastResolvedMarkdown = '![封面](assets/cover.png)';
    view.getFrontmatterPublishMeta = vi.fn(() => ({ cover: 'assets/cover.png', coverSrc: 'app://local/notes%2Fassets%2Fcover.png' }));
    view.getCurrentExportHtml = vi.fn(() => '<p><img src="app://local/notes%2Fassets%2Fcover.png" alt="封面"></p>');
    view.prepareHtmlForWechatsyncArticle = vi.fn(async (html) => html);
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');

    await syncBtn.onclick();

    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      markdown: '![封面](asset://image-1)',
      content: '<p><img src="asset://image-1" alt="封面"></p>',
      cover: 'asset://image-1',
      assets: [
        expect.objectContaining({
          id: 'image-1',
          filename: 'cover.png',
        }),
      ],
    }));
  });

  it('ignores app resource session cover and resolves the original frontmatter cover path', async () => {
    const imageFile = {
      path: 'Wechat/published/img/cover-combined.jpg',
      name: 'cover-combined.jpg',
      extension: 'jpg',
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00, 9, 10]),
    };
    const app = {
      isMobile: false,
      metadataCache: {
        getFirstLinkpathDest: vi.fn((linkpath) => (
          linkpath === 'Wechat/published/img/cover-combined.jpg' ? imageFile : null
        )),
      },
      vault: {
        readBinary: vi.fn(async () => imageFile.bytes),
        getResourcePath: vi.fn(() => 'app://local/Users/demo/Vault/Wechat/published/img/cover-combined.jpg?123'),
        getAbstractFileByPath: vi.fn(() => null),
      },
    };
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge, app });
    view.sessionCoverBase64 = 'app://local/Users/demo/Vault/Wechat/published/img/cover-combined.jpg?123';
    view.lastResolvedMarkdown = '正文';
    view.getFrontmatterPublishMeta = vi.fn(() => ({
      cover: 'Wechat/published/img/cover-combined.jpg',
      coverSrc: 'app://local/Users/demo/Vault/Wechat/published/img/cover-combined.jpg?123',
    }));
    view.prepareHtmlForWechatsyncArticle = vi.fn(async (html) => html);
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');

    await syncBtn.onclick();

    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      cover: 'asset://image-1',
      assets: [
        expect.objectContaining({
          id: 'image-1',
          filename: 'cover-combined.jpg',
          mimeType: 'image/jpeg',
        }),
      ],
    }));
  });

  it('downloads selected WeChat material cover and sends it as a bridge asset', async () => {
    obsidian.requestUrl = vi.fn(async () => ({
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0x11]).buffer,
      headers: { 'content-type': 'image/jpeg' },
    }));
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge });
    view.sessionThumbMediaId = 'thumb-from-material';
    view.sessionCoverBase64 = 'https://mmbiz.qpic.cn/mmbiz_jpg/material-cover/0?wx_fmt=jpeg';
    view.lastResolvedMarkdown = '正文';
    view.getFrontmatterPublishMeta = vi.fn(() => ({ cover: 'assets/fallback.png', coverSrc: '' }));
    view.getFirstImageFromArticle = vi.fn(() => 'https://example.com/fallback.png');
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');

    await syncBtn.onclick();

    expect(obsidian.requestUrl).toHaveBeenCalledWith({
      url: 'https://mmbiz.qpic.cn/mmbiz_jpg/material-cover/0?wx_fmt=jpeg',
      method: 'GET',
    });
    expect(bridge.enqueueSyncArticle).toHaveBeenCalledWith(expect.objectContaining({
      cover: 'asset://image-1',
      assets: [
        expect.objectContaining({
          id: 'image-1',
          filename: '0.jpg',
          mimeType: 'image/jpeg',
          source: expect.objectContaining({
            kind: 'wechat-material-cover',
            thumbMediaId: 'thumb-from-material',
          }),
        }),
      ],
    }));
  });

  it('reuses cached downloaded WeChat material cover assets for later bridge sends', async () => {
    obsidian.requestUrl = vi.fn(async () => ({
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0x22]).buffer,
      headers: { 'content-type': 'image/jpeg' },
    }));
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge });
    view.sessionThumbMediaId = 'thumb-from-material';
    view.sessionCoverBase64 = 'https://mmbiz.qpic.cn/mmbiz_jpg/material-cover/1?wx_fmt=jpeg';
    view.lastResolvedMarkdown = '正文';
    view.getFrontmatterPublishMeta = vi.fn(() => ({ cover: '', coverSrc: '' }));
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    let modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    await view.showMultiPlatformSyncModal();
    modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    const materialRequests = obsidian.requestUrl.mock.calls
      .map((call) => call[0])
      .filter((request) => String(request?.url || '').includes('mmbiz.qpic.cn'));
    expect(materialRequests).toHaveLength(1);
    expect(bridge.enqueueSyncArticle).toHaveBeenCalledTimes(2);
    expect(view.wechatMaterialCoverAssetCache.size).toBe(1);
    expect(bridge.enqueueSyncArticle.mock.calls[1][0]).toEqual(expect.objectContaining({
      cover: 'asset://image-1',
      assets: [
        expect.objectContaining({
          id: 'image-1',
          filename: '1.jpg',
          base64: Buffer.from([0xff, 0xd8, 0xff, 0x22]).toString('base64'),
        }),
      ],
    }));
  });

  it('does not enqueue when a selected WeChat material cover has no downloadable URL', async () => {
    obsidian.requestUrl = vi.fn();
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge });
    view.sessionThumbMediaId = 'thumb-from-material';
    view.sessionCoverBase64 = '';
    view.lastResolvedMarkdown = '正文';
    view.showMultiPlatformSyncResultModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    const materialRequests = obsidian.requestUrl.mock.calls
      .map((call) => call[0])
      .filter((request) => String(request?.url || '').includes('mmbiz.qpic.cn'));
    expect(materialRequests).toHaveLength(0);
    expect(bridge.enqueueSyncArticle).not.toHaveBeenCalled();
    expect(view.showMultiPlatformSyncResultModal).toHaveBeenCalledWith(expect.objectContaining({
      fatalError: expect.any(Error),
    }));
  });

  it('does not enqueue when a selected WeChat material cover downloads as a non-image', async () => {
    obsidian.requestUrl = vi.fn(async () => ({
      arrayBuffer: async () => new TextEncoder().encode('<html></html>').buffer,
      headers: { 'content-type': 'text/html' },
    }));
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-1' }),
    };
    const view = makeView({ selectedPlatforms: ['zhihu'], bridge });
    view.sessionThumbMediaId = 'thumb-from-material';
    view.sessionCoverBase64 = 'https://mmbiz.qpic.cn/material-cover/not-image';
    view.lastResolvedMarkdown = '正文';
    view.showMultiPlatformSyncResultModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    const materialRequests = obsidian.requestUrl.mock.calls
      .map((call) => call[0])
      .filter((request) => String(request?.url || '').includes('mmbiz.qpic.cn'));
    expect(materialRequests).toHaveLength(1);
    expect(bridge.enqueueSyncArticle).not.toHaveBeenCalled();
    expect(view.showMultiPlatformSyncResultModal.mock.calls[0][0].fatalError.message).toContain('格式不支持');
  });

  it('shows skipped platforms in the accepted task modal when quota truncates the request', () => {
    const view = makeView({ selectedPlatforms: ['zhihu', 'juejin'] });
    view.openPublisherProPage = vi.fn();

    view.showWechatsyncEnqueueAcceptedModal({
      syncId: 'sync-1',
      title: 'a',
      platforms: ['zhihu', 'juejin'],
      quotaResult: {
        accepted: true,
        quotaBlocked: true,
        maxPlatforms: 1,
        publishedPlatforms: ['zhihu'],
        skippedPlatforms: ['juejin'],
      },
    });

    const modal = modalCapture.getLastModal();
    expect(modal.titleEl.textContent).toBe('已发送到浏览器插件');
    expect(modal.contentEl.textContent).toContain('已按免费版额度投递');
    expect(modal.contentEl.textContent).toContain('跳过 1 个超出今日额度的平台');
    expect(modal.contentEl.textContent).toContain('掘金');

    const upgradeBtn = Array.from(modal.contentEl.querySelectorAll('button'))
      .find((button) => button.textContent === '升级 Pro');
    expect(upgradeBtn).toBeDefined();
    upgradeBtn.click();
    expect(view.openPublisherProPage).toHaveBeenCalled();
  });

  it('does not render skipped platforms again as queued task rows', () => {
    const view = makeView({ selectedPlatforms: ['zhihu', 'juejin'] });

    view.showWechatsyncEnqueueAcceptedModal({
      syncId: 'sync-1',
      title: 'a',
      platforms: ['zhihu', 'juejin'],
      task: {
        platforms: [
          { id: 'zhihu', status: 'queued' },
          { id: 'juejin', status: 'queued', message: '免费版今日平台额度不足' },
        ],
      },
      quotaResult: {
        accepted: true,
        quotaBlocked: true,
        maxPlatforms: 1,
        publishedPlatforms: ['zhihu'],
        skippedPlatforms: ['juejin'],
      },
    });

    const modal = modalCapture.getLastModal();
    const rows = Array.from(modal.contentEl.querySelectorAll('.wechat-multiplatform-result-row'));
    const platformRows = rows.filter((row) => row.querySelector('.wechat-multiplatform-result-name')?.textContent !== 'a');
    const zhihuRows = platformRows.filter((row) => row.querySelector('.wechat-multiplatform-result-name')?.textContent === '知乎');
    const juejinRows = platformRows.filter((row) => row.querySelector('.wechat-multiplatform-result-name')?.textContent === '掘金');

    expect(zhihuRows).toHaveLength(1);
    expect(zhihuRows[0].querySelector('.wechat-multiplatform-result-pill')?.textContent).toBe('已投递');
    expect(juejinRows).toHaveLength(1);
    expect(juejinRows[0].querySelector('.wechat-multiplatform-result-pill')?.textContent).toBe('已跳过');
    expect(juejinRows[0].textContent).toContain('免费版每天 1 个平台额度');
  });

  it('uses daily platform quota copy for legacy platform_limit blocks', () => {
    const view = makeView({ selectedPlatforms: ['zhihu', 'juejin'] });
    view.showMultiPlatformQuotaBlockedModal = AppleStyleView.prototype.showMultiPlatformQuotaBlockedModal.bind(view);

    view.showMultiPlatformQuotaBlockedModal({
      requestedPlatformIds: ['zhihu', 'juejin'],
      quotaResult: {
        accepted: false,
        quotaBlocked: true,
        reason: 'platform_limit',
        maxPlatforms: 3,
        skippedPlatforms: ['zhihu', 'juejin'],
        message: '免费版每次最多 3 个平台。',
      },
    });

    const modal = modalCapture.getLastModal();
    expect(modal.titleEl.textContent).toBe('发布受限');
    expect(modal.contentEl.textContent).toContain('免费版平台额度不足');
    expect(modal.contentEl.textContent).toContain('免费版今日平台额度不足');
    expect(modal.contentEl.textContent).not.toContain('每次最多');
    expect(modal.contentEl.textContent).not.toContain('单次最多');
    expect(modal.contentEl.querySelector('.wechat-multiplatform-result-row')).toBeNull();
    const buttonTexts = Array.from(modal.contentEl.querySelectorAll('button')).map((button) => button.textContent);
    expect(buttonTexts).not.toContain('重新选择平台');
  });

  it('hides platform reselection when publish is quota blocked', () => {
    const view = makeView({ selectedPlatforms: ['zhihu'] });
    view.showMultiPlatformQuotaBlockedModal = AppleStyleView.prototype.showMultiPlatformQuotaBlockedModal.bind(view);

    view.showMultiPlatformQuotaBlockedModal({
      requestedPlatformIds: ['zhihu'],
      quotaResult: {
        accepted: false,
        quotaBlocked: true,
        reason: 'daily_limit',
        skippedPlatforms: ['zhihu'],
        message: '今日免费发布平台数已用完，明天 0:00 重置，或升级 Pro 解除限制',
      },
    });

    const modal = modalCapture.getLastModal();
    const buttonTexts = Array.from(modal.contentEl.querySelectorAll('button')).map((button) => button.textContent);
    expect(buttonTexts).not.toContain('重新选择平台');
    expect(buttonTexts).toContain('升级 Pro');
    expect(buttonTexts).toContain('关闭');
  });
});
