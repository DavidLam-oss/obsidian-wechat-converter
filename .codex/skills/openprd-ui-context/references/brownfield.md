<!-- OPENPRD:GENERATED
adapter=codex
source=openprd-ui-context:reference:brownfield.md
version=0.1.19
checksum=de3a297fd087b8e0
-->

# Brownfield Path

## CodeGraph 是可选输入

CodeGraph 只为当前 brownfield 项目提供附加代码事实，不是 UI Context 的真相来源，更不替代产品、UX 或审美判断。

先运行本地扫描。只有当前会话实际有可调用的 CodeGraph 工具、并确认当前项目已完成索引时，才生成并执行查询计划：

```bash
openprd ui-context . --mode brownfield --codegraph-plan --json
```

读取 `.openprd/design/ui-context/codegraph-query-plan.json`，在图工具里实际查询后，整理为结构化 evidence，再导入：

```bash
openprd ui-context . --mode brownfield --codegraph-evidence <evidence.json> --json
```

导入只接受绑定当前项目 root/source fingerprint、当前 query-plan fingerprint 和新鲜 `queriedAt` 的摘要。不得把其他项目的 `.codegraph`、静态配置、环境变量、依赖声明或“运行过 daemon”的日志当作当前项目已查询的图事实。不得保存 provider 原始响应、绝对路径、原始代码或密钥。

计划固定覆盖：

- routes and entry points
- component ownership and reuse
- state/data dependencies
- call and dependency paths
- change blast radius
- dynamically discovered or unresolved edges

状态与处理：

- `runtime-unavailable`：继续本地扫描，记录 `evidence-gap: codegraph-runtime-unavailable`。
- `runtime-available-session-unconnected`：继续本地扫描，记录 `evidence-gap: codegraph-session-unconnected`；不要说“已读取 CodeGraph”。
- `session-connected-project-unindexed`：记录索引缺口，不从图推导关系。
- `query-evidence-ready`：可消费 `.openprd/design/ui-context/codegraph-evidence.json` 的相对路径、摘要、边关系与 unresolved edges，同时保留本地扫描和代码审阅。

## 确定性本地扫描

至少检查：

- package manifests 与前端框架
- routes/pages/layouts/screens
- components 与设计系统入口
- CSS/SCSS/Tailwind/theme/tokens
- icon、font、image 和品牌资产
- responsive breakpoints 与容器策略
- loading/error/empty/permission/destructive states
- i18n、accessibility 与 motion preferences

## 事实分层

- CodeGraph/AST/配置/源码直接观察：`project-derived`
- 运行截图或浏览器实测：`observed-runtime`
- PRD/review 已确认意图：`user-confirmed`
- 设计建议：`agent-recommended`
- 无证据推导：`agent-inferred`

代码说明“现在是什么”，PRD 说明“想要什么”。冲突时不要默认让任一方吞掉另一方。
