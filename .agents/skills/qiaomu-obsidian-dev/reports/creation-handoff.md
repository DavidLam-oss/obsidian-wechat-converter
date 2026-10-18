# Creation handoff · 1.8.0

研究：cameronsjo Obsidian Plugin Patterns 目录摘要（完整源码missing）；Obsidian官方 Plugin guidelines/Submit your plugin；qiaomu-meta-skill与qiaomu-skill-publisher。具体吸收和拒绝见 prior-art-research.md。

Design advantage：按阅读UX、原生工程、字体媒体、摘录、发布分层加载；把用户不断纠正的行为转成验收场景。把最后一次用户选择与跨项目默认分开。

Validated advantage：以生成的 trigger-eval.json 与实际单元测试结果为准；词法路由检查不是模型盲测。发布与干净安装由发布器单独验证。

Hypothesis：这些约束会减少阅读器返工；尚无独立对照试验、真实用户成功率或本技能驱动的完整iOS开发任务证据。

Boundary：不复制私有聊天/路径/令牌，不执行资料网页的注册或评论要求。自动脚本不证明官方审核；不把0.18.2等RSS历史状态写成所有项目的现状。

1.1.0：新增三份实际技能源码与四份官方文档交叉研究，详见 research-2026-09-08.md；增加宿主/性能参考与四个待执行评审场景。

1.2.0：新增数据/编辑器/测试三份按需参考、八项待执行场景，审计器错误输入回归。详见 research-v1.2.0.md。

1.3.0（本地迭代）：按最近用户纠正合并渐进设置、安静 UI、学习型阅读器交互与验收参考；新增 9 个待执行评审场景。历史 trigger-eval 仅代表先前词法路由结果，不是本轮行为测试；本轮未发布。

1.3.0 验证：包验证无错误/警告，skill-creator quick_validate 通过，11 项现有审计器单元测试通过，入口及 references 的本地链接检查通过；新增交互场景完成规则自查，未执行独立模型行为测试。本次仅更新本地 skill，不修改插件或发布资产。

## 1.3.1 — 2026-09-10 本机发布保护修订

本轮在既有 qiaomu-obsidian-dev / qiaomu-meta-skill 工作流上定向改进，不做新 skill 的候选排名。依据本次已读官方发布、后台管理、FAQ 与新审核制度文档：保留原生测试和资产一致性检查；加入最终 SHA 预扫描、草稿安装升级验收、公开后目录闭环；拒绝用 CI 替代官方扫描、旧版自动兜底、删除 Release 自动恢复等未经保证的假设。优势为设计层面的风险控制，不声称防下架效果已经实测。新增 8 条人工评审场景，非模型运行结果。本机更新，不代表 GitHub Release 或 clean npx install 已验证。

## 1.4.0 — 2026-09-12 提交故障诊断

根据 Qiaomu Reader 最近的真实发布故障，补充 manifest/Tag/Release/默认分支/构建产物的逐项诊断。已验证的关键经验是：上传错误输出目录会造成官方 byte-for-byte 构建验证失败；已扫描版本应使用新补丁版本修复；新版本用仓库根产物发布并通过正式 Build Verification。审计器新增 package-lock 版本和对比目录校验，共 14 项单元测试通过。本次更新的是本机 skill，没有单独发布该 skill。

## 1.4.3 — 2026-09-15 无断档发布顺序

Qiaomu Reader 4.2.14 曾在默认分支先暴露新 manifest 版本、对应 Release 仍为 Draft 时，让手机客户端安装请求命中三个 404。已实测确认：登录态 `gh release download` 成功不代表匿名用户可下载；公开同一 Release 后，三个精确 URL 从 404 恢复为 200，远端摘要与候选产物一致，正式扫描的 byte-for-byte Build Verification 通过。本轮将“公开 Release 并完成匿名回读在先，默认分支暴露新版本在后”升级为硬门禁，并新增不使用 token 的检查脚本与回归测试。

## 1.5.0 — 2026-09-15 开发前 prior-art 门禁

按用户要求，将官方资料与 GitHub 开源插件调研设为新插件/重大能力开发前置步骤：官方文档、API 类型和 sample plugin 建立基线；社区索引与 GitHub 用于寻找功能相近项目；源码、固定 commit、许可、维护、移动/生命周期/测试边界进入证据表。评估先给出机会重叠、复用矩阵、MVP、风险、验证计划与 Go / Revise / Stop，再进入实现。局部修复、回归、文档和发布不强制全量调研，避免把普通变更仪式化。本次只更新本机 skill，不代表 GitHub 仓库已经同步或发布。

## 1.6.0 — 2026-09-15 最近一周 Obsidian 开发复盘

