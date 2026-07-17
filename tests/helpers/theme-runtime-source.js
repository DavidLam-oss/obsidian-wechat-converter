/*
## 核心功能

读取构建后的 AppleTheme 单脚本，供需要模拟插件脚本环境的测试使用。

## 输入

接收生成物中的 embeddedDependencyScripts 配置。

## 输出

输出可直接执行、且已包含主题子模块的 AppleTheme 脚本文本。

## 定位

位于 tests/helpers/，只服务主题与 converter 的集成测试，不参与生产运行时。

## 依赖

关键依赖：`../../services/generated-embedded-deps.js`。

## 维护规则

- 测试通过该 helper 读取主题脚本，避免重新拼接主题子模块。
- 主题源码变化后先运行 `npm run generate:embedded`。
*/

const { embeddedDependencyScripts } = require('../../services/generated-embedded-deps.js');

function getBundledThemeSource() {
  const source = embeddedDependencyScripts?.theme;
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('Embedded AppleTheme source is unavailable');
  }
  return source;
}

module.exports = {
  getBundledThemeSource,
};
