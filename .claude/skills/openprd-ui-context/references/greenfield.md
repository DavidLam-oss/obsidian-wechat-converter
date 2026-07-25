<!-- OPENPRD:GENERATED
adapter=claude
source=openprd-ui-context:reference:greenfield.md
version=0.1.19
checksum=60e6878cb2084bc8
-->

# Greenfield Path

## 输入

- `.openprd/state/freeze.json`
- 对应 `.openprd/state/versions/<version>.md`
- 已确认 review/diagram/decision log
- 用户给出的参考图、参考站点与品牌资产
- `.openprd/design/` 的 lenses、themes、layouts、components、recipes 和 anti-slop

## Planned UI Topology

使用 `planned UI topology` 这个名字，并固定来源为 `planned-from-confirmed-prd`。至少覆盖：

1. Pages and entry points
2. Primary and secondary user flows
3. Empty, loading, success, error, permission and destructive states
4. Reusable components and ownership boundaries
5. Data roles shown to users; do not invent backend implementation
6. Responsive and accessibility implications
7. Conflicts and open questions

不要画不存在的代码调用边。计划组件可以表达责任和复用意图，但不得伪装成已实现模块。

## 脚手架判定

只有 package manifest、配置、空目录、starter 占位或没有真实 UI 入口时，按 greenfield 处理。脚手架依赖不等于已有产品结构。

## 失败处理

- PRD 未冻结：停止合同编译，回到 requirement/review。
- PRD 缺页面细节：基于用户任务提出专业拓扑草案，将缺口留为 open question。
- 参考图与 PRD 冲突：同时保留两条证据，请用户确认产品行为优先级。
