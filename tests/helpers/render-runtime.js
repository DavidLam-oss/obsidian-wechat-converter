/*
## 核心功能

提供测试辅助能力：render runtime。

## 输入

接收 Vitest/jsdom 测试上下文、mock 模块、插件源码路径或渲染 fixture。

## 输出

输出 `bootstrapLegacyRuntime`、`createLegacyConverter`，供 tests/ 下的测试用例复用。

## 定位

位于 tests/helpers/，只服务自动化测试，不参与生产插件运行时。

## 依赖

关键依赖：`fs`、`path`、`../../lib/markdown-it.min.js`、`../../lib/highlight.min.js`、`../../lib/mathjax-plugin.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests/helpers 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

const fs = require('fs');
const path = require('path');
const { getBundledThemeSource } = require('./theme-runtime-source.js');

function ensureDomGlobals() {
  if (typeof window === 'undefined') {
    global.window = global;
  }
}

function bootstrapLegacyRuntime() {
  ensureDomGlobals();

  if (typeof global.markdownit === 'undefined') {
    global.markdownit = require('../../lib/markdown-it.min.js');
  }
  if (typeof global.hljs === 'undefined') {
    global.hljs = require('../../lib/highlight.min.js');
  }
  if (typeof window.markdownit === 'undefined') {
    window.markdownit = global.markdownit;
  }
  if (typeof window.hljs === 'undefined') {
    window.hljs = global.hljs;
  }

  require('../../lib/mathjax-plugin.js');

  if (!window.AppleTheme) {
    const themeCode = getBundledThemeSource();
    (0, eval)(themeCode);
  }
  if (!window.AppleStyleConverter) {
    const converterCode = fs.readFileSync(path.resolve(__dirname, '../../converter.js'), 'utf8');
    (0, eval)(converterCode);
  }
}

async function createLegacyConverter({
  sourcePath = '',
  themeOptions = {},
} = {}) {
  bootstrapLegacyRuntime();

  const theme = new window.AppleTheme({
    theme: 'wechat',
    themeColor: 'blue',
    fontSize: 3,
    macCodeBlock: true,
    codeLineNumber: true,
    sidePadding: 16,
    coloredHeader: false,
    ...themeOptions,
  });

  const converter = new window.AppleStyleConverter(theme, '', true, null, sourcePath);
  await converter.initMarkdownIt();
  return converter;
}

module.exports = {
  bootstrapLegacyRuntime,
  createLegacyConverter,
};
