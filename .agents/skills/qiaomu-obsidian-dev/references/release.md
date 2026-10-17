# 发布与官方审核

## 发布账本

分别记录：本地构建、测试库安装、PR/CI、合并 SHA、GitHub tag/Release/资产、目录审核状态、公开页安装按钮。GitHub 上传成功不等于官方可搜索；没有红色错误也不等于当前版本已生效。

2026-09-07 官方 Submit your plugin 文档使用 community.obsidian.md 账户流程；首次提交后新版本从 GitHub Release 更新。旧 community-plugins.json PR 教程不能作为唯一判据。每次发布先读当前官方要求，目录指南可能变化。

## 防止新版本影响线上目录（发布硬门槛）

2026-09-10 核实：官方说明每个新版本都会扫描，审核失败可能使整个插件在 24 小时内从搜索中移除。不要假设旧版会自动保留展示。以下是乔木的发布要求，不能保证绕过官方政策变化或扫描故障。

1. **开发与 PR**：检查权利、许可证/字体、网络披露、manifest id/minAppVersion/isDesktopOnly。运行项目 lint/typecheck/test/build，审查依赖。检查 diff 与敏感信息，走 feature branch → PR；不直接推默认分支。候选分支可准备新版本，但在同版本正式 Release 的匿名资产可下载前，**不得合并或推送会让默认分支根 `manifest.json` 暴露新版本的提交**。
2. **冻结最终候选**：记录完整 commit SHA、目标版本、lockfile、产物 SHA256 和测试结果。从确定的候选构建，使用生产 build 脚本；签名/attestation 不能替代功能验收。若合并、rebase、代码、依赖或配置使候选变化，重新核对并扫描最终 SHA，不能把旧分支扫描当最终结果。
3. **发布前官方预扫描**：后台 Review branch → 输入最终候选 SHA → Run preview scan。逐项检查 Manifest、Releases、Source code、Build verification。Error 必须解决；Warning 官方不阻止提交，但应处理或记录理由；Recommendation 如实评估。记录扫描 SHA、时间、结果与证据链接/截图。排队、超时、不可访问或没有结果都不是通过；保持未发布状态，不能以本地 ESLint 替代。
4. **先草稿与安装验收**：CI 默认创建 Draft Release，不因推 tag 自动公开。tag 精确等于 manifest.version（如 1.2.3，无 v），指向已预扫描的最终候选提交；核对 package/versions.json（存在时）及 release manifest，上传 main.js、manifest.json 和需要的 styles.css。额外字体文件不会自动安装，检查实际打包策略。对草稿最终资产做隔离库全新安装与旧版升级，验证订阅、收藏、阅读位置、设置与笔记链接；核对已登录下载的摘要。移动端模拟与真机分开报告。草稿不是官方免审通道，已登录的 `gh release download` 能读草稿，不证明普通用户能安装。
5. **无断档公开顺序**：只有上述证据齐全且任务已有发布授权，才按下列顺序操作：
   1. 默认分支仍指向上一个可安装版本时，先公开已验证的同版本 Release。新 Release 暂时未被目录引用是安全的；反向顺序会让客户端看到新版本却只能获得 404。
   2. 立即运行 `check_public_release.py`，用**无 token/无登录**的精确 `releases/download/<version>/<asset>` URL 读回 `main.js`、`manifest.json`、`styles.css`（若有）；全部必须 HTTP 200、字节数与 SHA256 匹配。刚公开时允许有限重试等待 CDN 传播，但 404 期间不得继续合并版本提升。
   3. 公开资产通过后，再通过已检查的 PR 让默认分支暴露新 `manifest.version`；不直接推默认分支。若合并方式改写 commit SHA，必须确认 Release tag 树与默认分支的发布相关文件无 diff；有任何内容变化就停止，不覆盖已公开资产，改用新补丁版本。
   4. 不能通过 prerelease、latest 标记或已登录读回假设普通客户端可用。保留旧 Release，不重用/移动旧 tag，不替换已发布资产；修复用新补丁版本。
