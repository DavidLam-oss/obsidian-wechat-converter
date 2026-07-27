# 微信贴图：发布弹窗图片编辑与文案清洗方案

> 分支：`feature/wechat-sticker`
> 关联代码：`services/sticker-extractor.js`、`services/markdown-cleaner.js`、`views/converter/style-panel.js`、`views/publish-modal/wechat-sync-modal.js`、`views/publish-modal/wechat-sync-action.js`、`views/publish-modal/material-picker.js`、`styles/preview.css`
> 关联计划：`docs/plans/2026-06-20-obsidian-syntax-phase2-priority.md`（Obsidian 语法覆盖优先级，本计划的清洗规则与其口径保持一致）
> 评审更新：2026-07-27。已结合当前分支代码与测试补充统一排序、账号归属、Blob 生命周期、失败重试、清洗保护区、文件切换、移动端/无障碍与视觉证据要求。
> 上限更新：微信公众号后台网页当前可选择 45 张，但插件使用的公开 `draft/add` 接口在 `newspic.image_info` 中明确限制最多 20 张。本方案以公开接口为准；超过 20 张时界面阻止继续添加，服务层拒绝请求，不做静默裁切。
> 版本控制提示：本文件当前命中 `.gitignore` 的 `docs/*`；如果它要作为分支交接产物，应在提交时显式纳入，或迁移到受版本控制的计划目录。

## 1. 背景与现状

微信贴图（newspic）是纯文本文案 + 最多 20 张图片的消息类型，没有富文本 HTML。当前实现分三层：

**提取层** `services/sticker-extractor.js`
- `STICKER_MAX_IMAGES = 20`、`STICKER_MAX_CONTENT_LENGTH = 1000`。
- `extractMarkdownImageSources(markdown)`：先扫 `![[...]]`，再扫 `![](...)`，按 `normalizeImageKey`（解码后的小写文件名）去重。**问题：不判断扩展名**，`![[某篇笔记]]`、`![[手册.pdf]]` 都会被当成图片收进来（已实测确认）。
- `reconcileStickerImageOrder({defaultImages, order, removedKeys, limit})`：用户顺序优先 → 正文新增补末尾 → 裁剪到 9。
- `extractStickerData(...)`：frontmatter `cover`/`images` 优先，合并正文图片，reconcile，再调 cleaner，返回 `{title, content, images: string[], hasCodeBlocks, hasTables}`。

**清洗层** `services/markdown-cleaner.js` — `cleanMarkdownToPlainText` 按固定 14 步顺序处理：frontmatter → 检测并删除代码块 → 删除表格 → 删除删除线 → 图片标签（可替换为 `[配图 N]`）→ HTML 标签 → 标题 → 粗斜体 → 行内代码 → 链接 → wiki 链接 → 引用前缀 `>` → 列表符号归一为 `• ` → 空行整理。

**视图层**
- `views/converter/style-panel.js`：`buildStickerData()`（调提取器 + `resolveStickerImageSrc()` 把 vault 路径转 `app://`，结果缓存在 `this.previewStickerData`）、`getStickerUiState(filePath)`（内存 `Map<path, {order, removedKeys}>`）、`renderStickerPreview()`（提醒条 + 3 列图片墙 + 拖拽排序 + `✕` 排除 + 文案预览与字数计）。0 张图时仍渲染完整 section header、`N / 20 张` 徽标、虚线空盒，且 `apple-sticker-hint-line`（第 1434 行）在 `if/else` 之外，**0 张图也照样显示"可拖拽调整或点右上角 ✕ 排除"**。
- `views/publish-modal/wechat-sync-modal.js`：贴图模式下把"封面图"改标签为"贴图配图列表"，`updatePreview()` 里只渲染 `.wechat-modal-sticker-grid-preview`（最多 4 张 48×48 缩略图 + `+N` 徽标），无任何交互；`coverBtns`（上传 / 从素材库选择）被 `display: none` 隐藏；摘要区同样隐藏。
- `views/publish-modal/wechat-sync-action.js`：`onSyncStickerToWechat(account)` 对 `stickerData.images` 逐个 `srcToBlob()` → `api.uploadCover()` 拿 `media_id` → `syncStickerDraft()`。**假设每张图都是需要上传的 src 字符串，没有"已有 media_id 直接复用"的通路。**
- `views/publish-modal/material-picker.js`：`showMaterialPickerModal(api, onSelect)` 已是完整的永久素材分页选择器（12/页、缓存 5 分钟、骨架屏、加载失败提示），标题与确认按钮文案硬编码为"从素材库选择封面"/"使用这张封面"，目前只服务文章封面。

**样式** `styles/preview.css`：`.apple-sticker-img-remove-btn` 默认 `rgba(0,0,0,0.5)`，`:hover { background: #ef4444; transform: scale(1.1); }`。CSS 片段由 `npm run generate:styles` 合成 `styles.css`，不能直接改生成物。

### 1.1 已实测确认的清洗漏洞

用当前 `cleanMarkdownToPlainText` 实跑的输出（不是推测）：

| 输入 | 当前输出 |
|---|---|
| `> [!note] 提示标题\n> 正文` | `[!note] 提示标题\n正文` ← marker 泄漏 |
| `$a_1 + b_2$ 和 $x*y*z$` | `$a1 + b2$ 和 $xyz$` ← 斜体规则吃掉了公式里的 `_`/`*` |
| `正文[^1]。\n\n[^1]: 定义` | 原样保留 |
| `==重点==` / `%%注释%%` / `#标签` | 原样保留 |
| `- [ ] 任务` | `• [ ] 任务` |
| 正文中的 `---` | 原样保留（frontmatter 正则只锚定开头） |
| 正文中的 `***` | 被吃成 `• 下文`（`*` 斜体 + 列表规则连环误伤） |
| 正文中的 `___` | 被吃成 `_` |
| `![[某篇笔记]]` | 图片计数 +1，占掉一个图片名额 |

