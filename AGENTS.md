# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

## Language Preferences
- Detect the language of the user's prompt (English or Chinese). Always reply in the same language unless explicitly asked otherwise.
- When drafting replies or documentation intended for Chinese audiences, ensure natural, native-level phrasing.

## Project Summary
- This is an Obsidian plugin that converts Markdown notes into WeChat Official Account article HTML.
- The core user workflow is: open the converter panel, preview the rendered article live, copy rich HTML into the WeChat editor, and optionally sync directly to the WeChat draft box.
- The plugin is aimed at creators who publish from Obsidian to WeChat and care about fidelity for headings, code blocks, math, callouts, tables, local images, and article metadata.

## Commands
- **Install dependencies**: `npm install`
- **Generate embedded runtime bundles**: `npm run generate:embedded`
- **Check embedded runtime bundles are up to date**: `npm run check:embedded`
- **Build for production**: `npm run build`
- **Start development watcher**: `npm run dev`
- **Run unit tests**: `npm test`
- **Run coverage**: `npm run test:coverage`
- **Run fast Obsidian scan-risk guard**: `npm run scan:guard`
- **Run Obsidian scan readiness guard**: `npm run review:guard`
- **Check generated build artifacts**: `npm run check:build-artifacts`
- **Release dry run**: `npm run release:dryrun`
- **Release validation**: `npm run release:validate`

## Testing Expectations
- This project still relies on manual visual testing for end-to-end rendering quality and WeChat paste/sync behavior.
- Use [TEST.md](/Users/davidlin/Documents/Obsidian/MyVault/.obsidian/plugins/obsidian-wechat-converter/TEST.md) for general rendering checks.
- Use [TEST_MATH.md](/Users/davidlin/Documents/Obsidian/MyVault/.obsidian/plugins/obsidian-wechat-converter/TEST_MATH.md) when touching formula rendering or math upload behavior.
- Use [OBSIDIAN_SCAN_CHECKLIST.md](/Users/davidlin/Documents/Obsidian/MyVault/.obsidian/plugins/obsidian-wechat-converter/OBSIDIAN_SCAN_CHECKLIST.md) before merging feature branches or preparing a release candidate.
- The repository also has a substantial Vitest suite under [tests](/Users/davidlin/Documents/Obsidian/MyVault/.obsidian/plugins/obsidian-wechat-converter/tests). For logic changes, especially around rendering, sanitization, path resolution, sync flow, or error handling, add or update unit tests unless the change is purely cosmetic.

## Architecture & Structure
- **Entry source**: `input.js`
  It contains plugin lifecycle, view wiring, settings UI, preview panel logic, and top-level sync actions.
- **Generated runtime artifact**: `main.js`
  Do not hand-edit `main.js`; rebuild from source instead.
- **Markdown conversion core**: `converter.js`
  Handles markdown-it based conversion, HTML sanitization, callouts, image rendering, code block rendering, and WeChat-friendly output shaping.
- **Theme system**: `themes/apple-theme.js`
  There is one theme module with three built-in presets exposed in the UI:
  - `github` -> `简约`
  - `wechat` -> `经典`
  - `serif` -> `优雅`
- **Service layer**: `services/`
  The codebase has evolved beyond a single converter file. Important modules include:
  - `render-pipeline.js`: creates the render pipeline used by the view.
  - `dependency-loader.js`: loads embedded runtime dependencies.
  - `native-renderer.js`: native rendering path.
  - `obsidian-triplet-renderer.js` and `obsidian-triplet-serializer.js`: renderer/serializer helpers used by the newer pipeline.
  - `markdown-source.js`: resolves the active markdown source.
  - `path-utils.js`: vault/path helpers.
  - `wechat-media.js`: image and math asset processing for WeChat.
  - `wechat-html-cleaner.js`: HTML cleanup for draft sync.
  - `wechat-sync.js` and `sync-context.js`: draft sync orchestration and user-facing sync messaging.
