/*
## 核心功能

覆盖 obsidian loader 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 obsidian loader 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Obsidian runtime loader', () => {
  it('does not fall back to Node module.require for Obsidian APIs', () => {
    const source = readFileSync('services/obsidian-compat.js', 'utf8');
    const loaderStart = source.indexOf('const loadCommonJsDependency =');
    const loaderEnd = source.indexOf('export const obsidianApi =', loaderStart);
    const loaderSource = source.slice(loaderStart, loaderEnd);

    expect(loaderSource).toContain('typeof require ===');
    expect(loaderSource).not.toContain('module.require');
  });
});
