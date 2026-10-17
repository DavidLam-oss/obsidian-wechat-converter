# 渲染、编辑器与资源所有权

## 先选最小扩展面

| 用户结果 | 首选 |
| --- | --- |
| 插入/替换选中文字 | Editor 命令与事务 |
| 阅读模式加工 Markdown | Markdown post processor |
| 自定义 fenced code 展示 | Markdown code block processor |
| 编辑模式高亮/替换/小组件 | CM6 decorations |
| 独立阅读器或仪表盘 | ItemView，沿用宿主叶子布局 |

阅读模式后处理不是编辑器状态 API。[官方 Markdown 后处理](https://docs.obsidian.md/Plugins/Editor/Markdown%20post%20processing)。

## 资源跟随最短合理生命周期

1. View 关闭就应释放的 Markdown 渲染资源由 View 持有，不能全挂到 Plugin 等待卸载。
2. 每次文章切换可使用有明确父子关系的子 Component，先释放旧渲染，再挂载新内容。不能 new Component 只传给 renderer 而从不卸载。
3. 后处理的小组件可由 MarkdownRenderChild 管理，并交给 context.addChild；容器被替换时资源随之清理。sourcePath 传真实来源以解析相对链接，不能一律空字符串。
4. React/Svelte/Vue 只在确有复杂状态需求时引入；销毁视图时执行框架对应卸载，observer、计时器、对象 URL、事件和异步任务也要释放。DOM remove 本身不等于释放这些资源。
5. 重复打开弹窗要创建新组件或正确重新加载，不能复用已失效的组件。异步渲染返回后检查视图是否仍在、是否还是同一篇。

来源：[官方生命周期](https://docs.obsidian.md/plugins/guides/lifecycle-management)、[MarkdownRenderChild / context.addChild 类型](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)。框架卸载及异步保护是本技能据此采用的工程建议。

验证：连续切文章、关闭重开、禁用再启用；观察同一次点击回调次数、监听/计时器是否累积及内存趋势，不以一次 heap 数字证明无泄漏。

## CM6 装饰的选择

- 可由可见范围决定的装饰优先 ViewPlugin；遍历 visibleRanges，只在相关文档/视口状态变化时更新。
- 全文持久状态、视口外装饰或会改变布局范围的装饰用 StateField。不能为制造大块布局而滥用仅视口的间接装饰。
- Mark/Widget/Replace/Line 分别对应文本样式、插入组件、替换显示、整行样式。装饰改变显示，不应偷偷改 Markdown 原文。
- 文档变更后旧 offset 不可靠，需通过事务映射或重建；包含异步高亮时还需检查文档版本。后一句是本技能实现建议。

来源：[官方 Decorations](https://docs.obsidian.md/Plugins/Editor/Decorations)。

## 编辑体验与兼容建议

- 不捕获全部键盘事件。处理自己作用域和有效上下文；IME 组合输入、contenteditable、输入框及多选区单独验证。
- 不为每次渲染 setValue 全文；局部事务保留撤销链和选择。不要用 DOM 文本偏移直接当源文档偏移。
- 需要直接访问 editor.cm 时，官方旧教程也使用未公开类型路径；集中在适配器、做存在性判断与版本测试，不能散布断言。普通插入优先公开 Editor API。
- 核对构建器对 obsidian、宿主 CM6/Lezer 包的 external 配置，避免同一页面两份运行时身份冲突；不直接升级模板中的所有依赖。
- DOM 与事件跨窗口使用当前 SDK 的跨 realm 检查（官方 lint 推荐 instanceOf 方法），不能把主窗口 HTMLElement 的 instanceof 当所有窗口通用。Vault 的 TFile 检查是另一类对象边界，不机械替换。

来源：[编辑器通信](https://docs.obsidian.md/Plugins/Editor/Communicating%20with%20editor%20extensions)、[官方 ESLint](https://github.com/obsidianmd/eslint-plugin)。

验收至少覆盖此次影响的输入、删除、撤销重做、长文滚动、模式切换、弹出窗口。键盘模拟不能替代移动端长按选区与系统拖放。
