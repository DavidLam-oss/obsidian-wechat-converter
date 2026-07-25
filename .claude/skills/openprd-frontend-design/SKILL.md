---
name: openprd-frontend-design
description: OpenPrd 前端设计框架 skill：为界面、页面、视觉、样式和前端体验任务提供设计资产框架、审美立意、反 AI 味门禁和实现前方向评审规则。
---

<!-- OPENPRD:GENERATED
adapter=claude
source=openprd-frontend-design
version=0.1.19
checksum=c1dce7f1b79de34b
-->

# OpenPrd Frontend Design

当任务涉及界面、页面、视觉、样式、组件层级、信息架构、内容型页面或前端体验时，使用这份 skill。

如果任务会新建界面、结构性改变信息架构/核心布局/视觉系统，或后续要交给 Impeccable，实现前同时读取 `skills/openprd-ui-context/SKILL.md`。由 UI Context 负责 greenfield/brownfield 项目理解、三个专业方向、用户确认以及 PRODUCT.md/DESIGN.md 编译；本 skill 继续提供审美资产框架与反模板化门禁。低风险局部修正使用 UI Context 的 `local-fix` 路径，不重复冻结完整合同。

## 核心目标

- 让 Agent 在动手实现前，先有一套稳定的前端设计资产和判断顺序。
- 避免界面任务默认收敛成同一种安全解。
- 避免“没素材硬做”“事实没核实就写页面”“看起来好看但空心”的情况。
- 让每个界面先有明确审美主张和记忆点，而不是只套默认模板、堆卡片或复用通用 AI 风格。

## 先读这些文件

- `.openprd/design/README.md`
- `.openprd/design/templates/README.md`
- `skills/openprd-frontend-design/references/design-asset-contract.md`
- `skills/openprd-frontend-design/references/direction-engine.md`

如果当前工作区本来就有现成前端结构，或你明确需要偏离模板默认组合，再读：

- `.openprd/design/lenses/frontend-lenses.md`
- `.openprd/design/themes/theme-catalog.json`
- `.openprd/design/layouts/layout-catalog.json`
- `.openprd/design/components/component-catalog.md`
- `.openprd/design/checklists/ui-quality-gate.md`
- `.openprd/design/anti-slop.md`

如果本轮已经进入实现准备，再读：

- `.openprd/design/active/facts-sheet.md`
- `.openprd/design/active/asset-spec.md`
- `.openprd/design/active/image-preflight.md`
- `.openprd/design/active/direction-plan.md`
- `.openprd/design/active/selected-direction.md`

## 使用顺序

1. 先判断这是不是前端体验任务。
2. 选一个 `lens`，明确这次界面的视觉判断角度。
3. 写清本次审美立意：页面解决什么问题、服务谁、气质要偏哪一端、受什么技术/可访问性约束、用户第一眼应该记住什么。
4. 选一个 `theme`、一个 `layout skeleton` 和一个 `recipe`，并说明它们如何服务上面的审美立意。
5. 如果页面会写具体产品事实，先补 `facts-sheet.md`。
6. 如果页面依赖品牌素材、产品图、界面图、图库或插图，先补 `asset-spec.md`，并记录字体、色彩、动效、背景/表面这些审美资产。
7. 如果这类页面没有真实图片就会空心，先补 `image-preflight.md`。
8. 如果用户还没有给参考方向，先补 `direction-plan.md`，明确 3 个异源方向；每个方向都要有不同审美主张和记忆点。
9. 用户选定方向后，再补 `selected-direction.md`，把选中的 lens、theme、layout、组件、审美主张、记忆点和风险锁定。
10. 如果用户已经给了效果图、设计稿、参考截图或其他明确参考图，先把它视为主参考源：优先锁定它的版式、层级、主视觉和关键路径；`starter / lens / theme / layout` 只作为实现加速器，不作为高于参考图的裁决源。
11. 如果当前是空白工作区的前端/页面冷启动，而且用户原话已经给了明确的页面主题、模块范围或“直接实现”的意图，优先运行 `openprd run . --context --message <用户原话>`，不要先跑不带 message 的 `run --context`。
12. 跑完 `design-starter` 后，立即进入 `Patch Mode`：把生成的入口文件当成稳定基座，在同一路径里细化结构、内容、样式和交互。
13. 最后再进入验证，并用 `.openprd/design/checklists/ui-quality-gate.md` 和 `.openprd/design/anti-slop.md` 做自检。

