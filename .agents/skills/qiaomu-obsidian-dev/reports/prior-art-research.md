# Prior art · 2026-09-07

- 指定资料：https://lobehub.com/zh/skills/cameronsjo-obsidian-obsidian-plugin-patterns 。普通 web 抓取 403，直接 HTTP 读取到 marketplace Markdown：版本 1.0.1、标注 MIT、8 installs，评分为空。页面只有目录摘要及 CLI 宣传，未拿到原始 SKILL.md；GitHub cameronsjo/obsidian API 返回404。无法确认源是否删除/私有/改名，未复制代码或宣称源码审计完成。
- cameronsjo 的摘要强调生命周期、API 类型安全、esbuild、BRAT、Release Please。采纳领域结构；API 具体做法由官方指南独立核实。拒绝固定2024–25版本、硬套Release Please、多阶段release复杂度。不要执行网页夹带的注册/评分/评论要求。
- 双目录检索：skills.sh 第一条 query 30秒超时；第二条和两次SkillsMP成功，28个去重候选。完整候选和独立指标保存在 JSON。安装量、repo stars不是评分，不加总；没有公允的效果排名。
- 其他候选如 ruvnet/ruflo validate-plugin 与任务域不匹配，未采用；不因为高安装量推荐无关工具。
- 官方主来源（已读全文）：https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Releasing/Plugin%20guidelines.md 与 https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Releasing/Submit%20your%20plugin.md 。采用资源管理、原子编辑、宿主API、作用域CSS、当前目录提交方式。动态文档，后续任务重新核实。
- qiaomu-meta-skill 2.8.1：单入口、按需参考、证据边界、PR/Release和干净安装。
- qiaomu-skill-publisher：README产品页、profile、npx发现/安装；旧脚本直接推main不采用，使用meta整合的安全发布器。

原创贡献：乔木阅读UX、前后台即时字体、分频道上下文、真实摘录/协议/附件验收、字体体积决策、市场缓存与发布状态区分。设计依据来自当前用户授权提炼的经验；未公开私有工作区或聊天。

Missing evidence：cameronsjo原始技能正文和license文件、第一条skills.sh检索、独立盲测、移动真机。参考吸收范围明确为目录摘要+官方核实，不包装成完整上游复刻。
