---
name: openprd-discovery-loop
description: 面向现有项目、参考项目和模糊需求的持续 OpenPrd discovery。
---

<!-- OPENPRD:GENERATED
adapter=codex
source=openprd-discovery-loop
version=0.1.19
checksum=66f4a72100e85b0d
-->

# OpenPrd Discovery Loop

当用户要求继续、深挖、补全、对比、复刻、全面梳理 requirements，或进行大量只读扫描时，使用这份 skill。

## 大量只读扫描调度

- 日常任务仍由主 agent 先直接读取本地上下文；不要因为用户只说“看看、分析、梳理、定位、排查”就自动并行。
- 用户明确要求深度分析、深入调研、全面梳理、多角度评估、交叉验证、并行排查、对标复刻或风险审查时，优先考虑只读 subagent。
- 任务需要同时阅读多个目录、文档、模块、日志、历史实现或参考项目，且并行收集证据能明显减少主上下文污染或节省时间时，可以启动。
- 任务涉及外部技术事实、公开仓库对标、复杂排障、发布风险或安全风险，且需要独立复核时，可以启动；仍必须遵守 Context7、DeepWiki、secrets-vault 和长文件门禁。
- 用户明确说“不用 subagent / 直接做 / 先别并行 / 只回答”时，不启动。
- 单文件小改、明确文案微调、简单命令、非常短的问题或清晰 bug 修复，默认不启动。
- 一旦进入深度研究型 subagent 流程，默认使用 3 个只读 subagent：2 个独立调研执行者 + 1 个审查/交叉验证者。
- 最多启动 5 个 subagent：最多 4 个调研执行者 + 1 个审查者。只有任务天然拆成 4 个互不冲突的研究分支时才扩到 5 个。
- 代码与文档调研优先使用 `spark-code-researcher`、`spark-doc-reader` 或 `documentation-explore`；对标复刻用 `electron-parity-mapper`；安装发布或渠道排障用 `release-diagnostics-researcher`、`channel-debug-researcher`；审查与风险扫描用 `skill-workflow-reviewer`、`security-risk-researcher`。
- 每个 subagent 只回答一个清晰问题，不再继续 spawn；主 agent 负责决策、整合和所有写入，subagent 只做只读调研、归纳和交叉验证。
- subagent 输出必须回到主 agent 汇总；写入 discovery claim、requirements、specs 或 tasks 前，主 agent 必须把结论映射到证据路径、置信度和未解决问题。

## 循环

- 用 `openprd discovery . --mode <brownfield|reference|requirement>` 启动或恢复。
- 每次只推进一个有证据支撑的覆盖项。
- 报告运行健康前，用 `openprd discovery . --verify` 做校验。
- 通过 `openprd standards . --verify` 保持基线文档标准同步。
- 单个任务完成后只保留 task-scoped evidence；阶段收口或整体实现完成后，再用 `openprd quality . --verify` 审查 HTML 质量评估报告里的场景标签、必需 EVO 门禁、日志、业务护栏、冒烟覆盖、性能和知识缺口。

## 深度规则

- 每个 claim 都要带来源、证据路径和置信度。
- 推断出的行为不能直接变成 accepted requirement，必须保持可评审。
- 大型任务文件必须分片并通过校验。
- 只有在覆盖耗尽、被阻塞，或明确交接后才停止。