## 空白工作区快路径

如果当前工作区几乎没有前端入口文件，或只有 `.openprd/` 与说明文档：

1. 先运行一次 `openprd run . --context` 看建议路径；如果当前轮用户已经把页面主题、模块范围或“直接实现”的意图说清，优先带 `--message <用户原话>`，让建议基于当前请求，而不是只看空白工作区状态。
2. 如果建议已经是轻量原型/轻量实现路径，或这类 blank frontend task 在带 message 后仍短暂返回 `clarify-user` 但用户原话已足够明确，不要继续长时间翻 `docs/basic/` 占位文档。
3. 立刻把 `.openprd/design/active/facts-sheet.md`、`asset-spec.md`、`image-preflight.md`、`direction-plan.md`、`selected-direction.md` 写成具体内容；如果当前任务是个人博客、通用静态首页、单页介绍或其他不依赖外部产品事实/品牌素材/真实图片的页面，也要明确写成“无外部事实依赖”“当前无品牌素材依赖”“真实图片不是页面成立前提”，不要长期保留 `pending`。
4. 选 `.openprd/design/templates/` 里最接近的一份模板；如果用户已经给了效果图、设计稿或参考图，先挑最接近它的 starter / lens / theme / layout；只有确实接近时才复用，不接近就允许偏离默认组合，以用户参考图为准。如果当前任务已经有一句明确页面主题和模块范围，优先直接运行 `openprd design-starter . --starter <starter-id> --out index.html --brief "<页面主题>" --sections "<模块1|模块2|模块3>"`。只有像个人博客、工具台、纯结构化产品页这类确认不靠真实图片成立的静态首页，才补 `--no-external-facts --no-brand-assets --no-real-images`，让 starter 同步写实 active design artifacts，并把 `docs/basic/`、入口文件说明书和根目录文件夹 README 一起补到可过 standards 的状态；如果题目更像旅游、导览、展览、博物馆、城市、自然观察、案例展示或品牌内容页，默认不要带 `--no-real-images`，先让 starter 尝试补首批真实图片。
5. 下一步动作应该是一轮补丁，同时改 active design artifacts 和生成的入口文件；如果 `design-starter` 已经带 `--brief` 生成了第一版真实内容，就直接在生成的入口文件上细化结构、内容和样式，并立即进入 `Patch Mode`。`Patch Mode` 的意思是：入口路径已经固定，后续所有大改都在当前文件里完成；如果你觉得整页都要重写，也是在同一路径内覆盖，不做 delete-first。禁止删除 `index.html` 后另起新稿；即使结构要大改，也是在当前文件里重排，不要回头整份通读模板源码。如果你真的需要整页重写，先把完整新稿写到同目录 sibling draft，例如 `index.next.html`，确认内容成形后再覆盖回 `index.html`，不要让入口文件出现空窗。starter 一落地后，只允许做一轮就地对焦：快速读一次生成的入口文件和必要的 active design artifacts；这轮对焦结束后，下一步就必须是真实写入口，不要再回头搜网页、翻 `docs/basic/` 或继续模板漫游。把最后一批必要的查事实、查图、读模板动作放在口头宣布之前做完；一旦你已经口头宣布“开始覆盖入口文件”或“进入整页重写”，下一步必须是对 `index.html` 或 sibling draft 的实际写操作，不要继续长时间读模板、翻文档、压图片或停在口头承诺。只有规划、下载图片、补合同或口头说明还不算完成；必须把最终页面真的改到入口文件里。

默认要求：

