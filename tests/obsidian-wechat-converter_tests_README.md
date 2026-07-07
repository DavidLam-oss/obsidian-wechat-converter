# 文件夹说明书

## 核心功能

承载 Vitest 回归测试，覆盖渲染、同步、设置、安全、UI 和构建契约；飞书同步协调器测试按基础导入、智能覆盖和图片后处理分文件维护，AI layout service 测试按基础、渲染、缓存归一化和生成 provider 分文件维护。

## 输入

接收被测源码、mock Obsidian/jsdom 环境、fixture Markdown/HTML 和服务层假依赖。

## 输出

输出自动化断言结果，保护用户可见行为和服务契约不回归。

## 定位

位于 tests/，是质量保障层；新增核心逻辑应同步补测试或说明人工验证理由。

## 依赖

Vitest、jsdom、__mocks__/obsidian.js、tests/helpers/ 和项目源码。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
