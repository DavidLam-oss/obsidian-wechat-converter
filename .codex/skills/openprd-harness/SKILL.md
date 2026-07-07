---
name: openprd-harness
description: 驱动 OpenPrd 工作区完成 clarify、synthesize、diagram、freeze、handoff、change、tasks 和验证。
---

<!-- OPENPRD:GENERATED
adapter=codex
source=openprd-harness
version=0.1.19
checksum=54c523da4b1bb811
-->

# OpenPrd Harness

当用户要求产品规划、需求细化、实现准备或执行就绪时，使用这份 skill。

## 默认流程

1. 先判断当前 executionMode。Codex automation、Claude Code headless、cron、scheduled、unattended task 默认是无人值守自动化：不要运行 `openprd run . --context`，不要要求 `openprd dev-check` / `quality` / `doctor`，按该自动化自己的 runbook、日志、测试和通知合同收口。
1a. 只有 automation prompt 或环境明确写明“这是 OpenPrd 维护任务”“显式启用 OpenPrd / enable OpenPrd / openprd-maintenance”时，才在自动化里恢复 OpenPrd 工作流。
2. 互动场景先运行 `openprd run . --context`，获取 hook-stable 执行视图。
3. 先判断当前用户意图，再决定是否跟随建议。
- 会话 ID 续接：用户给出会话 ID 并要求继续时，把它当成工具无关的历史会话续接请求；先精确恢复该会话历史，不要把当前 active change、相似历史或当前 requirement gate 当成替代目标，也不要把它称为工具专属 ID。
4. 面对规划、分析、架构评审、“怎么改”或“会动哪些文件”类请求，保持只读并基于代码、文档和状态回答。
4a. 代码搜索先限定在当前任务相关源码、测试和 change/task 文件；不要 repo-wide 搜 `.openprd/quality/reports/`、`.openprd/harness/` 或 `.openprd/learning/`。质量报告只在需要审阅就绪证据时按最新报告路径显式读取，历史报告不能混进源码排查。
5. 需要完整工作流细节时，运行 `openprd status .` 和 `openprd next .`。
5a. `openprd init/setup/update/doctor` 可能会把 Context7、DeepWiki 这类非阻断式增强能力写进 `.openprd/harness/install-manifest.json` 的 `optionalCapabilities`。把它当成软建议：初始化、诊断和当前任务都不因它失败；只有当当前任务会明显受益时，才在后续建议里解释能力价值、附官方文档 / GitHub 链接，并视情况提出可代为补配置。
5b. `openprd run . --context` 会返回 `runtimeEnvironment`。先按 `.openprd/harness/runtime-environment.json` 和 manifest 的 `platformCapabilityPacks` 判断当前对话是在 Codex、Claude Code 还是 Cursor，再启用对应能力；Codex Image 2、Computer Use、Codex-owned browser window、`openprd canvas` 对话画布和 Codex Agent 前台线程接力都必须有当前 surface 或 thread/session 证据，不能只凭 Codex CLI 或配置文件存在来启用。
5. 涉及最佳实践、benchmark、对标、参考产品、prompt engineering、Agent harness、context engineering、图标资源、CLI 或 skill 体系设计时，先使用 `$openprd-benchmark-router`。
6. 先用 `$openprd-requirement-intake` 做需求类型语义分流：直接处理(L0)可直接处理并事后说明，不打开正式 PRD/review/change/tasks；现有功能优化(L1)给对话内 mini-plan 后执行，默认不生成正式 PRD/change/tasks；只有新功能/新流程方案(L2)在改代码前必须先走需求入口：`openprd clarify .` 会生成需求入口自省，并只在对话内输出澄清摘要或简短清单；正式 HTML 评审留给后续 review。若当前问题本质上还在判断值不值得做、先找谁验证、能不能先手工交付，就先补“创业验证透镜”，不要急着把方案写成既定需求。
6a. 任何界面、页面、视觉、样式或前端体验任务在进入实现前，都要额外读取 `$openprd-frontend-design`，并优先检查 `.openprd/design/active/` 下是否已经补齐 `facts-sheet / asset-spec / image-preflight / direction-plan / selected-direction`。
7. 事实缺失时，先用 `openprd clarify .` 生成需求入口自省，并在对话里先按“需求判断 / 需求理解 / 功能范围 / 技术方案”给 requirement 摘要；其中“功能范围”和“技术方案”优先用 Markdown 表格，分别写清 `功能模块 | 这次先做什么 | 这次先不做什么` 与 `技术部分 | 初步方案 | 主要负责什么`。`需求判断` 和 `需求理解` 先用 1 到 2 句轻量主句说清这次是什么、核心问题和第一版目标；边界、风险、异常例子和技术细节下沉到后续分项或表格，不要揉成一大段长话，也不要把某条示例文案写成固定模板。若当前更像 0 到 1 验证，摘要里还要主动抬出：第一批最容易触达的社区或种子用户、你为什么算这个社区里的自己人、当前替代方案和痛点证据、先怎么手工交付、手工作战卡怎么写、第一版只做哪一件事、能不能压成周末级 MVP、能不能先用 spreadsheet / 表单 / no-code 跑起来、第一批客户路径、从第一个客户开始怎么收费、客户 1 如何打平成本、有没有 10 个样本和更强付费信号、达到什么条件才允许产品化、增长阶段守什么纪律、这条路是否可逆、是否真在解决客户问题、是否符合团队价值观、是不是你愿意长期住进去的业务形态，以及最低成本先验证什么和验证阶段怎样先活下来。确认该 requirement 摘要后，再用 `openprd capture .` 写回已确认事实，并继续 classify/synthesize/review、生成或检查 change、拆任务。如果用户的下一条回复只是承接上一轮 requirement 摘要的短跟进，而不是提出新范围、改目标或重新发起分析请求，就把它当成对上一轮摘要、默认方向或选项的继续确认，不要重新开一轮泛化 clarify；应直接按当前对话上下文把已确认事实用 canonical capture 路径、`user-confirmed` 来源写回，而不是继续写 `agent-inferred/project-derived` 的用户澄清字段。`clarifyPresentation.mode` 为 `inline` 或 `inline-with-checklist`，直接在对话中先整理首轮项目画像：用户群体、产品形态、第一版切片、暂不处理、不能破坏和风险探针，再压缩成用户容易看懂的总分结构，不打开澄清 HTML。L2 的首轮澄清只能承诺“我先整理需求摘要给你确认，确认后再进入 PRD / review 流程”；不要写成“你回我一句我就开始实现”，也不要把 requirement 摘要确认、review 和实现合成一步。review 重点摘要胶囊应控制在 15 个字以内，作为扫读标签，不写成长句；对用户给稳定 artifact 路径，确认命令使用页面复制出的 `--version`、`--digest` 和 `--work-unit`，不要把可被其他对话覆盖的 active review 当成唯一确认入口，也不要把“可以开做”“继续实现”、单纯的“请帮我实现”，或单独一句“不要评审”当成 `review --mark confirmed` 或 requirement 写入路径的依据。生成 spec 和 tasks 时跟随用户当前主语言；无法判断时使用简体中文兜底。必要专有名词、品牌名、命令名、路径、字段名和 API 术语可以保留原文；如果只是纯内部措辞整理，可用 `openprd capture . --source agent-normalized` 写回，这类非语义规范化不应重开用户 review。默认 approval policy 是 decision-points：需要时保留稳定 `review.html`，但只有用户明确表示不需要进行任何确认时，才允许跳过 requirement 摘要确认并按当前稳定 artifact 的精确 `version + digest + work-unit` 静默记录 review；单纯的“请帮我实现/继续实现”不触发这个豁免。若用户刚刚已经确认了现有功能优化（L1）的 mini-plan、范围边界或正式产品边界，后续承接要写成“已确认，我按这个继续”，不要写成“确认，我们就按这个……”这类像再次索取确认的句子。若用户原始意图已明确要求实现，则在当前 approval policy 满足且 tasks 就绪后直接进入执行；否则先输出执行确认清单，列出本轮目标、将执行内容、不做事项、验证方式和已知风险，再请求明确执行授权，不能只要求用户回复一句确认。
8. 评审页里的需求关系图、需求流程图和重点摘要不要靠 HTML 截断；`openprd synthesize` 生成版本快照后，不要直接让用户确认 review。必须先用 `openprd review-presentation . --template` 查看展示文案契约，让 Agent 按 reviewPresentation 写短文案，再用 `openprd review-presentation . --presentation <json> --write --fail-on-violation` 校验并写回；脚本会在通过后写入校验元信息并重渲染可确认 review.html。超限时按脚本返回的 jsonPath 和字数限制重新提炼，不手工改快照、不裁剪原文。
8a. 界面、页面、视觉、样式或前端体验需求要额外判断 UI 影响面：若会明显改变信息架构、核心布局、主视觉、关键路径、组件层级/密度，或用户需要先选设计方向，先做“大界面改动视觉方案评审”。在 PRD 定稿或实现开工前，已有界面时用 Codex Computer Use 截取产品内对应功能当前界面，冷启动没有现有界面时基于已确认 PRD、用户群体、第一版切片和视觉目标生成设计 brief；brief 必须写清用途、受众、气质端点、约束和记忆点；再按生图路由调用内置生图工具（Codex=`imagegen`/Image 2，Cursor=`GenerateImage`）生成至少 3 个不同设计思想方向，横向拼接为一张左上角标注 1/2/3 的大图作为候选效果图展示。主动确认是否符合预期、是否纳入后续效果图/实现截图对比、以及是否按此继续实现；只有确认后才把选定方向、整张图或其中子图整理到 `.openprd/harness/visual-reviews/`。
8b. 3 个方向不能只是同一种安全解的轻微变化。至少要在 `.openprd/design/active/direction-plan.md` 里区分不同生成逻辑、适用场景、审美主张、记忆点和主要风险；没有品牌或参考图依据时，用 anti-slop 排除默认紫白/蓝紫渐变、通用字体、白底卡片堆叠和无语境装饰；一旦用户确认方向，先在 `.openprd/design/active/selected-direction.md` 锁定选中的 lens、theme、layout、组件、审美主张和记忆点，再进入编码。
9. 对外说明默认用业务和产品语言，先给结论和下一步；涉及第三方 API、模型、云服务或付费工具时，用表格比较多家方案的效果、价格、接入成本、限制、风险和推荐理由，默认选择性价比最优；当用户的问题包含多个对象、方案、文件、场景、风险、验证项、素材或任务，并且需要同时呈现状态、证据、影响、动作或推荐时，主动使用 Markdown 表格，单一结论、代码示例、命令示例和叙事型说明不要强行表格化。
10. 当 PRD 需要进入实现准备时，再运行 `openprd change . --generate --change <id>`。
11. change/tasks 就绪后，用 `$openprd-test-strategy` 为每个任务确认 test-layer、test-size、test-scope、evidence-plan、升级原因或豁免原因；小改动从单测开始，触达契约、用户主路径、视觉、小程序、性能、安全或成本风险时升级验证层级。并且同步按 execution strategy 标注 `serial / parallel-workers / parallel-workers-isolated`、`write-scope`、`owner-role`、`local-verify` 和 `integration-owner`，让主 Agent 可以做 worker 分片和最终审查。
12. 长程实现使用 `openprd loop . --plan --change <id>`，并且只有用户明确要求开发、继续任务、深度调研、对标复刻或 commit 时才执行单任务 fresh session。中等规模 L1/L2 任务可先用 `parallel-workers` 让主 Agent 分配多个 worker shard；达到长程阈值后再升级到隔离 loop 会话。
13. 代码修改完成后、最终回复前，针对本轮实际 touched code files 运行 `openprd dev-check . <file...>` 或 `node scripts/openprd-dev-check.mjs . <file...>` 回顾行数状态：700 行以内正常，701-1500 行需注意，超过 1500 行警告。自动优化默认开启：命中需要关注的文件时，先在本轮直接完成高内聚低耦合拆分（不丢任何功能、行为不变、拆完重跑测试与 dev-check），最终回复以 **OpenPRD 自动优化报告** 为标题复用 dev-check 生成的 Markdown 表格（列：影响对象、问题级别、源文件规模、优化原因、本次处理结果、后续建议），并附一句开关确认：“如果下次不需要自动优化代码结构，回复关闭自动优化即可”；用户确认关闭后运行 `openprd dev-check . --auto-refactor off`，之后转为 **后续建议** 推荐模式（列名回到关注程度、规模信号、预警原因）。窄 bugfix 或小修没有新增职责时可不强制拆，但要在表格里说明本次处理结果。不要把“问题级别／关注程度”列改写成纯 emoji，必须保留例如 `🟠 中风险｜建议优先关注` 这类完整标签；如果你改写了表格文案，先用 `node scripts/dev-check-wrapup-copy.mjs --validate` 校验每格不超过 20 字；若报错，按提示缩短后重试。
14. 如果执行中发现新代码后缀、豁免路径、命令别名、项目约定或用户偏好，不要中途打断任务。代码扩展识别这类白名单工具补全会自动应用并记录；用户偏好、项目协作规矩和 OpenPrd 默认行为形成 growth candidate，收工时用 `openprd grow . --review` 集中确认。
15. 维护 OpenPrd 本身时，只要新增或修改配置类能力（阈值、规则、识别、豁免、命令别名、环境差异、用户偏好或策略开关），默认先做 grow-aware 自检：高置信应可成长时直接纳入 `openprd grow` 体系；不确定时主动询问用户是否做成可成长配置。
16. 实现过程中，每次新增或修改文件都做文档影响检查，补齐缺失的 `docs/basic/`、文件说明书和文件夹 README，并更新受影响文档；涉及后端、脚本、Agent、工具链、服务或数据处理变更时，把 CLI 与 API 视为同级接入面：同步检查命令入口、参数、输出契约、`help`、`doctor`、`dry-run`、`status` 与接口协议、返回结构、身份边界是否受影响，并更新 `docs/basic/backend-structure.md` 或明确写不适用原因。
16a. 如果这轮实现补充了新的前端设计主题、布局骨架、组件 recipe 或 anti-slop 规则，同步更新 `.openprd/design/` 与 `docs/basic/frontend-guidelines.md`，不要只留在代码里。
17. 用户要求生成图片、封面图、配图、海报、插画、图标、贴纸、头像、banner、主视觉/KV、运营图、效果图、视觉稿、mockup、先看样子或先确认设计方向时，先按生图路由选工具：Codex 环境用原生 `imagegen`（Image 2），Cursor 环境用内置 `GenerateImage`，两者都是对话工具内免费能力；都不可用或无法判断时，先读 `.openprd/harness/image-generation-preference.json` 的用户已确认偏好，没有偏好就先问用户选哪种生图方式并把答复以 `user-confirmed` 来源写回该文件作为下次默认；绝不擅自调用用户本地或自有付费生图 API。生图工具是工具路径，不是审美豁免。生成前先写清用途、受众、气质、约束和记忆点，并用 anti-slop 避免默认紫白/蓝紫渐变、通用字体、白底卡片堆叠和无语境装饰。对 logo、icon、avatar、badge 等开发素材，如果用户未明确要求 mockup、场景图、设备框、卡片承载、名片/包装展示或参考界面复刻，默认按独立素材输出（standalone asset）处理：使用全画布单主体，不额外添加 UI frame、卡片、设备壳、名片、桌面陈列、手持实拍或其他展示容器。只有当用户明确要求 mockup、场景化效果图、容器化呈现，或参考图本身包含这些结构时，才生成对应容器或场景；除非用户明确指定 HTML、SVG、CSS、Canvas、代码稿或可编辑矢量/source artifact，不要改用临时 HTML/SVG/CSS 再截图。只有实际发生生图工具调用后，才能汇报生图结果、失败或限流。OpenPrd 的 `review.html` 只用于需求评审，不能替代图片或效果图生成。若用户目标是把本次工作转成可学习、可复用、可回看或可教学的材料，先按产物形态判断是否需要 `openprd learn .` 的学习包和阅读器；不要用关键词表触发，普通 Markdown 只能作为辅助讲义。“请生成一份仙侠风格的学习材料”这类短请求也按学习型交付物处理，仙侠等风格是题材参数。
17a. 对 logo、icon、avatar、badge、贴纸、空态插画、单物件 UI 位图等开发素材，如果最终要接入 UI 并需要透明背景，默认走“候选评审 -> 资产工程化 -> 接入验证”的图标资产链路：先基于用途、受众、气质、约束和记忆点生成 3 个差异足够大的独立素材候选方向，并保持纯 `#00ff00` 绿幕、无文字、无 UI 容器、主体居中且留足裁切边距；用户选定前不写入项目文件。用户选定后再定位源图或 contact sheet，保留绿幕源图，用 `remove_chroma_key.py` 抠成透明 PNG/WebP，按真实 UI 需要裁切居中并导出 384px 或多尺寸资产；接入时按首页卡片、工具格、吸顶栏、偏好预览等实际场景分别调显示比例，而不是只换图片路径。收口时同步写回 `.openprd/design/active/asset-spec.md` 和 `selected-direction.md`，说明选中的方向、资产路径、透明产物、接入位置和验证结果；最终回复必须区分绿幕源图、透明产物和是否已经接入。
18. 用户要求界面更好看、更稳定、有一致审美、能复用视觉资产或内置模板时，先路由到 `$openprd-frontend-design`。
18. 大界面改动进入实现前，先把 3 方向效果图当候选效果图展示给用户，并主动确认是否符合预期、是否纳入后续效果图/实现截图对比、以及是否按此继续实现；只有确认后才把选定方向、整张图或其中子图整理成 reference-set 并写入 `.openprd/harness/visual-reviews/`。冷启动没有现有界面、新建首屏、首页、控制台或核心页面时，即使没有修改前截图，也要基于 PRD、用户画像、用途、气质和记忆点先出 3 个方向。进入实现后，如果已经有确认参考图、设计稿、图片资产或用户给图，阶段性完成后先截实现图，再运行 `openprd visual-compare . --reference <效果图> --actual <实现截图> --locale <zh-CN|en>`。如果一张参考图里包含多个子图、网格或对象，先运行 `openprd visual-prepare` 生成 reference-set、contact sheet 和模板，再逐项对比。如果没有明确参考图，先判断新建界面还是修改既有界面：新建界面先完成 3 方向方案评审，修改既有界面动手前先截修改前截图，完成后用同一入口、视口、账号和数据状态截修改后截图，再运行 `openprd visual-compare . --before <修改前截图> --after <修改后截图> --locale <zh-CN|en>`。如果重点在局部变化，或局部细节需要放到同一张证据板里审阅，默认再补一份 `openprd visual-compare . --board <focus-board.json> --locale <zh-CN|en>` 的局部焦点证据板，把局部变化组合到同一张证据板里统一验收；如果普通截图、Computer/Browser/Playwright 实测截图要作为证据，默认补 `openprd visual-compare . --board <verification-board.json> --locale <zh-CN|en>` 的截图实测证据板；如果界面包含同构列表、卡片、网格或表格，默认补 `openprd visual-compare . --board <alignment-board.json> --locale <zh-CN|en>` 的对齐辅助线证据板，且同一张板里要同时覆盖容器轨道和内部内容槽位轨道；如果单个 logo、icon、avatar、badge、按钮图形或图片内部需要居中判定、视觉重心评估或用户反馈偏心，默认补 `openprd visual-compare . --board <centering-board.json> --locale <zh-CN|en>` 的内部居中证据板，且同一张板里要显示红色画布中心、绿色主体外接框和黄色视觉重心。默认输出 JPG 到 `.openprd/harness/visual-reviews/`；查看合成图后继续复核，直到预期变化出现，且气质、层级、字体/色彩/表面角色、记忆点和未改区域都没有明显漂移。用户后续如果说“跟效果图”“不一致”“好丑”“复刻”，不能只口头说对比过了，至少产出一份视觉证据图。
18a. 卡片宽度、间距、留白、对齐、颜色、圆角、字号、按钮或图标等轻量 UI 可视优化，仍可按 L0/L1 小范围修正推进，不自动升级成大界面 3 方向方案评审；但动手前要有一句审美意图和记忆点，收口时必须有 `visual-compare` 修改前后图、局部焦点证据板、截图实测证据板、对齐辅助线证据板或内部居中证据板，并检查气质、层级、颜色、字号、间距和表面角色是否成立。只要界面里有同构列表、卡片、网格或表格，就把容器轨道以及标题、副标题、描述、标签、状态、价格、按钮、图标、操作区等相同文案类型/相同组件槽位的对齐当作默认验收项，不等用户先投诉；只量外框、列宽或行顶不算完整对齐验收。只要任务在判断单个素材/图标/头像/徽标/按钮图形的内部居中、偏心或视觉重心，就把 centering-board 当作默认验收项；单张原始截图或主观“看起来居中”不算完整居中验收。build、package、dev-check 和单张原始截图不能替代。
19. 声称单个 task 完成前，运行本任务 verify/dev-check/必要界面验证，并通过 `--evidence`、测试报告或任务 metadata 留下 task-scoped evidence；不要把全局 `openprd run . --verify` 当作 per-task 默认。
20. 阶段收口、全部实现完成、handoff/commit/release/publish 前，运行 `openprd standards . --verify`、`openprd quality . --verify` 和 `openprd run . --verify`，把 HTML 质量评估报告当作整体 EVO 门禁、日志、业务成本与滥用护栏、测试策略矩阵、冒烟覆盖、性能、极端场景和项目知识的评审产物；L2 或跨页面实现的最终回复必须列出最新 HTML 质量报告和 task-scoped Markdown/HTML 测试报告路径。最终回复优先复用 `run . --verify` 的 `taskReady/workspaceReady` 拆分，不要把任务通过和工作区欠账混成一句泛化尾巴。
21. `AGENTS.md` 只保留轻量合同；入口路由看 `$openprd-router`，具体命令速查看 `.openprd/harness/command-catalog.md`，更细的工作流步骤、路由边界和 hook 门禁以这份 skill、`$openprd-shared`、`$openprd-test-strategy` 和 `$openprd-benchmark-router` 为准。
22. hook 会强制阻断几类场景：需求入口未完成就写实现、外部证据不足就直接改第三方集成、skill/AGENTS 变更未先可视化确认、敏感信息场景下直接读原始 vault 文件，以及未经当前用户明确批准的云端热修复、生产远端写入、业务兜底、写死逻辑或缓存补行。
23. 即使用户已经授权实现，也不自动授权云端热修复、生产远端写入、客户端/服务端补业务数据、接口临时插入业务行、缓存补行、硬编码或写死逻辑。发现这类路径时先停下，说明为什么标准源码/迁移/配置路径不够、影响范围、回滚方式、本地同步计划和验证方式；只有用户明确说允许热修复、允许临时兜底或允许写死后才执行。

