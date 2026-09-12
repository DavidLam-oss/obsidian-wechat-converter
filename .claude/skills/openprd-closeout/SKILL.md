---
name: openprd-closeout
description: 审计并安全收尾已完成的 OpenPrd task、change、release 或明确指定的 workspace。
---

<!-- OPENPRD:GENERATED
adapter=claude
source=openprd-closeout
version=0.1.19
checksum=b5b57e787b6281e6
-->

# OpenPrd Closeout

当用户明确要求阶段收尾、同步实现后的项目文档、准备干净交接、归档已完成 change、检查旧项目知识或预览清理候选时使用。普通代码完成、单份数据整理或泛化文件分类不触发。

## 工作流

1. 在 task、change、release、workspace 中选择可推断出的最小作用域。
2. 先运行 `openprd closeout . --preview --scope <scope> --json`；preview 必须零写入。
3. 汇报 code、runtime、docs、rules、knowledge、workspace 六面状态、冲突、计划动作和 digest。
4. 用户已授权安全同步与归档时，才运行 `openprd closeout . --apply --plan-digest <digest>`。
5. 删除候选必须在完整报告后再次确认，并通过批准标识运行 cleanup；`--force` 不能穿透权限层或覆盖历史 archive。
6. 最终只引用唯一 receipt，并列出 pending、待确认和 out-of-scope；不生成重复 README、安装指南、quick reference 或 changelog。

机械扫描、路径归一化、digest、retention 和 rollback 由 CLI 实现，不在 skill 中拼临时 shell。运行态无法验证时保持 pending；latest/current 或 receipt 引用的唯一证据不得清理。
