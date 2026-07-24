# 后端架构设计

## 适用范围

本项目主体运行在 Obsidian 插件进程中，没有传统常驻业务后端。后端相关边界主要包括插件内的服务层、微信/飞书开放平台 API 调用、可选 Cloudflare Worker 代理、本地浏览器扩展桥接，以及仓库内 `server/` 目录下的辅助代理服务。

## 服务边界

- `services/render-pipeline.js` 组织预览和发布输出所需的渲染步骤。
- `services/dependency-loader.js` 加载嵌入式运行时依赖，避免 Obsidian 环境中动态依赖失配。
- `services/native-renderer.js`、`services/obsidian-triplet-renderer.js` 和 serializer 模块承接 native-only 渲染方向。
- `services/wechat-*` 模块负责微信 token、素材、草稿、HTML 清洗、媒体上传、同步上下文和失败反馈。
- `services/feishu-*` 模块负责飞书文档同步、媒体处理、设置、API 调用和 Mermaid 远程渲染策略。
- `services/wechatsync-*` 模块负责桌面端浏览器发布助手桥接、平台设置、结果回传和任务状态；模块本身必须可在移动端安全加载，桌面专用 Node API 只能在平台守卫后动态获取。
- `server/` 是可部署的微信代理辅助服务，不是插件运行的必需组件。

## CLI 接入面

项目不提供用户可安装的产品 CLI。仓库 CLI 面主要是开发脚本：`npm run dev`、`npm run build`、`npm test`、`npm run scan:guard`、`npm run review:guard`、`npm run release:validate` 和 OpenPRD 的 `openprd status/doctor/validate`。

## API 接入面

- 微信草稿同步使用微信官方 API，涉及 access token、素材上传、草稿创建/更新、封面和配额错误处理。
- 飞书云文档同步使用飞书开放平台 API，涉及应用凭证、目标文件夹、docx 创建/更新、图片/GIF 上传和调用次数统计。
- 多平台草稿分发通过 Obsidian 发布助手浏览器扩展桥接，不在插件内接管第三方平台登录态。
- 可选 Cloudflare Worker 或 `server/` 代理用于处理微信 API 的 CORS、IP 白名单和部署环境差异。

## 数据流

输入来自当前 Obsidian Markdown 文件、frontmatter、插件设置、本地图片资源和用户在发布弹窗中的临时选择。处理过程包括 Markdown 渲染、HTML 清洗、图片路径解析、媒体压缩/上传、数学公式转换、Mermaid 栅格化和发布 payload 组装。输出包括预览 DOM、剪贴板富 HTML、微信草稿、飞书云文档、多平台草稿任务和本地缓存/设置。

## 维护规则

- 每次服务边界、CLI/API 接入契约、数据流、存储或外部依赖发生变化后，必须检查并更新本文件。
