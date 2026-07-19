/*
## 核心功能

提供多平台发布弹窗测试共用的 Obsidian、Modal 和视图 fixture。

## 输入

测试用例提供的设置、平台状态、Bridge 响应和 Markdown 文件参数。

## 输出

可重复使用的 mock API、Modal 捕获器、视图实例和平台行查询器。

## 定位

位于 tests/helpers/，是多平台发布测试的共享 fixture 层。

## 依赖

关键依赖：Vitest、`./input-module.cjs`、`../../views/apple-style-view.js`。

## 维护规则

- 保持 fixture 的默认行为与既有测试契约一致。
- 共享 fixture 变化时检查所有多平台测试文件。
*/

import { vi } from 'vitest';

const { loadInputModule } = require('./input-module.cjs');
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

function makeView({ selectedPlatforms = ['zhihu'], cachedPlatforms = null, bridge = null, app = null, enabled = true } = {}) {
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
        enabled,
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

export {
  obsidian,
  AppleStyleView,
  installModalCapture,
  makeView,
  findRow,
};
