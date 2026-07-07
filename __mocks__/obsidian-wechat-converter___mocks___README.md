# 文件夹说明书

## 核心功能

承载测试环境中的 Obsidian API mock，让 Vitest 可以在 Node/jsdom 中运行插件逻辑。

## 输入

接收测试用例对 Obsidian 类、Notice、requestUrl、DOM helper 和插件基类的导入。

## 输出

输出可复用 mock、调用记录和重置工具，供测试断言与隔离状态使用。

## 定位

位于仓库测试辅助边界，只服务自动化测试，不进入生产 bundle。

## 依赖

Vitest mock 解析、tests/helpers/、被测插件源码。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
