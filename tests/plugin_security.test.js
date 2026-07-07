/*
## 核心功能

覆盖 plugin security 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 plugin security 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');
describe('WechatAPI Security', () => {
  let WechatAPI;
  let obsidianMock;

  beforeEach(() => {
    // 1. Reset modules to ensure clean state
    vi.resetModules();

    // 2. Get the obsidian mock (which is likely aliased or we are modifying the cached version if it exists)
    // In this environment, we just need to ensure we modify the object that input.js will receive.
    obsidianMock = require('obsidian');

    // 3. Reset and mock requestUrl
    // We attach the mock to the exported object
    obsidianMock.requestUrl = vi.fn();

    // 4. Require the module under test AFTER mocking dependencies
    const inputModule = loadInputModule();
    WechatAPI = inputModule.WechatAPI;
  });

  it('should throw Security Error when proxy URL is not HTTPS in sendRequest', async () => {
    const api = new WechatAPI('appId', 'secret', 'http://insecure-proxy.com');
    await expect(api.sendRequest('https://api.weixin.qq.com/test')).rejects.toThrow(
      'Security Error: Insecure HTTP proxy blocked. Proxy URL must use HTTPS.'
    );
  });

  it('should throw Security Error when proxy URL is not HTTPS in uploadMultipart', async () => {
    const api = new WechatAPI('appId', 'secret', 'http://insecure-proxy.com');
    const blob = new Blob(['test'], { type: 'image/jpeg' });

    await expect(api.uploadMultipart('https://api.weixin.qq.com/upload', blob, 'media')).rejects.toThrow(
      'Security Error: Insecure HTTP proxy blocked. Proxy URL must use HTTPS.'
    );
  });

  it('should allow HTTPS proxy in sendRequest', async () => {
    obsidianMock.requestUrl.mockResolvedValue({ json: { success: true } });

    const api = new WechatAPI('appId', 'secret', 'https://secure-proxy.com');
    await api.sendRequest('https://api.weixin.qq.com/test');

    expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(1);
    expect(obsidianMock.requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://secure-proxy.com'
    }));
  });

  it('should allow HTTPS proxy in uploadMultipart', async () => {
    obsidianMock.requestUrl.mockResolvedValue({ json: { media_id: '123' } });

    const api = new WechatAPI('appId', 'secret', 'https://secure-proxy.com');
    const blob = new Blob(['test'], { type: 'image/jpeg' });

    await api.uploadMultipart('https://api.weixin.qq.com/upload', blob, 'media');

    expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(1);
    expect(obsidianMock.requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://secure-proxy.com'
    }));
  });

  it('should allow uppercase HTTPS proxy URL', async () => {
    obsidianMock.requestUrl.mockResolvedValue({ json: { success: true } });

    const api = new WechatAPI('appId', 'secret', 'HTTPS://secure-proxy.com');
    await api.sendRequest('https://api.weixin.qq.com/test');

    expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(1);
    expect(obsidianMock.requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'HTTPS://secure-proxy.com'
    }));
  });
});
