/*
## 核心功能

实现 AI layout 服务的 block utils 子能力，支撑文章结构到微信安全版式的生成和归一化。

## 输入

接收 Markdown 结构、AI provider 响应、布局选择、色彩/组件配置和缓存状态。

## 输出

输出 `getLayoutBlockLabel`、`getLayoutBlockKey`，供 AI layout 入口和转换器面板调用。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现；保持与旧 services/ai-layout.js 兼容。

## 依赖

关键依赖：`./utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import { coerceString, toRecord } from './utils.js';

function getLayoutBlockLabel(block = {}) {
  const source = toRecord(block);
  return coerceString(
    source.title
    || source.caseLabel
    || source.text
    || source.caption
    || source.buttonText
    || source.imageId
    || source.type
  );
}

function getLayoutBlockKey(block = {}) {
  const source = toRecord(block);
  return `${coerceString(source.type)}:${getLayoutBlockLabel(source)}`;
}

export {
  getLayoutBlockLabel,
  getLayoutBlockKey,
};
