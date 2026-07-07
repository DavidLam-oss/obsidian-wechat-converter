/*
## 核心功能

保留 AI layout 旧入口兼容层，把调用转发到拆分后的 services/ai-layout/index.js。

## 输入

接收历史导入路径上的 AI layout 调用。

## 输出

重新导出拆分后 AI layout 模块的公共 API。

## 定位

位于 services/，是兼容转发文件；新增能力应放到 services/ai-layout/ 子模块。

## 依赖

关键依赖：`./ai-layout/index.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

export * from './ai-layout/index.js';