6. **发布后闭环**：后台 Check for new releases 触发发现，必要时 Request review。核对正式扫描、公开目录版本、安装按钮、客户端搜索和隔离库正式安装。记录每个阶段；GitHub 发布成功、匿名资产可下载、预扫描通过、正式审核通过、客户端可安装是不同证据。没有通过闭环不得报告“上架成功”。
7. **失败处理**：读取具体错误，区分代码违规、版本/资产不匹配、GitHub 权限/服务故障、目录同步延迟。若客户端已显示新版本，而精确公开资产 URL 是 404，这是发布顺序故障，不应先归因于移动网络。若同一草稿已完成授权、预扫描、资产和安装验收，立即公开并做匿名回读；否则通过 PR 把默认分支版本指针恢复到上一个可安装版本，再重新完成门禁。不删旧 Release，不覆盖已公开资产。官方扫描异常按官方社区支持渠道反馈，保留错误/SHA/版本证据；对外发消息仍需任务授权。

**人工步骤前置（2026-09-27）**：官方预扫描需要账号登录；自动填写后台表单可能被权限策略拦截。把最终候选 SHA、草稿 Release 与资产摘要一次准备好交给用户执行，不换方式绕过拦截。影响候选的产品决定（隐私默认值、联网、写入位置）在冻结前问清；扫描后任何代码变化都要更新草稿目标与资产并重扫。详见 [提速手册](speed-playbook.md#4-上架人工步骤一次集中)。

遇到具体后台提示时读取 [提交与更新故障手册](submission-failures.md)。其中包含默认分支无法读取 manifest、版本找不到 Release、构建产物不一致、资产缺失、Pending、扫描分级和 CSS Lint 的诊断顺序。先按错误原文分类，再行动，避免用删除仓库、覆盖资产或重复扫描试错。

## 发布证据最小记录

每次记录：候选 SHA、版本、CI 结果、官方预扫描 SHA/结果/时间、资产名/大小/摘要、全新安装/升级覆盖、公开 Release URL、匿名精确 URL 的 HTTP/摘要回读、默认分支版本暴露时间、正式审核、目录/客户端可安装状态。预扫描缺证就停在草稿且不得推进默认分支版本，不能用“以后补查”放行。

官方来源（核对日期 2026-09-10，发布前再次核实）：
- [新版本失败与搜索移除](https://obsidian.md/blog/future-of-plugins/)
- [Preview Scan、正式审核、同步与错误分级](https://docs.obsidian.md/community-directory/manage-entry)
- [扫描 build 脚本与本地 ESLint](https://docs.obsidian.md/community-directory/faq)
- [版本与安装资产](https://docs.obsidian.md/plugins/releasing/submit-plugin)

## 商店与更新体验

README 首屏放官方安装 URL 与说明，GitHub About 的 website 可指同一地址；保留 BRAT/手动安装作为适当备用。描述应忠于实际支持，图片来自当前真实 UI，不把美术 mock 当功能截图。目录英文限制、截图大小与 icon 能力先读页面。

设置“关于”放当前版本、release notes、GitHub Issues 和公开作者信息。只使用宿主更新机制；不静默下载可执行代码，不包含客户端遥测（不是加开关即可合规）。下载统计是下载次数，不等于安装用户或活跃用户。

## 成功报告示例

本地/CI 通过；GitHub 1.2.3 已发布且三个资产完整；官方审核 queued；公开页面仍为 1.2.2。下一步是等待/处理官方反馈，不能写「自动上架成功」。

政策依据：[Developer policies](https://docs.obsidian.md/community-directory/developer-policies)，核对于 2026-09-08；后续发布重新核实。

## 原生安装后的宿主附加内容

2026-09 的宿主安装核验观察到 main.js 末尾可能由 Obsidian 添加 `/* nosourcemap */`。公开 Release 仍必须与候选原始字节一致；原生安装若摘要不同，先核对是否仅有已验证的宿主后缀，并记录原始/安装摘要和精确差异。不得为让校验通过任意裁剪、忽略未知差异。版本、公开资产、正式扫描和实际更新成功仍是独立证据。
