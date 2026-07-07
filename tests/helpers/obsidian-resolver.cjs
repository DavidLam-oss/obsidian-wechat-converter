/*
## 核心功能

提供测试辅助能力：obsidian resolver。

## 输入

接收 Vitest/jsdom 测试上下文、mock 模块、插件源码路径或渲染 fixture。

## 输出

输出 同文件内副作用、配置对象、测试断言或样式规则，供 tests/ 下的测试用例复用。

## 定位

位于 tests/helpers/，只服务自动化测试，不参与生产插件运行时。

## 依赖

关键依赖：`obsidian`、`module`、`path`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests/helpers 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// tests/helpers/obsidian-resolver.cjs
//
// Vitest 4 honors `resolve.alias` for ESM imports it transforms, while some
// legacy CommonJS tests still call `require('obsidian')` directly. The
// installed `obsidian` package ships only `.d.ts` type definitions, so those
// direct requires need to resolve to our mock implementation.
//
// Fix: monkey-patch `Module._resolveFilename` once per worker, before any
// test file runs, so every `require('obsidian')` resolves to our mock at
// `__mocks__/obsidian.js`. Wired in via `vitest.config.mjs` -> `setupFiles`.
//
// This keeps the existing alias semantics for ESM users and unblocks the
// CJS tests (settings_*, wechat_api, sync_modal_*, etc.) without touching
// node_modules or the production build.

const Module = require('module');
const path = require('path');

const mockPath = path.resolve(__dirname, '../../__mocks__/obsidian.js');
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function patchedResolveFilename(request, parent, ...rest) {
  if (request === 'obsidian') {
    return mockPath;
  }
  return originalResolve.call(this, request, parent, ...rest);
};

function installSetCssStylesPrototype(Ctor) {
  if (!Ctor || Ctor.prototype.setCssStyles) return;
  Object.defineProperty(Ctor.prototype, 'setCssStyles', {
    configurable: true,
    value(styles = {}) {
      Object.entries(styles || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        this.style[key] = String(value);
      });
      return this;
    },
  });
}

installSetCssStylesPrototype(globalThis.HTMLElement);
installSetCssStylesPrototype(globalThis.SVGElement);
