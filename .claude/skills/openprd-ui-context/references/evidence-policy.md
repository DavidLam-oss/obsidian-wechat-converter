<!-- OPENPRD:GENERATED
adapter=claude
source=openprd-ui-context:reference:evidence-policy.md
version=0.1.19
checksum=23ed486b1207e382
-->

# Evidence Policy

## 每条决策的最小字段

| 字段 | 含义 |
|---|---|
| claim | 当前结论 |
| source | user-confirmed / project-derived / observed-runtime / agent-recommended / agent-inferred / evidence-gap |
| confidence | high / medium / low |
| evidence | 文件、命令、截图、PRD 版本或用户答复 |
| conflicts | 与此结论冲突的证据 |
| openQuestions | 尚未解决但会影响实现的内容 |

## 优先级不是自动裁决

`user-confirmed` 与 `project-derived` 都是高价值证据，但负责不同问题。用户确认产品目标，代码证明当前实现；二者冲突时应形成 change，而不是挑一个覆盖另一个。

## 合同冲突

发现已有 PRODUCT.md 或 DESIGN.md 时：

- `preserve`：保留现有合同，仅生成差异建议。
- `merge`：逐条合并，并保留来源与冲突记录。
- `refresh`：用户明确批准后，以新确认方向重编译；保留旧版本或 diff 证据。

通过 `--contract-decision <preserve|merge|refresh>` 记录这次决策。即使文件已有 OpenPrd marker，只要冻结方向和新确认方向不同，也必须重新决策。禁止静默覆盖，也不要把文件存在本身当成已确认。
