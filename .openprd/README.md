# OpenPrd 工作区

简体中文 | [English](./README_EN.md)

`.openprd/` 是项目内用于 discovery、PRD 合成、校验、freeze 和 handoff 的本地事实源。

## 生命周期

```text
classify -> interview -> synthesize -> validate -> freeze -> handoff
```

## 这里存放什么

- `config.yaml`：运行时默认值与工作流策略。
- `schema/`：规范 PRD schema 与校验规则。
- `schema/diagram-architecture.schema.yaml`：架构图最小契约 schema。
- `schema/diagram-product-flow.schema.yaml`：产品流程图最小契约 schema。
- `templates/`：模板层与模板注册表。
- `templates/diagram/`：图表 artifact 契约模板。
- `standards/`：项目标准契约与说明书模板。
- `engagements/active/`：当前默认 PRD 草稿、流程、角色与交接文档。
- `engagements/active/decision-log.md`：可持续追加的决策记录。
- `engagements/active/open-questions.md`：待解问题与 discovery 缺口。
- `engagements/active/progress.md`：追加式执行进度。
- `engagements/active/verification.md`：freeze 与验证证据。
- `engagements/active/architecture-diagram.html`：可评审架构图 artifact。
- `engagements/active/architecture-diagram.json`：用于继续迭代的结构化架构图契约。
- `engagements/active/product-flow-diagram.html`：可评审产品流程图 artifact。
- `engagements/active/product-flow-diagram.json`：用于继续迭代的结构化产品流程图契约。
- `artifacts/active/`：人类评审与 playground 使用的 HTML、Markdown 与 patch bundle。
- `artifacts/archive/`：需求评审或 handoff 之后归档的 artifact bundle。
- `state/`：运行状态、版本索引、freeze 快照、session 元数据与执行图。
- `state/task-graph.json`：工作流 / 任务图、阻塞关系与 next-ready 节点。
- `state/events.jsonl`：追加式生命周期事件流。
- `state/versions/`：不可变版本快照。
- `sessions/`：按 engagement 组织的工作状态。
- `exports/`：下游导出产物，例如 OpenSpec handoff bundle。

## 模板层

```text
core -> company -> industry -> project -> session
```

- `core`：OpenPrd 自带的基础字段、默认文案和共享规则。
- `company`：团队或公司范围的共用术语、流程和评审偏好。
- `industry`：行业特有字段、约束和验证重点。
- `project`：单项目特有的补充规则、前提和交付方式。
- `session`：单次协作临时覆盖，不改变长期事实源。

## 日常规则

- 优先更新 `docs/basic/`，不要把长期说明堆回 `AGENTS.md`。
- 新增工作流或导出物时，同步检查 `src/workspace-core.js`、`src/openprd.js` 和对应模板是否一致。
- 对外确认前，优先运行 `openprd standards . --verify`、`openprd quality . --verify` 与 `openprd run . --verify`。
