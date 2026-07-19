# 文件夹说明书

## 核心功能

承载测试 helper，提供模块加载、Obsidian DOM mock、view 测试封装、Modal 夹具、路径解析和渲染运行时辅助。

## 输入

接收测试上下文、被测模块路径、mock 设置和 fixture 数据。

## 输出

输出复用 helper、加载器、DOM 构造器和测试运行时包装。

## 定位

位于 tests/helpers/，只服务测试，避免引入生产依赖反向耦合。

## 依赖

Vitest、jsdom、__mocks__/obsidian.js 和被测模块。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
