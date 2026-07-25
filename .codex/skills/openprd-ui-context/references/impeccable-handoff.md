<!-- OPENPRD:GENERATED
adapter=codex
source=openprd-ui-context:reference:impeccable-handoff.md
version=0.1.19
checksum=5241e38aaa64224e
-->

# Impeccable Handoff

只有 `openprd ui-context . --check` 通过后才能 handoff。handoff 会绑定 PRODUCT.md、DESIGN.md 和五个 active design artifacts 的摘要；任一文件在 lint 后变化，结构性 UI 写入都会重新阻断，必须再次运行 `--check`。

## 读取顺序

1. PRODUCT.md
2. DESIGN.md
3. `.openprd/design/active/selected-direction.md`
4. `.openprd/design/active/asset-spec.md`
5. 必要的参考图与 planned/current UI topology

## Handoff 指令

```text
Read PRODUCT.md and DESIGN.md before editing the interface. Treat the confirmed
product boundary, user flows, visual north star, and token roles as frozen.
Use Impeccable shape/craft/critique/polish to implement and refine the interface.
Do not invent a new product strategy or visual direction. Report material
contract conflicts before proceeding.
```

## 完成定义

- 关键流程与状态均实现
- 设计 token 和组件角色可追溯到 DESIGN.md
- 未用通用安全模板抹掉选定方向的记忆点
- 通过项目测试和 OpenPrd visual evidence
- 有同构列表/卡片/网格/表格时完成 alignment-board
- 有单个素材内部居中问题时完成 centering-board
