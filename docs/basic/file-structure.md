# 项目文件结构

## 项目定位

本项目是一个 Obsidian 插件，把 Markdown 笔记转换为适合微信公众号编辑器粘贴、微信草稿箱同步、飞书云文档同步和多平台草稿分发的内容。运行边界是 Obsidian Electron 环境，入口源码是 `input.js`，生产入口是构建生成的 `main.js`。

## 核心目录

- `input.js`: 插件生命周期、视图注册、设置 UI、预览面板和顶层发布动作。
- `converter.js`: Markdown 到微信友好 HTML 的转换核心，包括 sanitizer、callout、图片、代码块和输出 shaping。
- `project-types.js`: JavaScript 源码共用的全局 JSDoc 类型入口，仅参与静态分析，不产生运行时代码。
- `project-view-contracts.d.ts`、`project-view-method-contracts.d.ts`、`project-method-groups.d.ts`: 拆分后的视图状态、方法和方法组静态合同，通过接口合并保持模块边界类型一致。
- `services/`: 渲染管线、动态依赖加载、Obsidian 原生渲染、路径处理、微信/飞书/多平台同步和错误处理。
- `views/`: 转换器视图、发布弹窗、设置页和共享视图工具。
- `styles/` 与 `styles.css`: 按职责拆分的样式源文件和生成后的插件样式入口；预览、设置控件、贴图预览、贴图设置与贴图发布均有独立片段。
- `themes/`: 主题模块，当前核心文件是 `themes/apple-theme.js`。
- `lib/`: 独立运行时库和单独构建的数学公式 bundle。
- `scripts/`: 构建、生成、扫描风险、发布校验和性能测量脚本。
- `tests/`: Vitest 单元测试和测试辅助模块。
- `docs/`: 设计计划、交接文档、支持说明和 OpenPRD 基线文档。
- `.openprd/`: OpenPRD 工作区、模板、标准、需求和协作元数据。
- `.codex/` 与 `.claude/`: OpenPRD 生成的 Agent skills、hooks 和命令入口。

## 文件组织规则

- 新增文件时，应同步确认所在文件夹说明书是否需要更新。
- 跨模块移动文件时，应更新本文件中的目录结构和职责说明。
- 不手写 `main.js`、`services/generated-embedded-deps.js`、`styles.css` 等生成物；源文件变更后通过既有 npm 脚本重新生成。
- `project-*.d.ts` 和 `project-types.js` 只描述现有 JavaScript 合同，不承载默认值、请求参数或运行时 fallback 逻辑。
- 渲染、路径、同步、清洗和错误处理逻辑优先放在 `services/` 或 `converter.js`，避免把核心规则堆回 `input.js`。

## 维护规则

- 每次新增、删除、移动目录或核心文件后，必须检查并更新本文件。
- 本文档只记录项目结构事实，不承载具体功能需求细节。
