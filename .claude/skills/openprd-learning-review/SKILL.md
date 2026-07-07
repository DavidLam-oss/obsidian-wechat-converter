---
name: openprd-learning-review
description: 为 OpenPrd 工作区生成归档学习包、题材模板、证据清单、图文讲解模块和 HTML 电子书阅读器。
---

<!-- OPENPRD:GENERATED
adapter=claude
source=openprd-learning-review
version=0.1.19
checksum=1841678396624fe1
-->

# OpenPrd Learning Review

当用户希望生成复盘学习包、题材模板库、证据清单、图文讲解模块、检索模块、工作示例或 OpenPrd 工作区里的 HTML 电子书阅读器时，使用这份 skill。
当用户目标是学习、复盘、教学、经验沉淀或把一次工作转成可长期阅读的材料时，先判断期望产物是否需要章节结构、证据锚点、图文讲解、检索练习或阅读体验；需要时默认走这条路径。普通 Markdown 可以作为讲义补充，但不能替代阅读器；这个判断基于场景和产物形态，不基于关键词表。
即使用户只说“请生成一份仙侠风格的学习材料”这类短请求，也先把它理解成学习型交付物；仙侠、科幻、童话等风格是题材/文体参数，不能成为绕过学习包和阅读器流程、只在聊天里写普通文章的理由。

## 产出物

- `learning-content.json`：版本化内容契约
- `evidence-manifest.json`：source id、digest、摘录、claim 和缺口
- `learning-content.md`：书籍式阅读稿
- `reader.html`：固定电子书阅读器界面，支持章节级 `visualExplainer` 图卡
- `assets/`：可选图片素材目录，用于归档 Codex Image 2 生成的图文解释图片
- `learning-package.json` 和 `.openprd/learning/index.json`：归档元数据

## 工作流程

1. 从 `.openprd/` 重建状态，并识别触发源是 loop finish 还是手动请求。
2. 从参考库里选择题材。主题没有特殊要求时，默认使用 `internet-product`。
3. 写正文前先从工作区状态、`docs/basic` 和 loop 报告收集证据。
4. 分离证据清单、叙事正文和渲染器；所有判断都必须能引用 source id。面向产品或非技术读者时，优先补 `visualExplainer` 图卡。
5. 尽可能在每章加入检索模块、工作示例模块和必要的图文比喻卡。
6. 把学习包归档到 `.openprd/learning/archive/<packageId>/`，并在合适时打开 `reader.html`。

## 扩展规则

- 新增题材时扩展参考库，不要分叉渲染器。
- 契约必须版本化；`openprd.learning-content.v1` 的演进要通过新版本完成。
- 任何无法追溯到来源的句子都要显式标为推断。
- 把阅读器保持为稳定的 HTML 电子书界面，包含 TOC、进度、上一章/下一章控制、章节内轻量证据锚点和可选图文解释卡。

## 参考资料

- `skills/openprd-learning-review/references/genre-library.md`
- `skills/openprd-learning-review/references/content-contract.md`
- `skills/openprd-learning-review/references/evidence-manifest.md`
- `skills/openprd-learning-review/references/ebook-reader.md`
- `skills/openprd-learning-review/references/retrieval-worked-example.md`
- `skills/openprd-learning-review/references/quality-rubric.md`
