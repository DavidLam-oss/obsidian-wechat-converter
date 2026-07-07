/*
## 核心功能

覆盖 settings platform chip 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 settings platform chip 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// tests/settings_platform_chip.test.js
//
// Locks the DOM contract of the platform chip rendered in the「其他平台」
// settings tab. Specifically verifies:
//
//   1. status text is a *child of* `.wechat-platform-chip-body` (stacked
//      below the name), not a sibling of the chip — this is the fix for
//      the "platform name overlapped by status" bug.
//   2. clicking the checkbox toggles `is-selected` plus the auth-status
//      class (`is-ok` / `is-error` / `is-bridge` / `is-unknown`).
//   3. status visibility is driven by CSS (always rendered in DOM, the
//      `display` flip happens via `.is-selected` selector in styles.css).
//
// Failing this test means a refactor to chip rendering changed structure;
// review against `styles.css` for `.wechat-platform-chip` rules.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { createObsidianLikeElement } = require('./helpers/obsidian-dom.js');
const { loadInputModule } = require('./helpers/input-module.cjs');
const { AppleStyleSettingTab } = loadInputModule();

function makePlugin({ selectedPlatforms = [], connection = null } = {}) {
  const defaultConnection = {
    status: 'connected',
    checkedAt: Date.now(),
    platforms: [
      { id: 'zhihu', name: '知乎', authKnown: true, authenticated: true, username: 'Lin' },
      { id: 'juejin', name: '掘金', authKnown: true, authenticated: false, error: '需登录' },
    ],
    capabilities: {},
    message: '',
  };
  return {
    app: {},
    manifest: { dir: '/test', id: 'wechat-converter', version: '0.0.0-test' },
    settings: {
      wechatAccounts: [],
      defaultAccountId: '',
      proxyUrl: '',
      cleanupAfterSync: false,
      cleanupUseSystemTrash: true,
      cleanupDirTemplate: '',
      usePhoneFrame: true,
      enableWatermark: false,
      showImageCaption: true,
      normalizeChinesePunctuation: true,
      coloredHeader: false,
      sidePadding: 16,
      theme: 'github', themeColor: 'blue', customColor: '#0366d6',
      quoteCalloutStyleMode: 'theme',
      fontFamily: 'sans-serif', fontSize: 3,
      macCodeBlock: true, codeLineNumber: true,
      avatarUrl: '', avatarBase64: '',
      multiPlatformSync: {
        enabled: true,
        port: 9527,
        token: 'test-token',
        supportedPlatforms: [],
        selectedPlatforms,
        connection: connection || defaultConnection,
        recentTasks: [],
      },
      ai: {
        enabled: false, providers: [], defaultProviderId: '',
        defaultLayoutFamily: 'auto', defaultColorPalette: 'auto',
        includeImagesInLayout: true, requestTimeoutMs: 45000, articleLayoutsByPath: {},
      },
    },
    saveSettings: vi.fn().mockResolvedValue(undefined),
    startWechatSyncBridgeInBackground: vi.fn(),
    _wechatSyncBridgeService: null,
    getWechatSyncBridgeService: vi.fn(() => ({})),
    getConverterView: vi.fn(() => null),
    getArticleLayoutState: vi.fn(() => null),
  };
}

function renderTab(plugin) {
  const tab = new AppleStyleSettingTab(plugin.app, plugin);
  tab.containerEl = createObsidianLikeElement('div');
  tab.renderSettingsContent();
  return tab;
}

function findChip(tab, platformId) {
  return Array.from(tab.containerEl.querySelectorAll('.wechat-platform-chip'))
    .find((chip) => chip.querySelector(`input[value="${platformId}"]`));
}

describe('settings page - platform chip DOM contract', () => {
  beforeEach(() => {
    globalThis.__obsidianSettingNamesRegistry = [];
  });

  it('renders chips with name + status both inside chip-body (stacked, not sibling)', () => {
    const tab = renderTab(makePlugin({ selectedPlatforms: ['zhihu'] }));

    const chip = findChip(tab, 'zhihu');
    expect(chip).toBeDefined();

    const body = chip.querySelector('.wechat-platform-chip-body');
    const name = body && body.querySelector('.wechat-platform-chip-name');
    const status = body && body.querySelector('.wechat-platform-chip-status');

    expect(body).not.toBeNull();
    expect(name).not.toBeNull();
    expect(status).not.toBeNull();
    // Regression guard for the original bug: status MUST be inside body,
    // not a sibling of the chip-body.
    expect(status.parentElement).toBe(body);
  });

  it('always renders the status text in DOM regardless of selection (CSS hides it)', () => {
    // unselected platform: 掘金 (login_required in fixture)
    const tab = renderTab(makePlugin({ selectedPlatforms: ['zhihu'] }));

    const unselectedChip = findChip(tab, 'juejin');
    expect(unselectedChip.classList.contains('is-selected')).toBe(false);

    const status = unselectedChip.querySelector('.wechat-platform-chip-status');
    expect(status).not.toBeNull();
    // Status text is rendered in DOM even when not selected; CSS .is-selected
    // selector controls visibility. Don't rely on inline display:none.
    expect(status.textContent.length).toBeGreaterThan(0);
  });

  it('selected chip carries is-selected + auth-status class', () => {
    const tab = renderTab(makePlugin({ selectedPlatforms: ['zhihu'] }));
    const chip = findChip(tab, 'zhihu');
    expect(chip.classList.contains('is-selected')).toBe(true);
    expect(chip.classList.contains('is-ok')).toBe(true);
  });

  it('toggling checkbox updates classes on the chip', () => {
    const tab = renderTab(makePlugin({ selectedPlatforms: [] }));

    const chip = findChip(tab, 'zhihu');
    const checkbox = chip.querySelector('input[type="checkbox"]');
    expect(chip.classList.contains('is-selected')).toBe(false);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(chip.classList.contains('is-selected')).toBe(true);
    expect(chip.classList.contains('is-ok')).toBe(true);

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    expect(chip.classList.contains('is-selected')).toBe(false);
    expect(chip.classList.contains('is-ok')).toBe(false);
  });

  it('login_required platforms get is-error class when selected', () => {
    const tab = renderTab(makePlugin({ selectedPlatforms: ['juejin'] }));
    const chip = findChip(tab, 'juejin');
    expect(chip.classList.contains('is-selected')).toBe(true);
    expect(chip.classList.contains('is-error')).toBe(true);
  });

  it('chip exposes a tooltip with full platform name + status when selected', () => {
    const tab = renderTab(makePlugin({ selectedPlatforms: ['zhihu'] }));
    const chip = findChip(tab, 'zhihu');
    const title = chip.getAttribute('title');
    expect(title).toContain('知乎');
    expect(title).toContain('上次可用');
  });
});
