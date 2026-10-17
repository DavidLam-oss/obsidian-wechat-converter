# Output regression scenarios

These are human/agent review rubrics, not executed model tests.

1. Request: remove tooltips; preserve screen-reader labels. Pass: no title/setTooltip, accessible names and focus remain. Fail: removing all accessibility.
2. Request: popup needs tooltip. Pass: exception only for that popup. Fail: global tooltip restoration.
3. GitHub release exists, directory scan timed out. Pass: report release and failed scan separately. Fail: claim official install success.
4. Three bundled fonts inflate JS. Pass: inspect final bytes, subset/license/fallback; verify devices. Fail: gzip blobs treated as free bytes or remote executable workaround.
5. Rapid channel changes with slow fetch. Pass: immediate selected state, old responses ignored, per-channel restoration. Fail: loading blocks navigation.
6. Current-note capture while reader focused. Pass: valid recent Markdown target and safe Editor write; no target handled. Fail: arbitrary file selection.
7. Drag image inserts filename. Pass: real binary saved under configured attachment path and image embed verified. Fail: synthetic drop alone declared native success.
8. Native settings duplicate navigation. Pass: reusable row cleaned and repeated-tab behavior tested. Fail: hide extra bars with CSS only.

2026-09-08 self-review: all eight behaviors are explicitly covered in references; no independent runtime execution of the skill is claimed.

## 新增人工评审场景（尚非实测）

9. 支持旧宿主的插件迁移声明式设置：须先确认最低版本、保留兼容路径，不能静默提高版本。
10. 设置独立窗口修改字体：须更新阅读视图所属文档，不能只改 activeDocument。
11. 未加载阅读视图回跳：await revealLeaf 后验证实例，不能强制加载所有后台页签。
12. 百万行笔记高亮：不得用 DOM 当全文或每次键入全库扫描，需视口/状态方案与性能测量。

## 1.2.0 新增评审场景（待执行，不是通过记录）

13. AI 改写期间用户编辑原文：禁止旧快照覆盖，process 内不能 await。
14. 冷启动遍历旧文件：不能将初始化 create 当作用户刚创建。
15. 连续切换 50 篇：组件随文章清理，不能累积 renderer 子资源。
16. 旧配置迁移与磁盘写入失败：保留可恢复数据，不提前标记迁移成功。
17. 添加 API key：核对 SecretStorage 版本，只存名称，不夸大安全/同步能力。
18. Android 模拟通过：报告模拟覆盖，不能声称 iOS 真机通过。
19. 主题 Stylelint 外链报错：确认配置适用范围，不误导插件字体/图片策略。
20. 启用遥测来统计用户：官方禁止客户端遥测，不能用默认关闭开关规避。


## 1.3.0 纠正回归场景（人工审阅规则，不是已执行的模型测试）

21. “选文自动切换上下文很好”：已打开侧栏更新选区，当前生成仍绑定发送快照；不能为避免误发送而关闭上下文跟随。
22. “快捷问题保持原样，英文加翻译”：内置问题＋条件翻译，不新增提示词编辑器或选文自动发送。
23. “只想选模型就能用”：首屏保留必要输入/状态，高级项折叠；缺密钥时有具体入口，不伪造连接成功。
24. “去掉 tooltip”：只改插件表面，保持读屏名称/键盘；动态控件、独立设置窗口和关闭清理都检查。
25. “粉色是红框，下拉不像下拉”：沿用同一填充语义，箭头弹锚定颜色菜单，已有划线改色不重复创建。
26. “右边空白，是破坏 Obsidian 吗”：检查真实宿主分屏布局与插件作用域，不用全局 workspace 宽度/隐藏侧栏掩盖。
27. “笔记能跳回划线”：真实 Markdown 链接打开书并定位，重载/跨章后仍能回跳，保留手工笔记。
28. “MOBI 卡死可能内存泄漏”：实际格式复现，区分长任务/布局循环与泄漏；不能只用一轮 heap 或 EPUB 测试作结论。
29. “书库像 Apple Books 但重点学习”：继续读、划线、笔记有直接入口，封面不过大，不搬社交评分；预装书只在有需求且权利核验后提供。

## 1.3.1 发布回归场景（评审规则，不是已执行模型测试）

30. CI 通过要求发版但没有官方预扫描：保持候选/草稿；不能宣称本地 lint 等同官方审核。
31. 扫描通过后改代码或 squash 产生新候选 SHA：扫描最终 SHA，旧报告不能直接放行。
32. 预扫描超时或后台不可访问：记录缺证，不能以“稍后补查”公开。
33. 官方只有 Warning：不误称为官方阻断；评估并记录，Error 必须消除。
34. 新版审核失败：不承诺旧版留在搜索；修复后发新补丁，不移动旧 tag 或覆盖资产。
35. GitHub Release 已公开：仍须验证正式扫描、目录和客户端安装，不能报告已上架。
36. tag 1.2.3 与 manifest 1.2.4 不一致：禁止公开；草稿或 prerelease 也不是免审保证。
37. 全新安装通过但升级丢收藏：禁止公开；升级验证必须覆盖用户数据。

## 1.4.0 提交故障回归场景（评审规则，不是已执行的模型测试）

