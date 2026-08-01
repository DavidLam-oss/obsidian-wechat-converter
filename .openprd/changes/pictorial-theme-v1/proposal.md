# 图文志公众号主题第一阶段

## 背景与原因

现有公众号文章主题缺少以图片叙事为核心、同时服从动态主题色和微信内联样式限制的杂志式母版；外部参考主题也不能直接复制或依赖写死色板，需要结合本项目主题系统进行原创重设计。

## 变更内容

- 图文志主题注册与本项目自有命名
- hero、regular、caption 与无图降级的图片叙事结构
- accent、accent-readable、accent-deep、accent-soft 与中性色角色合同
- 必要的图片角色解析与原生序列化接入
- 主题、颜色、图片角色、序列化和微信兼容的自动化与视觉证据
- 按职责拆分源码并遵守 OpenPrd 行数与文件说明书门禁
- AppleTheme 主题列表新增图文志，主题和颜色仍是两个独立选择维度
- 提供可复用的动态颜色角色与对比度保护，不为图文志写颜色特例
- 提供明确且可测试的 hero、regular、caption 语义合同
- 为标题、正文、引用、列表、表格、图片、图注、链接和代码生成自洽的内联样式
- 自定义 CSS 继续作为现有后置覆盖层
- 第一阶段只实现 hero、regular、caption、无图降级、动态主题色和微信内联兼容
- 图片角色行为可预测，不按尺寸、文件名或主观算法猜测
- 复杂表格、代码、数学、Mermaid 与 Callout 以兼容优先，不强行杂志化
- 本轮新增或实质扩展的源码模块保持在 OpenPrd 正常控制线 700 行以内；达到预警即按职责拆分
- 不把新职责继续堆进 input.js、converter.js、views/converter/core.js 或其他已有大文件

## 能力范围

- `consumer-requirements`: 图文志公众号主题第一阶段 需求。

## 影响范围

- 主要用户: 在 Obsidian 中写作并发布到微信公众号、希望减少二次排版的内容创作者
- 主要用户: 需要图片、图注和章节节奏共同叙事，同时仍要求代码、公式、表格与 Callout 兼容的作者
- 依赖: themes/apple-theme-config.js、themes/apple-theme.js 与 themes/apple-theme-headings.js
- 依赖: services/obsidian-triplet-serializer.js 与现有 render pipeline
- 依赖: views/converter/settings-panel.js 与 views/converter/core.js
- 依赖: npm run generate:embedded、Vitest、scan/review guard、build 与 build-artifact checks
- 风险: 杂志式结构提高内容图片质量与图注一致性的要求，需要清晰降级而不是强制作者重写文章
- 风险: 极亮自定义色可能降低白底文字对比度，需要共用颜色工具保护
- 风险: 本地预览与微信编辑器处理差异可能造成视觉漂移，需要复制和草稿侧证据
- 风险: 现有主题和渲染文件部分已接近或超过行数控制线，若不提前拆分会增加维护成本
