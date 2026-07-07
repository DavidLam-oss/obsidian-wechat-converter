/*
## 核心功能

实现 AI layout 服务的 index 子能力，支撑文章结构到微信安全版式的生成和归一化。

## 输入

接收 Markdown 结构、AI provider 响应、布局选择、色彩/组件配置和缓存状态。

## 输出

输出 同文件内副作用、配置对象、测试断言或样式规则，供 AI layout 入口和转换器面板调用。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现；保持与旧 services/ai-layout.js 兼容。

## 依赖

关键依赖：`./constants.js`、`./utils.js`、`./color.js`、`./catalog.js`、`./providers.js`、`./block-utils.js`、`./schema-validation.js`、`./state-cache.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

export * from './constants.js';
export * from './utils.js';
export * from './color.js';
export * from './catalog.js';
export * from './providers.js';
export * from './block-utils.js';
export * from './schema-validation.js';
export * from './state-cache.js';
export * from './settings.js';
export * from './prompt-context.js';
export * from './selection.js';
export * from './layout-normalization.js';
export * from './generation.js';
export * from './render.js';