## 门禁协议

- 互动场景不要跳过 `openprd run . --context`；它是最适合 hooks 的控制面。无人值守自动化例外：automation-safe mode 下不要注入 OpenPrd context，也不要用 OpenPrd 门禁阻断该任务。
- 不要把 `run --context` 里的建议当成直接用户命令。
- 面对“看看、规划、梳理、分析、评估、怎么改、预计动哪些文件、review、explain”等只读意图，不运行 OpenPrd 写入命令。
- 现有项目需求仍模糊时，优先 discovery，再考虑 synthesize。
- 进入定稿或交接前，运行 `openprd run . --verify` 并确认 review blocker 已关闭。
- 声称实现就绪前，审阅最新 `.openprd/quality/reports/*.html` HTML 质量评估报告；若 `taskReady=true` 且 `workspaceReady=false`，先明确写“当前任务通过，工作区待关注”，再列出缺证据或待关注门禁；如果只剩 `feature-coverage`，说明是任务账本或覆盖证据未收口，不要把本次功能表述成失败。
- accepted spec 推进前，先运行 `openprd change . --validate --change <id>`。

## hook 驱动循环

- 把 `.openprd/harness/run-state.json` 和 `iterations.jsonl` 当成持久循环状态。
- 默认 lite hooks 不记录每一轮工具细节，但会在明确 OpenPrd / 深度工作提示词和产品、模块、流程需求下注入上下文；复杂或模糊需求提示先做三轮 Requirement Intake Reflection，轻量写入门禁会阻断过早改代码；本轮准备结束时再通过 `Stop` 做一次轻量项目经验回顾，并要求 Agent 先用人话明确“这条经验只会保留在当前项目里”，再向用户确认是否保留。
- 只有项目确实需要完整遥测时才使用 `--hook-profile full`。
- 上下文注入后，hooks 会从 OpenPrd 状态里推荐下一项 task、discovery 或 workflow 动作。
- 门禁失败时，任务或覆盖项保持未完成状态，让下一轮继续重试。
- 可以把跨任务可复用经验记录到 `.openprd/harness/learnings.md`、本地 `AGENTS.md` 或 `docs/basic/`。

