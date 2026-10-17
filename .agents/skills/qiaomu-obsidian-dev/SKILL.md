---
name: qiaomu-obsidian-dev
description: |
  Develop, debug, review, test and release any Obsidian plugin with current native APIs and evidence-based engineering. Use for commands, editor extensions, custom views, search/indexing, import/export, sync/network integrations, media/reading, AI tools, settings, mobile compatibility and official releases. Also use for lifecycle, data, performance, race-condition and release failures. Exclude ordinary vault note writing, generic Markdown formatting, plugin recommendations, non-Obsidian app development, and skill authoring itself.
metadata:
  author: 向阳乔木
  version: "1.10.0"
---

# Qiaomu Obsidian Dev

把插件做成可持续使用、可验证发布的产品。用户当前指令和项目 AGENTS 优先于本技能；本技能不等于 Obsidian 官方政策。

## 路由与边界

- 审查/诊断请求默认只读；开发请求完成实现与验证；只有授权发布时才推送、合并、修改社区页面。不得把「修好」擅自扩大为公开发布。
- 先检查实际仓库、分支、dirty 状态、目标测试库、已安装版本、项目脚本和当前 SDK 类型。不要把另一个库、旧截图或缓存中的版本当当前证据。
- 原生 API 优先；插件运行时不依赖开发机器路径或调试全局 app。面向移动端时不打包 Node/Electron；声明兼容不等于真机验证。
- 原创项目保留已选许可证；fork 保留来源和许可，核实目录提交的额外授权要求。重命名不能消除来源义务。

## 最小工作流

1. 将本轮及仍未完成的要求逐项对应到用户动作和验收结果；新纠正覆盖同一行为的旧决定，不丢掉其他待办。读取 [插件类型与通用架构](references/plugin-architecture.md)，判断插件主类型、宿主触点、状态所有者、外部副作用、平台范围和主要风险，再只加载相关专项参考。
2. 新插件或重大新能力在写实现前读取 [前置调研与评估](references/prior-art-evaluation.md)：先核对当前官方文档/API/示例，再检查功能最接近且许可明确的开源插件源码，交付可追溯的评估方案。默认等用户确认推荐方向后再进入大规模实现；用户已明确“直接开发/按推荐方案做”时，可在同一轮给出精简评估后继续。局部修复、回归、文档与发布工作不强制重做完整调研。
3. 修复前复现问题，沿“用户动作 → 命令/事件 → 状态转换 → 宿主/网络/文件副作用 → UI反馈 → 清理/恢复”定位根因；不能从某个历史案例直接猜当前插件也有同一问题。
4. 在现有架构内做最小实现。明确单一数据源、请求/任务身份、持久化时机、失败恢复、卸载清理与兼容边界；保持用户当前任务、焦点、选区、编辑内容或其他插件相关状态不被意外覆盖。
5. 按改动运行 lint/typecheck/测试/build，再安装到指定测试库并重载，用 `scripts/host_eval.py` 脚本化真实用户操作。模拟测试和实机结果分开写。批量修复与发版提速见 [提速手册](references/speed-playbook.md)。
6. 授权发布时按 [发布门禁](references/release.md) 走 feature branch/PR → checks → 最终候选 SHA 官方 Preview Scan → Draft Release 与安装验收 → **先公开同版本 Release 并确认匿名资产 200/摘要匹配，再让默认分支 manifest 暴露新版本** → 正式审核与目录/客户端核验。预扫描 Error 或缺证时不得公开发布；扫描后修改代码/依赖/配置须重扫。CI 默认只产草稿，不因推 tag 直接公开。已登录的 `gh release download` 可读草稿，不能代替匿名安装链路检查。
7. 交付改动、测试结果、未覆盖平台、实际发布阶段和可点击产物。无法验证的部分直接标记，禁止声称「自动上架成功」。

## 按任务加载

| 任务 | 参考 |
| --- | --- |
| 所有插件：类型识别、状态/副作用/生命周期与验收设计 | [插件类型与通用架构](references/plugin-architecture.md) |
| 新插件、重大新能力、竞品重叠与技术路线判断 | [前置调研与评估](references/prior-art-evaluation.md) |
| 设置页重构、黑灰配色、卡片留白、图标对齐、渐进配置与关于 | [设置 GUI](references/settings-gui.md) |
| 视图、工具栏、列表、设置、空态、移动交互 | [产品界面与设置](references/product-ux.md) |
| 书库、选文 popup/右键、划线回跳、AI 助读 | [学习型阅读器](references/reader-workflows.md) |
| 字体大小、离线字库、缓存图片、拖拽附件 | [字体与媒体](references/fonts-media.md) |
| 日记、当前笔记、选区、内部回跳、本地 Markdown | [摘录与来源](references/capture-navigation.md) |
| 生命周期、Vault API、异步安全、多窗口 | [工程模式](references/engineering.md) |
| 新设置 API、延迟视图、编辑器扩展、启动性能 | [宿主与性能](references/platform-patterns.md) |
| 大数据集/长文/媒体、内存增长、虚拟化与资源回收 | [规模与资源性能](references/performance-large-files.md) |
| 配置迁移、并发写入、同步、密钥、索引 | [数据可靠性](references/data-reliability.md) |
| 网络服务、跨插件协议、AI、MCP/Skill 与外部能力 | [外部集成与能力](references/ai-integrations.md) |
| 乔木系列插件（`qiaomu-*`）：接入乔木Home 起点页、乔木 Agent 上下文，起点页/新标签接管 | [乔木插件家族协议](references/qiaomu-family.md) |
| Markdown 组件、CM6 装饰、资源释放 | [编辑器与生命周期](references/editor-lifecycle.md) |
| 回归测试、真实宿主测试、常见故障定位 | [测试与诊断](references/testing-troubleshooting.md) |
| 批量打磨/修复、减少补丁版本、宿主脚本验收、发版人工步骤 | [提速手册](references/speed-playbook.md) |
| 插件商店搜不到、审核、Release、安装 | [发布门禁](references/release.md) |
| manifest/Release/Tag 不一致、构建验证、CSS Lint、扫描 Pending | [提交故障手册](references/submission-failures.md) |
| 经验来源、偏好变化、哪些不是通则 | [经验与依据](references/lessons.md) |

