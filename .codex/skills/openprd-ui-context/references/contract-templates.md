<!-- OPENPRD:GENERATED
adapter=codex
source=openprd-ui-context:reference:contract-templates.md
version=0.1.19
checksum=b171bf2ec7ed1cdb
-->

# Contract Templates

## PRODUCT.md

使用稳定英文 H2 作为机器可读章节名，正文跟随用户语言：

```markdown
<!-- OPENPRD:UI-CONTEXT
status=frozen
direction=direction-1
source=user-confirmed
schema=google-labs-code/design.md@bde692f2bc92ef7fdd0cf277b2704ab074b70efd
-->
# Product

## Product Context
## Users
## Jobs and Flows
## Planned UI Topology
## States and Edge Cases
## Evidence and Decisions
## Conflicts and Open Questions
```

brownfield 可将 `Planned UI Topology` 改为 `Current UI Topology`。每个流程说明入口、用户动作、系统反馈、成功条件、失败与恢复。

## DESIGN.md

```markdown
---
version: alpha
name: <confirmed direction name>
description: <one sentence visual north star>
colors:
  primary: "#000000"
typography:
  body-md:
    fontFamily: <family>
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
spacing:
  sm: 8px
  md: 16px
rounded:
  sm: 4px
components: {}
---
<!-- OPENPRD:UI-CONTEXT
status=frozen
direction=direction-1
source=user-confirmed
schema=google-labs-code/design.md@bde692f2bc92ef7fdd0cf277b2704ab074b70efd
-->
# Design System

## Overview
## Colors
## Typography
## Layout
## Elevation & Depth
## Shapes
## Components
## Do's and Don'ts
```

不要把示例 token 当默认审美。token 必须来自选定方向、品牌事实、可访问性和实现约束。所有必需章节都要有实际内容，不能保留 `TODO`、`TBD`、`待填写` 或空标题；dimension 使用 `px`、`em`、`rem` 或合法 token reference。

## active design 同步

- facts-sheet：产品与品牌事实、来源、日期、状态
- asset-spec：logo、图片、字体、图标、动效、表面、记忆点
- image-preflight：真实图片是否是体验成立前提
- direction-plan：三个方向及差异、适用场景、风险
- selected-direction：用户确认方向和冻结变量
