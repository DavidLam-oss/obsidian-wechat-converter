# 测试、诊断与工具选择

只增加能证明本次行为的检查，不要求普通 CSS 修复搭建完整 E2E 平台。

## 分层证据

| 层 | 能证明 | 不能证明 |
| --- | --- | --- |
| 纯函数测试 | 解析、去重、路径、迁移和状态转换 | 宿主 API 与 UI 手势 |
| mock 集成 | 错误/并发顺序、接口契约 | 真实 Obsidian 行为 |
| 隔离桌面宿主 E2E | 安装、重载、持久化、DOM 交互 | iOS Capacitor/系统手势 |
| 移动模拟 | 窄屏、布局、部分触摸分支 | Android/iOS 真机兼容 |
| 真机手测/自动化 | 指定设备与版本上的操作 | 全部设备与市场审核 |
| 发布资产读回 | 版本/摘要和安装包一致性 | 功能正确与审核通过 |

每条真实宿主证据绑定：仓库/checkout、分支与 commit、构建输出、安装目录、vault/profile、插件 ID/版本、Obsidian 版本、fixture 和同时启用的相关插件。另一个项目的 `.test-vault`、旧安装目录或同名插件不能为当前 checkout 作证。遇到文件扩展注册冲突、重复 view/command 或其他插件拦截时，先在隔离 vault 只启用目标插件；冲突未消除前只能报告该格式/路径受阻。

优先项目现有脚本；复杂持续迭代可评估 wdio-obsidian-service。已读取其 sample 的 wdio.conf.mts：它将桌面矩阵与 emulateMobile 分开，并另指向 Android 配置。隔离配置与专用测试 vault 避免污染日常库；测试前构建，记录应用版本与 installer/runtime 版本。不要为了一个小修复自动安装整套服务。

来源：[测试服务](https://github.com/jesse-r-s-hines/wdio-obsidian-service)、[实际示例配置](https://github.com/jesse-r-s-hines/wdio-obsidian-service-sample-plugin/blob/0e86de5b22d0b0a3d96cdd855162cdebde78b6f1/wdio.conf.mts)。

## 官方检查工具

- eslint-plugin-obsidianmd 的 recommended 已组合基础与类型检查规则，需正确配置 TS project service；先读锁定版本配置，不能重复拼配置制造冲突。每条报错查规则依据，不一键 disable。
- stylelint-config-obsidianmd 来源是主题检查，规则含主题资源 URL 限制。插件可借鉴 CSS 兼容与质量检查，但不能把主题禁止外链资源直接宣称为所有插件禁令；按当前插件审核规则配置。
- lint 零错误不代表官方批准。检查浏览器兼容时兼顾目标 Electron 与 iOS WebKit，不能只选最新桌面引擎。

来源：[ESLint 配置](https://github.com/obsidianmd/eslint-plugin/blob/master/README.md)、[Stylelint 范围](https://github.com/obsidianmd/stylelint-config)。

## 失败症状 → 首查位置

| 症状 | 首查 | 修后验证 |
| --- | --- | --- |
| 每次打开按钮多一次响应 | 重复监听、组件卸载 | 打开关闭多轮，一次操作仅一次写入 |
| 启动就处理所有旧文件 | create 初始化事件、onload 重任务 | 旧库启动不触发“新文件”动作 |
| 等待 AI 后新编辑消失 | 快照过期、整篇覆盖 | 等待时改字，结果不会覆盖 |
| 切页后显示上一请求内容 | 缺失代次/目标校验 | 让旧请求最后返回 |
| 设置关闭后丢失 | 未 await/乱序 save、存储报错 | 连改、关闭、重载与失败重试 |
| 回跳只在重启后失效 | 临时 ID、缓存过期、DeferredView | 冷启动点击真实链接 |
| 字体只在设置窗口变化 | 错误 document、视图未接收状态 | 独立设置窗口＋阅读窗口 |
| 编辑器装饰偏移/消失 | 旧 offset、映射、模式/视口 | 插入删除与滚动后仍对齐 |
| 插件在手机无法加载 | 顶层 Node、依赖、语法兼容 | 真实设备冷启动并读错误 |
| 图片只有文件名 | 链接非 embed、下载/路径失败 | 真拖放并读回附件二进制 |
| 构建过但新版没生效 | 安装错 vault、未重载、旧资产 | 核对已安装 manifest 与摘要 |
| 自定义视图空白、无报错 | 子类方法覆盖宿主生命周期（如 `open`）；或 reload 后旧叶子脱节 | 新建视图后 `view.containerEl.isConnected` 为真且 `onOpen` 已执行；用上一版构建对照 |
| 卡片在用户输入时不更新 | 刷新因焦点被跳过 | 输入中触发 vault 变更，卡片更新且输入值/光标保留 |
| 写入后磁盘内容没变 | 笔记开在编辑器，保存有延迟 | 读 `editor.getValue()` 或关闭标签后再读 |
| 内存/启动数字很好看 | 混入宿主/其他进程或采集器等待 | 隔离 profile/进程并说明测量边界 |
| provider mock 通过 | 未走真实认证、模型或输出事件 | 对指定组合做真实调用和结果呈现 |

这些是诊断线索，不能没复现就断言根因。

## 可复现的最小验收材料

准备最小 synthetic vault：中文/空格文件名、相对图片链接、模板日记、两个同名不同目录文件、超长文、无目标笔记。不要复制个人笔记作为公开测试夹具。

格式能力不能互相替代：EPUB 可见不证明 PDF/MOBI，普通 PDF 不证明大型/扫描 PDF，桌面窄屏不证明 iOS 系统选区。按本次声明准备对应 fixture；同一功能的成功态、空态、错误态和恢复态至少各有一条真实路径。外部分类/搜索还要抽查结果语义，HTTP 成功和列表非空不等于分类准确。

宿主操作优先用 `scripts/host_eval.py` 脚本化（真实点击、读回文件、收集控制台错误、可截图），用法见 [提速手册](speed-playbook.md#3-验证宿主里脚本化不靠用户点)。

异步测试用可控制完成顺序，等待具体状态，不堆固定 sleep。数据写入检查最终文件与撤销行为，不只检查 toast。需要桌面 UI 时用宿主 CLI/截图；先查本机 help，开发 CLI 不成为插件运行时依赖。

官方移动调试参考：[Mobile development](https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development)。实际可用的 Android/iOS 调试前提按页面与设备核对。
