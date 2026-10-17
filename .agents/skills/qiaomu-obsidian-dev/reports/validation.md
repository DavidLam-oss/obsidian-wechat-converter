# Validation · 1.2.0 · 2026-09-08

- Package validator: pass, zero warnings.
- Trigger smoke: 14/14 lexical cases passed; not model routing accuracy.
- Artifact audit unit tests: 11 passed, including malformed JSON, exact tag, bytes budget, read-only behavior, missing assets and version mismatch.
- Historical 1.0.0 evidence (not rerun for this documentation update): real qiaomu-ai-rss 0.18.2 local artifacts: audit passed; main.js 4,907,526 bytes, styles.css 25,299 bytes. No private vault read.
- Output scenarios: twenty self-review rubrics; independent agent trial and iOS device execution are missing evidence.
- Publication/discovery/clean-install status belongs to the publisher report, not this pre-publication record.

## 1.4.0 · 2026-09-12

- Package validator: pass, zero failures; one historical handoff-version warning was then corrected.
- Skill Creator quick validator: pass.
- Artifact audit unit tests: 14 passed. New coverage checks both `package-lock.json` version locations and detects mismatched or missing downloaded release assets.
- Submission troubleshooting reference added from observed Qiaomu Reader release evidence; it is operational guidance, not a guarantee of future Obsidian approval.

## 1.4.3 · 2026-09-15

- Added an anonymous public-release verifier that requests the exact GitHub asset URLs without authentication and compares bytes and SHA256 with local final artifacts.
- Regression coverage includes matching public assets, Draft-like HTTP 404, remote byte mismatch, and requested/local version mismatch.
- Release guidance now requires public asset 200/readback before the default branch exposes the new manifest version; official scan and device installation remain separate evidence.
- Validation rerun: 26/26 unit tests passed; package validator passed with zero failures/warnings; Skill Creator quick validator passed.
- Live anonymous check against Qiaomu Reader 4.2.14 passed for `main.js`, `manifest.json`, and `styles.css`; all returned HTTP 200 and matched the local final artifacts byte-for-byte. This is download evidence, not a mobile runtime test.

## 1.5.0 · 2026-09-15

- Skill Creator `quick_validate.py`: pass.
- Package validator: pass with zero failures and zero warnings; version and reference links are consistent.
- Existing unit suite: 26 tests passed. No production script behavior changed in this revision.
- Four new prior-art scenarios were added as human review rubrics; they are not independent model behavior tests.
- Official developer docs, API/sample repositories, community plugin index and GitHub topic were rechecked as discovery entry points. Candidate quality, license and maintenance still require per-project source inspection at a fixed commit.
- This validation covers the local installed skill only; GitHub sync, release and clean remote install were not performed.

## 1.6.0 · 2026-09-15

- Reviewed dated evidence from Reader, RSS, Seed and Radio conversations between 2026-09-08 and 2026-09-15, including three rollout summaries, targeted Nowledge memories and scoped runtime-observation summaries. Partial observations were not promoted to completed behavior claims.
- Added two routed references for large-file performance and AI/cross-plugin integrations; merged bounded recovery, evidence identity, format-specific QA, semantic-result checks and long-identifier layout into existing references.
- Added seven human review scenarios. They are rubrics, not executed model behavior tests.
- Skill Creator `quick_validate.py`: pass. Package validator: zero failures and zero warnings. Markdown local-link check: no missing links. Existing unit suite: 26 tests passed.
- `SKILL.md` is 8,521 bytes, below this package validator's 14,000-byte production budget. No production scripts changed.
- This validation covers the local installed skill only; GitHub sync, release, clean remote install and independent model forward-testing were not performed.

## 1.7.0 · 2026-09-15

- Corrected the 1.6.0 over-specialization: Reader, RSS, Seed and Radio are now evidence examples, not default product templates.
- Added a common architecture router covering command/automation, editor, custom-view, data/index, import/export, network/sync, media/reading and AI/Agent plugins. Entry workflow now starts from user action, state ownership, side effects, cancellation/recovery, lifecycle and evidence.
- Generalized the performance reference beyond PDF and the integration reference beyond AI. Added eight cross-archetype human review scenarios.
- Expanded lexical trigger smoke cases with calendar/view, CM6 editor, CSV import/export, full-vault indexing and external sync prompts: 19/19 passed. This is keyword routing smoke, not model behavior evaluation.
- Skill Creator quick validation passed; package validation passed with zero failures/warnings; 26 unit tests passed; local Markdown links have no missing targets. `SKILL.md` remains below the package's 14 KB production budget.
- This validation covers the local installed skill only; GitHub sync/release, clean remote install and independent model forward-testing were not performed.

## 1.7.1 · 2026-09-15

- README rewritten as a user-facing installation page with a first-screen value proposition, one-line install, natural-language trigger, feature comparison, real case studies, limitations and troubleshooting.
- Added four visually inspected case screenshots under `assets/cases/`: combined Obsidian plugin evidence, Reader library, Reader AI assistance and AI RSS reader.
- Skill Creator quick validation passed; package validation passed with zero failures/warnings; 26 unit tests passed.
- Qiaomu Skill Publisher dry-run passed, including README and Qiaomu profile checks.

## 1.8.0 · 2026-09-26

- 新增 `references/qiaomu-family.md`：乔木插件家族两个协议（`qiaomu-context` v1、`qiaomu-home` v1）的职责、接入判断、实现要点、参考实现与验收；新增起点页/新标签接管的实测经验。
- 新增 `assets/qiaomu-protocols/`：可原样复制的 `qiaomu-home.ts`、`qiaomu-home.js`、`qiaomu-context.ts`，技能不再依赖本机仓库路径。
- 路由：SKILL.md 任务表新增一行；`plugin-architecture.md` 注明乔木系列插件的例外，非乔木插件仍不默认接入。
- 证据来源：乔木Home 0.1.0 与 Reader/RSS/Radio/Agent 的 `claude/home-protocol` 分支在 rockfish 库的真实宿主验证（provider 发现、卡片、搜索、新标签接管、回退）。