- 对 blank static prototype，模板默认组合优先于“把所有 catalog 全读一遍再决定”；只有真的需要偏离模板默认组合时，才回头细读 `lenses / themes / layouts / components`。
- 对 blank static prototype，优先使用 `openprd design-starter . --starter <starter-id> --out index.html`，把“挑模板”和“创建入口文件”变成确定动作，不要让 Agent 自己发明复制步骤。
- 对 blank static prototype，如果 prompt 已经给了页面主题和模块范围，优先把它们带进 `design-starter` 的 `--brief` 与 `--sections`，让 starter 直接落真实首版，并顺手把基础文档和说明书从模板态拉成当前事实，而不是先生成整页占位再手工回填。
- 对 blank static prototype，如果当前轮是用户直接给任务，优先让 `openprd run . --context --message <用户原话>` 参与当前请求解析，而不是只看空白工作区自身状态。
- 如果用户已经给了效果图、设计稿、参考截图或其他明确参考图，默认把它当成这轮实现的主约束；只有现有 starter、theme、layout 足够接近时才复用它们，否则以参考图为准，不强行套库。
- 没有明确参考图时，不要直接落回紫白渐变、白底卡片堆叠、通用 SaaS hero、Inter/Roboto/Arial/system-ui 默认字体栈，或“浅色留白 + 少量点缀色”的安全解；先写出更具体的气质和记忆点。
- 选择 theme 时优先用有角色分工的字体、色彩、表面、动效和密度体系；如果必须使用中性字体或克制配色，要说明这是为扫描效率、品牌限制或可访问性服务，而不是偷懒。
- 动效、背景、纹理、阴影和装饰只能强化本次审美主张，不能替代信息层级、真实素材或任务完成路径。
- 对 blank static prototype，如果页面不依赖外部产品事实、品牌素材或真实图片，允许并建议在 active design artifacts 里直接写清：`无外部产品事实依赖`、`当前无品牌素材依赖`、`真实图片不是页面成立前提`；这类页面不该因为“没有更多证据可查”而一直停在 `待填写 / pending`。
- 对旅游、导览、展览、博物馆、城市、自然观察、馆藏、案例展示这类页面，默认先把“真实图片大概率是页面成立前提”写进判断里；除非你已经有明确降级方案，否则不要顺手补 `--no-real-images`。
- 跑完 `design-starter` 后，立即替换生成入口文件里的 `title`、首屏文案、CTA 和所有 `[占位]` 文案；除非真的需要额外结构，不要再回头整页阅读模板文件。
- 跑完 `design-starter` 后，不要再重新判断“要不要删文件重写”；下一步默认就是进入 `Patch Mode`，至少同时修改 `index.html` 和必要的 active design artifacts；直接在生成的入口文件上改。禁止删除 `index.html` 后重起，也不要继续翻 theme / layout / template 源码来给自己找“再等等”的理由。
- 跑完 `design-starter` 后，如果确实还需要确认当前骨架，只允许做一轮就地对焦：快速读一次生成的入口文件和必要的 active design artifacts；对焦结束后，下一步就必须是真实写入 `index.html` 或 sibling draft，不要再回头搜网页、翻 `docs/basic/` 或继续模板漫游。
- 如果确实要做整页重写，默认先写 sibling draft，例如 `index.next.html` 或 `index.rewrite.html`，确认新稿已经成形后再覆盖回 `index.html`；不要先把当前入口删掉再慢慢补。
- 把最后一批必要的查事实、查图、读模板动作放在口头宣布之前做完；一旦你已经说“现在开始覆盖入口文件”或“现在开始整页重写”，下一步必须出现真实写文件动作；优先直接修改 `index.html`，或先写 `index.next.html` / `index.rewrite.html`，不要继续只读浏览或长时间停住。
- 如果用户已经给了效果图或设计稿，跑完 `design-starter` 后的第一目标不是“回到样式库重新想一版”，而是把参考图里的版式、信息层级、主视觉和关键路径真正映射到当前入口文件里。
- active design artifacts 是空白工作区里第一批应该被写实的文件，不是实现后补填的附属记录。
- 当你已经读完 design 框架和 active 模板后，不要继续反复扫描同一批模板文件；直接进入填写和实现。
- 对静态单页原型，默认优先用单文件 HTML 模板起步；只有复杂交互或现有项目结构已经明确时，才拆成多文件。

## Patch Mode

- `design-starter` 一旦生成入口文件，这个路径就视为稳定基座；后续默认围绕它继续实现。
- “重写页面”在这里的正确含义是“在同一路径内覆盖结构和内容”，不是先删除文件再慢慢补回来。
- 如果用户已经给了效果图、设计稿、参考截图或其他明确参考图，这些参考图就是 `Patch Mode` 的主裁决源；现有样式库、starter 和 design tokens 只负责加速，不负责把页面带到另一种风格。
- 一轮有效的 `Patch Mode` 至少同时收口入口文件和必要的 active design artifacts；如果事实、素材或图片还没准备好，先补这些，再继续改页面，不要把入口文件删空当成思考中间态。
- 如果要整页重写，先写 sibling draft，再覆盖回正式入口；不要让 `index.html` 在重写过程中处于缺失状态。
- `design-starter` 刚落地时，如果需要短暂对焦，只允许围绕生成的入口文件和 active design artifacts 做一轮快速确认；对焦之后就进入真实写入，不再回头搜网页、翻 `docs/basic/` 或继续模板漫游。
- 一旦你已经宣布进入 `Patch Mode` 的覆盖阶段，下一步必须是实际写入 `index.html` 或 sibling draft；不能继续只做素材处理、重复阅读或停在“准备开始改”的状态。把“开始覆盖”这句话视为最后一跳承诺，不要太早说。
- “Patch 已完成”的最低标准是：入口文件本体已经真正改完，主要占位或“待补”文案已去掉，已准备好的真实图片或参考约束已经映射进页面，相关 active design artifacts 也已同步。
- 只做规划、下载素材、补合同、写说明或口头承诺“准备开始改”都不算 `Patch Mode` 完成。