---

## 2. 需求拆解

| # | 需求 | 完成标准（done 的样子） |
|---|---|---|
| R1 | 发布弹窗里真正承载贴图图片，并支持本地上传与素材库添加 | 弹窗中的贴图图片区与侧边栏能力对等（编号、排序、排除），另有「添加本地图片」「从素材库选择」两个入口；新增图片与正文图片在同一个列表里排序，共享 20 张上限；素材库图片绑定来源账号，同账号同步时复用 `media_id`；已成功上传的图片在失败重试时不重复上传 |
| R2 | 0 张图时收起整块图片 UI，只留一句带出路的提示 | 侧边栏 0 张图时不渲染 section header、`0 / 9` 徽标、虚线空盒与拖拽提示行，只保留一行提示；弹窗 0 张图时提示 + 保留两个添加入口（因为"当场加图"只在弹窗里有意义） |
| R3 | 修掉 `✕` 的红色 hover | `.apple-sticker-img-remove-btn:hover` 不再是 `#ef4444`；改为中性加深，并给出选型理由与备选 |
| R4 | 审计并决定其余复杂 Markdown 语法的剔除口径 | 每条语法有明确归类（整块删除并提示 / 只删标记保留文字 / 不处理），公式与 callout 有明确结论；提醒条能列出真正被删掉的东西 |
| R5 | 为将来的「文章长图 → 贴图配图」预留扩展点 | 数据模型里有一个 `source` 维度可以容纳「不是正文图、也不是 URL/vault 路径，而是刚渲染出来的 HTML→image blob」，且添加通路只有一个函数，不需要改上传链路 |

---

## 3. 逐项设计方案

### 3.1 R1：弹窗贴图图片编辑区

#### 布局

弹窗贴图模式下，把现在的"贴图配图列表 + 4 张只读缩略图"整段替换为可编辑区（复用侧边栏同一个网格渲染器）：

```
┌─ 贴图发布配置（标题与配图） ────────────────────────────┐
│ 贴图标题  [____________________________________]      │
│                                                        │
│ 贴图配图                           3 / 20 张           │
│ ┌──────┐ ┌──────┐ ┌──────┐                            │
│ │ ×     │ │ ×     │ │ ×     │   ← 拖拽排序，与侧边栏一致  │
│ │ #1   │ │ #2 素│ │ #3 传│   ← 左下编号；非正文图带来源角标│
│ └──────┘ └──────┘ └──────┘                            │
│ [ 添加本地图片 ]  [ 从素材库选择 ]                      │
│ 正文提取 2 张 · 手动添加 1 张；调整只影响本次发布         │
│ 共 3 张图片 · 文案 412 / 1000 字                        │
└────────────────────────────────────────────────────────┘
```

20 张已满时：两个按钮 `disabled`，`title` 提示"贴图最多 20 张，请先移除一张"。一次选择超过剩余名额时，只接收剩余名额内的图片，并明确提示其余图片未添加。按钮图标复用项目现有的 Obsidian/Lucide 体系（`upload`、`images`），不使用 emoji 字符。

这是一块克制的工作流界面：审美重点是稳定、可扫、状态明确，记忆点是“图片网格顺序就是最终发布顺序”。发布检查放在图片区之前；弹窗内桌面宽度采用 5 列、中等宽度 4 列、窄屏 3 列，并将图片区高度限制在 360px/42vh 内独立滚动，保证底部说明与发布动作始终容易到达。不引入新的卡片皮肤、强调色或装饰体系；新增控件继续服从现有发布弹窗的密度、圆角、按钮和功能色角色。

#### 数据流

```
笔记正文/frontmatter ──→ bodyItems ───────────────┐
uiState.manualItems（Blob/素材库/渲染产物）────────┤
                                                  ↓
                           candidatesByKey（先合并所有来源）
                                                  ↓
                  reconcileStickerImageItems(candidates, order, removedKeys)
                                                  ↓
                   保持统一顺序；超限时从末尾淘汰 body 项
                                                  ↓
                            imageItems[]（唯一真相）
                         ┌──────────────────┴──────────────────┐
                         ↓                                     ↓
              侧边栏 renderStickerPreview          弹窗 sticker section
                         └──────────────┬──────────────────────┘
                                        ↓
                          onSyncStickerToWechat：
                            material + 同账号 → 直接复用 mediaId
                            upload/render Blob → 直接 uploadCover
                            body src → srcToBlob → uploadCover
                            成功后写 session upload cache，重试复用
```

关键点：

- 弹窗和侧边栏读写**同一份** `getStickerUiState(filePath)`，所以弹窗里加的图会反映到侧边栏；弹窗关闭后统一触发一次 `renderStickerPreview()`。
- 必须先把 body/manual 全部合成候选集，再按 key reconcile。不能先 reconcile 正文图再 merge 手动图，否则现有 reconcile 会丢掉“不在正文候选集里”的手动 key，无法保住跨来源交错顺序。
- 弹窗打开时冻结 `sourcePath`。发布前若当前活动文件已变化，阻止同步并提示重新打开弹窗；不能让标题来自 A 笔记、图片和文案来自 B 笔记。
- 所有 Blob 指纹计算、素材库回调与异步刷新都绑定 modal/session generation；弹窗已关闭或 sourcePath 已变化时，迟到回调不得再写 UI state。

#### 触达文件

