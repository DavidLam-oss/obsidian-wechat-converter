/*
## 核心功能

覆盖 connection status bar 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 connection status bar 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// tests/connection_status_bar.test.js
//
// Locks the contract of:
//   - describeWechatsyncConnectionState({ status, checkedAt, message }, { variant })
//   - renderWechatsyncConnectionStatusBar(parent, { dotLabel, dotClass, text, action })
//
// These are the helpers introduced in Phase 2 to share connection-state UI
// between the「其他平台」settings tab and the publish modal. Both surfaces
// MUST render identical wording for identical states.

import { describe, it, expect, vi } from 'vitest';

const { createObsidianLikeElement } = require('./helpers/obsidian-dom.js');
const { loadInputModule } = require('./helpers/input-module.cjs');
const {
  describeWechatsyncConnectionState,
  renderWechatsyncConnectionStatusBar,
  formatWechatsyncCheckedAt,
} = loadInputModule();

describe('describeWechatsyncConnectionState - text contract', () => {
  it('returns connected variant text for the publish modal', () => {
    const description = describeWechatsyncConnectionState(
      { status: 'connected', checkedAt: 1700000000000, message: '' },
      { variant: 'modal' }
    );
    expect(description.dotLabel).toBe('已连接');
    expect(description.dotClass).toBe('is-ok');
    expect(description.text).toContain('已连接');
    expect(description.text).toContain('微信不会出现在这里');
  });

  it('returns connected variant text for the settings page (different wording)', () => {
    const description = describeWechatsyncConnectionState(
      { status: 'connected', checkedAt: 1700000000000, message: '' },
      { variant: 'settings' }
    );
    expect(description.dotLabel).toBe('已连接');
    expect(description.dotClass).toBe('is-ok');
    expect(description.text).toContain('已连接浏览器插件');
    expect(description.text).toContain('上次检查');
    // Settings variant must not borrow the modal-specific wording.
    expect(description.text).not.toContain('微信不会出现在这里');
  });

  it('uses the latest connection.message when present (settings variant)', () => {
    const description = describeWechatsyncConnectionState(
      { status: 'connected', checkedAt: 0, message: '已诊断 3 个平台，2 个上次可用。' },
      { variant: 'settings' }
    );
    expect(description.text).toBe('已诊断 3 个平台，2 个上次可用。');
  });

  it('returns failed variant with the saved error message', () => {
    const description = describeWechatsyncConnectionState(
      { status: 'failed', checkedAt: 0, message: '连接令牌校验失败' },
      { variant: 'settings' }
    );
    expect(description.dotLabel).toBe('未连接');
    expect(description.dotClass).toBe('is-error');
    expect(description.text).toContain('连接令牌校验失败');
    expect(description.text).toContain('点击「测试连接」');
  });

  it('returns untested variant when status is empty/unknown', () => {
    const description = describeWechatsyncConnectionState({}, { variant: 'modal' });
    expect(description.dotLabel).toBe('未测试');
    expect(description.dotClass).toBe('');
    expect(description.text).toContain('尚未连接');
  });

  it('omits checked-at timestamp from connected text when checkedAt is 0', () => {
    const description = describeWechatsyncConnectionState(
      { status: 'connected', checkedAt: 0 },
      { variant: 'modal' }
    );
    expect(description.text).toBe('已连接。勾选本次要发送的平台，微信不会出现在这里。');
  });
});

describe('renderWechatsyncConnectionStatusBar - DOM contract', () => {
  it('renders a status bar with dot + text inside the parent element', () => {
    const parent = createObsidianLikeElement('div');
    const { bar } = renderWechatsyncConnectionStatusBar(parent, {
      dotLabel: '已连接',
      dotClass: 'is-ok',
      text: '上次检查 12:30',
    });

    expect(bar).toBeDefined();
    expect(bar.classList.contains('wechat-multiplatform-status')).toBe(true);
    expect(bar.parentElement).toBe(parent);

    const dot = bar.querySelector('.wechat-multiplatform-status-dot');
    const text = bar.querySelector('.wechat-multiplatform-status-text');
    expect(dot).not.toBeNull();
    expect(dot.classList.contains('is-ok')).toBe(true);
    expect(dot.textContent).toBe('已连接');
    expect(text).not.toBeNull();
    expect(text.textContent).toBe('上次检查 12:30');
  });

  it('omits dot class when dotClass is empty', () => {
    const parent = createObsidianLikeElement('div');
    const { bar } = renderWechatsyncConnectionStatusBar(parent, {
      dotLabel: '未测试',
      dotClass: '',
      text: '',
    });
    const dot = bar.querySelector('.wechat-multiplatform-status-dot');
    // dotClass is empty -> className should be just the base class
    expect(dot.className.trim()).toBe('wechat-multiplatform-status-dot');
  });

  it('skips the dot span entirely when dotLabel is missing', () => {
    const parent = createObsidianLikeElement('div');
    const { bar } = renderWechatsyncConnectionStatusBar(parent, { text: 'just text' });
    expect(bar.querySelector('.wechat-multiplatform-status-dot')).toBeNull();
    expect(bar.querySelector('.wechat-multiplatform-status-text').textContent).toBe('just text');
  });

  it('renders an action button and wires onClick handler', () => {
    const parent = createObsidianLikeElement('div');
    const onClick = vi.fn();
    const { actionButton } = renderWechatsyncConnectionStatusBar(parent, {
      dotLabel: '未连接',
      dotClass: 'is-error',
      text: '上次失败',
      action: { label: '重试', onClick },
    });
    expect(actionButton).not.toBeNull();
    expect(actionButton.classList.contains('wechat-multiplatform-status-action')).toBe(true);
    expect(actionButton.textContent).toBe('重试');
    expect(actionButton.disabled).toBe(false);

    actionButton.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][1]).toBe(actionButton);
  });

  it('honors action.disabled when set', () => {
    const parent = createObsidianLikeElement('div');
    const { actionButton } = renderWechatsyncConnectionStatusBar(parent, {
      dotLabel: '未连接',
      dotClass: 'is-error',
      text: '上次失败',
      action: { label: '重试', disabled: true, onClick: () => {} },
    });
    expect(actionButton.disabled).toBe(true);
  });
});

describe('formatWechatsyncCheckedAt', () => {
  it('returns empty string for falsy timestamps', () => {
    expect(formatWechatsyncCheckedAt(0)).toBe('');
    expect(formatWechatsyncCheckedAt(null)).toBe('');
    expect(formatWechatsyncCheckedAt(undefined)).toBe('');
  });

  it('returns a non-empty string for valid timestamps', () => {
    const result = formatWechatsyncCheckedAt(Date.now());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
