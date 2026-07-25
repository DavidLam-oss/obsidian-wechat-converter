---
name: openprd-router
description: OpenPrd 入口路由 skill：先判断当前任务该读哪个 skill、哪个命令面和哪个门禁。
---

<!-- OPENPRD:GENERATED
adapter=claude
source=openprd-router
version=0.1.19
checksum=952b675fce2a5dcf
-->

# OpenPrd Router

把这份 skill 当成 OpenPrd 的入口路由，而不是长文规则仓库。

## 先做什么

1. 先判断 executionMode。Codex automation、Claude Code headless、cron、scheduled、unattended task 这类无人值守自动化默认进入 automation-safe mode：不要运行 `openprd run . --context`，不要注入 OpenPrd context，不要求 `openprd dev-check` / `quality` / `doctor`，按该自动化自己的 runbook、日志、测试和通知合同收口。
2. 只有 automation prompt 或环境明确写明“这是 OpenPrd 维护任务”“显式启用 OpenPrd / enable OpenPrd / openprd-maintenance”时，才在自动化里恢复 OpenPrd 工作流。
3. 如果用户当前明确在说“帮我梳理下”“先想清楚”“进入脑暴模式”，先读 `$openprd-requirement-intake`，并优先运行 `openprd run . --context --message <用户原话>`；需要时直接进入 `openprd brainstorm . --open`，不要只跑不带 message 的 `openprd run . --context`。
4. 其他互动场景再读 `.openprd/` 当前状态，并把 `openprd run . --context` 当作纯读取的建议上下文，而不是自动执行指令；只有 hook/调用方确实要记录本次上下文使用时，才显式加 `--record-context`。
5. 如果当前是空白工作区的前端/页面冷启动，而且用户已经给了明确的页面主题、模块范围或“直接实现”的意图，优先改用 `openprd run . --context --message <用户原话>`；不要先跑不带 message 的 `openprd run . --context`，再被空白工作区自己的 `clarify-user` 带偏。
6. 需要具体命令时，优先读取 `.openprd/harness/command-catalog.md`，不要把命令清单继续塞回 `AGENTS.md`。
7. 需要共用约束时，读 `$openprd-shared`；需要主工作流时，读 `$openprd-harness`。
8. 任务涉及界面、页面、视觉、样式、信息架构、内容型页面或前端体验时，先读取 `$openprd-frontend-design`；新界面、结构性 UI 改造、设计系统或 Impeccable handoff 再读取 `$openprd-ui-context`。局部低风险修正使用 UI Context 的 `local-fix` 路径。
9. 如果这类空白前端任务在带 message 的前提下仍短暂返回 `clarify-user`，但用户原话已经明确要求直接实现单页/首页/原型，就把它当成摘要级提醒；先用 3 到 5 行 mini-plan 收口，再按 frontend design 的 `design-starter -> Patch Mode` 路径继续，不要回到长澄清或模板源码漫游。

## 路由表

- 需求入口分流、用户可见需求类型与内部 L0/L1/L2 路由码对照、PRD 场景视角选择：`$openprd-requirement-intake`
- 主工作流、review/change/tasks、`run/loop`：`$openprd-harness`
- 前端设计框架、审美资产库、主题/骨架/组件/配方/模板、事实与素材前置门：`$openprd-frontend-design`
- 项目双路径理解、专业 UI/UX 方向、PRODUCT.md/DESIGN.md 与 Impeccable 交接：`$openprd-ui-context`
- 测试策略分流、分层验证和任务级 evidence-plan：`$openprd-test-strategy`
- 最佳实践、benchmark、公开 GitHub 仓库、第三方技术事实、prompt/context engineering：`$openprd-benchmark-router`
- `docs/basic/`、文件说明书、文件夹 README、文档标准：`$openprd-standards`
- 就绪验证、EVO 门禁、HTML 质量评估报告、项目经验沉淀：`$openprd-quality`
- 架构图、产品流程图、解释型 SVG、可视化评审、大界面改动效果图方案评审：`$openprd-diagram-review` 与 `$openprd-harness`
- 长时间只读挖掘、参考项目持续调研、requirements/specs/tasks 补全：`$openprd-discovery-loop`
- 学习包、归档阅读器、知识整理：`$openprd-learning-review`

## 路由原则

- `AGENTS.md` 只保留轻量入口合同；详细规则放进 repo-local skills、`.openprd/harness/command-catalog.md` 和 hooks。
- 公开 GitHub 仓库架构/对标先 DeepWiki；第三方库、API、SDK、MCP、CLI 用法先查本地证据，本地不足时再按 `resolve_library_id -> query_docs` 使用 Context7。
- hooks 已经强制处理 requirement / research / secrets / skill-visualization / weapp / browser / copy 这些门禁；不要再把它们膨胀回 `AGENTS.md` 静态长文。
- 用户原话里已经明确要求“先梳理/脑暴”时，用户意图优先于不带 message 的默认 run context；先把原话带进 `openprd run . --context --message ...`，或直接进入脑暴模式。
- 不要用固定关键词决定是否写 PRD，也不要用词表决定工具；先让 `$openprd-requirement-intake` 按影响面、未知数、决策成本和验证成本做语义分流，再按用户目标、期望产物、交付阶段和证据缺口选择学习器、视觉评审或质量收口工具。
- 当用户需要理解状态跳转、因果链、方案差异、边界分工或风险传播时，先读 `$openprd-diagram-review`，优先用轻量解释型 SVG 辅助说明；不要把它误升级成正式评审图或视觉验收图。
- 不要用“需求大小”机械决定测试层级；先让 `$openprd-test-strategy` 按风险、触达面、失败后果和证据成本分流。