| 文件 | 改动 |
|---|---|
| `services/sticker-extractor.js` | 新增 `STICKER_IMAGE_EXTENSIONS`、按语法来源判断图片的 helper、`buildStickerImageKey()`、`reconcileStickerImageItems()`；`extractStickerData` 增加 `manualItems` 与可选纯函数 `resolveBodyImageIdentity` 入参，返回值增加 `imageItems` |
| `views/converter/style-panel.js` | `buildStickerData()` 向提取器注入 vault canonical path resolver，组装 `imageItems` 与 `displaySrc`；`getStickerUiState` 增加 `manualItems`；`renderStickerPreview()` 改为调用共享网格渲染器 |
| `views/shared/sticker-image-list.js`（新增） | `renderStickerImageGrid({container, items, max, onRemove, onReorder, variant})`，侧边栏与弹窗共用；纯 DOM，不碰 API；同时提供键盘/触屏可用的排序入口和可访问名称 |
| `views/publish-modal/sticker-image-section.js`（新增） | `renderStickerImageSection()` + `addStickerImageFromUpload()` + `addStickerImageFromMaterial()` + `addStickerImageItem()`（唯一收口）；管理 object URL、modal generation 与来源账号校验 |
| `views/publish-modal/wechat-sync-modal.js` | 贴图模式不再走 cover 分支，改调 `renderStickerImageSection()`；同步按钮状态改读 `imageItems.length` |
| `views/publish-modal/wechat.js` | 汇入新方法组 |
| `views/publish-modal/material-picker.js` | `showMaterialPickerModal(api, onSelect, options)`，`options.title` / `options.confirmText` 可覆盖硬编码文案（默认值保持现状，文章封面调用点不用改） |
| `views/publish-modal/wechat-sync-action.js` | 上传循环改遍历 `imageItems`，校验素材账号；接入按账号和图片指纹区分的 session 上传缓存，失败重试不重复上传已成功项 |
| `views/apple-style-view.js` / `views/converter/core.js` | 初始化并在 `onClose` 清理 `stickerUploadCache`、manual Blob 与 object URL |
| `project-view-contracts.d.ts` / `project-method-groups.d.ts` | `StickerImageItemLike`、`StickerUploadRefLike`、`StickerPreviewDataLike.imageItems`、新状态与方法组契约 |
| `styles/preview.css` | 弹窗网格 variant 样式、来源角标、添加按钮行、空态单行提示 |
| `.openprd/design/active/asset-spec.md` | 实现前登记新增功能图标：`upload`（添加本地图片）、`images`（从素材库选择）、`x`（移除）、排序操作所用图标；统一使用现有 Obsidian/Lucide 体系 |

新文件的理由：`wechat-sync-modal.js` 已 532 行且承载账号/标题/封面/摘要/草稿关联多条线，贴图图片区带上传与素材库两条异步通路会再加 150+ 行，按 CLAUDE.md「不要把逻辑堆在单一文件」拆出；网格渲染器抽到 `views/shared/` 是因为侧边栏和弹窗必须视觉一致，两处各写一份必然漂移。两个新文件都要按项目惯例写头部说明书块（核心功能/输入/输出/定位/依赖/维护规则），并更新所在目录 README。

#### 边界情况

- **上限**：以公开 `draft/add` 接口的 20 张限制为准。手动添加前先计算剩余名额，达到 20 张后禁用添加入口；批量本地选择超过剩余名额时只接收可用名额，并用 Notice 明确说明其余图片未添加。正文/frontmatter 自身超过 20 张时保留前 20 张，同时在发布检查中显示被省略数量。API 与同步服务对第 21 张做硬拒绝，不静默截断。
- **去重（已确认）**：只做同来源内的可靠去重。正文图按 canonical vault path 或规范化完整 URL；素材库图按 `accountId + media_id`；本地上传按内容指纹（若指纹计算失败，降级到 `name + size + lastModified`）。不同来源之间**不自动去重**——路径、Blob、URL 与 media_id 无法可靠互认，误删用户有意添加的图片比偶尔重复一张更糟。命中同来源重复时给 Notice 并不插入。
- **图片语法判断**：`![[...]]` 是模糊嵌入，只有图片扩展名才作为图片；`![](...)` 已明确表达图片语义，允许无扩展名 CDN URL、带 query/anchor 的 URL 与 data URL。frontmatter 图片同样不能仅靠文件扩展名一刀切。
- **key 不透明**：`key` 只由 `buildStickerImageKey` 构造，后续不得再经过 `normalizeImageKey`、basename 截断或统一小写。不同目录的同名文件、大小写敏感的 media_id 和带签名 URL 不能碰撞。
- **排序**：手动图与正文图在同一个列表里，可以互相拖拽，不做分组栏。
- **移除与撤销**：移除正文图 = 记进 `removedKeys`；移除手动图 = 从 `manualItems` 移出。两者都提供本次会话内 Undo/恢复入口；不使用"不可恢复"这种危险操作文案。真正释放 Blob/object URL 要等撤销窗口结束或会话销毁。
- **本地文件校验**：`input.accept` 只做第一层筛选；添加时二次校验受支持格式、MIME、字节数和可解码性。`image/*` 过宽，不能让 SVG、HEIC、AVIF 等未经验证的格式直接进入微信上传链路。
- **本地文件内存**：内存态保存原始 Blob，不转成 data URL；预览使用 object URL，并在移除、切文件、视图关闭时释放。接近上限的大图测试必须同时覆盖桌面与移动端内存表现。
- **素材库失败**：`showMaterialPickerModal` 内部已有失败态（grid 内显示"加载失败：…"），不额外处理；未配置账号时按现有 `selectMaterialBtn` 逻辑给"请先配置公众号账号"。
- **素材账号归属**：素材项必须记录选择时的 `accountId`。切换账号后不能直接复用其他账号的 media_id；第一版建议标为不可用并要求重新选择，不做静默跨账号下载/重传。
- **混合来源上传**：见 §5，`onSyncStickerToWechat` 只有在 `material accountId === selectedAccountId` 时才直接复用；其他项走 Blob/src 上传。
- **失败重试**：每张成功上传后立即把 `mediaId` 写入 `stickerUploadCache(accountId + fingerprint)`。后续同会话重试复用成功项，只补传失败项，避免反复消耗永久素材额度。
- **发布上下文**：弹窗固定绑定打开时的 `sourcePath`；账号仍允许用户切换，但每次切换都要重新校验素材项的 `accountId`。活动文件变化、素材账号不匹配或存在异步添加任务时，同步按钮进入明确的不可用状态。
- **移动端与无障碍**：不能只依赖 HTML5 `draggable`。每张图还应提供键盘和触屏可用的前移/后移操作；缩略图有 alt，移除与排序按钮有 `aria-label`/title，焦点样式清楚，触控目标不因 22px 小圆钮而难点。

