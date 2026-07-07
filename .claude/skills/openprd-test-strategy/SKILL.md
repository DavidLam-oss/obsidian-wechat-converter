---
name: openprd-test-strategy
description: OpenPrd 测试策略分流 skill：按风险把任务分到单元、集成、端到端、人工、视觉、小程序、性能和安全验证，并要求 evidence-plan。
---

<!-- OPENPRD:GENERATED
adapter=claude
source=openprd-test-strategy
version=0.1.19
checksum=ff5cff892bd659f0
-->

# OpenPrd Test Strategy

当需求进入实现、任务拆分、验证计划、质量评估或 loop 单任务执行时，使用这份 skill。

## 核心判断

- 先接住 `$openprd-requirement-intake` 的需求类型，再按风险、触达面、失败后果和证据成本选择测试组合。
- 不把“小需求=单测、中需求=集成、大需求=端到端”写成硬规则；它只是默认起点。
- 70/20/10 只作为健康形状参考，不作为 OpenPrd 的硬性比例门禁。
- 脚本存在只能说明项目具备能力，不能替代本次执行证据。

## 默认分流

- 局部纯逻辑、格式化、解析、规则函数：优先 `test-layer: unit`，`test-size: small`，`test-scope: isolated`。
- 触达 CLI/API/Agent 契约、生成物、跨模块状态、任务推进、quality/run/loop：使用 `unit, integration`，`test-size: medium`，`test-scope: cli-contract|api-contract|module`。
- 触达用户主路径、页面、发布链路、真实浏览器、登录权限或第三方依赖：升级到 `integration, e2e`，`test-size: large`，`test-scope: user-flow`。
- 触达视觉还原：补 `visual` 或 `visual-flow`；已有参考图时用 `openprd visual-compare --reference/--actual` 留证据；没有参考图时先判断新建界面还是修改既有界面，新建界面先按用户目标、信息架构和视觉决策成本判断是否需要 3 方向方案评审，修改既有界面用 `openprd visual-compare --before/--after` 留修改前后自检证据；局部细节优先补“局部焦点证据板”，多方向实验优先补“并行实验证据板”。卡片宽度、间距、留白、对齐、颜色、圆角、字号、按钮或图标等轻量 UI 可视优化也需要视觉证据，build、package 和 dev-check 不能替代。新功能或改动包含同构列表、卡片、网格、表格时，或用户反馈排版没对齐时，还要补“对齐辅助线证据板”，同时量测容器轨道和内容槽位轨道；内容槽位包括标题、副标题、描述、标签、状态、价格、按钮、图标或操作区等相同文案类型/相同组件槽位的 x/y/宽高/baseline spread。单个 logo、icon、avatar、badge、按钮图形或图片内部需要居中判定、视觉重心评估或用户反馈偏心时，补“内部居中证据板”，用 `centering-board` 量画布中心、主体外接框中心和视觉重心偏移。
- 明确要求微信小程序运行态证据，或改动高风险且只能靠真实运行态确认时：补 `weapp` 和 `weapp-runtime`，并使用当前环境已配置的本地小程序验证能力；默认沿用当前小程序运行态或开发者工具会话连续验证，不要为了验证自动重开应用；普通小改默认先选更轻的验证，不要自动升级到小程序运行态验证。
- 触达性能、成本、额度、并发、滥用、安全、敏感信息：增加 `performance` 或 `security` 专项验证和负向场景。
- 纯文档或治理任务：使用 `manual`，并记录标准校验、review、change validate 或人工审查证据。

## 任务元数据

OpenPrd 任务可以显式写入：

```md
- test-layer: unit|integration|e2e|manual|smoke|visual|performance|security|weapp|none
- test-size: small|medium|large|manual|advisory|none
- test-scope: isolated|module|contract|cli-contract|api-contract|user-flow|visual-flow|weapp-runtime|performance|security|governance|docs|none
- evidence-plan: 说明本任务准备留下什么验证证据
- evidence: 本次已经产生的证据路径或摘要
- waiver-reason: 不做某层测试时的原因和剩余风险
```

## 收尾要求

- loop 单任务完成时，阶段性测试报告必须包含测试策略、执行命令、结果和证据路径。
- `openprd quality . --verify` 应能看到分层测试策略矩阵；缺少本次证据时只能写需补证据，不能宣称已验证。
- 如果策略被升级或豁免，把原因写进 `upgrade-reason` 或 `waiver-reason`，方便后续 review。
