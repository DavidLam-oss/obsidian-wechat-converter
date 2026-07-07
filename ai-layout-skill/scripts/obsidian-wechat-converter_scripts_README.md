# 文件夹说明书

## 核心功能

承载 AI layout skill 的构建辅助脚本，把 skill 上下文整理为运行时可消费材料。

## 输入

接收 ai-layout-skill 源材料、项目布局约束和脚本命令参数。

## 输出

输出 prompt context 或生成材料，供 AI layout runtime 和构建流程使用。

## 定位

位于 ai-layout-skill/scripts/，属于 AI layout skill 工程化，不参与插件主视图运行。

## 依赖

Node.js fs/path、AI layout skill 源文件和 services/ai-layout 约束。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
