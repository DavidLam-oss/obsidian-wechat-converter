<!-- OPENPRD:GENERATED
adapter=claude
source=openprd-ui-context:reference:brownfield.md
version=0.1.19
checksum=34415c473c32b46f
-->

# Brownfield Path

## CodeGraph 是可选输入

发现 CodeGraph 可用时，查询并记录实际命令、索引时间和来源；未执行查询时不得写“已读取 CodeGraph”。建议查询：

- routes and entry points
- component ownership and reuse
- state/data dependencies
- call and dependency paths
- change blast radius
- dynamically discovered or unresolved edges

CodeGraph 不可用、未索引或查询失败时继续本地扫描，并标记 `evidence-gap: codegraph-unavailable`。

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
