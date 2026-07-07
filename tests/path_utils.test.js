/*
## 核心功能

覆盖 path utils 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 path utils 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect } from 'vitest';
const { normalizeVaultPath, isAbsolutePathLike } = require('../services/path-utils');

describe('Path Utils Service', () => {
  it('normalizeVaultPath should normalize separators, duplicate slashes and edges', () => {
    expect(normalizeVaultPath('  /a//b\\c/  ')).toBe('a/b/c');
    expect(normalizeVaultPath('published/{{note}}_img/')).toBe('published/{{note}}_img');
    expect(normalizeVaultPath('')).toBe('');
    expect(normalizeVaultPath(null)).toBe('');
  });

  it('isAbsolutePathLike should detect unix and windows absolute paths', () => {
    expect(isAbsolutePathLike('/Users/demo/vault')).toBe(true);
    expect(isAbsolutePathLike('C:\\Users\\demo')).toBe(true);
    expect(isAbsolutePathLike('relative/path')).toBe(false);
    expect(isAbsolutePathLike('')).toBe(false);
    expect(isAbsolutePathLike(null)).toBe(false);
  });
});