### 3.2 R2：0 图时收起整块 UI

侧边栏（`renderStickerPreview`）：`imageItems.length === 0` 时不建 `.apple-sticker-images-section` 的 header/badge/empty-box/hint-line，只渲染一行：

```
还没有配图。在笔记正文插入图片，或在「发布与分发」里直接添加。
   [ 恢复已删除的 2 张图片 ]   ← 仅当 removedKeys 非空
```

弹窗（`renderStickerImageSection`）：0 张时同样收起网格与徽标，但**保留两个添加按钮**，因为"当场加图"的能力只在弹窗里：

```
还没有配图，贴图至少需要 1 张。
[ 添加本地图片 ]  [ 从素材库选择 ]
```

两端行为**故意不同**：侧边栏是预览面板，没有添加能力，给它一个死按钮反而更糟；弹窗是发布现场，提示必须直接连着可执行的动作。这是对用户"提示应该告诉两条出路"的落地——侧边栏那条提示用文字指向弹窗，弹窗直接给按钮。

同时把 hint-line 移进"有图"分支（当前在 `if/else` 之外，是 0 图也显示提示的直接原因）。

样式上新增 `.apple-sticker-empty-line`（单行、无虚线框、无 emoji、`font-size: 12px; color: var(--text-muted)`），`.apple-sticker-empty-notice` 与 `.apple-sticker-empty-icon` 在两处都不再被引用后从 `styles/preview.css` 删除。

### 3.3 R3：`✕` hover 配色

**方案（推荐）**：保持中性，加深既有暗色遮罩。

```css
.apple-sticker-img-remove-btn:hover {
  background: rgba(0, 0, 0, 0.78);
  transform: scale(1.08);
}
.apple-sticker-img-remove-btn:focus-visible {
  outline: 2px solid var(--interactive-accent);
  outline-offset: 1px;
}
```

理由：这个按钮的默认态本来就是 `rgba(0,0,0,0.5)` 的暗色玻璃遮罩，hover 只需要"更实一点"来确认可点，不需要换色系。`#ef4444` 把一个随时可撤销的本地排除动作（不改笔记，还能通过"恢复已删除"按回来）表达成了危险操作，语义过重——这正是用户觉得难看的根因，不只是颜色不好看。中性加深也与同文件里图片卡的 hover（`translateY(-2px)` + 阴影加深）是同一套克制的动效语言。缩放从 1.1 降到 1.08，22px 的小圆钮上 1.1 会有明显的像素抖动。

备选与不选的原因：
- `var(--interactive-accent)`（微信绿 `#07c160`）：卡片本身 hover 时的 `border-color` 已经是这个绿色（`.apple-sticker-image-item:hover`，`styles/preview.css:672`，`color-mix(in srgb, var(--interactive-accent, #07c160) 40%, transparent)`），且绿色在这里更读作"确认/通过"，和"排除这张"语义相反，叠加还会让一张卡上出现两处绿色竞争焦点。
- `var(--apple-accent)`（`#0071e3`，蓝）：语义中立，卡片目前没有用到蓝色，理论上可用，但引入一个卡片其余部分完全没出现过的新色系，只为一个次要的 hover 反馈，性价比不如直接加深已有的中性色。
- 保留红色只降饱和（如 `color-mix` 出 60% 红）：仍是危险色语义，只是弱化了症状。

`.wechat-modal-sticker-status .is-error` 与 `.apple-sticker-count-current.is-error` 的红色**保留**——那是真正的错误态（超字数会导致同步失败）。

### 3.4 R4：清洗规则设计

清洗顺序必须重排，`markdown-cleaner.js` 现有的 14 步里，粗斜体（第 8 步）在很多新规则之前，会先破坏公式和分隔线。新顺序：

```
0  frontmatter
1  代码块检测（并区分 mermaid） → 删除
2  Obsidian 注释 %%...%%      → 删除（先删，避免注释里的语法参与后续判断）
3  数学公式 $$...$$ / $...$    → 删除（必须早于粗斜体，否则 $a_1$ 被吃成 $a1$）
4  表格                        → 删除
5  脚注定义块 [^n]: ...        → 删除（含后续缩进行）；脚注引用 [^n] → 删除标记
6  分隔线 ---/***/___ 独占行   → 删除（必须早于粗斜体与列表规则，否则 *** 会被吃成 •）
7  删除线 ~~...~~              → 删除（现状）
8  图片/嵌入：图片扩展名 → [配图 N]；非图片嵌入 ![[note]]/![[x.pdf]] → 删除
9  callout marker [!type][+-]  → 删除标记，保留标题与正文
10 HTML 标签
11 标题 #
12 高亮 ==text==               → 删标记保留文字
13 行内代码、Markdown 链接、wiki 链接 → 提取可读文字并放入保护占位
14 粗体/斜体
15 恢复受保护的行内文字
16 任务复选框 - [ ]/- [x]      → ☐ / ☑
17 引用前缀 >
18 列表符号 → •
19 空行整理
```

