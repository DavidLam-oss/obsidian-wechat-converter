# 项目文件结构

## 项目定位

本项目是一个 Obsidian 插件，把 Markdown 笔记转换为适合微信公众号编辑器粘贴、微信草稿箱同步、飞书云文档同步和多平台草稿分发的内容。运行边界是 Obsidian Electron 环境，入口源码是 `input.js`，生产入口是构建生成的 `main.js`。

## 核心目录

- `input.js`: 插件生命周期、视图注册、设置 UI、预览面板和顶层发布动作。
- `converter.js`: Markdown 到微信友好 HTML 的转换核心，包括 sanitizer、callout、图片、代码块和输出 shaping。
- `project-types.js`: JavaScript 源码共用的全局 JSDoc 类型入口，仅参与静态分析，不产生运行时代码。
- `project-*.d.ts`: 按域拆分的静态合同，同名 `interface` 靠 TypeScript 声明合并成同一个合同，方法顺序与所在文件无关；只参与静态分析、不产生运行时代码。
  - `project-view-contracts.d.ts`: 视图状态字段、生命周期与设置面板外壳；
  - `project-view-contracts-card.d.ts`: 图片卡片（预览/设置/导出）；
  - `project-view-contracts-publish.d.ts`: 微信贴图提取、发布元数据、路径工具与目录清洗；
  - `project-view-contracts-ai.d.ts`: AI 排版面板；
  - `project-view-method-contracts.d.ts`: 渲染/复制/同步/AI 动作与设置页合同；
  - `project-method-groups.d.ts`: 各方法组模块的 `Pick` 合同（模块 ↔ 合同的接线）；
  - 合同与实现的一致性由 `tests/contracts_reconciliation.test.js` 机器守卫（挂 `npm test`）。
- `services/`: 渲染管线、动态依赖加载、Obsidian 原生渲染、路径处理、微信/飞书/多平台同步，以及图片卡片导出全链路服务：
  - `card-document.js`: 卡片分块、分页指令识别（`<!-- card:break -->`）与诊断；
  - `card-pagination.js`: 真实 DOM 测量的装箱页计划、孤行回退与标题联排；
  - `card-render-profile.js` / `card-render-engine.js`: 卡片语义渲染适配、DOM 测量装配与离屏渲染；
  - `card-render-capture.js`: 全局单捕获槽、有界 FIFO 队列（上限 100）、取消排队与底层生命周期锁；
  - `card-resources.js` / `card-resource-loaders.js`: 资源预加载、内联 data URL 与引用计数快照；
  - `card-session.js` / `card-export-job.js`: 会话状态机、排版 Token 缓存与导出任务生命周期；
  - `card-themes.js` / `card-cover-model.js` / `card-settings-model.js`: 六套卡片主题、四式封面模型与排版设置归一化；
  - `card-exporter.js` / `card-export-paths.js`: 批次路径校验、独占排他写入、进度反馈、取消重试与仅失败清单。
- `views/`: 转换器视图、发布弹窗、设置页和共享视图工具；卡片模块包含 `card-preview.js`（卡片预览流）、`card-settings.js`（侧栏排版/封面双 Tab 设置）、`card-cover-settings.js`（封面设置折叠卡片）、`card-media-picker-modal.js`（封面配图弹窗）、`card-export-modal.js` / `card-export-modal-view.js`（导出弹窗交互与视图）、`card-export-bridge.js`（导出接线层，含 `listCardExportPageIds` 页全集口径）及 `card-page-selection.js`（页选择状态与导出弹窗「自选页」清单渲染）。
- `styles/` 与 `styles.css`: 按职责拆分的样式源文件和生成后的插件样式入口；包含文章预览、贴图预览、卡片预览（`card-preview.css`）、卡片侧栏设置（`card-settings.css`）、卡片导出弹窗（`card-export.css`、`card-export-progress.css`）与 AI 设置（`ai-settings.css`）等独立片段。
- `themes/`: 主题模块，当前包含文章主题 `themes/apple-theme.js` 与卡片主题 `services/card-themes.js`。
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
