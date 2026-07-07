# 文件夹说明书

## 核心功能

承载微信、飞书和多平台发布弹窗的 UI 编排。

## 输入

接收文章元数据、账号配置、媒体选择、同步服务结果和用户操作。

## 输出

输出发布弹窗、账号状态、素材选择、同步动作和结果展示。

## 定位

位于 views/publish-modal/，负责发布 UI；API 与桥接细节委托 services/。

## 依赖

views/apple-style-view-shared.js、services/wechat-*、services/feishu-*、services/wechatsync-*。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
