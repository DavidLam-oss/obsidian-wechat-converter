/*
## 核心功能

提供测试辅助能力：input module。

## 输入

接收 Vitest/jsdom 测试上下文、mock 模块、插件源码路径或渲染 fixture。

## 输出

输出 `loadInputModule`，供 tests/ 下的测试用例复用。

## 定位

位于 tests/helpers/，只服务自动化测试，不参与生产插件运行时。

## 依赖

关键依赖：`../../input.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests/helpers 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

function loadInputModule() {
  if (typeof globalThis.require !== 'function') {
    globalThis.require = require;
  }
  if (globalThis.window && typeof globalThis.window.require !== 'function') {
    globalThis.window.require = require;
  }
  const inputModule = require('../../input.js');
  return inputModule && inputModule.default ? inputModule : {
    default: inputModule,
    ...inputModule,
  };
}

module.exports = {
  loadInputModule,
};
