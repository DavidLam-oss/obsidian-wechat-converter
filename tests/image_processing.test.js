/*
## 核心功能

覆盖 image processing 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 image processing 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Alias configured in vitest.config.mjs handles the mock
const { loadInputModule } = require('./helpers/input-module.cjs');
const { AppleStyleView } = loadInputModule();

// Mock fetch globally
global.fetch = vi.fn();

describe('AppleStyleView - Image Processing', () => {
  let view;

  beforeEach(() => {
    view = new AppleStyleView(null, null);
    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();

    // Mock Image
    global.Image = class {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.src = '';
        setTimeout(() => this.onload && this.onload(), 10);
      }
    };

    // Reset fetch mock
    global.fetch.mockReset();
  });

  it('should handle app:// images (Desktop)', async () => {
    // Setup DOM with image
    const div = document.createElement('div');
    div.innerHTML = '<img src="app://local/path/image.png" />';

    // Mock fetch response
    global.fetch.mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['test'], { type: 'image/png' }))
    });

    // Mock blobToJpegDataUrl (since canvas is hard to mock in jsdom perfectly without canvas package)
    // We'll spy on the method instead to verify it's called
    view.convertImageToLocally = vi.fn().mockResolvedValue(true);

    const hasProcessed = await view.processImagesToDataURL(div);

    // We expect it to find the image and try to process it
    expect(hasProcessed).toBe(true);
    expect(view.convertImageToLocally).toHaveBeenCalled();
  });

  it('should handle capacitor:// images (Mobile)', async () => {
    const div = document.createElement('div');
    div.innerHTML = '<img src="capacitor://localhost/path/image.png" />';

    // Mock methods
    view.convertImageToLocally = vi.fn().mockResolvedValue(true);

    const hasProcessed = await view.processImagesToDataURL(div);

    expect(hasProcessed).toBe(true); // Should return true if checking capacitor://
    expect(view.convertImageToLocally).toHaveBeenCalled();
  });

  it('should ignore remote images in local processing', async () => {
    const div = document.createElement('div');
    div.innerHTML = '<img src="https://example.com/image.png" />';

    view.convertImageToLocally = vi.fn();

    const hasProcessed = await view.processImagesToDataURL(div);

    expect(hasProcessed).toBe(false);
    expect(view.convertImageToLocally).not.toHaveBeenCalled();
  });
});
