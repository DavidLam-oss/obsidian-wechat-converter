---
name: openprd-shared
description: OpenPrd 工作区、语言规则、门禁和 workspace-first 推理的共用守则。
---

<!-- OPENPRD:GENERATED
adapter=codex
source=openprd-shared
version=0.1.19
checksum=6c941e031e3149dc
-->

# OpenPrd Shared

这份规则集适用于所有 OpenPrd 工作。

## 优先读取

- `.openprd/state/current.json`
- `.openprd/state/task-graph.json`
- `.openprd/harness/install-manifest.json`
- `.openprd/harness/hook-state.json`
- `.openprd/harness/runtime-environment.json`
- `docs/basic/`

## 运行规则

- 动手前先从 `.openprd/` 重建上下文。
- 选择写入命令前，优先运行 `openprd status .` 和 `openprd next .`。
- 代码搜索默认从当前任务相关源码、测试和 change/task 文件起步；不要把 `.openprd/quality/reports/`、`.openprd/harness/` 或 `.openprd/learning/` 当源码目录做 repo-wide `rg`。需要审阅质量报告时，显式读取最新 HTML/JSON 或 `latest` 指针，而不是把历史报告混进代码搜索。
- 实现授权不包含云端热修复、生产远端写入、业务兜底、写死逻辑、客户端/服务端补业务数据或缓存补行；这些动作需要当前用户单独明确批准，并给出本地源码/配置/迁移同步与回滚计划。
- 用户可见文档、进度日志、proposal、prompt、报告，以及 Agent 产出的 spec 和 tasks 跟随用户当前主语言；无法判断时使用简体中文兜底。只保留必要专有名词、品牌名、命令名、路径、字段名和 API 术语。
- OpenPrd 自身及随包 workspace / template / skill README 默认把简体中文放在 `README.md`，英文放在 `README_EN.md`；如需兼容旧链接，可保留 `README_CN.md` 作为跳转入口。
- 当 `locale` 为 `zh-CN` 时，diagram contract 中所有可见字段都必须使用简体中文；面向用户的 review.html 或 diagram HTML 文案不要使用 `freeze` 这类内部流程词，改写为“需求定稿前”“进入实现前确认”等业务可理解表达。
- OpenPrd 用户默认懂业务和产品，但不想读技术黑话；对外输出先给结论和下一步，能一句讲清楚就不要拆成两步。
- 主动替用户补全范围边界、失败路径、恢复路径、实现成本、维护成本、滥用风险和第三方依赖；默认按性价比选方案。
- 涉及第三方 API、模型、云服务或付费工具时，用表格比较效果、价格、接入成本、限制、风险和推荐理由；用户明确质量优先时，提高质量和稳定性权重。
- 当用户的问题包含多个对象、方案、文件、场景、风险、验证项、素材或任务，并且需要同时呈现状态、证据、影响、动作或推荐时，Agent 应主动使用 Markdown 表格，不等用户要求。先用一句话给结论，再给表格。
- 表格优先用于方案对比、状态盘点、问题排查、风险审查、多对象 QA、文件/命令清单、需求场景覆盖和内容/素材规划；单一结论、单一动作、代码示例、命令示例和叙事型说明不要强行表格化。
- 当用户需要理解复杂关系、状态跳转、因果链、边界分工、路径差异、风险传播或方案取舍时，优先用“结论 + 解释型 SVG 图 + 少量补充”的图解优先表达；能被一张图讲清的内容，不要先输出长段落文字。
- 解释型 SVG 是对话辅助，不是正式评审或验收产物；它用于让用户快速看懂，不替代 `review.html`、`openprd diagram`、`visual-compare`、测试证据、调研证据或实现截图。
- 图解优先不等于所有问题都画图：单一事实、短命令输出、简单 yes/no、精确错误文本、合规/安全必须逐字说明的内容，仍用简短文字或表格。
- 面向用户的时间统一使用上海时区 `YYYY-MM-DD HH:mm:ss` 格式，不带 `T`、`Z` 或毫秒。
- 保持未解决假设可见，不要悄悄补脑。
- 对于 L2、脑暴或仍在判断值不值得做的 0 到 1 需求，默认再补一层“创业验证闭环”：第一批最容易触达的人群/社区、你为什么算这个社区里的自己人、当前替代方案和痛点证据、先不做完整产品时的手工路径、能否先用 spreadsheet / 表单 / no-code 跑起来、如果必须开始做产品也只自动化最重复的一步并先压成 forms / lists / CRUD 骨架、什么真实承诺才算真需求、有没有 10 个样本和更强付费信号、最低成本验证动作、达到什么条件才允许产品化，以及验证阶段怎样先活下来、增长阶段守什么纪律，以及这是不是你愿意长期住进去、不会反过来绑住自己的业务形态。
- 项目基线文档路径只能是 `docs/basic/`。
- 声称就绪前，至少通过 `openprd validate .` 和 `openprd standards . --verify`。
- 实现就绪还要运行 `openprd quality . --verify`，并审阅 HTML 质量评估报告中的场景标签、必需 EVO 门禁、可观测性、业务护栏、评估执行环境、性能和知识缺口。L2 或跨页面实现的最终回复必须带上最新 HTML 质量报告和 task-scoped 测试报告路径；缺失时只能说“实现完成但项目级收口未完成”。
- 用户要求生成图片、封面图、配图、海报、插画、图标、贴纸、头像、banner、主视觉/KV、运营图、效果图、视觉稿、mockup、先看样子或先确认设计方向时，先按生图路由选工具：Codex 环境用原生 `imagegen`（Image 2），Cursor 环境用内置 `GenerateImage`，两者都是对话工具内免费能力；都不可用或无法判断时，先读 `.openprd/harness/image-generation-preference.json` 的用户已确认偏好，没有偏好就先问用户选哪种生图方式并把答复以 `user-confirmed` 来源写回该文件作为下次默认；绝不擅自调用用户本地或自有付费生图 API。生图工具是工具路径，不是审美豁免。生成前先写清用途、受众、气质、约束和记忆点，并把它们写进 prompt；没有品牌或参考图依据时，用 anti-slop 排除默认紫白/蓝紫渐变、通用字体、白底卡片堆叠和无语境装饰。对 logo、icon、avatar、badge 等开发素材，如果用户未明确要求 mockup、场景图、设备框、卡片承载、名片/包装展示或参考界面复刻，默认按独立素材输出（standalone asset）处理：使用全画布单主体，不额外添加 UI frame、卡片、设备壳、名片、桌面陈列、手持实拍或其他展示容器。只有当用户明确要求 mockup、场景化效果图、容器化呈现，或参考图本身包含这些结构时，才生成对应容器或场景；除非用户明确指定 HTML、SVG、CSS、Canvas、代码稿或可编辑矢量/source artifact，不要改用临时 HTML/SVG/CSS 再截图。只有实际发生生图工具调用后，才能汇报生图结果、失败或限流。生图结果先当候选效果图，不要默认登记到 `.openprd/harness/visual-reviews/`；如果用户还要继续做实现，主动确认是否符合预期、是否纳入后续效果图/实现截图对比、以及是否按此继续实现。
- 对 logo、icon、avatar、badge、贴纸、空态插画、单物件 UI 位图等开发素材，如果最终要接入 UI 并需要透明背景，默认走“候选评审 -> 资产工程化 -> 接入验证”的图标资产链路：先基于用途、受众、气质、约束和记忆点生成 3 个差异足够大的独立素材候选方向，并保持纯 `#00ff00` 绿幕、无文字、无 UI 容器、主体居中且留足裁切边距；用户选定前不写入项目文件。用户选定后再定位源图或 contact sheet，保留绿幕源图，用 `remove_chroma_key.py` 抠成透明 PNG/WebP，按真实 UI 需要裁切居中并导出 384px 或多尺寸资产；接入时按首页卡片、工具格、吸顶栏、偏好预览等实际场景分别调显示比例，而不是只换图片路径。收口时同步写回 `.openprd/design/active/asset-spec.md` 和 `selected-direction.md`，说明选中的方向、资产路径、透明产物、接入位置和验证结果；最终回复必须区分绿幕源图、透明产物和是否已经接入。
- OpenPrd 的 `review.html` 用于需求评审，不能替代图片或效果图生成；`visual-compare` 只用于实现阶段视觉证据：已有确认参考图时对比“效果图 / 实现截图”；没有参考图时先判断新建界面还是修改既有界面，新建界面回到实现前 3 方向方案评审，修改既有界面再对比“修改前 / 修改后”；当局部细节更重要时，优先改用 `--board` 生成“局部焦点证据板”；当并行跑了多个优化方向时，优先改用 `--board` 生成“并行实验证据板”；当普通截图、Computer/Browser/Playwright 实测截图被用作证据时，必须改用 `--board` 生成“截图实测证据板”；当新功能或改动包含同构列表、卡片、网格、表格，或用户反馈排版没对齐时，必须改用 `--board` 生成“对齐辅助线证据板”，且同时覆盖容器轨道和内部内容槽位轨道；当单个 logo、icon、avatar、badge、按钮图形或图片内部需要居中判定、视觉重心评估或用户反馈偏心时，必须改用 `--board` 生成“内部居中证据板”，用红色画布中心线、绿色主体外接框和黄色视觉重心点展示偏移。视觉证据不仅检查位置和结构，也要检查选定气质、层级、字体/色彩/动效/表面角色和记忆点是否保住。当参考图是一张整板、网格图、多对象或多子图组合时，先运行 `openprd visual-prepare` 生成 reference-set、contact sheet 和 board 模板，再进入实现对比。
- 轻量 UI 可视优化也要走视觉证据门：卡片宽度、间距、留白、对齐、颜色、圆角、字号、按钮、图标这类用户可见小改，不自动升级成大界面 3 方向评审，但动手前要有一句本轮审美意图和记忆点，收口前至少补 `visual-compare --before/--after`、`--board <focus-board.json>` 或 `--board <verification-board.json>`；如果存在同构列表、卡片、网格或表格，或用户反馈没对齐，还要补 `--board <alignment-board.json>`，把真实截图、辅助线、容器轨道 spread 和内容槽位 spread 放在一张板里；如果关注单个素材/图标/头像/徽标/按钮图形的内部居中或视觉重心，还要补 `--board <centering-board.json>`，把画布中心、主体外接框中心和视觉重心偏移放在一张板里；build、package、dev-check、单元测试和单张原始截图都不能替代视觉证据。
- 大界面改动在需求分流后、PRD 定稿或实现开工前先做视觉方案评审。先判断这是不是会决定首屏、核心布局、信息架构、主视觉或关键路径的场景，而不是按关键词触发；已有界面时用 Codex Computer Use 进入产品内对应功能并截当前真实界面，冷启动没有现有界面时基于已确认 PRD、用户群体、第一版切片和视觉目标生成设计 brief。brief 必须写清用途、受众、气质端点、约束和记忆点，3 个方向要分别说明审美主张和主动避开的模板味。再按生图路由调用内置生图工具（Codex=`imagegen`/Image 2，Cursor=`GenerateImage`）生成至少 3 个不同设计思想方向；把效果图横向拼成一张带 1/2/3 序号的大图，先作为候选效果图展示给用户。只有用户确认纳入后续对比或继续实现后，才把选定方向、整张图或其中子图整理到 `.openprd/harness/visual-reviews/` 并进入实现。
- 界面、页面、视觉、样式或前端体验开发中，只要已经有效果图、设计稿、图片资产或用户给图并进入实现阶段，阶段性完成后必须先截实现图，再运行 `openprd visual-compare . --reference <效果图> --actual <实现截图> --locale <当前主语言>` 生成左右对比 JPG；中文语境默认标注“效果图 / 实现截图”，英文语境默认标注“Reference / Implementation”。如果这次要审局部细节，就补一份 `--board <focus-board.json>` 的局部焦点证据板。如果一张参考图里有多个子图、网格或对象，先运行 `openprd visual-prepare . --reference <效果图> --grid <列>x<行>` 或 `--boxes <plan.json>`，确认 contact sheet 后再逐项对比。普通截图和 Computer/Browser/Playwright 实测截图只能作为原始素材，收口前要用 `--board <verification-board.json> --locale <当前主语言>` 拼成截图实测证据板。证据板 JSON 里的 title、summary、label、notes、checks 等用户可见文案必须跟随用户当前主语言；中文语境不要整段写英文，英文语境不要混入默认中文标签。新功能开发或既有调整里出现同构列表、卡片、网格、表格时，即使用户没有主动提“对齐”，也要用 `--board <alignment-board.json>` 生成对齐辅助线证据板，先检查卡片外框、列宽、行顶等容器轨道，再检查标题、副标题、描述、标签、状态、价格、按钮、图标和操作区等内部内容槽位是否成轨；用户反馈没对齐/排版漂移时也走同一条路径。单个 logo、icon、avatar、badge、按钮图形或图片内部需要居中判定、视觉重心评估或用户反馈偏心时，要用 `--board <centering-board.json>` 生成内部居中证据板，检查画布中心、主体外接框中心和视觉重心偏移。Agent 必须查看合成图并继续对标，直到结构、气质、层级、字体/色彩/表面角色和记忆点都没有明显差异；如果用户后续说“跟效果图”“不一致”“好丑”“复刻”，至少先产出一份视觉证据图，不能只凭主观判断宣称完成。
- 界面、页面、视觉、样式或前端体验开发中，如果没有明确效果图、设计稿、图片资产或用户给图，要先判断这是新建界面还是修改既有界面：新建界面走实现前 3 方向方案评审；修改既有界面则动手前必须先用 Computer Use、Browser、Playwright 或项目现有工具截取修改前截图。完成后用同一入口、视口、账号和数据状态截取修改后截图，再运行 `openprd visual-compare . --before <修改前截图> --after <修改后截图> --locale <zh-CN|en>`。如果这次并行试了多条优化方向，再补一份 `--board <parallel-board.json>` 的并行实验证据板；如果只是普通截图或 Computer/Browser/Playwright 实测截图，也必须补 `--board <verification-board.json>` 的截图实测证据板。Agent 必须查看合成图，确认预期变化出现且未改区域没有明显漂移。
- 界面任务进入实现前，先用 `.openprd/design/` 锁定设计框架：页面涉及具体产品事实、版本、发布时间、规格、价格、引用数据或地点事实时，先补 `.openprd/design/active/facts-sheet.md`；页面依赖 logo、产品图、UI 图、摄影图、插图、图表或品牌色字体时，先补 `.openprd/design/active/asset-spec.md`；旅游、展览、内容、案例、发布、品牌故事等内容型页面，要先判断真实图片是不是页面成立前提，必要时先补 `.openprd/design/active/image-preflight.md`；没有明确参考方向时，先补 `.openprd/design/active/direction-plan.md`，并确保 3 个方向来自不同生成逻辑；用户选定方向后，再补 `.openprd/design/active/selected-direction.md`，把选中的 lens、theme、layout、组件和风险锁定。如果用户已经给了效果图、设计稿、参考截图或其他明确参考图，先把它当成主参考源：只有现有 starter、theme、layout 足够接近时才复用，不接近就允许偏离默认组合，以参考图为准。空白工作区的静态原型优先从 `.openprd/design/templates/` 里挑最近模板；如果当前轮用户已经把页面主题、模块范围或“直接实现”的意图说清，优先运行 `openprd run . --context --message <用户原话>`。如果页面主题和模块范围已经明确，优先运行 `openprd design-starter . --starter <starter-id> --out index.html --brief "<页面主题>" --sections "<模块1|模块2|模块3>"`，让 starter 一次写实 active design artifacts 和第一版真实页面。只有像个人博客、工具台、纯结构化产品页这类确认不靠真实图片成立的页面，才在 active design artifacts 写清无依赖并补 `--no-external-facts --no-brand-assets --no-real-images`；若题目更像旅游、导览、展览、博物馆、城市、自然观察或案例内容页，先不要带 `--no-real-images`，让 starter 先尝试补首批真实图片；若这类冷启动即使带 message 仍短暂返回 `clarify-user`，把它当成摘要级提醒，先用 3 到 5 行 mini-plan 收口，再继续。starter 落地后默认进入 `Patch Mode`：必须直接在生成的入口文件上补丁修改；即使结构要大改，也是在同一路径内覆盖，不做 delete-first，更不要删除 `index.html` 后另起新稿。如果确实要整页重写，先把完整新稿写到 sibling draft，例如 `index.next.html`，确认内容成形后再覆盖回 `index.html`，不要让正式入口出现空窗。starter 一落地后，只允许做一轮就地对焦：快速读一次生成的入口文件和必要的 active design artifacts；这轮对焦结束后，下一步就必须是真实写入口，不要再回头搜网页、翻 `docs/basic/` 或继续模板漫游。把最后一批必要的查事实、查图、读模板动作放在口头宣布之前做完；一旦已经说“开始覆盖入口文件”或“开始整页重写”，下一步必须出现真实写文件动作，而不是继续只读浏览、压图或停在口头承诺；必要时 hook 会把这类非写入动作挡回去。`Patch Mode` 完成不等于只补合同、只下载素材或只写计划；至少要把入口文件本体改完、主要占位清掉，并把已准备好的真实图片或参考约束真正落进页面。
- 看到生成文件疑似过期时，先运行 `openprd doctor .`。
- `.openprd/harness/install-manifest.json` 里的 `optionalCapabilities` 用来记录非阻断式增强建议：如果当前任务明显受益但状态还是 `recommended`，在后续建议里说明它能帮什么、给出文档和 GitHub 链接，并可顺手提出“如果你愿意，我可以按当前客户端帮你补配置”；不要因为它未配置就阻断当前任务。
- `.openprd/harness/install-manifest.json` 里的 `runtimeDetection` 和 `platformCapabilityPacks` 是平台能力解耦协议；`.openprd/harness/runtime-environment.json` 记录最近 hook/session 观察到的当前对话环境。判断当前用户是在 Codex、Claude Code 还是 Cursor 中对话时，按 hook/session payload > 显式 launcher > SDK/headless session > 子进程 env > config/CLI probe > agent 自述的优先级处理。
- `runtimeDetection.executionMode` 用来区分 interactive 与 automation/cron/scheduled/headless/unattended。OpenPrd 默认服务人机协同；无人值守自动化默认不要注入 OpenPrd context、不要阻断写入、不要要求 `dev-check` / `quality` / `doctor`，除非当前任务明确是 OpenPrd 维护或显式启用 OpenPrd。
- Codex 原生 Image 2、Computer Use、Codex-owned browser window、对话协同画布和 Codex 当前线程桥接都属于 Codex 能力包里的 surface-dependent 能力：只有当前工具面或 hook/session 证据明确支持时才走对应路径；画布必须绑定到当前 thread/session，取不到证据时用 `openprd canvas . --thread <id> --thread-title <name>` 或 `--session <id> --session-title <name>` 显式隔离，标题只用于显示，不要让多个窗口共用 fallback 画布；当前线程桥接只在 Codex App 当前 thread binding 明确时启用。浏览器写入 handoff 后，OpenPrd 服务端默认通过 Codex app-server `thread/resume -> turn/start` 把文本和本地图片路径提交到绑定线程，并在 `relays/` 留 payload/status/log；自动投递关闭、明确失败或长时间未启动时，才写入 `agent-foreground-relay` 队列，由当前 Agent 通过 `openprd canvas . --bridge-outbox --claim next` 领取后调用线程工具发送，再用 `--bridge-sent` 或 `--bridge-failed` 回写。也不要仅凭 Codex CLI、`.codex/config.toml` 或 `CODEX_HOME` 推断这些能力可用。Claude Code、Cursor 也同理，先识别当前对话客户端，再启用对应能力包。
- 前端体验任务进入实现前，优先读取 `$openprd-frontend-design` 与 `.openprd/design/`，先锁定审美主张、记忆点、lens、theme、layout 和组件，再决定是否实现。
- 开发新功能出现新的入口、按钮、tab、卡片、空态或工具格时，默认自动配图标，不等用户提出：先复用项目已有图标体系保持一致性；项目没有时按图标最佳实践路由选型（UI 图标看 Phosphor，落码用 Lucide/Tabler/React Icons，AI 品牌看 LobeHub Icons，技术栈看 Tech Icons，功能图标/插画看 iconfont），把选中的图标名、来源和用途登记到 `.openprd/design/active/asset-spec.md` 的“功能图标”行，再接入实现。只有语义确实不需要图标（如纯文本段落）或用户明确说不要图标时才跳过，并在收口说明原因。
- `openprd run . --context` 只是建议。规划、分析、review、影响范围说明等请求保持只读，除非当前用户消息明确要求开发、实现、继续任务、深度调研、对标复刻或 commit/push。
- 用户给出会话 ID 并要求继续时，按工具无关的历史会话精确续接；不要要求或使用工具专属 ID；当前 active change、相似历史或 requirement gate 只能作为背景，不能替代该会话 ID。
- 代码修改完成后、最终回复前，针对本轮实际 touched code files 运行 `openprd dev-check . <file...>` 或 `node scripts/openprd-dev-check.mjs . <file...>`；700 行以内正常，701-1500 行需注意，超过 1500 行警告。自动优化默认开启：命中需要关注的文件时，先在本轮按 dev-check 给出的动作直接完成高内聚低耦合拆分（不丢任何功能、拆完重跑测试与 dev-check），最终回复以 **OpenPRD 自动优化报告** 为标题复用 dev-check 生成的 Markdown 表格（列：影响对象、问题级别、源文件规模、优化原因、本次处理结果、后续建议），并附一句开关确认：“如果下次不需要自动优化代码结构，回复关闭自动优化即可”；用户说关闭就运行 `openprd dev-check . --auto-refactor off` 转为仅推荐（此时标题回到 **后续建议**，列名回到关注程度、规模信号、预警原因）。不要把“问题级别／关注程度”列改写成纯 emoji，必须保留例如 `🟠 中风险｜建议优先关注` 这类完整标签；如果你改写了表格文案，先用 `node scripts/dev-check-wrapup-copy.mjs --validate` 校验每格不超过 20 字；若报错，按提示缩短后重试。
- 执行中发现可沉淀项时，不要中途打断当前任务：代码扩展识别这类白名单工具补全会自动应用并记录；用户偏好、项目协作规矩和 OpenPrd 默认行为先沉淀为 `.openprd/growth` 候选，收工时再集中运行 `openprd grow . --review` 请用户确认。
- 维护 OpenPrd 本身时，只要新增或修改配置类能力（阈值、规则、识别、豁免、命令别名、环境差异、用户偏好或策略开关），都要做 grow-aware 自检：高置信应可成长时默认纳入 `openprd grow`；不确定时主动问用户；明确一次性或固定规则时才保持静态配置。
- 只要实现新增或修改文件，就做文档影响检查；缺失的 `docs/basic/`、文件说明书和文件夹 README 要补齐，已有文档受影响时要更新。
- 涉及后端、脚本、Agent、工具链、服务或数据处理变更时，把 CLI 与 API 视为同级接入面：检查命令入口、参数、输出契约、`help`、`doctor`、`dry-run`、`status` 与接口协议、返回结构、身份边界是否受影响，并同步更新 `docs/basic/backend-structure.md`；若某一面不适用也要明确写原因。
- Codex hooks 默认使用 `lite`：`UserPromptSubmit` 注入上下文、轻量 `PreToolUse` 写入门禁，以及 `Stop` 本轮收工回顾。若发现可复用的项目经验，`Stop` 会要求 Agent 在最终回复结尾用人话说明“本次观察到的情况 / 计划保留的项目经验 / 以后怎么复用 / 只保留在当前项目里”，再询问用户是否保留；只有项目明确需要更重的工具级遥测时，才切到 `full`。
- 需求分流优先使用 `$openprd-requirement-intake`，不要按固定关键词判断。用户可见需求类型和内部路由码的固定对照为：直接处理=L0、现有功能优化=L1、新功能/新流程方案=L2。用户审查默认把路由码并进“需求类型：直接处理（L0）”这类标签里；只有内部排障确实受益时，才额外附“内部路由码”。L0 可直接处理并事后说明，不打开正式 PRD/review/change/tasks；L1 先给对话内 mini-plan，默认不生成正式 PRD/change/tasks；只有 L2 才进入 requirement intake 与 PRD/review/change/tasks。L2 的对话内 requirement 摘要默认按“需求判断 / 需求理解 / 功能范围 / 技术方案”四段来写，其中“功能范围”和“技术方案”优先用 Markdown 表格，帮助用户先总后分地看清范围和实现方向；`需求判断` 和 `需求理解` 先用 1 到 2 句轻量主句说清这次是什么、核心问题和第一版目标，边界、风险、异常例子和技术细节下沉到后面的分项或表格，不要把它们都塞进一整段长话里，也不要把某条示例文案写成固定模板。若当前仍是 0 到 1 探索、脑暴或值不值得做的判断，摘要里还要主动补上“验证与创业闭环”：第一批最容易触达的社区或种子用户、你为什么算这个社区里的自己人、当前替代方案和痛点证据、先怎么手工交付、手工作战卡怎么写、能不能先用 spreadsheet / 表单 / no-code 跑起来、如果必须开始做产品也只自动化最重复的一步并先压成 forms / lists / CRUD 骨架、第一版只做哪一件事、能不能压成周末级 MVP、第一批客户路径、从第一个客户开始怎么收费、客户 1 如何打平成本、有没有 10 个样本和更强付费信号、达到什么条件才允许产品化、增长阶段守什么纪律、这条路是否可逆、是否真在解决客户问题、以及是否符合团队价值观、是不是你愿意长期住进去的业务形态。如果用户刚刚已经确认了现有功能优化（L1）的 mini-plan、范围边界或正式产品边界，后续承接要明确写成“已确认，我按这个继续/收口/落地”，不要用“确认，我们就按这个……”这类像再次索取确认的句子。单纯的“请帮我实现/继续实现”不等于跳过 requirement 摘要确认、`capture/classify/synthesize` 写入路径或 review；只有用户明确表示“不需要进行任何确认”时，才允许静默走完整 requirement write path。若当前仍在 L2 的首轮澄清或 requirement 摘要确认阶段，不要写成“你回我一句我就开始实现”；只能承诺“我先整理需求摘要给你确认，确认后再进入 PRD / review 流程”。如果用户的下一条回复只是承接上一轮 requirement 摘要的短跟进，而不是提出新范围、改目标或重新发起分析请求，就把它当成对上一轮摘要、默认方向或选项的继续确认，不要重新开一轮泛化 clarify；应直接按当前对话上下文把已确认事实用 canonical capture 路径、`user-confirmed` 来源写回，而不是继续写 `agent-inferred/project-derived` 的用户澄清字段。若用户原始意图已经明确要求实现，review 已确认且 tasks 就绪后可直接进入执行；否则在请求执行授权前，先输出执行确认清单，列出本轮目标、将执行内容、不做事项、验证方式和已知风险，不能只要求用户回复一句确认。
- 涉及最佳实践、benchmark、对标、参考产品、prompt engineering、Agent harness、context engineering、图标资源、CLI 或 skill 体系设计时，先使用 `$openprd-benchmark-router` 选择证据源，再进入 Context7、DeepWiki 或官方资料调研。
- 入口路由优先看 `$openprd-router`；具体命令速查优先看 `.openprd/harness/command-catalog.md`。
- `AGENTS.md` 只保留轻量合同；详细执行细则优先沉淀到 repo-local skills、command catalog 和 hooks。
- 任务需要 API key、token、账号信息、第三方服务凭证或个人信息时，先使用 `secrets-vault` skill，且不要直接读取原始 vault 文件。
- 修改 skill、`SKILL.md`、`AGENTS.md` 或相关 workflow 前，先读取现状、输出彩色 Mermaid 方案图，并等待用户确认后再编辑相关文件。
- 涉及微信小程序测试、验证、截图、日志、网络请求、开发者工具自动化或运行态相关改动时，先判断是否真的需要运行态证据：只有用户明确要求小程序实测、复现、截图、抓日志/网络、从 0 到 1 走流程，或当前改动高风险到无法靠静态检查、单测、代码审查或现有证据确认时，才升级到本地小程序运行态验证；低风险小改、纯文案、局部样式或可由更轻验证覆盖的改动，默认不要自动触发小程序运行态验证。
- 一旦进入小程序运行态验证，默认沿用当前小程序运行态或开发者工具会话连续验证，不要为了验证自动重开应用；只有用户明确要求从 0 到 1、冷启动、重开或重新打开时，才从头启动。
- 一旦进入小程序运行态验证，优先使用当前环境已配置的小程序本地验证能力；如果当前客户端没有相应工具，不要假定已经安装，也不要把缺少工具本身当成任务失败。未拿到本地运行态证据前，不要宣称“小程序已验证”。
- 用户明确要求 Computer Use 时优先使用 Computer Use，并尽量在 Codex-owned browser window 中操作；对提交、删除、发送、切换账号、退出登录、支付、关闭标签页等高风险网页动作先确认窗口归属。
- 写产品界面上用户能看到的文案时，先站在“正在使用这个界面的用户”视角：这句话要说明用户现在能做什么、会发生什么、为什么值得点、下一步怎么走；不要站在开发者、产品经理或运营分类视角描述“适合某类用户”“这个模块用于承载某能力”。除非这是面向开发者或专业技术人员的技术型产品，否则默认用普通人能看懂的语言写结果、状态、限制和行动。
- 产品界面文案要先做一次用户视角改写检查：坏例“适合想保留全部工具入口的用户”，改成“首页会显示所有工具入口，你可以直接选择需要的功能”；坏例“API 请求失败，错误码 500”，改成“暂时保存失败，请稍后再试”；坏例“专业版会启用高级 pipeline”，改成“打开更多编辑工具，方便继续细调”。如果确实是技术型产品，可以保留必要术语，但仍要写清用户动作、影响和修复路径，例如“Webhook 验证失败，请检查签名密钥和权限”。
- 修改用户可见文案前，先检查 `i18n`、`locales`、`translations`、`Localizable` 或其他语言资源；若项目已有多语言结构，用户可见文案要同步维护到所有已支持语言，并避免暴露 API、SDK、模型、数据库、缓存或错误码等实现细节。

