/*
## 核心功能

覆盖 sync context 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 sync context 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect } from 'vitest';
const { resolveSyncAccount, toSyncFriendlyMessage } = require('../services/sync-context');

describe('Sync Context Service', () => {
  it('resolveSyncAccount should prefer selected account id', () => {
    const accounts = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];

    const selected = resolveSyncAccount({
      accounts,
      selectedAccountId: 'b',
      defaultAccountId: 'a',
    });

    expect(selected).toEqual({ id: 'b', name: 'B' });
  });

  it('resolveSyncAccount should fallback to default account id', () => {
    const accounts = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];

    const selected = resolveSyncAccount({
      accounts,
      selectedAccountId: '',
      defaultAccountId: 'a',
    });

    expect(selected).toEqual({ id: 'a', name: 'A' });
  });

  it('resolveSyncAccount should fallback to default when selected id is invalid', () => {
    const accounts = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];

    const selected = resolveSyncAccount({
      accounts,
      selectedAccountId: 'missing',
      defaultAccountId: 'a',
    });

    expect(selected).toEqual({ id: 'a', name: 'A' });
  });

  it('resolveSyncAccount should fallback to first account when selected/default are invalid', () => {
    const accounts = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];

    const selected = resolveSyncAccount({
      accounts,
      selectedAccountId: 'missing-selected',
      defaultAccountId: 'missing-default',
    });

    expect(selected).toEqual({ id: 'a', name: 'A' });
  });

  it('resolveSyncAccount should return null when account list is empty', () => {
    const selected = resolveSyncAccount({
      accounts: [],
      selectedAccountId: 'a',
      defaultAccountId: 'b',
    });

    expect(selected).toBeNull();
  });

  it('toSyncFriendlyMessage should map 45002 to user friendly message', () => {
    const msg = toSyncFriendlyMessage('create draft failed (45002)');
    expect(msg).toContain('文章太长，微信接口拒收');
  });

  it('toSyncFriendlyMessage should map invalid content errors to user friendly message', () => {
    const msg = toSyncFriendlyMessage('创建草稿失败:invalld content hint: [x] (45166)');
    expect(msg).toContain('微信接口拒收正文内容');
  });

  it('toSyncFriendlyMessage should map status 403 to proxy error message', () => {
    const msg = toSyncFriendlyMessage('Request failed, status 403');
    expect(msg).toContain('访问中转代理服务器被拒绝 (HTTP 403)');
  });

  it('toSyncFriendlyMessage should map status 401 to proxy error message', () => {
    const msg = toSyncFriendlyMessage('Request failed, status 401');
    expect(msg).toContain('访问中转代理服务器未授权 (HTTP 401)');
  });

  it('toSyncFriendlyMessage should map 40007 / invalid media_id to user friendly message', () => {
    const msg = toSyncFriendlyMessage('微信API报错: invalid media_id (40007)');
    expect(msg).toContain('微信接口返回媒体 ID 无效 (40007)');
  });

  it('toSyncFriendlyMessage should keep other errors unchanged', () => {
    expect(toSyncFriendlyMessage('network error')).toBe('network error');
  });
});