数学公式的保守判定（避免误伤价格）：`$$...$$` 一律删；行内 `$...$` **仅当内部含 LaTeX 信号字符**（`\`、`^`、`_`、`{`、`}`）才删。实现时不要只用一个可跨任意正文的宽泛正则，要用受限的单行扫描/保护区，识别转义 `\$`、相邻货币金额与未闭合 `$`。例如 `价格 $19，变量 a_b，另一件 $25` 不能因为两个金额之间恰好出现 `_` 就整段误删。宁可漏判（保留一段无害的 `$x$`），不可错删正文金额——这与 `docs/plans/2026-06-19-feishu-phase-2-implementation-plan.md §6.4` 的"不确定时视为文本"口径一致。

提醒条从两个布尔位扩展成结构化原因列表。`cleanMarkdownToPlainText` 返回值增加 `removed: Array<{ kind: 'codeBlocks' | 'mermaid' | 'tables' | 'math' | 'footnotes', count: number }>`，`hasCodeBlocks` / `hasTables` 作为派生字段保留（弹窗、`view_sticker_mode.test.js` 与既有测试都在读它们），提醒条文案按实际命中项生成，例如 `已自动移除代码块、流程图与公式`。使用带数量的结构，避免“原因数组”和“布尔对象”两套含义并存。

`removed` 里只放"用户会因为看不到而困惑"的项。注释（本来就不该发出去）、高亮/粗斜体（只掉标记）、分隔线（纯装饰）不进提醒条，否则提醒条会变成噪音。

正则顺序之外还要补保护区测试：`` `foo_bar_baz` `` 必须保留为 `foo_bar_baz`；wiki 目标、URL、转义字符不能被粗斜体规则提前破坏。代码围栏至少覆盖反引号、`~~~`、更长 fence 和未闭合 fence 的保守行为；脚注定义覆盖字符串 label 与后续缩进行。

### 3.5 R5：HTML→图片的扩展点

见 §5.3。

---

## 4. Markdown 剔除规则清单

“当前是否处理”一栏均为实测结果（§1.1）。

| 语法 | 当前是否处理 | 建议处理方式 | 理由 |
|---|---|---|---|
| 代码块 fence | 反引号三 fence 已删除、已提示 | 扩展覆盖反引号、`~~~`、更长及未闭合 fence 的保守处理（a） | 贴图只有纯文本，代码块贴出来是乱码；不能只识别固定三个反引号 |
| ` ```mermaid ` | 已被通用代码块规则删掉，但提示里混在"代码块"中 | 单独检测，提示写"流程图"（a） | 用户画的图消失了，"已移除代码块"对不上他的心智模型 |
| 表格 | 已删除，已提示 | 保持（a） | 纯文本无法保住列对齐 |
| **数学公式 `$$...$$`** | **未处理，原样泄漏** | **整块删除并提示（a）** | 贴图文案渲染不了 LaTeX，`\frac{a}{b}` 直接暴露给读者；且块级公式无歧义，可以放心删 |
| **数学公式 `$...$`** | **未处理，且被斜体规则破坏成 `$a1$`** | **含 LaTeX 信号字符才删，并提示（a）** | 同上；但 `$19.99` 这类价格必须保住，所以加信号字符门槛，宁可漏判 |
| **Obsidian callout `> [!type] 标题`** | **`>` 被剥掉，`[!note]` 原样泄漏** | **只删 `[!type]` 与 `+/-` 折叠标记，保留标题与正文（b）** | 标题与正文是用户写的真内容，不能丢；只有 marker 是给渲染器看的机器语法。marker 独占一行时整行删掉 |
| 普通引用块 `> text` | 已剥前缀保留正文（b） | 保持（b） | 引用内容是正文的一部分；纯文本里无法表达"这是引用"，剥掉前缀最干净 |
| 脚注引用 `[^1]` | 未处理，原样泄漏 | 删标记，不提示（b 的退化：标记本身没有可读文字） | `[^1]` 在纯文本里指向不了任何东西，是纯噪音 |
| 脚注定义 `[^1]: 说明` | 未处理，原样泄漏 | 删除整个定义块并提示（a） | 定义块里有实际文字，删了要告知；后续缩进行属于同一定义，不能只删首行后留下孤立说明 |
| 高亮 `==text==` | 未处理，`==` 泄漏 | 删标记保留文字（b） | 高亮的文字本身是重点内容，绝不能删；纯文本没有底色可表达 |
| Obsidian 注释 `%%...%%` | 未处理，注释内容会被发出去 | 整块删除，**不提示**（a 的变体） | 这是最需要修的一条：注释本意就是"不发布"，泄漏是内容事故。不提示是因为用户本来就不期待它出现 |
| 标签 `#tag` | 未处理，原样保留 | 不处理（c） | 微信文案里 `#话题` 是通行写法，很多人就是想带着发；`#` 后无空格不会被标题规则误伤（已实测） |
| 任务复选框 `- [ ]` / `- [x]` | 变成 `• [ ] 任务` | 换成 `☐` / `☑`（b） | `[ ]` 在纯文本里读不出"未完成"；文章模式 `converter.js` 已经在用 `☐`/`☑`，两条链路口径统一 |
| 分隔线 `---` / `***` / `___` | `---` 原样保留；`***` 被吃成 `• 下文`；`___` 被吃成 `_` | 独占行整行删除（a 但不提示） | 现状是 bug 不是设计。分隔线是纯装饰，纯文本用空行足够；`***`/`___` 与粗斜体、列表规则的连环误伤必须靠"更早删掉"来断掉 |
| 非图片嵌入 `![[某篇笔记]]` / `![[x.pdf]]` | **被当成图片，占掉一个图片名额且 imageCount+1** | 提取阶段按扩展名过滤；清洗阶段整块删除（a，不提示） | 这是当前最严重的功能性 bug：一篇带笔记嵌入的文章会把图片配额浪费在根本加载不出来的"图片"上 |
| 删除线 `~~text~~` | 已连内容一起删除 | 保持（a 但不提示） | 用户主动划掉的内容不该出现在成稿里；不提示是因为这是符合直觉的 |
| 内联 HTML | 已删标签保留文字 | 保持（b） | 现状正确 |

