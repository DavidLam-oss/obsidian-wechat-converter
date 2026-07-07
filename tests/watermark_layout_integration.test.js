/*
## 核心功能

覆盖 watermark layout integration 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 watermark layout integration 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect } from 'vitest';

const { createLegacyConverter } = require('./helpers/render-runtime');

describe('Watermark layout integration', () => {
  it('should render avatar and caption as inline-safe siblings in watermark mode', async () => {
    const converter = await createLegacyConverter();
    converter.updateConfig({
      avatarUrl: 'https://example.com/avatar.png',
      showImageCaption: true,
    });

    const html = await converter.convert('![图片说明](https://example.com/body.png)');
    const container = document.createElement('div');
    container.innerHTML = html;

    const header = container.querySelector('figure > div');
    expect(header).not.toBeNull();

    const avatar = header.querySelector('img[alt="logo"]');
    const caption = header.querySelector('span');

    expect(avatar).not.toBeNull();
    expect(caption).not.toBeNull();
    expect(caption.textContent).toBe('图片说明');
    expect(avatar.nextElementSibling).toBe(caption);

    expect(header.getAttribute('style')).toContain('flex-wrap: nowrap !important;');
    expect(avatar.getAttribute('style')).toContain('display: inline-block !important;');
    expect(caption.getAttribute('style')).toContain('display: inline-block !important;');
  });
});
