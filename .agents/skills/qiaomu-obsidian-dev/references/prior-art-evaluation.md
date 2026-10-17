# 前置调研与评估

用于从零开发 Obsidian 插件，或为既有插件加入会改变架构、数据模型、宿主集成或核心交互的重大能力。目标不是拼凑竞品功能，而是在动手前确认官方边界、已有解法、许可义务和真正值得开发的差异。

## 何时执行

- **完整评估**：新插件、重大能力、技术路线选择、可能与成熟插件高度重叠的需求。
- **轻量核对**：局部功能但涉及不熟悉或可能变化的 Obsidian API；只查相关官方页面和一两个最接近实现。
- **跳过完整调研**：已复现的 bug 修复、回归、纯文档/样式微调、构建或发布操作。若根因暴露出未知 API 或架构问题，再补轻量核对。

## 研究顺序

1. 先写清用户问题、核心动作、数据边界、桌面/移动目标、离线/同步要求，以及不做什么。不要先用竞品功能替用户定义产品。
2. 以当前官方资料建立基线，至少核对与任务相关的开发文档、`obsidian.d.ts`/当前 SDK 类型和官方 sample plugin；发布型插件再核对 developer policies、plugin guidelines 与社区目录/Release 规则。记录访问日期，动态政策在实施和发布前重查。
3. 从官方社区插件索引、GitHub code/repository search、`obsidian-plugin` topic，以及用户指定项目中形成一个小而有代表性的候选集。通常包含官方 sample 和 2–5 个功能最接近、仍维护且许可明确的项目；冷门领域允许更少，但必须说明检索式和缺口。
4. 不只读 README。对进入评估的仓库检查许可证、默认分支与固定 commit、最近维护、开放 issue/已知限制、manifest/minAppVersion/isDesktopOnly、依赖与构建脚本、核心源码、数据格式、生命周期清理、移动边界、测试和 Release 资产。先只读审查；不要在未检查脚本前安装依赖或运行第三方代码。
5. 将事实、推断和建议分开。Stars、下载量和更新时间只是信号，不是质量结论；流行插件也可能使用旧 API、只支持桌面端或有不可接受的数据模型。

## 许可与借鉴边界

- 未确认许可证前只学习公开行为和通用思路，不复制代码、资源、文案或独特视觉。
- 记录每个候选的许可证与归属要求。fork、直接复用代码、参考架构和独立实现是不同路径；选择前评估与目标项目许可证的兼容性。
- 若复用代码或衍生实现，保留版权、许可证和 README 归属；重命名或改写变量不能消除义务。许可证不清晰或不兼容时，采用独立实现并记录没有复制源码。
- 不把第三方未公开接口、调试全局、私有服务、账号凭据或机器路径带入实现。

## 开发前评估方案

交付一份短而可审阅的方案，至少包括：

1. **机会与重叠**：现有插件已经解决什么，用户仍未被满足的核心场景是什么；若没有真实差异，优先建议使用/贡献现有插件。
2. **证据表**：官方依据和候选仓库 URL、固定 commit、许可证、维护状态、与本需求的相关模块、已知限制和证据缺口。
3. **复用矩阵**：逐项标明“直接采用官方模式 / 经许可复用 / 只借鉴思路并独立实现 / 明确拒绝”，并写原因。
4. **推荐方案**：核心用户流程、MVP 边界、数据与宿主集成、桌面/移动策略、迁移与回退、性能/安全/无障碍考虑。
5. **验证计划**：自动检查、真实 vault fixture、桌面与真机/模拟边界、失败恢复和发布前证据。
6. **结论**：`Go`（差异和路线明确）、`Revise`（需收窄或改变方案）或 `Stop/Contribute`（重复建设，优先使用或贡献现有项目）。明确尚未验证的内容。

除非用户已经明确要求直接开发或接受推荐默认值，先交付评估并等待方向确认，再进行大规模实现。即使同轮继续，也要先让调研结论实际约束架构和 MVP；不能把调研作为开发后的装饰性引用。

## 官方与发现入口

- Obsidian Developer Docs: https://docs.obsidian.md/
- Obsidian API types: https://github.com/obsidianmd/obsidian-api
- Official sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- Community plugin source index: https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json
- Developer policies: https://docs.obsidian.md/Developer+policies
- GitHub topic: https://github.com/topics/obsidian-plugin

这些入口用于发现和核实，不是固定候选名单。具体 API、政策和项目状态以本轮读取的当前页面、源码与 commit 为准。