- **Generated embedded dependency snapshot**: `services/generated-embedded-deps.js`
  This is generated. If you change embedded runtime sources such as `converter.js` or `themes/apple-theme.js`, regenerate it before building or testing.
- **Math bundle**: `lib/mathjax-plugin.js`
  Built separately via `esbuild.math.mjs` and loaded dynamically.

## Current Product Behavior To Keep In Mind
- Live preview is a first-class feature; the plugin is expected to feel close to WYSIWYG for WeChat publishing.
- The plugin supports copy-to-editor and direct sync to WeChat drafts.
- WeChat draft sync supports multiple accounts, frontmatter-aware cover/excerpt defaults, optional cleanup of a configured output directory after successful sync, and optional proxying through a Cloudflare Worker.
- Local image handling is important: wiki links, relative paths, absolute paths, GIF handling, avatar uploads, and cover selection all matter.
- Chinese punctuation normalization only affects rendered output, copy output, and sync output. It must not mutate the source Markdown note.
- The codebase has moved to a `native-only` rendering direction; be careful around old legacy/parity switches and prefer current pipeline behavior.

## Development Notes
- **Runtime environment**: Obsidian plugin running in Electron / Node-style CommonJS.
- **Languages in repo**: mostly JavaScript plus `.mjs` build scripts and test helpers.
- **External dependencies**: `obsidian`, `electron`, and CodeMirror-related APIs are provided by the Obsidian app/runtime.
- **Security-sensitive areas**:
  - HTML sanitization
  - link validation
  - proxy URL validation
  - file/path cleanup after sync
- **Performance-sensitive areas**:
  - preview refresh
  - image processing
  - math conversion
  - WeChat upload concurrency and retry behavior

## Best Practices & Lessons Learned

### 1. Build Artifacts
- `input.js` is the source of truth for the plugin entry; rebuild after changing it.
- `main.js` and `services/generated-embedded-deps.js` are generated artifacts and should stay in sync with source edits.
- If you touch runtime code that is embedded or eval-loaded, always consider whether `npm run generate:embedded` is required before testing.
- Do not run file-writing build/generate/release commands in parallel with `git status`, `git diff`, or staging. Wait for the writer to finish, then inspect the final tree; otherwise generated artifacts such as `main.js` can appear as transient mid-build changes.

### 2. WeChat Compatibility
- WeChat strips `<style>` tags and most class-based styling. Rendered article output must remain robust with inline styles and self-contained markup.
- Math support is compatibility-sensitive. Complex formulas may need SVG/PNG processing paths depending on the sync target.
- Non-math SVG content such as diagrams should not be accidentally recolored or mangled by math-specific cleanup.
- Keep an eye on WeChat API quota and media-limit errors. The circuit-breaker behavior is intentional and user-protective.

### 3. Dynamic Loading
- Heavy or embedded features are loaded indirectly. Avoid assumptions that typical browser globals behave exactly like a normal webpage environment.
- When editing eval-loaded/global-exported code, preserve safe global export patterns and re-entrancy protections.

### 4. UX Consistency
- Preserve the fast live-preview workflow.
- Prefer Obsidian-native controls and simple layout techniques over brittle CSS tricks.
- Keep copy/sync behavior aligned with preview behavior as much as possible.
- For multi-document or multi-account workflows, preserve existing state management patterns unless there is a clear bug.

