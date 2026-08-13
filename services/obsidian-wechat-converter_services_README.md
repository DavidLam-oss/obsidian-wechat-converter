# 文件夹说明书

## 核心功能

承载渲染、路径、同步、媒体、设置、错误处理和多平台桥接等服务层能力。

## 输入

接收视图层请求、Markdown/HTML、插件设置、账号凭证、本地资源和外部 API 响应。

## 输出

输出渲染结果、triplet renderer/serializer 子模块、同步 payload、bridge runtime、媒体上传结果、清洗 HTML、设置模型和错误消息。

## 微信贴图模块

- `markdown-cleaner.js`：把 Markdown 保守清理为贴图纯文本，并报告被移除结构。
- `sticker-extractor.js`：提取正文图片、标题和清理后的文案。
- `sticker-image-items.js`：统一正文、本地上传和公众号素材图片项，只做同来源去重。
- `sticker-media-resolver.js`：校验素材所属账号、复用成功上传缓存并解析 media_id。

## 微信图片上传兼容

- `wechat-image-transcoder.js`：在共用微信上传边界识别 WebP 容器；照片型静态 WebP 转 JPEG，透明或无损型静态 WebP 转 PNG，动画 WebP 明确拒绝；不修改源文件。
- `wechat-api.js`：让正文图片、封面和贴图图片的代理/直连上传统一消费格式归一化后的 Blob，网络重试复用同一次转换结果。

## 发布清理模块

- `publish-cleanup.js`：负责发布后目录解析、安全校验、删除和失效 `cover` / `cover_dir` 清理；视图层只保留兼容适配。

## 定位

位于 services/，是业务服务层；UI 只调用服务，不在视图文件内重复核心规则。

## 依赖

converter.js、views/、Obsidian API、微信/飞书 API、浏览器扩展桥接和本地资源解析。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