**用户直接问的两项结论**：
- **数学公式 → 归 (a)，整块删除 + 提示。** 不能归 (b)，因为公式的"可读文字"就是 LaTeX 源码本身，保留下来只是把乱码换个位置。
- **Callout → 归 (b)，只删 marker 保留文字。** 不能归 (a)，callout 里通常是整段正文（tip、warning 的说明文字），整块删掉等于丢内容；泄漏的只是 `[!note]` 这 7 个字符。
- **普通引用块 → 归 (b)，维持现状**，无需改动。

---

## 5. 数据模型变更

### 5.1 图片项

```ts
interface StickerImageItemLike {
  /** 来源：正文/frontmatter | 本地上传 | 微信素材库 | 预留：渲染产物 */
  source: 'body' | 'upload' | 'material' | 'render';
  /** 由 buildStickerImageKey 唯一构造；后续按不透明字符串使用 */
  key: string;
  /** 可直接当 <img src> 的地址；Blob 项使用 object URL，允许素材无预览 URL */
  displaySrc?: string;
  /** 上传传输方式，与 source（来源语义）分离 */
  uploadRef:
    | { kind: 'src'; src: string }
    | { kind: 'blob'; blob: Blob }
    | { kind: 'media'; mediaId: string; accountId: string };
  /** 素材库图片名 / 上传文件名，用于 alt、title 与状态说明 */
  name?: string;
  /** 同来源去重与失败重试使用的稳定指纹 */
  fingerprint?: string;
}
```

`key` 的构造（`buildStickerImageKey`）：
- `body` → 优先使用解析后的 canonical vault path；远程图使用保留完整路径语义的规范化 URL。不能只取 basename，否则 `a/cover.png` 与 `b/cover.png` 会碰撞。`sticker-extractor.js` 仍保持纯服务层，不直接访问 Obsidian API；由 `buildStickerData()` 通过 `resolveBodyImageIdentity(src, sourcePath)` 注入解析结果，纯服务测试使用默认的完整路径规范化函数。
- `material` → `material:<accountId>:<mediaId>`，mediaId 保持原始大小写。
- `upload` → `upload:<contentFingerprint>`；指纹不可用时降级为仅在当前会话有效的 `name + size + lastModified + seq`。
- `render` → `render:<sessionId>:<seq>`。

`key` 是 opaque identifier。构造完成后，reconcile、removedKeys 和顺序数组都只做精确比较，不再调用 `normalizeImageKey`。旧的 `reconcileStickerImageOrder(string[])` 可保留给兼容测试，但新链路必须使用 item-aware 的 `reconcileStickerImageItems()`。

### 5.2 流向

```
extractStickerData({ ..., manualItems })
  ├ frontmatter cover/images + 正文图（按语法来源过滤非图片嵌入）
  ├ bodyItems + manualItems → candidatesByKey
  ├ reconcileStickerImageItems(candidates, order, removedKeys)
  ├ 若超过 9：保持剩余项相对顺序，从列表尾部开始淘汰 body 项
  └ 返回 { title, content, imageItems: StickerImageItemLike[], removed, hasCodeBlocks, hasTables }
        ↓
buildStickerData()  ← 给 body 项补 displaySrc；Blob 项复用受控 object URL
        ↓ this.previewStickerData
   ┌────┴─────────────────────────────┐
侧边栏 renderStickerPreview        弹窗 renderStickerImageSection
   └────┬─────────────────────────────┘
        ↓（共用 views/shared/sticker-image-list.js）
onSyncStickerToWechat：for (item of imageItems)
   uploadRef.kind === 'media' 且 accountId 匹配 → 复用 mediaId
   uploadRef.kind === 'blob'                         → uploadCover(blob)
   uploadRef.kind === 'src'                          → uploadCover(await srcToBlob(src))
   每张成功后写 stickerUploadCache(accountId + fingerprint)
```

`imageItems` 是唯一真相。`extractStickerData` 的新核心返回值不再把 `images` 当完整数据；如果跨提交兼容确实需要 `images: string[]` / `imageDisplaySources`，只允许在旧调用边界由 adapter 即时派生并视为只读。Blob 与素材项无法被 `string[]` 完整表达，新代码不得再读取兼容数组。P3 内应把贴图渲染和同步调用点全部切到 `imageItems`；若兼容字段继续保留，必须列出调用点、加一致性断言并标记删除提交。

`getStickerUiState(filePath)` 从 `{order: string[], removedKeys: string[]}` 变成 `{order: string[], removedKeys: string[], manualItems: StickerImageItemLike[], undoItems: StickerImageItemLike[]}`。`order` 语义从"src 列表"变成 opaque `key` 列表。Blob 只存在 `manualItems/undoItems`，不会进入 order，也不落 `settings`，所以不需要持久化迁移；但必须定义 remove、undo 超时、切文件和 `onClose` 的 object URL 释放责任。

给 `cleanMarkdownToPlainText` 的 `imageOrder` 传最终 `imageItems.map(item => item.key)`，正文图片先通过同一个 `buildStickerImageKey` 得到 key，再做精确查找。`[配图 N]` 按最终图片网格位置编号：正文 2 张、手动图插到首位时，正文标记为 `[配图 2]` / `[配图 3]`。这是已确认的发布语义，不再依赖 `normalizeImageKey` 对手动 key 的偶然跳过行为。

### 5.3 R5 扩展点：文章长图