### 5. Quality Bar
- Add tests for core logic changes, especially regex-heavy transformations, sanitizer changes, sync failure handling, path cleanup rules, or rendering edge cases.
- When changing output HTML, consider both automated tests and manual visual verification because small markup changes can regress WeChat compatibility.
- Before merging feature work that could affect Obsidian review results, run `npm run review:guard`.
- CI/CD must use the same `npm run review:guard` gatekeeper so local, PR, and release checks stay aligned.
- Avoid introducing new scan-triggering APIs: prefer DOM helpers over `innerHTML`, `setCssStyles(...)` over static `element.style.*`, Obsidian `Modal` over `confirm()`, and local parsing over `fetch(data:)`.
- Avoid production `globalThis`; use `window` or `services/dom-utils.js` active-window helpers. Timers should use `window.setTimeout()` / `window.clearTimeout()`, and dynamic browser APIs should not be returned as `.call()` / `.bind()` wrappers.
- Avoid adding stylesheet `!important`; prefer stronger selectors, CSS variables, or narrow rendered-output compatibility styles covered by tests.
- If a scan-sensitive API is intentionally required for compatibility, keep the usage narrow, document the reason inline, and add regression tests around the behavior.
- During feature development, use `npm run scan:guard` for quick feedback before running the full `npm run review:guard`.

### 6. Modular Architecture
- Adhere to the refactored modular architecture. Do not pile rendering rules or core logic inside the entry file `input.js`.
- Keep the entry file `input.js` lightweight, focused only on plugin lifecycle, view wiring, settings UI, and top-level sync actions.
- Place markdown-it rules and conversion core in `converter.js`.
- Place styling rules in `themes/apple-theme.js`.
- Place preprocessing, path resolution, and cleaner logic in their respective modules under `services/`.

## Release
发布新版本时，使用 `/project-release` skill 查看完整流程。

<!-- OPENPRD:AGENTS:START -->
## OpenPrd Harness

本项目由 OpenPrd 管理。Agent 应优先遵循 repo-local skills 和 hooks；`AGENTS.md` 只保留轻量入口合同。

### Scope

- skill 路由放在 `openprd-router`，命令清单放在 command catalog，强约束放在 hooks。
- `AGENTS.md` 只说明入口、默认行为和高风险门禁，不再承载静态长清单。

### Entry Points

- 先读 `skills/openprd-router/SKILL.md`；在生成的 Codex / Claude 环境里，优先读同名 `openprd-router` skill。
- 需要具体命令时，优先读 `.openprd/harness/command-catalog.md`，不要继续把命令清单膨胀回 `AGENTS.md`。
- `$openprd-shared`：共用语言、文档影响、敏感信息、浏览器安全、小程序验证、产品文案与 i18n 规则。
- `$openprd-requirement-intake`：需求入口分流、用户可见需求类型与内部 L0/L1/L2 路由码对照、PRD 场景视角选择，以及创业验证闭环。
- `$openprd-test-strategy`：测试策略分流、分层验证、任务级 evidence-plan、升级原因与豁免理由。
- `$openprd-harness`：主工作流、`run/loop`、review/change/tasks 与执行节奏。
- `$openprd-frontend-design`：前端设计框架、审美资产库、设计主题/骨架/组件/配方/模板，以及事实、素材、图片和方向前置门。
- `$openprd-benchmark-router`：外部技术、公开 GitHub 仓库、benchmark/对标/最佳实践路由。
- `$openprd-standards` / `$openprd-quality`：`docs/basic/`、就绪验证、EVO 门禁、知识沉淀。
- `$openprd-diagram-review` / `$openprd-discovery-loop`：可视评审与长时间只读挖掘。
- 当前对话环境与平台能力包：优先看 `.openprd/harness/runtime-environment.json`，协议和能力清单看 `.openprd/harness/install-manifest.json` 的 `runtimeDetection` / `platformCapabilityPacks`。

### 默认行为

