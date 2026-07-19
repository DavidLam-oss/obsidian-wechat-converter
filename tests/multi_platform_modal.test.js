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
// Locks the DOM and result-modal contracts of the「其他平台发布」modal
// opened via AppleStyleView.showMultiPlatformSyncModal(). Publish policy and
// asset-heavy scenarios live in the sibling behavior-focused test files.
//
// Failing this test means a refactor changed the publish-modal platform row
// layout; review styles.css `.wechat-multiplatform-platform*` rules before
// adjusting the test.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AppleStyleView,
  installModalCapture,
  makeView,
  findRow,
} from './helpers/multi-platform-modal-fixtures.js';

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
    expect(modal.contentEl.querySelector('.wechat-multiplatform-enable-panel')).toBeNull();
  });

  it('shows only the enable action when browser publishing is disabled, even with cached Pro identity', async () => {
    const view = makeView({ enabled: false });
    view.plugin.settings.multiPlatformSync.connection.capabilities = { proLicensed: true };
    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();

    const enablePanel = modal.contentEl.querySelector('.wechat-multiplatform-enable-panel');
    expect(enablePanel?.textContent).toContain('启用浏览器插件发布');
    expect(enablePanel?.textContent).toContain('小红书、知乎、头条等平台的草稿箱');
    expect(enablePanel?.textContent).toContain('去设置');
    expect(enablePanel?.textContent).toContain('查看安装教程');
    expect(enablePanel?.querySelector('.wechat-multiplatform-enable-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(enablePanel?.querySelectorAll('button')).toHaveLength(2);
    expect(modal.contentEl.querySelector('.wechat-multiplatform-intro')).toBeNull();
    expect(modal.contentEl.querySelector('.wechat-multiplatform-quota-hint')).toBeNull();
    expect(modal.contentEl.textContent).not.toContain('免费版');
    expect(modal.contentEl.textContent).not.toContain('升级 Pro');
    expect(view.plugin.getWechatSyncBridgeService).not.toHaveBeenCalled();
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
