# 文件夹说明书

## 核心功能

承载 Vitest 回归测试，覆盖渲染、同步、设置、安全、UI 和构建契约；飞书同步协调器测试按基础导入、智能覆盖和图片后处理分文件维护，AI layout service 测试按基础、渲染、缓存归一化和生成 provider 分文件维护，Wechatsync bridge 测试按基础服务流、队列操作、协议握手、HTTP 安全和多客户端注册表分文件维护。

## 输入

接收被测源码、mock Obsidian/jsdom 环境、fixture Markdown/HTML 和服务层假依赖。

## 输出

输出自动化断言结果，保护用户可见行为和服务契约不回归。

## 定位

位于 tests/，是质量保障层；新增核心逻辑应同步补测试或说明人工验证理由。

## 依赖

Vitest、jsdom、__mocks__/obsidian.js、tests/helpers/ 和项目源码。

## 多平台发布测试分组

- `multi_platform_modal.test.js`：平台列表、选择状态、连接状态和 Pro/Free UI 契约。
- `multi_platform_modal_publish.test.js`：额度策略、Pro 预截断和 Bridge 发布结果。
- `multi_platform_modal_assets.test.js`：本地图片、封面资源、远程素材封面和缓存。
- `helpers/multi-platform-modal-fixtures.js`：多平台 Modal 的公共 Obsidian view 与 Modal 夹具。

## 发布清理测试

- `publish_cleanup.test.js`：直接验证目录解析、安全拒绝、frontmatter 清理和删除编排。
- `frontmatter_cleanup.test.js`：验证 AppleStyleView 兼容适配及同步成功后的调用顺序。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
