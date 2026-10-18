# 开发技巧增补研究 · 1.2.0 · 2026-09-08

范围：在 1.1.0 的三个公开技能研究基础上，继续检索官方经验、SDK、成熟测试基础设施。是专项增补，不重新复制技能目录；没有安装或执行检索来源代码。

## 本次实际读取

- obsidianmd/obsidian-developer-docs，提交 c56c7e770ba25dd0ea392aacf4588f9425970d36：Vault、Markdown post processing、Decorations、Communicating with editor extensions、Store secrets 原文；网页读取 load-time、lifecycle-management、Mobile development、Developer policies。
- obsidianmd/obsidian-api 的当前 obsidian.d.ts：核对 process 同步签名、MarkdownRenderChild、context.addChild、SecretStorage/SecretComponent 1.11.4 标记。实际项目仍以锁定版本为准。
- obsidianmd/eslint-plugin README：类型检查配置、跨窗口 instanceOf、设置版本规则。
- obsidianmd/stylelint-config README：主题资源限制与目标浏览器范围，不能整体冒充插件政策。
- jesse-r-s-hines/wdio-obsidian-service README 与 sample-plugin 的实际 wdio.conf.mts，提交 0e86de5b22d0b0a3d96cdd855162cdebde78b6f1：真实宿主隔离、版本矩阵、桌面移动模拟与 Android 分支。

各文档可点击来源在新增 reference 中。未复制第三方代码；测试服务按维护者文档解释，不冒称已经在本 skill 中运行。

## 取舍

采用：读写决策、渲染资源所有权、create 初始化边界、CM6 装饰选择、secret 名称引用、真实宿主测试分层。
适配：数据迁移/失败恢复/有界队列/同步冲突属于本技能工程建议；避免把建议称为官方强制流程。
拒绝：process 中 async、全库无界 Promise.all 示例直接用于生产、孤立 Component、依赖 activeDocument 更新所有窗口、用主题规则否定所有插件外链、将模拟测试当真机。
修正：旧文本“不替用户开启遥测”过弱，明确官方禁止客户端遥测，开关不是豁免。

独立改进：症状→诊断→验证表；审计器遇到 list/dict 版本号与 versions.json 同时存在时返回失败而非崩溃，新增回归测试。

## 证据边界

新增八项 output 场景仍是待执行评审，不算模型效果证据。无新移动真机或实际插件迁移证据。链接含空格时 web 工具将 + 当字面量而返回 Not Found，已改用 GitHub 官方原文与类型核对；不声称失败页面读取成功。
