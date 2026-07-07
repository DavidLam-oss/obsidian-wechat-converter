/*
## 核心功能

提供 AppleStyleView 相关测试的共享辅助能力。

## 输入

接收 Vitest 的 `vi` 测试工具、jsdom 环境和被测 input 模块。

## 输出

输出 `AppleStylePlugin`、`AppleStyleView`、Obsidian 风格 DOM 构造器和 view 测试清理工具。

## 定位

位于 tests/helpers/，只服务 view 层测试，不参与生产插件运行时。

## 依赖

关键依赖：`input-module.cjs`、`obsidian-dom.js` 和 Vitest 测试上下文。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests/helpers 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有 helper 协作。
*/

const { createObsidianLikeElement } = require('./obsidian-dom.js');
const { loadInputModule } = require('./input-module.cjs');

const inputModule = loadInputModule();
const AppleStylePlugin = inputModule.default;
const { AppleStyleView } = inputModule;

function resetViewTestGlobals(vi) {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (Array.isArray(globalThis.__obsidianNoticeRegistry)) {
    globalThis.__obsidianNoticeRegistry.length = 0;
  }
}

function installNoticeCapture() {
  globalThis.__obsidianNoticeRegistry = [];
  return globalThis.__obsidianNoticeRegistry;
}

module.exports = {
  AppleStylePlugin,
  AppleStyleView,
  createObsidianLikeElement,
  installNoticeCapture,
  resetViewTestGlobals,
};
