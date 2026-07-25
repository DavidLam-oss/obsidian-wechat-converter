---
name: openprd-ui-context
description: OpenPrd UI Context skill：区分 greenfield、brownfield 与局部修正，基于已确认 PRD、可选 CodeGraph 和本地证据提出专业 UI/UX 方向，并在用户确认后编译 PRODUCT.md、DESIGN.md 和 Impeccable handoff。
---

<!-- OPENPRD:GENERATED
adapter=codex
source=openprd-ui-context
version=0.1.19
checksum=041d61f5688d9b05
-->

# OpenPrd UI Context

这份 skill 是项目理解与 Impeccable 之间的专业设计层，不是 CodeGraph 翻译器，也不是固定风格数据库。

## 触发边界

- 新建界面、核心页面、视觉系统、信息架构或关键用户流程：运行完整流程。
- 存量项目的结构性 UI 改造：运行完整流程，并优先消费代码事实。
- 卡片间距、颜色、字号、局部对齐等低风险修正：使用 `local-fix`，复用已有冻结上下文。
- 纯后端、纯脚本、纯数据和无用户可见输出：跳过本 skill。

## 核心原则

1. CodeGraph 只在 brownfield 中作为可选代码事实输入；不可用时回退本地扫描并标记 evidence-gap。
2. greenfield 从已确认 PRD/review 生成 `planned UI topology`；永远不要称它为 CodeGraph 或现有代码事实。
3. 先做产品设计、UX 架构与审美判断，再请用户确认少量高价值变量。
4. 三个方向必须在生成逻辑、信息组织、密度、素材策略、交互哲学或视觉气质上真正不同。
5. 未记录 `user-confirmed` 方向前，不冻结 PRODUCT.md/DESIGN.md，也不进入 Impeccable 实现。
6. 不静默覆盖已有合同；发现冲突时保留原文件并请求 `preserve / merge / refresh` 决策。

## 工作流

### 1. 建立证据底座

运行：

```bash
openprd ui-context . --mode auto --json
```

读取 `.openprd/design/ui-context/context.json`。按模式继续：

- `greenfield`：读取 [greenfield.md](references/greenfield.md)，从已冻结 PRD/review 编译计划页面、入口、流程、状态、复用组件和数据角色。
- `brownfield`：读取 [brownfield.md](references/brownfield.md)，查询可用 CodeGraph，并补路由、组件、CSS/tokens、状态、资产和 blast radius 扫描。
- `local-fix`：复用已有 PRODUCT.md、DESIGN.md 和 active design artifacts，不重开完整方向评审。

每条关键结论都保留：`source`、`confidence`、`conflicts`、`open questions`。事实优先级与冲突处理见 [evidence-policy.md](references/evidence-policy.md)。

### 2. 做专业设计判断

结合 `$openprd-frontend-design`、项目事实、用户目标、受众、可访问性与技术约束，先形成一条设计 brief：

- 用途与关键任务
- 目标用户与使用环境
- 气质端点与品牌强度
- 信息密度与响应式约束
- 素材策略与真实性要求
- 用户第一眼应记住的东西

再生成三个异源方向。每个方向必须说明：

- 生成逻辑：`contrast` / `reference-transfer` / `design-lens`
- 产品与 UX 主张
- 页面骨架、密度、视觉层级和状态策略
- 色彩、字体、表面、图标、图片与动效角色
- 记忆点、适用场景、主要风险和主动避开的模板味

不要把专业判断全部甩给用户；先给带理由的推荐。

### 3. 只确认高价值决策

向用户展示三个方向和推荐，按实际缺口确认：

- 方向
- 明暗偏好
- 信息密度
- 品牌表达强度
- 动效强度
- 参考图或参考站点的约束地位

用户确认后运行：

```bash
openprd ui-context . --direction <1|2|3> --source user-confirmed --json
```

如果已有 PRODUCT.md/DESIGN.md 冲突，先完成 preserve/merge/refresh 决策，并在记录方向时显式加 `--contract-decision <preserve|merge|refresh>`；不得用 `--force` 绕过。`preserve` 会保持阻断，`merge` / `refresh` 只表示用户批准 Agent 继续编译，不会让 Host API 静默覆盖文件。

### 4. 编译冻结合同

内容编译属于本 skill 的专业判断职责：Agent 基于证据、三个方向和用户确认写出高质量合同。`openprd ui-context` Host API 只负责模式证据、确认绑定、lint 和 handoff 生命周期，不生成通用模板冒充设计结果。

读取 [contract-templates.md](references/contract-templates.md) 和 [design-md-compatibility.md](references/design-md-compatibility.md)，生成：

- 项目根 `PRODUCT.md`
- 项目根 `DESIGN.md`
- 可选 `.impeccable/design.json`
- 同步 `.openprd/design/active/facts-sheet.md`
- 同步 `.openprd/design/active/asset-spec.md`
- 同步 `.openprd/design/active/image-preflight.md`
- 同步 `.openprd/design/active/direction-plan.md`
- 同步 `.openprd/design/active/selected-direction.md`

根合同必须各自包含唯一的 `OPENPRD:UI-CONTEXT` 标记，并明确方向、来源、确认状态和 schema target；marker 必须与 `confirmation.json` 一致。DESIGN.md 兼容目标固定为 Google `design.md` `alpha`，commit `bde692f2bc92ef7fdd0cf277b2704ab074b70efd`。

运行合同校验：

```bash
openprd ui-context . --check
```

校验未通过时不得 handoff。

### 5. 交给 Impeccable

读取 [impeccable-handoff.md](references/impeccable-handoff.md)。明确要求 Impeccable：

- 先读冻结的 PRODUCT.md 和 DESIGN.md。
- 保持已确认产品边界、关键流程、视觉北极星和 token 角色。
- 用 shape/craft/critique/polish 完成实现与精修，不重新发明方向。
- 发现合同冲突或实现不可行时回报，不静默偏航。

实现完成后回到 OpenPrd 的 visual-compare、verification-board、alignment-board 和 centering-board 验证链路。

## 停止条件

- greenfield 没有已确认 PRD/review。
- 方向仍未确认。
- 已有合同冲突尚未决策。
- DESIGN.md schema lint 失败。
- CodeGraph、代码、PRD 或用户参考之间有影响产品边界的未决冲突。
- 关键颜色、字体、素材许可、可访问性或交互状态仍是推断，却被写成已确认事实。
