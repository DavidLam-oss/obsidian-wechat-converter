/*
## 核心功能

覆盖 feishu mermaid remote renderer 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 feishu mermaid remote renderer 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi } from 'vitest';

const {
  DEFAULT_KROKI_MAX_IMAGE_BYTES,
  DEFAULT_KROKI_MERMAID_PNG_ENDPOINT,
  normalizeKrokiEndpoint,
  renderMermaidWithKroki,
} = await import('../services/feishu-mermaid-remote-renderer.js');

describe('Feishu Mermaid remote renderer', () => {
  it('should render Mermaid through Kroki POST and return a PNG data URL', async () => {
    const requestUrl = vi.fn(async () => ({
      status: 200,
      headers: { 'content-type': 'image/png' },
      arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
    }));

    const dataUrl = await renderMermaidWithKroki('graph TD\nA-->B', { requestUrl });

    expect(dataUrl).toBe('data:image/png;base64,AQID');
    expect(requestUrl).toHaveBeenCalledWith({
      url: DEFAULT_KROKI_MERMAID_PNG_ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'image/png',
      },
      body: JSON.stringify({ diagram_source: 'graph TD\nA-->B' }),
      throw: false,
    });
  });

  it('should read Obsidian requestUrl arrayBuffer functions safely', async () => {
    const requestUrl = vi.fn(async () => ({
      status: 200,
      headers: { 'content-type': 'image/png' },
      arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
    }));

    const dataUrl = await renderMermaidWithKroki('graph TD\nA-->B', { requestUrl });

    expect(dataUrl).toBe('data:image/png;base64,BAUG');
  });

  it('should require HTTPS Kroki endpoints', () => {
    expect(normalizeKrokiEndpoint('https://kroki.example.com/mermaid/png')).toBe('https://kroki.example.com/mermaid/png');
    expect(() => normalizeKrokiEndpoint('http://kroki.example.com/mermaid/png')).toThrow('Kroki 渲染服务必须使用 HTTPS');
    expect(() => normalizeKrokiEndpoint('not-a-url')).toThrow('Kroki 渲染服务地址无效');
  });

  it('should fail when Kroki returns non-image content', async () => {
    const requestUrl = vi.fn(async () => ({
      status: 200,
      headers: { 'content-type': 'text/plain' },
      arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
    }));

    await expect(renderMermaidWithKroki('graph TD\nA-->B', { requestUrl }))
      .rejects.toThrow('Kroki Mermaid 渲染返回了非图片内容');
  });

  it('should fail when Kroki returns an HTTP error', async () => {
    const requestUrl = vi.fn(async () => ({
      status: 500,
      headers: { 'content-type': 'text/plain' },
      text: 'boom',
    }));

    await expect(renderMermaidWithKroki('graph TD\nA-->B', { requestUrl }))
      .rejects.toThrow('Kroki Mermaid 渲染失败 (500)');
  });

  it('should fail before base64 conversion when Kroki image is too large', async () => {
    const requestUrl = vi.fn(async () => ({
      status: 200,
      headers: { 'content-type': 'image/png' },
      arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
    }));

    await expect(renderMermaidWithKroki('graph TD\nA-->B', {
      requestUrl,
      maxImageBytes: 2,
    })).rejects.toThrow('Kroki Mermaid 渲染图片过大 (3 bytes)');
    expect(DEFAULT_KROKI_MAX_IMAGE_BYTES).toBeGreaterThan(1024 * 1024);
  });
});
