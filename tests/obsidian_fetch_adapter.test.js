/*
## 核心功能

覆盖 obsidian fetch adapter 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 obsidian fetch adapter 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, expect, it, vi } from 'vitest';

const {
  createObsidianFetchAdapter,
  isJsonParseFailure,
  parseJsonResponseText,
} = require('../services/obsidian-fetch-adapter');

describe('Obsidian fetch adapter', () => {
  it('should map fetch-style JSON requests to requestUrl', async () => {
    const requestUrl = vi.fn(async () => ({
      status: 200,
      text: '{"ok":true}',
      json: { ok: true },
      headers: { 'content-type': 'application/json' },
    }));
    const fetchImpl = createObsidianFetchAdapter(requestUrl);

    const response = await fetchImpl('https://api.example.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret',
      },
      body: '{"hello":"world"}',
    });

    expect(requestUrl).toHaveBeenCalledWith({
      url: 'https://api.example.com/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret',
      },
      body: '{"hello":"world"}',
      contentType: 'application/json',
      throw: false,
    });
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('{"ok":true}');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('should expose non-2xx responses without throwing', async () => {
    const requestUrl = vi.fn(async () => ({
      status: 401,
      text: 'unauthorized',
      headers: {},
    }));
    const fetchImpl = createObsidianFetchAdapter(requestUrl);

    const response = await fetchImpl('https://api.example.com/v1/chat/completions');

    expect(response.ok).toBe(false);
    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('unauthorized');
  });

  it('should parse the first complete JSON payload when requestUrl text has trailing data', async () => {
    const requestUrl = vi.fn(async () => ({
      status: 200,
      text: '{"choices":[{"message":{"content":"{\\"blocks\\":[{\\"type\\":\\"paragraph\\",\\"text\\":\\"ok\\"}]}"}}]}{"ignored":true}',
      headers: { 'content-type': 'application/json' },
    }));
    const fetchImpl = createObsidianFetchAdapter(requestUrl);

    const response = await fetchImpl('https://api.example.com/v1/chat/completions');

    await expect(response.json()).resolves.toEqual({
      choices: [
        {
          message: {
            content: '{"blocks":[{"type":"paragraph","text":"ok"}]}',
          },
        },
      ],
    });
  });

  it('should fall back to Obsidian request text when requestUrl rejects while parsing JSON', async () => {
    const requestUrl = vi.fn(async () => {
      throw new SyntaxError('Unexpected non-whitespace character after JSON at position 655');
    });
    const request = vi.fn(async () => '{"ok":true}{"ignored":true}');
    const fetchImpl = createObsidianFetchAdapter({ requestUrl, request });

    const response = await fetchImpl('https://api.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"hello":"world"}',
    });

    expect(request).toHaveBeenCalledWith({
      url: 'https://api.example.com/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"hello":"world"}',
      contentType: 'application/json',
      throw: false,
    });
    expect(response.ok).toBe(true);
    await expect(response.text()).resolves.toBe('{"ok":true}{"ignored":true}');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('should preserve the original JSON parse error when no complete payload can be recovered', async () => {
    expect(() => parseJsonResponseText('{"ok":true}')).not.toThrow();
    expect(() => parseJsonResponseText('not json')).toThrow(SyntaxError);
    expect(isJsonParseFailure(new SyntaxError('broken'))).toBe(true);
    expect(isJsonParseFailure(new Error('Failed to fetch'))).toBe(false);
  });

  it('should reject immediately when the signal is already aborted', async () => {
    const requestUrl = vi.fn();
    const fetchImpl = createObsidianFetchAdapter(requestUrl);
    const controller = new AbortController();
    controller.abort();

    await expect(fetchImpl('https://api.example.com', {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it('should reject with AbortError when the signal aborts while requestUrl is pending', async () => {
    const requestUrl = vi.fn(() => new Promise(() => {}));
    const fetchImpl = createObsidianFetchAdapter(requestUrl);
    const controller = new AbortController();
    const request = fetchImpl('https://api.example.com', {
      signal: controller.signal,
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
