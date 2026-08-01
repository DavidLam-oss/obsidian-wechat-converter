# 设计

## 背景

用户已经完成 Flipped Editor 与公开 GitHub 主题的调研取舍，并选择 Image Essay 作为第一批母版，希望按规划开始实施。

## 目标

- 新增本项目自有名称的 Image Essay 结构主题图文志
- 在有图和无图文章中都形成稳定、可预测的长文排版
- 让新结构完整服从动态主题色与自定义色，而不是依赖外部固定色板
- 保持预览、复制和微信草稿同步的基础 HTML 一致

## 范围

- 图文志主题注册与本项目自有命名
- hero、regular、caption 与无图降级的图片叙事结构
- accent、accent-readable、accent-deep、accent-soft 与中性色角色合同
- 必要的图片角色解析与原生序列化接入
- 主题、颜色、图片角色、序列化和微信兼容的自动化与视觉证据
- 按职责拆分源码并遵守 OpenPrd 行数与文件说明书门禁

## 约束

- 运行环境是 Obsidian Electron/CommonJS，主题源码会进入 generated-embedded-deps
- 微信输出必须以标签级内联样式和必要结构节点为主
- 沿用 AppleTheme、原生 renderer/serializer 与现有 settings/core 实时刷新链路，不建立平行主题引擎
- input.js 保持轻量，样式、图片语义与序列化职责分别落在对应模块
- OpenPrd codeFileLines 正常上限为 700 行；触达已有超线文件时只做最小接线并把新职责拆出
- 当前项目 MIT；外部 GitHub 参考与上游 AGPL-3.0-or-later
- 不复制外部精确实现、品牌、示例内容、图片或素材
- 不记录凭据、用户内容或生产账号信息
- themes/apple-theme-config.js、themes/apple-theme.js 与 themes/apple-theme-headings.js
- services/obsidian-triplet-serializer.js 与现有 render pipeline
- views/converter/settings-panel.js 与 views/converter/core.js
- npm run generate:embedded、Vitest、scan/review guard、build 与 build-artifact checks

## 业务护栏

- 待补充

## 风险与开放问题

- 假设: 用户选择 Image Essay 是对结构方向的确认，不代表接受 Flipped Editor 的品牌、颜色或源码实现
- 假设: 图文志第一阶段可以在不实现 wide 的情况下独立成立
- 已确认: hero 使用 alt 的 `hero:` 前缀显式增强；未标记图片安全降级为 regular，marker 不得残留在输出 alt 或图注正文。
- 风险: 杂志式结构提高内容图片质量与图注一致性的要求，需要清晰降级而不是强制作者重写文章
- 风险: 极亮自定义色可能降低白底文字对比度，需要共用颜色工具保护
- 风险: 本地预览与微信编辑器处理差异可能造成视觉漂移，需要复制和草稿侧证据
- 风险: 现有主题和渲染文件部分已接近或超过行数控制线，若不提前拆分会增加维护成本
- 已冻结: 图文志 hero 的显式 Markdown 标记语法为 `hero:`；默认不得使用尺寸、文件名或位置推断图片角色。
- 问题: 真实公众号账号联调若本轮环境不可用，必须作为未完成验证明确保留，不得以本地截图替代
