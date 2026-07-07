# 文件夹说明书

## 核心功能

承载 AI layout 生成、解析、规范化、渲染和 provider 适配能力。

## 输入

接收 Markdown 结构、用户布局选择、AI provider 响应、色彩/组件约束和缓存状态。

## 输出

输出归一化布局、渲染块、skill 选择结果、schema 校验结果和 UI 可消费状态。

## 定位

位于 services/ai-layout/，是 AI layout 内部实现层；保持旧入口兼容并避免 UI 耦合。

## 依赖

services/dom-utils.js、AI layout runtime、项目样式约束和 provider API。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
