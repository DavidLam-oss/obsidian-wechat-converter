# OpenPrd Benchmark Registry

## 规则

- 项目级 approved benchmark 优先于 OpenPrd 内置 Source Map。
- `inbox/` 里的 candidate 只表示待确认线索，不表示长期最佳实践。
- 被采纳信源先累计证据，达到阈值后只推荐 approve，不自动晋级。
- 每次只挑 1-3 个高相关来源；来源目录不是事实来源。

## Approved Sources

### slavingia/skills `github-com-slavingia-skills`

- 状态: approved
- 来源类型: github
- 场景: skill-design
- 触发: 设计 skill 触发、metadata、安装方式、自动识别或项目级覆盖规则
- 不适用: 普通 PRD / 产品流程设计；与 CLI 无关的一次性 UI 视觉问题；单次脚本报错或纯环境权限问题
- 研究方式: deepwiki_then_github
- 来源: https://github.com/slavingia/skills
- 规范化信源: github.com/slavingia/skills
- 最近 7 天采纳: 2
- 累计采纳: 2
- 最近采纳时间: 2026-06-09 12:58:27
- 备注: DeepWiki read_wiki_structure + ask_question showed a reusable community -> workaround -> manual-first -> commitment -> productize -> default-alive framework for L2 requirement validation and brainstorm.
- 价值: DeepWiki read_wiki_structure + ask_question showed a reusable community -> workaround -> manual-first -> commitment -> productize -> default-alive framework for L2 requirement validation and brainstorm.

### milvus.io/ai-code-review-gets-better-when-models-debate-claude-vs-gemini-vs-codex-vs-qwen-vs-minimax.md `milvus-io-ai-code-review-gets-better-when-models-debate-claude-vs-gemini-vs-code`

- 状态: approved
- 来源类型: engineering-article
- 场景: agent-harness, pr-review-harness
- 触发: 设计 Agent harness、长程任务、状态持久化、验证门禁或人工接管；设计 merge 前高风险复核、独立 reviewer 交叉验证、误报过滤、reviewer agreement 或 merge recommendation
- 不适用: 普通 PRD / 产品流程设计；与 CLI 无关的一次性 UI 视觉问题；默认给每个低风险 PR 拉起多 reviewer 并行审查
- 研究方式: official_page_first
- 来源: https://milvus.io/ar/blog/ai-code-review-gets-better-when-models-debate-claude-vs-gemini-vs-codex-vs-qwen-vs-minimax.md
- 规范化信源: milvus-io-ai-code-review-gets-better-when-models-debate-claude-vs-gemini-vs-code
- 最近 7 天采纳: 0
- 累计采纳: 0
- 备注: AI code review / PR review harness；reviewer agreement、交叉验证、误报过滤、hallucination filter、merge recommendation
- 价值: AI code review / PR review harness；reviewer agreement、交叉验证、误报过滤、hallucination filter、merge recommendation

### nolanlawson.com/using-ai-to-write-better-code-more-slowly `nolanlawson-com-using-ai-to-write-better-code-more-slowly`

- 状态: approved
- 来源类型: web
- 场景: agent-harness, pr-review-harness
- 触发: 设计 Agent harness、长程任务、状态持久化、验证门禁或人工接管；设计 merge 前高风险复核、独立 reviewer 交叉验证、误报过滤、reviewer agreement 或 merge recommendation
- 不适用: 普通 PRD / 产品流程设计；与 CLI 无关的一次性 UI 视觉问题；默认给每个低风险 PR 拉起多 reviewer 并行审查
- 研究方式: official_page_first
- 来源: https://nolanlawson.com/2026/05/25/using-ai-to-write-better-code-more-slowly/
- 规范化信源: nolanlawson-com-using-ai-to-write-better-code-more-slowly
- 最近 7 天采纳: 0
- 累计采纳: 0
- 备注: AI code review / PR review harness；独立审查、主代理先不站队、汇总后再验证、critical/high/medium/low 分级、merge recommendation
- 价值: AI code review / PR review harness；独立审查、主代理先不站队、汇总后再验证、critical/high/medium/low 分级、merge recommendation

## Candidate Sources

- 暂无待确认来源。