`source: 'render'` 这一支现在就写进类型联合，但没有生产者。将来 HTML→image 落地时，它只需要：

1. 产出一个 Blob；
2. 创建受控 object URL 作为 `displaySrc`；
3. 调 `addStickerImageItem({ source: 'render', uploadRef: { kind: 'blob', blob }, displaySrc, name: '文章长图' })`。

之所以够用：同步动作按 `uploadRef.kind` 统一取 Blob/mediaId/src；`addStickerImageItem` 是上传、素材库和将来渲染的唯一添加收口，负责同来源去重、20 张上限、写回 `uiState.manualItems`、触发重渲染与资源登记。网格渲染器只按 `source` 决定角标文案，多一个生产者不影响布局。

长图往往几 MB，因此 Blob 生命周期不是“以后再处理”的提示，而是本次数据模型的硬合同：添加时登记 object URL，移除且撤销窗口结束、文件状态销毁或视图 `onClose` 时 revoke；禁止为方便上传把整张长图常驻为 data URL。

---

## 6. 分阶段任务清单

| 阶段 | 内容 | 可独立发布 | 风险 |
|---|---|---|---|
| **P1** | R3 hover 配色 + R2 侧边栏 0 图收起（hint-line 移进有图分支，新增 `.apple-sticker-empty-line`，删除 `.apple-sticker-empty-notice`） | 是 | 低。纯视图与 CSS，不碰数据 |
| **P2** | R4 清洗规则：重排顺序、新增 8 类规则、`removed` 原因数组、提醒条文案；提取阶段按语法来源过滤非图片嵌入 | 是 | 中。规则顺序与保护区耦合强，`***`/`___`、行内代码和数学公式必须靠对抗测试锁住 |
| **P3** | 数据模型：opaque key、`StickerUploadRefLike`、`reconcileStickerImageItems`、Blob 生命周期、`imageItems` 单一真相；抽出共享网格并把侧边栏切过去 | 是（需通过等价回归后才可发布） | **最高**。同时改变排序标识、资源生命周期与三条读取路径 |
| **P4** | 弹窗贴图区可编辑：网格 + 桌面/键盘/触屏排序 + 移除/Undo + 状态行 + 0 图空态；冻结 sourcePath 与 modal generation | **否，内部阶段** | 中。添加按钮未接通前不应以 disabled 占位形式发布给用户 |
| **P5** | 添加与同步通路：本地 Blob + 素材库（`showMaterialPickerModal` 加 options）+ 账号归属校验 + mediaId 复用 + 失败重试缓存 | 是 | 高。触到真实微信接口、永久素材额度与多账号状态，需真实账号端到端验证 |

P3 之所以最高风险：它是唯一一个"用户看不到任何变化，但底下全换了"的阶段。建议 P3 单独提交、单独跑一遍完整贴图端到端（提取 → 拖拽 → 排除 → 恢复 → 同步），确认与 P2 后的行为逐项一致再进 P4。

P1 与 P2 互不依赖，可并行。P4 依赖 P3。P4 只作为内部提交，不单独形成用户可见版本；P5 依赖 P4，P4+P5 一起构成可发布的弹窗功能。

每阶段先跑本阶段相关测试：`npm test -- --run <tests...>`。改过 CSS 片段时运行 `npm run generate:styles && npm run check:styles`；代码修改完成后对本轮实际 touched code files 运行 `openprd dev-check . <files...>`；阶段提交前运行 `npm run scan:guard` 与 `npm run build`。全部完成、准备合并或发布前再运行 `npm run review:guard`，并留下 task-scoped 测试报告与视觉证据。不要用 build、dev-check 或单张截图替代真实交互与视觉验证。

---

## 7. 测试策略

| 阶段 | 测试文件 | 新增/更新 |
|---|---|---|
| P1 | `tests/view_sticker_mode.test.js` | 新增：0 图时 DOM 内不存在 `.apple-sticker-section-header` / `.apple-sticker-count-badge` / `.apple-sticker-hint-line`，存在 `.apple-sticker-empty-line`；有图时三者都在。CSS 无法单测，靠 `npm run check:styles` 保证 `styles.css` 与片段同步 |
| P2 | `tests/markdown_cleaner.test.js` | 新增 §1.1 表格里每一行的用例；另加保护区与对抗用例：`` `foo_bar_baz` ``、wiki/URL 中 `_`、转义 `\$`、同一行多个金额、两个金额之间出现 LaTeX 信号字符、未闭合 `$`、反引号/`~~~`/更长/未闭合 fence、字符串脚注 label 与多行缩进定义。更新既有断言为结构化 `removed[] + count` |
| P2 | `tests/sticker_extractor.test.js` | 新增：wiki 笔记/PDF 嵌入不收；标准 Markdown 的无扩展名 CDN URL、带 query/anchor URL、data URL 仍收；大小写扩展名；`removed` 中 mermaid/codeBlocks 分别计数 |
| P3 | `tests/sticker_extractor.test.js` / `tests/sticker_order_mapping.test.js` | 新增：四类 opaque key；不同目录同名图不碰撞；大小写敏感 mediaId 不碰撞；正文—素材—上传—正文交错顺序经过重复 build 仍稳定；超 20 张时返回省略数量且最终发布列表不超限；跨来源相同内容允许共存 |
| P3 | `tests/view_sticker_mode.test.js` | 新增：`imageItems` 是唯一真相；兼容派生字段只读且一致；vault 图正确生成 displaySrc；Blob object URL 在 remove/undo 超时、切文件与 `onClose` 时释放且只释放一次 |
| P4 | 新增 `tests/view_sticker_modal_images.test.js` | 弹窗贴图区：渲染 N 张；鼠标、键盘与移动端替代操作都能排序；移除/Undo；0 图时保留可执行入口；20 张时按钮 disabled；批量选择超过剩余名额时有明确提示；按钮/图片有可访问名称；关闭弹窗后侧栏刷新；活动文件变化时阻止同步；迟到异步回调不写入已关闭 modal |
| P5 | `tests/wechat_sync_sticker.test.js` / `tests/sticker_publish_flow.test.js` | 新增：同账号素材 mediaId 直接复用；切账号后旧素材不能直接复用；混合来源上传次数正确；某张失败带正确序号；部分成功后重试只补传失败项；不同账号缓存隔离；素材无预览 URL 时仍可用 fallback 展示并同步 |