## 六个硬门

### 1. Aesthetic Direction Before Coding

- 编码前先回答：用途、用户、气质、约束、差异化记忆点。
- 气质可以极简、工业、编辑、复古未来、自然有机、精致奢华、玩具感、艺术几何、温暖邀请、克制工具感等，但必须和任务、受众、内容资产一致。
- 大胆不等于花，克制不等于空；复杂度要匹配审美主张。强叙事页面允许更强动效和视觉层次，工具型页面则用密度、对齐、状态和扫描效率体现设计。
- 不要把“好看”当方向；要能说出这个页面最想让人记住的一件事。

### 2. Facts Before Assumptions

- 涉及产品名、版本号、发布时间、规格、价格、引用数据、榜单、排名、地点或政策时，不要凭记忆写页面。
- 先核实，再写入 `.openprd/design/active/facts-sheet.md`。
- 核实不到就标成 `待确认`，而不是自己补一个像真的答案。

### 3. Assets Before Decoration

- 对品牌页、发布页、内容页、deck、招商页、展览页、产品页来说，logo、产品图、UI 图、图表素材、品牌色和字体都属于一等资产。
- 先写 `.openprd/design/active/asset-spec.md`，再决定版式。
- 不要把“先做个好看壳子”当成默认路径。

### 4. Real Images Before Placeholder Harmony

- 如果任务属于旅游、展览、内容、科普、发布、品牌故事、馆藏、案例展示等场景，先判断真实图片是不是内容成立的必要条件。
- 必要时在 `.openprd/design/active/image-preflight.md` 记录：是否需要真实图、计划来源、风险和降级方案。
- 页面还没有真实图片时，不要用大片灰块假装已经准备好了内容。

### 5. Three Directions Must Be Heterogeneous

- 没有明确参考图时，不要只出三张“有细微差异的同一种安全解”。
- 3 个方向至少来自 3 类不同生成逻辑：
  - `contrast`：刻意拉开气质、密度、明暗或叙事角度
  - `reference-transfer`：从真实世界成熟范式迁移结构方法
  - `design-lens`：基于某种明确设计哲学从头重构
- 每个方向都要写清：为什么它和另外两版不同、适合什么场景、主要风险是什么。
- 每个方向还要写清：审美主张是什么、用户会记住什么、它避免了哪种通用 AI 模板味。

### 6. Theme Lock Before Build

- 一旦方向已选，先锁定 `lens + theme + layout + component set + aesthetic direction + memory point`，再进入编码。
- 不要在实现中途临时发明颜色、阴影、边角体系或组件结构。
- 如果实现过程中发现现有 theme 或 layout 不够用，先补库，再继续写页面。

## 前端审美框架

这套框架不是“参考图收藏夹”，而是 Agent 可执行的设计骨架：

- `lenses/`：这次站在哪种设计判断角度看页面
- `themes/`：色彩、字体、密度、圆角、阴影、边框、留白、动效和表面规则
- `layouts/`：页面骨架
- `components/`：高频结构块
- `recipes/`：按任务类型打包的默认方案
- `checklists/`：实现前后自检
- `assets/`：允许反复复用的背景、表面、图案和位图资产说明
- `templates/`：可直接开工的页面模板，减少空白工作区从 0 到 1 的犹豫
- `anti-slop.md`：反模板化检查，拦住紫白渐变、通用字体、卡片堆叠和没有语境的装饰

## 什么时候必须补 active artifacts

