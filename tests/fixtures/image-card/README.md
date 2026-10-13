# 图片卡片一期 · 固定样本集（tests/fixtures/image-card）

来源任务：A01（`docs/plans/2026-09-08-image-card-export-phase1-revised-plan.md` §8.3）。
预期账本：[expected.json](./expected.json) —— A02 单测的断言输入，修改任何样本必须同步更新。

## 样本清单与用途

| 文件 | 用途 | 关键验证点 |
| --- | --- | --- |
| `s1-normal.md` | 普通正文 | 标题/段落/强调/链接/行内代码语义保留；行内代码 ≠ 代码块 |
| `s2-long-lists.md` | 长段落与嵌套列表 | 超长段行级拆分、嵌套列表、有序列表续号、任务列表、引用、超长列表项 |
| `s3-callout-table.md` | callout 与表格 | note/warning callout 区分、小表格完整保留、大表格省略需确认、表格内行内样式 |
| `s4-images.md` | 静态图片 | 相对路径 / wiki / 远程图引用识别、图片说明同页倾向、空 alt |
| `s5-filtered.md` | 过滤内容 | 代码块×3、Mermaid×1、GIF×1、块级公式×1 的互斥计数；行内公式整段/整项省略并高风险标记 |
| `s6-pagination.md` | 分页符边界 | 独立块级 `<!-- card:break -->`×4 + 独立成行 `===`×1（默认即分页符）；围栏/行内代码内伪标记不触发；`---` 保持分割线；首尾/连续不产生空白页 |
| `s7-long-cover.md` | 长封面字段 | frontmatter 超长 title/author/description 不静默裁切；日期只读有效元数据；正文不受影响 |

## 资源

- `assets/sample.png`：8×8 红色 PNG（静态本地图）。
- `assets/wiki-photo.png`：16×16 蓝色 PNG（wiki 嵌入）。
- `assets/animated.gif`：1×1 GIF89a（GIF 过滤样本）。

图片实际加载/解码验证属于 A04；本目录的 md 样本在 A02 单测中只做解析级断言，不触发网络请求。

## 使用边界

- 不含任何私密数据；可直接进版本管理。
- `s6-pagination.md` 中 L3 的分页符位于 H1 之后文件头部，用于验证「开头分页符不产生空白页」。
- 行号以文件 1-based 计（含 frontmatter 的样本从 `---` 行起算）。
