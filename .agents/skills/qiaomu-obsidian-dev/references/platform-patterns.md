# 宿主兼容、性能与编辑器

核对日期：2026-09-08。先读项目锁定 SDK 类型与最低支持版本，再选方案；本文不是要求所有旧插件升级宿主。

## 设置 API 与数据演进

Obsidian 1.13.0 起可用 `getSettingDefinitions()`。最低版本达标时可以采用声明式设置；保留旧用户兼容时同时维护旧 `display()`，并验证两套界面行为一致。不要只为普通修复提高最低版本。

声明式普通 control 自动持久化；自定义 render 的副作用与保存需自行处理。定义函数保持纯且轻量，不能联网或读文件；刷新声明式设置用 `update()`。加载旧数据也要校验，界面的 validate 不会修复已有坏值。迁移保留未知字段、分版本推进并验证幂等；这些迁移约束是本技能工程建议。

来源：[官方迁移指南](https://docs.obsidian.md/plugins/guides/migrate-declarative-settings)。

## 延迟视图与多窗口

Obsidian 1.7.2 起的 DeferredView 意味着 getViewType 相同不代表实例已加载。用户要打开阅读器时 await revealLeaf，再检查具体实例。仅在确有后台修改需要且版本支持时 loadIfDeferred，不能遍历加载所有页签抵消启动优化。

视图自身 DOM 使用其 ownerDocument；设置变更应通知目标阅读视图，让每个视图更新自身文档，不能把字体样式写到当前获得焦点的设置窗口。主工作区专属行为才定位 workspace.containerEl.ownerDocument；勿误以为它涵盖全部弹出窗口。测试独立设置窗口与两个阅读窗口同时存在的情况。

来源：[官方 DeferredView](https://docs.obsidian.md/plugins/guides/defer-views)；[多窗口经验](https://github.com/davidvkimball/obsidian-dev-skills/blob/50b0ab8a8e15f2b93b8a437494b93dd2e54056a2/obsidian-dev/references/agent-dos-donts.md)。后者是维护者经验，行为仍需在目标宿主复现。

## 编辑器扩展的边界

先区分编辑模式与阅读模式：编辑模式走 registerEditorExtension 和 CodeMirror 6；阅读模式走 Markdown 后处理器，自定义代码块用对应处理器。不要拿阅读 DOM 补丁冒充编辑器状态。

编辑器 DOM 只包含视口及少量邻近内容，不能遍历 DOM 推断全文或全量选区。用 Editor/编辑器文档状态取得正文；视口相关装饰在文档或视口变化后更新，清理组件资源。测试长文、滚动、输入法、撤销、选区及 Live Preview/阅读模式。仅需追加文本时优先原生 Editor，避免引入整套扩展。

来源：[官方 Viewport](https://docs.obsidian.md/Plugins/Editor/Viewport)。

## 性能与安全复核

- 启动只注册必要能力；布局相关工作等待就绪，重解析按需执行。async/await 不能把同步 CPU 工作移出主线程；大任务分批让出执行权，先测耗时再决定是否需要 worker。
- 对修改事件去抖、增量索引；缓存限定大小并处理删除/重命名。不得每次按键扫描全库。
- 面向移动端使用宿主 Platform 和 Vault API，不能把 adapter 强制转为桌面文件系统。网络优先 requestUrl，仍需验证错误、认证、超时策略及离线行为；不要假设它支持 fetch 的全部选项。
- 配置目录取 Vault.configDir；删除遵从 FileManager.trashFile，重命名需更新链接时用 FileManager.renameFile。稳定命令 ID 不随显示名变化；不设置全局默认快捷键，阅读器局部快捷键须避开编辑器与 IME。
- 使用项目提供的 Obsidian ESLint 检查，先读具体规则与类型；不靠 any、eslint-disable 或固定旧版本消除报错。第三方依赖的遥测、远程代码、体积与许可一起审查。

来源：[官方自审清单](https://docs.obsidian.md/oo/plugin)。性能分批与增量索引是据此形成的项目建议，不代表官方强制实现。
