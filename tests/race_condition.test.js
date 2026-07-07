/*
## 核心功能

覆盖 race condition 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 race condition 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi } from 'vitest';

// 模拟我们的 View 类逻辑
class MockAppleStyleView {
    constructor() {
        this.renderGeneration = 0;
        this.currentHtml = null;
        this.previewContainer = {
            innerHTML: '',
            scrollTop: 0,
            addClass: vi.fn(),
            empty: vi.fn()
        };
        this.app = {
            workspace: {
                getActiveViewOfType: () => ({
                    editor: { getValue: () => 'mock markdown' },
                    file: { path: 'test.md' }
                })
            }
        };
        this.converter = {
            convert: async (md) => {
                // 模拟网络或复杂转换延迟
                await new Promise(resolve => setTimeout(resolve, md === 'fast' ? 10 : 100));
                return `<html>${md}</html>`;
            },
            updateSourcePath: vi.fn()
        };
        this.updateCurrentDoc = vi.fn();
    }

    async convertCurrent(_silent = false, customMd = null) {
        const generation = ++this.renderGeneration;

        // 模拟获取 markdown 的逻辑
        const markdown = customMd || 'default';

        try {
            const html = await this.converter.convert(markdown);

            // 核心逻辑：检查代数
            if (generation !== this.renderGeneration) {
                return; // 被丢弃
            }

            this.currentHtml = html;
            this.previewContainer.innerHTML = html;
            this.updateCurrentDoc();
        } catch {
            // error handling
        }
    }
}

describe('AppleStyleView Race Condition Guard', () => {
    it('should only update UI with the result of the LATEST call', async () => {
        const view = new MockAppleStyleView();

        // 同时启动两个请求：
        // 1. 第一个请求（慢）：将渲染为 "slow content"
        // 2. 第二个请求（快）：将渲染为 "fast content"

        const p1 = view.convertCurrent(true, 'slow'); // 会延迟 100ms
        const p2 = view.convertCurrent(true, 'fast'); // 会延迟 10ms，但它是第 2 代

        await Promise.all([p1, p2]);

        // 验证：最终 HTML 应该是最后一次调用的结果（即使最后一次调用可能先完成，
        // 但在这个例子中，最后一次调用代数更高，旧调用完成后发现代数不对会退出）
        expect(view.renderGeneration).toBe(2);
        expect(view.previewContainer.innerHTML).toBe('<html>fast</html>');
    });

    it('should discard results from interleaved calls', async () => {
        const view = new MockAppleStyleView();

        // 模拟三个连续调用
        view.convertCurrent(true, 'first');
        view.convertCurrent(true, 'second');
        const finalP = view.convertCurrent(true, 'third');

        await finalP;

        // 即使前面的还在跑，最终显示的必须是第三个
        expect(view.previewContainer.innerHTML).toBe('<html>third</html>');
    });
});
