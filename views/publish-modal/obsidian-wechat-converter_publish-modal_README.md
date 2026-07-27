# 文件夹说明书

## 核心功能

承载微信、飞书和多平台发布弹窗的 UI 编排。

## 输入

接收文章元数据、账号配置、媒体选择、同步服务结果和用户操作。

## 输出

输出发布弹窗、账号状态、素材选择、同步动作和结果展示。

## 微信贴图发布

- `sticker-publish-content.js`：按顺序优先的单列流程编排账号、标题、九宫格、清理摘要与发布按钮。
- `material-picker.js`：封面与贴图共用的公众号素材选择器，可配置标题和确认文案。
- `wechat-sync-action.js`：把统一图片项解析为永久素材并创建贴图草稿。

## 定位

位于 views/publish-modal/，负责发布 UI；API 与桥接细节委托 services/。

## 依赖

views/apple-style-view-shared.js、services/wechat-*、services/feishu-*、services/wechatsync-*。

## 多平台发布模块边界

- `multi-platform.js`：公共入口和发布编排，负责文件内容准备、Bridge 请求、设置保存及结果 Modal 调用。
- `multi-platform-modal-ui.js`：多平台弹窗 DOM、平台选择状态和按钮状态，不直接调用 Bridge。
- `multi-platform-policy.js`：Pro、每日额度和远端策略计算，不依赖 DOM 或网络。
- `multi-platform-cover-assets.js`：微信素材封面下载、校验、缓存和 `asset://` 资源生成。
- `multi-platform-data.js`：Bridge 响应、资源和任务结果的兼容性归一化。

各模块通过单向依赖协作；不要在 UI 模块中加入发布请求，也不要在策略或数据模块中写入设置。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