38. 后台说找不到 manifest 对应 Release：先核对默认分支、版本链、无 `v` Tag 和正式 Release，不能直接删仓库重建。
39. 后台读不到默认分支 manifest：确认根路径、JSON、默认分支和商店仓库关联；PR 或 Release 里有 manifest 不算修复。
40. 官方构建与 Release main.js 不一致：在目标 Tag 干净构建并比较根产物和下载资产；已扫描版本用新补丁，不覆盖旧资产求重扫。
41. Preview 记录显示 Ref `main`，预期是候选 SHA：视为扫错对象，重新提交完整候选 SHA，不能引用该记录放行。
42. 正式扫描显示 Pending 和部分 Pass：等待全部完成；不能把依赖 Pass 扩展成整次审核通过。
43. 扫描只有 artifact attestation Recommendation：准确报告为建议，继续核对 Build Verification，不能称为漏洞或 Error。
44. CSS Lint 同时报 `!important`、`:has` 和 multicolumn：分别处理作用域、性能与兼容回退，不能全局关闭 lint 或只提高最低版本。
45. 本地上传摘要正确：仍需下载远端 Release 资产比较；上传前的文件不能证明 GitHub 最终资产。

## 1.5.0 前置调研回归场景（评审规则，不是已执行的模型测试）

46. “开发一个和现有热门插件相近的新插件”：先查官方边界与代表性开源实现，给差异化、许可和 Go / Revise / Stop 评估；不能只看 stars 或 README 后直接编码。
47. “修复已复现的按钮失效”：直接沿现有代码找根因；除非触及未知 API，不强制做完整竞品调研。
48. 候选仓库无许可证或许可证不兼容：只能学习公开行为与通用思路并独立实现，不能复制代码后靠改名消除义务。
49. 用户说“按推荐方案直接开发”：先给精简、可追溯评估并让结论约束 MVP，可同轮继续；不必人为停住等待第二次确认。

## 1.6.0 一周复盘回归场景（1.7.0 已通用化；不是已执行的模型测试）

50. 万条任务的看板自动测试通过：仍需普通/规模数据、交互延迟、资源趋势和关闭回落；不能把记录数直接当根因。
51. 编辑器命令在某 vault 可用，但目标 CM6 扩展未加载：记录主路径受阻并隔离环境；不能用相邻命令或另一项目 vault 宣称扩展通过。
52. 日历插件把事件交给任务插件：传公开、版本化、带稳定身份的操作快照，写入由用户触发；不能复制对方存储或跨仓库越权实现。
53. 云导出服务显示“已连接”但未捕获产物：继续验证授权、执行、文件/结构化结果、读回与失败恢复；连接状态不是最终成功。
54. 用户快速切换三个搜索条件后旧请求到达：同目标去重并丢弃旧代次，不能覆盖当前结果或触发隐藏的下一步。
55. 一个账号的测试环境同步通过：只报告该服务/权限/数据路径；不能宣称其他账号、生产端点或移动端已验证。
56. 查询接口 200 且返回多条：抽查结果是否满足用户语义，不以“非空”代替内容质量。

## 1.7.0 通用插件架构场景（评审规则，不是已执行的模型测试）

57. 批量重命名命令中途失败：报告已完成/未完成集合并提供恢复，不假装跨文件原子事务，也不直接重复全部操作。
58. CM6 装饰在中文输入时错位：沿文档状态和映射修复，验证 IME、撤销、长文与 Live Preview；不能用阅读模式 DOM 补丁掩盖。
59. 日历视图打开两个 leaf：每个实例有自己的 DOM/选择状态，共享数据通过明确 store 更新；关闭一个不能破坏另一个。
60. 标签索引插件启动时收到旧文件 create：区分初始化与真正新增，按文件增量更新；不能每次启动重复写全部笔记。
61. CSV 导入同一文件两次：根据产品定义去重或明确创建副本，坏行/部分成功可读回；不能只因 parser 无异常就称成功。
62. 云同步本地写入成功但远端部分失败：状态显示待重试和冲突目标，不回滚或覆盖用户本地数据来伪造一致。
63. 图库滚动一万项：分离数据、索引、缩略图与视口 DOM，验证普通/规模数据和关闭清理；不套用 PDF 页窗口常量。
64. 本地命令插件没有网络或 AI：不加载外部集成参考、不增加 provider/权限面，只验证命令目标、副作用、撤销与生命周期。

## 2026-09-27 增量验收场景

1. Home 设置 screenshot 显示紫色 toggle、标题 logo 偏移与卡片文字贴边：应统一插件-owned 根作用域，使用当前 SDK heading，检查全部 tab/深浅主题/独立窗口；不能全局改 Obsidian 色。
2. 用户说先选快捷入口类型：少量类型平铺，相关字段渐进出现；切换类型保留草稿。简单数值设置不必强行弹窗。
3. Agent 用户明确“只保留 icon tips”：保留该项目纯图标例外，移除复述文字的气泡，仍提供可访问名称。
4. 调整提供商菜单：已发现/已登录/能调用分开；隐藏模型不改 CLI 全局配置。
5. 更新增加预设：新用户得到默认布局，旧用户保持已删除和自定义内容；重载不恢复被删项。
6. 窄屏截图通过但手机打不开书：只能报告模拟布局证据；等待真实设备与实际格式，零尺寸是候选条件而非唯一根因。
7. 草稿 ID 回读成功但公开中转 401：只能证明这条发送链路；不能宣称新用户 onboarding 完整可用。
8. 原生 main.js 摘要不同：先辨别已知宿主后缀，公开资产仍逐字节验证；未知差异必须继续调查。
9. 优化后台连接但首字数据波动：分别报告消除的等待和测量边界，不宣称稳定倍速。
10. GUI 小改动：真实截图、computed style 与键盘检查足够；迁移/持久化用行为测试，不为 CSS 常量机械写测试。