1. 动手前先判断 executionMode。无人值守自动化（Codex automation、Claude Code headless、cron、scheduled、unattended task）默认不要注入 OpenPrd context，不阻断写入，不要求 `openprd dev-check` / `quality` / `doctor`；除非 automation prompt 明确写明“这是 OpenPrd 维护任务”“显式启用 OpenPrd / enable OpenPrd / openprd-maintenance”。
1a. 互动或显式启用 OpenPrd 的场景，再从 `.openprd/` 重建状态，并先运行 `openprd run . --context`；它是建议上下文，不是自动执行指令。
1a. 代码搜索默认从当前任务相关源码、测试和 change/task 文件起步；不要把 `.openprd/quality/reports/`、`.openprd/harness/` 或 `.openprd/learning/` 当源码目录做 repo-wide `rg`。质量报告只在需要审阅就绪证据时按最新报告路径显式读取。
2. 规划、分析、架构评审、“怎么改”或“会动哪些文件”类请求保持只读；只有用户明确要求实现、继续任务、深度调研、对标复刻或提交时才进入执行。
3. 先分流再执行：`openprd-requirement-intake` 按影响面、未知数、决策成本和验证成本判断需求类型，并保留内部路由码对照：直接处理=L0，现有功能优化=L1，新功能/新流程方案=L2。用户审查默认把路由码并进“需求类型：直接处理（L0）”这类标签里；只有内部排障确实受益时，才额外附“内部路由码”。直接处理类需求可直接处理并事后说明，不打开正式 PRD/review/change/tasks；现有功能优化先在对话内给 mini-plan 再执行，默认不生成正式 PRD/change/tasks；如果用户刚刚已经确认了 L1 mini-plan、范围边界或正式产品边界，后续承接要写成“已确认，我按这个继续”，不要用“确认，我们就按这个……”这类像再次索取确认的句子。只有新功能/新流程方案才先走 requirement intake、对话内 requirement 摘要确认，再 `review/change/tasks`，最后才实现。L2 的 requirement 摘要默认按“需求判断 / 需求理解 / 功能范围 / 技术方案”来写，其中“功能范围”和“技术方案”优先用 Markdown 表格，帮助用户一眼看清；`需求判断` 和 `需求理解` 先用 1 到 2 句轻量主句说清这次是什么、核心问题和第一版目标，边界、风险、异常例子和技术细节下沉到后面的分项或表格，不要把它们都塞进一整段长话里，也不要把某条示例文案写成固定模板。若当前仍在 0 到 1 探索、脑暴或值不值得做的判断，摘要里还要主动补上“验证与创业闭环”：第一批最容易触达的社区或种子用户、你为什么算这个社区里的自己人、当前替代方案和痛点证据、先怎么手工交付、手工作战卡怎么写、能不能先用 spreadsheet / 表单 / no-code 跑起来、如果必须开始做产品也只自动化最重复的一步并先压成 forms / lists / CRUD 骨架、第一版只做哪一件事、能不能压成周末级 MVP、第一批客户路径、从第一个客户开始怎么收费、客户 1 如何打平成本、有没有 10 个样本和更强付费信号、达到什么条件才允许产品化、增长阶段守什么纪律、这条路是否可逆、是否真在解决客户问题、以及是否符合团队价值观、是不是你愿意长期住进去的业务形态。L2 的首轮澄清只能承诺“我先整理需求摘要给你确认”，不能把 requirement 摘要确认、review 和实现压成一句“你回我一句我就开始实现”。如果 `openprd run . --context` 仍然建议 `clarify-user`，当前这轮回复的目标就只能是 `需求摘要` 或 `1 个最高价值澄清点`，不要写成“我先按默认方案实现”。如果用户的下一条回复只是承接上一轮 requirement 摘要的短跟进，而不是提出新范围、改目标或重新发起分析请求，就把它当成对上一轮摘要、默认方向或选项的继续确认，不要重新开一轮泛化 clarify；应直接按当前对话上下文把已确认事实用 canonical capture 路径、`user-confirmed` 来源写回，而不是继续写 `agent-inferred/project-derived` 的用户澄清字段。单纯的“请帮我实现/继续实现”只表示有执行意图，不表示可以跳过 requirement 摘要确认、`capture/classify/synthesize` 写入路径或 review；只有用户明确表示“不需要进行任何确认”时，才允许静默走完整 requirement write path。`review.html` 是稳定评审 artifact，不再默认等于唯一的人类停顿点；默认按 decision-points approval policy 执行，只有当前 lane 仍要求人类决策时才在 final answer 主体里停下请求确认；当 review 已确认且 tasks 已就绪但还需要执行授权时，先给执行确认清单再请用户确认。
4. change/tasks 就绪后，用 `openprd-test-strategy` 按风险选择单元、集成、端到端、人工、视觉、小程序、性能或安全验证组合，并在任务或报告中保留 evidence-plan；同时根据任务边界记录 execution strategy：小范围修正保持 `serial`，中等规模 L1/L2 可推荐 `parallel-workers`，高风险或大规模实现再升级到 `parallel-workers-isolated`；70/20/10 只作健康形状参考，不作硬门禁。
5. 纯图片、封面图、配图、海报、插画、图标、贴纸、mockup 或“先看样子”请求按生图路由选工具：先判断当前对话工具面，Codex 环境用原生 `imagegen`（Image 2），Cursor 环境用内置 `GenerateImage`，两者都是工具内免费能力；都不可用或无法判断时，先读 `.openprd/harness/image-generation-preference.json` 的用户已确认偏好，没有偏好就先问用户选哪种生图方式，并把答复以 `user-confirmed` 来源写回该文件作为下次默认；绝不擅自调用用户本地或自有付费生图 API。生图工具是工具路径，不是审美豁免，生成前先写清用途、受众、气质、约束和记忆点，并用 anti-slop 避免默认紫白/蓝紫渐变、通用字体、白底卡片堆叠和无语境装饰；其中 logo、icon、avatar、badge 等开发素材在用户未明确要求场景化展示时，默认按独立素材输出（standalone asset）生成：全画布单主体，不额外添加卡片、设备框或其他展示容器；只有实际发生生图工具调用后，才能汇报生图结果、失败或限流。生图结果先当候选效果图，不要默认登记到 `.openprd/harness/visual-reviews/`。Agent 要主动确认是否符合预期、是否纳入后续效果图/实现截图对比、以及是否按此继续实现；只有确认后，才把选定方向、整张图或其中子图整理成 reference-set 并进入实现。进入实现阶段时，已有确认参考图用 `openprd visual-compare --reference/--actual`；如果参考图是一张整板、网格图或多对象组合，先运行 `openprd visual-prepare --reference <效果图> --grid <列>x<行>` 或 `--boxes <plan.json>`，确认 contact sheet 后再逐项对比；没有参考图时先判断新建界面还是修改既有界面，新建界面先按用户目标、信息架构变化、视觉决策成本和验证风险完成 3 方向方案评审，修改既有界面用 `openprd visual-compare --before/--after`；局部细节重点则补 `openprd visual-compare --board <focus-board.json>`，多方向实验则补 `openprd visual-compare --board <parallel-board.json>`；普通截图、Computer/Browser/Playwright 实测截图要作为证据时补 `openprd visual-compare --board <verification-board.json>`；同构列表、卡片、网格、表格或用户反馈没对齐时补 `openprd visual-compare --board <alignment-board.json>`，并同时覆盖容器轨道与内部内容槽位轨道；单个 logo、icon、avatar、badge、按钮图形或图片内部居中/视觉重心/偏心问题补 `openprd visual-compare --board <centering-board.json>`，并同时覆盖画布中心、主体外接框中心和视觉重心偏移。visual evidence 同时检查气质、层级、字体/色彩/表面角色和记忆点，不只检查截图是否存在。用户后续如果说“跟效果图”“不一致”“好丑”“复刻”，不能只口头说对比过了，至少先产出一份视觉证据图。如果用户目标是把工作转成可学习、可复用、可回看、可教学或可沉淀的材料，先按期望产物是否需要章节结构、证据锚点、图文讲解、检索练习、工作示例或长期阅读体验来判断；需要时优先走 `openprd learn .` 生成学习包和阅读器，不要用关键词表触发；“仙侠风格的学习材料”这类短请求也按学习型交付物处理，风格只作为 `--genre` 题材参数。
5a. 对 logo、icon、avatar、badge、贴纸、空态插画、单物件 UI 位图等开发素材，如果最终要接入 UI 并需要透明背景，默认走“候选评审 -> 资产工程化 -> 接入验证”的图标资产链路：先基于用途、受众、气质、约束和记忆点生成 3 个差异足够大的独立素材候选方向，并保持纯 `#00ff00` 绿幕、无文字、无 UI 容器、主体居中且留足裁切边距；用户选定前不写入项目文件。用户选定后再定位源图或 contact sheet，保留绿幕源图，用 `remove_chroma_key.py` 抠成透明 PNG/WebP，按真实 UI 需要裁切居中并导出 384px 或多尺寸资产；接入时按首页卡片、工具格、吸顶栏、偏好预览等实际场景分别调显示比例，而不是只换图片路径。收口时同步写回 `.openprd/design/active/asset-spec.md` 和 `selected-direction.md`，说明选中的方向、资产路径、透明产物、接入位置和验证结果；最终回复必须区分绿幕源图、透明产物和是否已经接入。
5b. 卡片宽度、间距、留白、对齐、颜色、圆角、字号、按钮或图标等轻量 UI 可视优化，仍可按 L0/L1 小范围修正推进，不自动升级成大界面 3 方向方案评审；但它是用户可见变化，动手前要有一句审美意图和记忆点，收口必须补 `visual-compare` 修改前后图、局部焦点证据板、截图实测证据板、对齐辅助线证据板或内部居中证据板，并检查气质、层级、颜色、字号、间距和表面角色是否成立。只要界面里有同构列表、卡片、网格或表格，就把容器轨道以及标题、副标题、描述、标签、状态、价格、按钮、图标、操作区等相同文案类型/相同组件槽位的对齐当作默认验收项，不等用户先投诉；只量外框、列宽或行顶不算完整对齐验收。只要任务在判断单个素材/图标/头像/徽标/按钮图形的内部居中、偏心或视觉重心，就把 centering-board 当作默认验收项；单张原始截图或主观“看起来居中”不算完整居中验收。build、package、`openprd dev-check` 和单张原始截图不能替代视觉证据。`visual-compare` 每次都会返回 `chatEmbed` markdown；生成证据板后必须把这行 `![视觉证据: ...](路径)` 直接嵌入最终回复，让证据在对话流里可见，不要只报告文件路径；`openprd dev-check` 在触达界面文件且最近 24 小时没有证据板时也会输出视觉证据提醒，收口前按提醒补齐。
6. 界面、页面、视觉、样式、信息架构或前端体验任务进入实现前，先读取 `$openprd-frontend-design`，并用 `.openprd/design/active/` 补齐 `facts-sheet / asset-spec / image-preflight / direction-plan / selected-direction`；空白工作区优先从 `.openprd/design/templates/` 选最近模板。若用户已经给了效果图、设计稿、参考截图或其他明确参考图，先把它当成主参考源；只有现有 starter、theme、layout 足够接近时才复用，不接近就允许偏离默认组合，以参考图为准。若当前轮用户已经把页面主题、模块范围或“直接实现”的意图说清，优先运行 `openprd run . --context --message <用户原话>`。若页面主题和模块范围已经明确，优先运行 `openprd design-starter . --starter <starter-id> --out index.html --brief "<页面主题>" --sections "<模块1|模块2|模块3>"` 起第一版真实页面；只有这个页面本来就不依赖外部产品事实、品牌素材或真实图片时，才在 active design artifacts 写清无依赖并补 `--no-external-facts --no-brand-assets --no-real-images`；若题目更像旅游、导览、展览、博物馆、城市、自然观察或案例内容页，先不要带 `--no-real-images`，让 starter 先尝试补首批真实图片；若这类冷启动即使带 message 仍短暂返回 `clarify-user`，把它当成摘要级提醒，先用 3 到 5 行 mini-plan 收口，再继续。starter 落地后默认进入 `Patch Mode`，必须直接在生成的入口文件上补丁修改；即使结构要大改，也是在同一路径内覆盖，不做 delete-first，更不要删除 `index.html` 后另起新稿。如果确实要整页重写，先把完整新稿写到 sibling draft，例如 `index.next.html`，确认内容成形后再覆盖回 `index.html`，不要让正式入口出现空窗；starter 一落地后，只允许做一轮就地对焦：快速读一次生成的入口文件和必要的 active design artifacts；这轮对焦结束后，下一步就必须是真实写入口，不要再回头搜网页、翻 `docs/basic/` 或继续模板漫游；把最后一批必要的查事实、查图、读模板动作放在口头宣布之前做完；一旦已经说“开始覆盖入口文件”或“开始整页重写”，下一步必须出现真实写文件动作，而不是继续只读浏览、压图或停在口头承诺；必要时 hook 会把这类非写入动作挡回去；`Patch Mode` 完成不等于只补合同、只下载素材或只写计划；至少要把入口文件本体改完、主要占位清掉，并把已准备好的真实图片或参考约束真正落进页面；没有明确参考方向时，不要直接落回同一种安全极简解。
6a. 写产品界面上用户能看到的文案时，必须站在当前用户视角写：这句话要说明用户现在能做什么、会发生什么、为什么值得点、下一步怎么走。除非这是面向开发者或专业技术人员的技术型产品，否则默认用普通人能看懂的语言写结果、状态、限制和行动，不要暴露 API、SDK、模型、数据库、缓存、错误码或内部模块。正反例：不要写“适合想保留全部工具入口的用户”，改写成“首页会显示所有工具入口，你可以直接选择需要的功能”；不要写“API 请求失败，错误码 500”，改写成“暂时保存失败，请稍后再试”；技术型产品可以保留必要术语，但仍要写清用户动作、影响和修复路径。
6b. 开发新功能出现新的入口、按钮、tab、卡片、空态或工具格时，默认自动配图标，不等用户提出：先复用项目已有图标体系；项目没有时按图标最佳实践路由选型（UI 图标 Phosphor，落码 Lucide/Tabler/React Icons，AI 品牌 LobeHub Icons，技术栈 Tech Icons，功能图标/插画 iconfont），把图标名、来源、用途登记到 `.openprd/design/active/asset-spec.md` 的“功能图标”行再接入。只有语义确实不需要图标或用户明确说不要时才跳过，并在收口说明原因。
7. 用户给出会话 ID 并要求继续时，按工具无关的历史会话续接；不要要求工具专属 ID，也不要用当前 active change 或相似历史替代指定会话。
8. 单个 task 收尾时只运行本任务最小足够验证，并通过 `--evidence`、测试报告或任务 metadata 留下 task-scoped evidence；代码修改完成后、最终回复前，针对本轮实际 touched code files 运行 `openprd dev-check . <file...>`。阶段收口、全部实现完成、handoff/commit/release/publish 前，再运行 `openprd standards . --verify`、`openprd quality . --verify` 和 `openprd run . --verify`；L2 或跨页面实现的最终回复必须列出最新 HTML 质量报告和 task-scoped Markdown/HTML 测试报告路径。如果还没有 `.openprd/harness/test-reports/` 下的 Markdown / HTML 测试报告，就不要把状态表述成项目级已经闭环。
9. 微信小程序相关任务默认按“最小足够验证”执行：只有用户明确要求小程序实测、截图、抓日志/网络、复现问题，或当前改动必须依赖运行态证据时，才升级到本地小程序运行态验证；默认沿用当前小程序运行态或开发者工具会话连续验证，不要为了验证自动重开应用；只有用户明确要求从 0 到 1、冷启动或重开时，才从头启动。如果当前客户端没有相应工具，不要假定已经安装，也不要把缺少工具当成阻断。
10. `openprd init/setup/update/doctor` 记录的 `optionalCapabilities` 是非阻断式增强建议。当前任务明显受益但能力还未配置时，可在后续建议里说明它能帮什么、附官方文档 / GitHub 链接，并询问用户是否需要按当前客户端补配置；不要因为它未配置就阻断当前任务。
11. 判断当前用户正在和 Codex、Claude Code 还是 Cursor 对话时，先看 `.openprd/harness/runtime-environment.json` 的 hook/session evidence，再按 install manifest 里的 `platformCapabilityPacks` 启用平台专属能力。Codex 原生 Image 2、Computer Use、Codex-owned browser window、OpenPrd 对话协同画布和 Codex 当前线程桥接属于 surface-dependent 能力，只有当前工具面或 hook/session 证据明确支持时才使用；画布必须绑定当前 thread/session，无法自动识别时用 `openprd canvas . --thread <id> --thread-title <name>` 或 `--session <id> --session-title <name>` 显式隔离，标题只用于当前对话展示；当前线程桥接只在 Codex App 当前 thread binding 明确时使用，浏览器写入 handoff 后由 OpenPrd 服务端默认通过 Codex app-server `thread/resume -> turn/start` 提交到绑定线程，失败或关闭时才进入 `agent-foreground-relay` 兜底队列；不要仅凭 Codex CLI、`.codex/config.toml` 或 `CODEX_HOME` 推断可用。