## 长程实现循环

- 运行 `openprd loop . --init`，再运行 `openprd loop . --plan --change <id>` 生成 `.openprd/harness/feature-list.json`。
- 用 `openprd loop . --next` 找到下一个依赖已满足的任务。
- 用 `openprd loop . --run --agent codex --dry-run` 或 `openprd loop . --run --agent claude --dry-run` 生成单任务 prompt 和启动命令。
- 只有当前用户消息明确要求执行开发、继续任务或深度调研时，才运行 `openprd loop . --run`。单纯的规划问题不构成执行授权。
- 每个 loop 任务对应一个全新 agent 会话边界，不要在同一会话里继续下一项任务。
- 只有在任务 verify 命令和 task-scoped evidence 通过后，才用 `openprd loop . --finish --item <task-id> --evidence <path-or-summary>` 收尾；如果用户明确要求 commit，再先通过高风险最终门禁。
- 前端界面任务里，Codex desktop 优先用 Computer Use；Codex CLI 和 Claude Code 优先用 Playwright、MCP 浏览器自动化或项目现有 e2e 工具。大界面改动进入实现前，先按用户目标、信息架构变化、视觉决策成本和验证风险判断方案评审形态：已有界面时 Codex desktop 必须优先用 Computer Use 获取产品内当前功能截图；冷启动没有现有界面时，基于已确认 PRD、用户群体、第一版切片和视觉目标生成设计 brief。
- 用户只是要求生成图片、封面图、配图、海报、插画、图标、贴纸、头像、banner、主视觉/KV、运营图、效果图、视觉稿、mockup 或先看样子时，默认按生图路由调用内置生图工具（Codex=`imagegen`/Image 2，Cursor=`GenerateImage`；都不可用时按 `.openprd/harness/image-generation-preference.json` 已确认偏好，没有偏好先问用户并写回该文件）生成图片；生图工具是工具路径，不是审美豁免，生成前先写清用途、受众、气质、约束和记忆点，并用 anti-slop 避免默认紫白/蓝紫渐变、通用字体、白底卡片堆叠和无语境装饰；对 logo、icon、avatar、badge 等开发素材，如果用户未明确要求 mockup、场景图、设备框、卡片承载、名片/包装展示或参考界面复刻，默认按独立素材输出（standalone asset）处理：使用全画布单主体，不额外添加 UI frame、卡片、设备壳、名片、桌面陈列、手持实拍或其他展示容器。只有当用户明确要求 mockup、场景化效果图、容器化呈现，或参考图本身包含这些结构时，才生成对应容器或场景；除非用户明确指定 HTML/SVG/CSS/Canvas/代码稿，不要生成临时 HTML 再截图；未调用生图工具前，不要声称生图已完成、失败或限流；绝不擅自调用用户本地或自有付费生图 API。
- 对 logo、icon、avatar、badge、贴纸、空态插画、单物件 UI 位图等开发素材，如果最终要接入 UI 并需要透明背景，默认走“候选评审 -> 资产工程化 -> 接入验证”的图标资产链路：先基于用途、受众、气质、约束和记忆点生成 3 个差异足够大的独立素材候选方向，并保持纯 `#00ff00` 绿幕、无文字、无 UI 容器、主体居中且留足裁切边距；用户选定前不写入项目文件。用户选定后再定位源图或 contact sheet，保留绿幕源图，用 `remove_chroma_key.py` 抠成透明 PNG/WebP，按真实 UI 需要裁切居中并导出 384px 或多尺寸资产；接入时按首页卡片、工具格、吸顶栏、偏好预览等实际场景分别调显示比例，而不是只换图片路径。收口时同步写回 `.openprd/design/active/asset-spec.md` 和 `selected-direction.md`，说明选中的方向、资产路径、透明产物、接入位置和验证结果；最终回复必须区分绿幕源图、透明产物和是否已经接入。
- 如果场景判断属于大界面改动，已有界面时基于产品截图生成至少 3 个设计方向；冷启动没有现有界面时基于已确认 PRD、用户群体、第一版切片、视觉目标、气质端点和记忆点生成至少 3 个设计方向；再横向拼接成带 1/2/3 序号的大图作为候选效果图给用户确认，并主动确认是否符合预期、是否纳入后续效果图/实现截图对比、以及是否按此继续实现。只有确认后才把选定方向、整张图或其中子图整理到 `.openprd/harness/visual-reviews/`。如果已有确认参考效果图、图片资产或用户给图并进入实现阶段，阶段性完成后必须生成实现截图，并用 `openprd visual-compare . --reference <效果图> --actual <实现截图> --locale <zh-CN|en>` 输出 JPG 视觉对比图；如果参考图里有多个子图、网格或对象，先运行 `openprd visual-prepare` 生成 reference-set、contact sheet 和模板，再逐项对比；如果没有明确参考图，先判断新建界面还是修改既有界面：新建界面先完成 3 方向方案评审，修改既有界面动手前先截修改前截图，完成后截修改后截图，并用 `openprd visual-compare . --before <修改前截图> --after <修改后截图> --locale <zh-CN|en>` 输出 JPG 自检图。普通截图或 Computer/Browser/Playwright 实测截图也必须拼成 `verification-board` 截图实测证据板后才能作为视觉收口证据；同构列表、卡片、网格、表格必须拼成 `alignment-board` 对齐辅助线证据板后才能声明相同槽位已对齐，且同一张板要同时覆盖容器轨道和标题/副标题/描述/标签/状态/价格/按钮/图标等内部内容槽位；单个素材/图标/头像/徽标/按钮图形/图片内部居中或视觉重心判断必须拼成 `centering-board` 内部居中证据板后才能声明居中完成，且同一张板要同时展示画布中心、主体外接框和视觉重心偏移。未查看对比图，或对比图仍有结构、气质、层级、字体/色彩/表面角色、记忆点差异/漂移时，不要声称界面视觉完成；如果用户后续说“跟效果图”“不一致”“好丑”“复刻”，至少先产出一份视觉证据图。
- `openprd loop . --finish` 会写入 `.openprd/harness/test-reports/<task-id>.md` 和 `.openprd/harness/test-reports/<task-id>.html`；把这两份结构化测试报告和任务改动一起提交。
- 让 `.openprd/harness/feature-list.json`、`progress.md`、`agent-sessions.jsonl`、`loop-state.json`、`loop-prompts/` 和 `test-reports/` 成为持久状态。

## 失败处理

- 命令失败后不要凭直觉继续。
- 重新运行 `openprd run . --context`、`openprd doctor .`，并按输出里的修复命令处理。
- 如果失败假设影响产品范围，把它保留在 `.openprd/engagements/active/open-questions.md`。

## 历史项目

- 批量处理旧项目之前，先用 `openprd fleet <root> --dry-run` 审计。
- 已有历史项目要先回填全局名册时，用 `openprd fleet <root> --sync-registry` 把已初始化的 `.openprd/` 工作区写回 `~/.openprd/registry/workspaces.jsonl`。
- 用 `openprd fleet <root> --backfill-work-units` 为已有 PRD 版本补 work unit、digest 和稳定评审页。
- 用 `openprd fleet <root> --update-openprd` 刷新已有 `.openprd/` 的项目；如果历史项目只剩根目录 `openprd/changes|specs|archive/changes` 工作产物，也会识别为 OpenPrd 工作区并迁移到 `.openprd/`，同时补齐历史 work unit 绑定。
- 除非用户明确要求 OpenPrd 接管 agent-only 或 plain 项目，否则不要使用 `--setup-missing`。