- 写产品事实、版本事实或具体数据时：必须补 `facts-sheet.md`
- 依赖品牌素材、产品图、界面图或图库时：必须补 `asset-spec.md`
- 内容图是不是页面成立前提不明确时：必须补 `image-preflight.md`
- 没有明确参考方向且要做新界面时：必须补 `direction-plan.md`
- 用户已经选定方向并准备实现时：必须补 `selected-direction.md`
- 方向、主题或模板里出现通用 AI 味时：必须先用 `anti-slop.md` 改写审美主张，再进入实现
- 开发新功能出现新入口、按钮、tab、卡片、空态或工具格时：必须补 `asset-spec.md` 的“功能图标”行——先复用项目已有图标体系；项目没有时按最佳实践路由选型（UI 图标 Phosphor，落码 Lucide/Tabler/React Icons，AI 品牌 LobeHub Icons，技术栈 Tech Icons，功能图标/插画 iconfont），登记图标名、来源和用途后再接入实现。这是默认动作，不等用户提出；只有语义确实不需要图标或用户明确说不要时才跳过，并在收口说明原因

## 和现有视觉流程怎么配合

- 这份 skill 发生在实现前，用来约束“先决定怎么做”。
- `imagegen` 仍然负责出候选效果图。
- logo、icon、avatar、badge、贴纸、空态插画、单物件 UI 位图等开发素材，如果后续要接入 UI 并需要透明背景，默认走一条完整的图标资产链路：先出 3 个差异足够大的独立素材候选方向，全部使用纯 `#00ff00` 绿幕、无文字、无 UI 容器、主体居中且留足裁切边距；用户选定前不写项目文件。选定后先用源图顺序或 contact sheet 确认选中图，再保留绿幕源图、抠透明 PNG/WebP、裁切居中、导出 384px 或多尺寸资产，并按真实入口位置分别调显示比例。接入后同步写回 `.openprd/design/active/asset-spec.md` 和 `selected-direction.md`，记录选中方向、资产路径、接入位置和验证结果。
- `openprd visual-prepare` 负责把整板、多对象或网格参考图整理成可实现的 reference-set。
- `openprd visual-compare` 负责实现后的视觉证据，而不是替代这份设计前置判断。
- `visual-compare` 每次都会返回 `chatEmbed` markdown；生成证据板后必须把 `![视觉证据: ...](路径)` 直接嵌入最终回复，让证据在对话流里可见，不要只报告文件路径。`openprd dev-check` 触达界面文件且最近 24 小时没有证据板时会输出视觉证据提醒，收口前按提醒补齐。
- 视觉证据不仅看像不像，还要看选定的气质、记忆点、字体/色彩/动效/表面层级有没有被实现保住。
- 卡片宽度、间距、留白、对齐、颜色、圆角、字号、按钮和图标这类轻量 UI 可视优化，不需要自动升级成 3 方向方案评审；但只要最终会被用户看见，收口时就要有 `visual-compare` 的修改前后图、局部焦点证据板、截图实测证据板或对齐辅助线证据板。构建通过、打包成功、`dev-check` 通过和单张截图都不能替代视觉证据。
- 新功能或改动里只要出现同构列表、卡片、网格或表格，就默认把容器轨道以及相同文案类型/相同组件槽位的对齐纳入验收；Agent 应截真实页面、叠辅助线，同时量卡片外框、列宽、行顶等容器轨道，以及标题、副标题、描述、标签、状态、价格、按钮、图标、操作区等内部内容槽位的 x/y/宽高/baseline spread，并用 `openprd visual-compare . --board <alignment-board.json>` 生成对齐证据。只量外框、列宽或行顶不算完整对齐验收。
- 单个 logo、icon、avatar、badge、按钮图形或图片裁切需要判断内部居中、视觉重心或偏心时，默认使用 `openprd visual-compare . --board <centering-board.json>` 生成内部居中证据板；Agent 要先裁出目标元素，再用类似 Canvas 的像素 mask 量画布中心、主体外接框中心和视觉重心偏移。证据板必须显示红色画布中心线、绿色主体外接框、黄色视觉重心点和 offset 数值；单张截图或主观“看起来居中”不算完整验收。

## 输出要求

- 对用户说明方向时，用人话描述气质、信息组织、视觉重心和适用场景。
- 对实现说明时，明确写出选中的 lens、theme、layout、关键组件、审美主张、记忆点，以及主动避开的模板化风险。
- 若因素材缺失、事实未确认或方向未选定而暂不实现，要直说卡点在哪里。