无法完全由单元测试替代、必须在 P5 后完成的验证：

1. **真实账号契约**：素材库分页选择 → 确认 → 同账号直接复用 mediaId → 微信后台草稿里 1～20 张顺序与预览一致；确认 newspic 接受素材库返回的永久图片 mediaId。
2. **多账号**：账号 A 选择素材后切到 B，界面明确阻止错误复用；切回 A 后状态恢复合理。
3. **失败恢复与额度**：混合来源同步在中途制造一次失败，再次同步只补传失败项，后台不产生已成功图片的重复永久素材。
4. **内存与生命周期**：桌面和移动端分别添加接近允许上限的大图，预览、移除、Undo、切文件、关闭视图，不 OOM 且 object URL 已释放。
5. **交互与无障碍**：鼠标拖拽、键盘排序、触屏排序、焦点返回、错误提示、0/20 张状态均可完成主路径。
6. **视觉证据**：用 `openprd visual-compare --before/--after` 生成发布弹窗和侧边栏修改前后证据；网格用 alignment board 同时检查卡片容器、编号、来源角标、移除/排序按钮、添加按钮与状态行；至少覆盖桌面与移动端。证据不能只是一张无标注截图。

---

## 8. 已纳入方案的决策、开放问题与风险

### 8.1 已纳入方案的决策

1. **手动添加的图在侧边栏显示。** 侧边栏呈现的是最终发布负载，不只是笔记原文；手动图带"本次发布添加"来源角标。
2. **第一版不跨会话持久化任何手动图。** 本地 Blob 和素材库选择都只保存在当前视图、当前文件的发布会话里，避免两类来源出现不一致的持久化心智；提示文案要写清生命周期。
3. **`[配图 N]` 按最终图片网格位置编号。** 手动图可以插在中间，正文图片标记随最终格位偏移；不强制把手动图排到末尾。
4. **`#tag` 保持原样。** 不为 `#ai/agent` 等层级标签增加猜测性清洗规则，避免误删作者有意发布的话题。
5. **`imageItems` 是唯一真相。** 旧 `images` / `imageDisplaySources` 只能即时派生、只读，并在迁移完成后删除。
6. **不同来源之间不自动去重（用户已明确确认）。** 正文图、本地 Blob、素材库图、渲染产物可能是相同内容，但没有可靠共同标识；第一版允许共存，不根据文件名、URL 或缩略图相似度自动删除。只做各来源内部的可靠去重。
7. **手动图与正文图都支持本会话 Undo。** 不使用"不可恢复"文案。

### 8.2 仍需用真实证据收口

1. **数学公式的保守门槛可能漏判。** `$x = 1$`（无 `\^_{}`）不会被删。先用真实语料统计漏判与金额误判，再决定是否放宽；没有语料前保持保守。
2. **微信素材 mediaId 契约。** 代码与 mock 只能证明请求形状正确，不能证明素材库返回的永久图片 mediaId 在所有目标公众号上都可直接用于 newspic；P5 必须用真实账号验证后才能宣称完成。
3. **图片格式与字节上限。** 实现前以当前微信接口实测/官方约束确定 whitelist 和大小限制，不把 `image/*` 或"10MB"当作未经验证的通用事实。
4. **兼容字段删除时点。** 默认在 P3 把内部调用点迁到 `imageItems`；如果确实需要跨提交兼容，必须列出剩余调用点和明确删除提交，不留无限期双真相。
5. **可选想法，不进核心计划**（避免范围膨胀）：给弹窗贴图区加"从侧边栏当前顺序重新同步"按钮；给手动图加拖拽文件到网格直接添加；提醒条支持点击展开看被删掉的原文。

---

## 9. 明确排除范围

- **HTML→图片导出功能本身不做。** 本计划只在 `StickerImageItemLike.source` 的联合类型里预留 `'render'`，并保证 `addStickerImageItem` 是唯一添加入口。渲染引擎选型、长图分页、水印、导出触发入口、进度提示，全部是后续独立计划的事。
- 不动文章模式的任何行为：封面上传、素材库选封面、摘要、草稿关联与更新、`converter.js` 的渲染规则、`themes/apple-theme.js`。
- 不动 `syncStickerDraft` 的接口形状与 `api.createImageDraft` 的参数（`imageMediaIds: string[]` 保持不变）。
- `STICKER_MAX_IMAGES` 从 9 更新为公开接口上限 20；`STICKER_MAX_CONTENT_LENGTH = 1000` 保持不变。图片与文字都不做静默截断：图片超过名额时阻止添加/显示省略提示，文字超限时禁用同步按钮并提示。
- 不做贴图的定时发布、群发、多账号并发同步。
- 不做跨来源图片内容识别、感知哈希或自动去重；只做同来源内的稳定标识去重。
- 不给任何新行为加开关。清洗规则修正与空态收起都属于"正确性修复"，不是用户偏好项（沿用 `2026-06-19-feishu-phase-2-implementation-plan.md §12` 的决策口径）。
- 不动飞书与多平台发布链路。
- 不重排发布弹窗的整体结构（账号选择器、`details` 高级选项、按钮行位置都保持现状），只替换贴图模式下"封面"那一节的内容。