## 写入纪律

- 只读命令优先：`status`、`next`、`validate`、`standards --verify`、`doctor`。
- 下一道门禁没看清之前，不要贸然执行写入命令。
- 面对规划、分析、审查类请求，不要运行 `openprd loop --run`、`openprd tasks --advance`、`openprd discovery --advance`、`openprd loop --finish --commit`、git commit 或 git push。
- 代码改动完成后，要回顾 `openprd dev-check` 输出；若出现需要关注的文件，直接复用 dev-check 生成的 **后续建议** 表格，并保留“关注程度”列里的完整风险标签，不要缩成纯 emoji。
- 代码改动完成后，要回顾自我成长项：已自动补齐的低风险工具识别项简短说明；仍待确认的偏好、项目规矩或 OpenPrd 默认行为再用 `openprd grow . --review` 集中呈现；若 `Stop` 提醒本轮有可沉淀的项目经验，结尾要先用人话说明“这次情况 / 计划保留的经验 / 以后怎么复用 / 只保留在当前项目里”，再问用户要不要保留。
- 代码改动完成后，要说明 `docs/basic/`、文件说明书和文件夹 README 是新增、更新还是有意不变。
- 用户要求生成图片、封面图、配图、海报、插画、图标、贴纸、头像、banner、主视觉/KV、运营图、效果图、视觉稿、mockup、先看样子或先确认设计方向时，最终回复应给出按生图路由选定的内置生图工具生成的图片结果（Codex=`imagegen`/Image 2，Cursor=`GenerateImage`；都不可用时按 `.openprd/harness/image-generation-preference.json` 已确认偏好，没有偏好先问用户并写回该文件）；只有实际发生生图工具调用后，才能汇报生图结果、失败或限流。生图工具是工具路径，不是审美豁免；最终回复要能说明候选图是否满足用途、受众、气质和记忆点。大界面改动进入实现前先按用户目标、信息架构变化、视觉决策成本和验证风险判断是否需要 3 方向横向效果图大图；需要时等待用户选择方向后再实现。如果是 logo、icon、avatar、badge 等开发素材且用户未明确要求 mockup 或场景化呈现，默认给出独立素材输出结果。进入实现阶段后，已有参考图才给出 `openprd visual-compare --reference/--actual` 生成的 JPG 路径；没有参考图时先判断新建界面还是修改既有界面：新建界面回到实现前 3 方向方案评审，修改既有界面给出 `openprd visual-compare --before/--after` 生成的 JPG 路径；局部细节重点则补 `openprd visual-compare --board <focus-board.json>`，并行实验则补 `openprd visual-compare --board <parallel-board.json>`；普通截图或 Computer/Browser/Playwright 实测截图作为证据时补 `openprd visual-compare --board <verification-board.json>`；同构列表、卡片、网格、表格或用户反馈没对齐时补 `openprd visual-compare --board <alignment-board.json>`，并分别说明容器轨道 spread 和标题/副标题/描述/标签/状态/价格/按钮/图标等内容槽位 spread 是否仍有偏差；单个素材、图标、头像、徽标、按钮图形或图片内部居中/视觉重心问题时补 `openprd visual-compare --board <centering-board.json>`，并说明主体外接框中心和视觉重心偏移。
- 如果开发素材走了绿幕抠图路径，最终回复要说明绿幕源图已保留、透明 PNG/WebP 已生成或接入；如果未执行后处理，不要声称已经得到透明素材。
- 如果本轮是卡片宽度、间距、留白、对齐、颜色、圆角、字号、按钮或图标等轻量 UI 可视优化，最终回复可以说明代码、构建或 dev-check 状态，但只有补齐 `visual-compare`、局部焦点证据板、截图实测证据板、对齐辅助线证据板或内部居中证据板，并确认审美意图和记忆点成立后，才能说视觉优化已完成。
- `freeze`、`handoff`、`change --apply`、`change --archive`、commit、push、release、publish 等高风险动作都要求前置门禁全绿。

## 修复路径

1. 运行 `openprd doctor .`。
2. 如果生成引导或 hooks 漂移，运行 `openprd update .`。
3. 运行 `openprd standards . --verify` 并修复文档标准。
4. 运行 `openprd quality . --verify` 并审阅 HTML 质量评估报告；若 `productionReady=false`，最终回复必须先区分 `taskReady` 与 `workspaceReady`，再列出缺证据或需关注的必需 EVO 门禁；如果只剩 `feature-coverage`，说明是任务账本或覆盖证据未收口，不要把本次功能说成失败。
5. 报告就绪前运行 `openprd validate .`。