### Hook-Enforced Gates

- automation-safe：识别到 Codex automation、Claude Code headless、cron、scheduled 或 unattended task 时，hook 默认不注入 OpenPrd context、不阻断写入、不要求 dev-check / quality / doctor；只有 OpenPrd 维护任务或显式启用 OpenPrd 时才恢复这些门禁。
- requirement：需求未完成 `clarify/review/change/tasks` 前阻断实现写入；tasks 就绪后，只有用户原始意图已明确要求实现，或后续在看过执行确认清单后明确发出执行指令时才放行。
- research：公开 GitHub 架构/对标先 DeepWiki；第三方技术用法、配置、限制、版本差异或迁移先查本地证据，不足时再按 `resolve_library_id -> query_docs` 使用 Context7。
- design：界面、页面、视觉和前端体验任务进入实现前，先读取 `$openprd-frontend-design`，并补齐 `.openprd/design/active/` 下的事实、素材、图片和方向合同。
- skill-visualization：修改 skill、`SKILL.md`、`AGENTS.md` 或相关 workflow 前，先输出彩色 Mermaid 方案并等待用户确认。
- autonomy-risk：即使已经授权实现，也默认阻断未经当前用户明确批准的云端热修复、生产远端写入、业务兜底、写死逻辑、客户端/服务端补业务数据或缓存补行。
- secrets / weapp / browser / copy：分别处理 `secrets-vault`、按需的小程序运行态验证、窗口归属与 i18n/普通用户文案提醒。
- 需要细节时，读 router 指向的 skill 和 command catalog，而不是继续扩写 `AGENTS.md`。

### High-Risk Gate

For interactive OpenPrd flows, before freeze, handoff, accepted spec apply/archive, commit, push, release, or publish, ensure `openprd standards . --verify`, `openprd quality . --verify`, `openprd run . --verify`, and `openprd doctor .` are healthy. Unattended automation uses its own runbook, logs, tests, publish checks, and notification contract unless it explicitly opts into OpenPrd.
If the quality report says `productionReady=false`, do not claim overall readiness. Reuse `openprd run . --verify` to separate current-task status from workspace-level debt, list the missing evidence or gates, and when only `feature-coverage` is pending describe it as task-ledger or evidence debt rather than a failed implementation.
The only baseline documentation path is `docs/basic/`.
<!-- OPENPRD:AGENTS:END -->
