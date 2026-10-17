# 乔木插件家族协议

仅用于向阳乔木的 Obsidian 插件（id 以 `qiaomu-` 开头、作者为向阳乔木），或用户明确要求接入乔木Home / 乔木 Agent 时。其他作者的插件不默认加入。核对日期：2026-09-26。

## 两个协议，职责不同

| 协议 | 插件字段 | 方向 | 回答的问题 | 规范与文件 |
| --- | --- | --- | --- | --- |
| `qiaomu-context` v1 | `plugin.qiaomuContext`；Agent 暴露 `plugin.api` | 来源 → 乔木 Agent | 用户**此刻正在读什么**，供提问 | `assets/qiaomu-protocols/qiaomu-context.ts`；qiaomu-agent 仓库 `docs/integrations/qiaomu-context-protocol.md` |
| `qiaomu-home` v1 | `plugin.qiaomuHome` | 来源 → 乔木Home | 用户**可以继续、新建或找到什么**，供起点页 | `assets/qiaomu-protocols/qiaomu-home.ts` / `.js`；qiaomu-home 仓库 `docs/qiaomu-home-protocol.md` |

两者可只实现其一。插件之间从不 import，运行时通过 `app.plugins` 在使用时查找，每次调用都有保护；对方不存在时本插件照常工作。协议文件原样复制进插件（`qiaomu-home` 协议文件为 MIT），不要改名或重写。

## 新的乔木插件：开发前先问两件事

1. **它有可以「继续」的东西吗？** 在读的书、未读文章、正在播的音频、上次的会话、进行中的任务……有 → 实现 `qiaomuHome.sections()`。有明确的「新建/导入」入口 → 实现 `actions()`。有本地可搜的标题 → 实现 `search()`。
2. **它展示的内容值得问 AI 吗？** 有正文/选区 → 实现 `qiaomuContext.snapshot(leaf)`，并可加「问 AI」按钮调用 `findAgent(app)?.ask({ context })`。

都没有就不接入；不要为了「生态完整」塞空卡片。

## qiaomu-home v1 实现要点

- `sections()` 只读本地内存状态：不联网、不写文件、不打开视图，1.5 秒内返回；Home 超时或异常只影响该插件的卡片。每节最多 6 项，空节给 `empty` 文案或不返回。
- `open()` / `run()` 只在用户点击时被调用，应**恢复**到原位置（书的页码、文章本身、原会话），可以打开视图或开始播放。
- 数据而非 DOM：Home 统一排版。`image` 仅 `https:`、`app:`、`capacitor:`、`data:image/`；`progress` 0–1；次要操作最多 2 个；图标用 Obsidian 自带 Lucide 名。
- 状态变化时 `notifyHomeChanged(app, manifest.id)`：进度保存、已读/未读、播放状态、会话保存。挂在已有的保存路径上即可，Home 会合并连发。
- 文案用插件自己的 i18n；优先复用已有翻译键，新增键要补全插件支持的全部语言并跑其 i18n 检查。
- 监听已有单订阅者 API 时（如播放器 `subscribe` 只保留一个 listener），新增独立的多观察者入口，不要抢走视图自己的订阅。
- 调用乔木 Agent 提问而不附上下文：`api.compose?.({ prompt, submit })`，先检测方法存在；`submit: true` 仅在用户已在调用方界面按下发送时使用。

## 参考实现（2026-09-26，分支 `claude/home-protocol`）

| 插件 | 文件 | 展示 |
| --- | --- | --- |
| 乔木 Reader | `src/home.js` | 在读书籍（封面、进度）、添加图书、搜书名 |
| 乔木 RSS | `src/home.ts` | 最新未读与计数、添加订阅、搜文章 |
| 乔木电台 | `plugin-src/home.ts` | 正在播放（播放/暂停）与最近电台、搜电台 |
| 乔木 Agent | `src/integrations/home.ts` | 最近对话、新对话；`compose` 供 Home 的 ⌘↵ |

## 验收

- 单独安装本插件（无 Home、无 Agent）行为不变；装上 Home 后出现卡片，禁用/重载本插件后卡片消失或恢复。
- 用真实库检查：卡片内容与插件内一致；点击恢复到正确位置；状态变化后 Home 自动刷新；`sections()` 抛错时只出现该插件的「暂时无法显示」。
- 协议文件与 qiaomu-home 仓库 `protocol/` 下的版本逐字一致。变更协议先改 qiaomu-home 的规范与测试，再同步本技能 `assets/qiaomu-protocols/`；只能增加可选字段/方法，破坏性变更才升版本。

## 起点页/新标签接管（通用经验）

接管 Obsidian 空白标签时，在 `layout-change` 后延迟约 40 ms 再检查叶子**仍是 `empty`** 才替换，并跳过左右侧栏；实测 `getLeaf("tab")` 后 `layout-change` 约 20 ms 才触发，而 `setViewState` 会同步切换视图类型，因此不会抢走其他插件正在打开的标签。回退（history back）能回到起点页，无需额外处理。