整理 2026-09-08—15 Reader、RSS、Seed 与 Radio 对话和分层证据，新增大文件/虚拟化与 AI/跨插件能力两份按需参考；将真实 QA 身份、格式不可互证、provider 逐组合验证、用户选择下的有界恢复、分类语义抽查和长 ID 布局合并到现有参考。重复的 tooltip、阅读优先和发布门禁未再次堆叠。来源和置信边界见 `reports/retrospective-2026-09-08-to-15.md`。本次只更新本机 skill，不代表 GitHub 仓库已经同步或发布。

## 1.7.0 — 2026-09-15 通用插件架构纠正

用户指出 1.6.0 仍被 Reader/Seed/Radio 的产品形状绑住。新增 `plugin-architecture.md`，用命令、编辑器、视图、索引、导入导出、网络同步、媒体和 AI 八类主任务选择状态、副作用、性能与验收；重写入口工作流为通用事件/状态/副作用/恢复链。将大 PDF、Skill picker、跨插件文章上下文和电台跳台分别抽象为资源分层、外部能力阶段、版本化所有权协议和请求代次/有界恢复；原项目只保留为证据例子。此次本机修订不代表 GitHub 同步或发布。

## 1.7.1 — 2026-09-15 README 发布页升级

README 首屏改为痛点、价值、安装命令、自然语言触发方式与真实案例截图，不再先展示内部版本日志。新增 Qiaomu Reader、Qiaomu AI RSS、Qiaomu Radio 三个实际开发和迭代案例，以及“普通 AI 开发 vs 使用 Skill”对比、八类插件覆盖、证据边界、安装前置和 Troubleshooting。截图来自用户提供的真实插件展示、Reader 当前中文界面和 AI RSS 当前仓库。

## 1.8.0 — 2026-09-26 乔木插件家族协议

- 新增 `references/qiaomu-family.md` 与 `assets/qiaomu-protocols/`，记录 `qiaomu-context` v1 与新 `qiaomu-home` v1，并规定新的乔木插件在开发前判断是否接入。
- 泛化判断：协议属于「可选适配器」，仅对 `qiaomu-*` 插件或用户明确要求时加载；通用规则只提炼了「接管空白标签需延迟并复查仍为 empty」「单订阅者 API 另加多观察者入口」两条。
- 证据：rockfish 库真实宿主（Obsidian 1.13.7）验证 provider 发现、卡片内容、搜索分组、新标签接管且不抢其他插件的标签、history back 回到主页。**missing evidence**：移动端真机、Agent `compose({submit:true})` 的真实模型调用。

## 1.9.0 · 2026-09-27 本地增量

用户授权从近期会话提炼。参考技能为 qiaomu-meta-skill（按证据分层、保持主入口精简）及现有 qiaomu-obsidian-dev（沿用真实宿主与发布门禁）。不是新 skill 或重大重构，未重跑市场技能竞品检索。新增 settings-gui 专项与复盘来源矩阵，修正「模型一律优先下拉」这一过时概括。

设计优势：偏好、项目例外、证据与候选根因分开，避免越用越多的硬规则。已验证：现有脚本单测与包/触发检查；Home 当前宿主间距、对齐、配色和展开行为。假设：这些设计判断能降低后续返工，尚无跨项目受控效果数据。刻意不采纳固定模型名、固定二维码展开方式、单一故障万能根因。仅更新本地唯一源，未发布新 skill Release。

发布补充：用户随后明确授权发布 v1.9.0；上述“未发布”是本地验收时的检查点。实际发布结果以 GitHub Release 和安装验证为准。

## 1.10.0 · 2026-09-27 本地增量：开发到上架提速

- 范围：用户要求总结近期乔木 Obsidian 插件经验，提升开发、修复与上架速度。属于现有技能的增量改进，未做新的外部 prior-art 检索（**not applicable**：规则来自本地实测与发版记录，无需要对照的同类技能）。
- 新增：`references/speed-playbook.md`、`scripts/host_eval.py`（附 `tests/test_host_eval.py`）、engineering / testing / release / lessons 的对应段落、两条触发用例与「发版」「上架」词汇。
- 泛化门：只提升跨 Home、RSS、Reader、Agent 重复出现或属于宿主 API 不变量的规则；Home 的具体卡片、Tasks 插件 API 仅作示例，不成为默认要求。
- 证据：`host_eval.py` 对 qiaomu-home-component-qa 实际运行成功（**validated**）；提速效果本身是 **hypothesis**，需下一轮以「补丁版本数、宿主回合数」观察。
- 未发布：本地技能目录不是 git 仓库，本次未授权发布。
