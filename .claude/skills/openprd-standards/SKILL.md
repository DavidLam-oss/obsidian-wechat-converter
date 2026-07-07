---
name: openprd-standards
description: 初始化并校验 `docs/basic`、文件说明书和文件夹 README 标准。
---

<!-- OPENPRD:GENERATED
adapter=claude
source=openprd-standards
version=0.1.19
checksum=2adea40f4afa7b05
-->

# OpenPrd Standards

当文档、文件说明书、文件夹 README 或实现就绪检查在范围内时，使用这份 skill。

## 必需文档

- `docs/basic/file-structure.md`
- `docs/basic/app-flow.md`
- `docs/basic/prd.md`
- `docs/basic/frontend-guidelines.md`
- `docs/basic/backend-structure.md`
- `docs/basic/tech-stack.md`

报告实现就绪前，先运行 `openprd standards . --verify`。
对包含源码文件的项目，这个门禁还要求 `docs/basic/` 内容具体可用、文件头说明书存在，以及 `[project]_[folder]_README.md` 文件夹说明完整；如果涉及后端实现，`docs/basic/backend-structure.md` 还必须显式覆盖 CLI 接入面和 API 接入面，或写明不适用原因。
研发期代码修改完成后、最终回复前，运行 `openprd dev-check . <file...>` 或 `node scripts/openprd-dev-check.mjs . <file...>`；该标准层只检查本轮实际 touched code files 的行数状态，不替代 `standards --verify`；自动优化默认开启时，需要关注的文件应在本轮直接完成高内聚低耦合拆分并以“OpenPRD 自动优化报告”表格呈现（附开关确认一句话）；用 `openprd dev-check . --auto-refactor off` 关闭后转为“后续建议”推荐表格，最终回复按 🔴 → 🟠 → 🟡 的顺序呈现。
当 dev-check 识别出新的代码扩展名时，会自动补齐识别规则并记录；豁免路径、项目规矩、用户偏好或 OpenPrd 默认行为只作为候选留到收工复盘，用 `openprd grow . --review` 集中确认。
维护 OpenPrd 本身时，新增或修改任何配置类能力都要检查是否应该成为 grow-aware 配置：高置信可复用、可被用户习惯影响、会随项目环境变化的配置默认纳入 `openprd grow`；不确定时主动询问用户；一次性固定规则才保留为静态配置。

## 文档影响检查

- 编辑前先识别本次会变化的文件、文件夹、用户流程、架构边界、依赖和产品行为。
- 代码修改完成后用 dev-check 回顾行数：`ok` 可正常收尾；自动优化开启（默认）时，需要关注的文件先在本轮完成拆分再以 **OpenPRD 自动优化报告** 表格呈现并附开关确认；关闭后以 **后续建议** 表格呈现。两种模式都按 🔴 → 🟠 → 🟡 排序，直接复用 dev-check 生成的表格，保留“问题级别／关注程度”列里的完整风险标签，不要缩成纯 emoji。
- 新增配置类能力时同步评审 grow-aware 入口：候选类型、scope、review/apply 行为、拒绝后不重复提示，以及 user-local 与项目共享配置的边界。
- 新增源码文件：如果缺少文件说明书就补上，并确认所在文件夹 README 已存在。
- 修改源码文件：若已有文件说明书，先读取；当文件职责、输入、输出、依赖或维护规则变化时更新它。
- 文件夹内容新增、移动、删除或改作他用：新增或更新文件夹 README，使其反映当前职责和文件布局。
- 功能、流程、架构、依赖或产品行为变化：即使文件已存在，也更新对应的 `docs/basic/` 文档。
- 后端、脚本、Agent、工具链、服务或数据处理变化：把 CLI 与 API 视为同级接入面，更新 `docs/basic/backend-structure.md` 中的命令入口、输出契约、`help`/`doctor`/`dry-run`/`status`、接口协议和不适用说明。
- 若必需文档或说明书缺失，或仍停留在模板态，就绪前必须补齐。
- 如果最终不需要改文档，也要说明文档影响检查已完成，以及为什么可以保持不变。

## 同步触发条件

- 文件或文件夹新增、移动、删除：更新 `docs/basic/file-structure.md` 和相关文件夹 README。
- 产品流程、状态、路由或任务行为变化：更新 `docs/basic/app-flow.md`。
- 用户可见能力或验收标准变化：更新 `docs/basic/prd.md`。
- 框架、依赖、运行时或构建命令变化：更新 `docs/basic/tech-stack.md`。
- 前端或后端结构变化：更新对应的 `docs/basic/` 指南；后端变化时同时评估 CLI 与 API 两个接入面。

## 门禁

`openprd standards . --verify` 必须在 freeze、handoff、accepted spec apply/archive、commit、push、release 和 publish 之前通过。