## 默认产品判断

乔木插件新 UI 默认使用作用域内的黑白灰语义色、Lucide 图标、明确内边距与渐进配置；优先任务和可见状态，少说明，不堆控件。设置页细则和实机检查见 [设置 GUI](references/settings-gui.md)。用户当前偏好优先，纯图标 tooltip 等项目例外不得被默认值覆盖。

以用户的主任务而不是数据表或技术模块组织界面：命令型插件缩短执行路径，编辑器插件保持写作流，管理/索引插件突出查找与批处理，集成插件清楚显示连接与同步状态。默认选择即可开始，复杂配置渐进展开；减少常驻说明和无明确用途的控件。阅读型插件再应用“继续读 → 划线/思考 → 笔记 → 回到原文”的专项流程。

默认禁止无明确需求的 hover tooltip、`title`、`setTooltip` 和悬浮解释。Obsidian 会把部分 `aria-label` 映射为提示气泡时，图标按钮必须改用 visually-hidden 文本或 `aria-labelledby`，输入框使用原生 `label`；不能以无障碍为由重新引入 tips。只有用户明确要求，或控件含义无法通过可见文本与标准图标表达时，才逐个加入 tooltip。发布前搜索并审查相关属性。字体调整即时保存。

遵守用户“不使用左侧装饰竖线”的视觉偏好，包括选中态；具体范围与替代方式见 [阅读与设置](references/product-ux.md#设计判断与宿主边界)。

优先复用 Obsidian 已有命令、Editor、Vault/FileManager、MetadataCache、菜单、设置、工作区与附件能力。不要把内部识别码、HTML 注释、服务地址或调试选项暴露到普通用户流程。

## 验证入口

```bash
python3 scripts/audit_release.py /path/to/plugin --tag 1.2.3 --max-asset-bytes 5000000 --scan-tips
python3 scripts/check_public_release.py /path/to/plugin --repo owner/repo --version 1.2.3 --attempts 6
python3 scripts/host_eval.py --vault <qa-vault> --reload <plugin-id> --file check.js --screenshot /tmp/shot.png
python3 -m unittest discover -s tests -p 'test_*.py'
rg -n 'setTooltip|setAttribute\(["'"']title|\btitle\s*:|aria-label' plugin-src src styles.css
```

本地审计脚本只读，输出 JSON 与非零失败码；它检查本地产物、版本、大小与摘要。`check_public_release.py` 不使用 GitHub 登录或 API token，通过安装器使用的精确 Release URL 匿名下载根级资产，并与本地最终产物逐字节比较；它只证明当次公开下载，不证明目录同步或真机运行。`--scan-tips` 按插件入口（`esbuild.plugin.mjs`、`tsconfig.plugin.json`，否则退回 `plugin-src`/`src`）只扫真正进入插件的源码与 `main.js`、`styles.css`：源码查 `aria-label`、`title=`、`setTooltip`、`data-tooltip`，构建产物只查 `setTooltip(` 与 `data-tooltip`，跳过测试文件。审计与公开回读脚本不执行目标项目代码，不证明官方审核、依赖安全或移动兼容。`host_eval.py` 相反：它在指定库的 Obsidian 里以完整权限执行你写的检查脚本，只对 QA 库使用；它证明的是该桌面库、该版本上的这次操作。5 MB 是本项目经验的可配置预算，不声称永久官方限制。

## 输出合同

- Research：问题边界、官方依据、候选仓库及固定 commit、许可/维护状态、可借鉴与拒绝项、证据缺口和检索日期。
- Assessment：差异化价值、复用矩阵、推荐架构与 MVP、风险/验证计划，以及 Go / Revise / Stop 结论；默认先交付此项再开发。
- Diagnosis：触发条件、根因、影响、拟修复范围。
- Implementation：实际文件与用户可见行为，避免只报实现术语。
- Verification：命令/结果、测试库与版本、桌面/真机/模拟覆盖，失败或缺证。
- Distribution：local / PR / merged / GitHub release / review queued / review passed / public installable 分开记录。
- Feedback：可复用规则只在用户要求时写入外部长期记忆；无需把私有库路径、订阅令牌或原始聊天发布。

Copyright (c) 向阳乔木 · X https://x.com/vista8 · GitHub https://github.com/joeseesun/
