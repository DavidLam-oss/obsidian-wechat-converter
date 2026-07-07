# OpenPrd 前端设计资产

这层目录给 Agent 提供前端体验任务的可复用设计框架。

它不是参考图仓库，而是实现前的判断顺序、审美立意和资产底座。

## 目录

- `lenses/`: 设计判断角度
- `themes/`: 主题 token 和密度规则
- `layouts/`: 页面骨架
- `components/`: 高频组件结构
- `recipes/`: 按任务类型整理的默认配方
- `checklists/`: 自检门
- `anti-slop.md`: 反模板化检查，避免通用 AI 页面味
- `assets/`: 可复用表面和素材说明
- `templates/`: 可直接套用的页面起步模板
- `active/`: 当前任务正在使用的事实、素材和方向文件

## 默认顺序

1. 先选 `lens`
2. 写清用途、受众、气质端点、约束和记忆点
3. 再选 `theme`
4. 再选 `layout`
5. 再决定 `component set`
6. 再补当前任务的 `facts / assets / image preflight / directions`
7. 用 `anti-slop.md` 排除通用 AI 味
8. 最后进入实现

对空白静态原型，如果 `templates/` 里已经有足够接近的模板，优先先用模板默认组合开工；只有确实要偏离默认组合时，再回头细读所有 catalog。

## 空白底座提醒

如果当前工作区几乎没有页面文件，`active/` 目录里的设计合同就是第一批应该被写实的文件。

- 先补 `facts-sheet / asset-spec / image-preflight / direction-plan / selected-direction`
- 再从 `templates/` 里选最近的一份模板，先把骨架落成可打开页面
- 如果页面主题和模块范围已经明确，优先把它们直接带进 `openprd design-starter ... --brief ... --sections ...`
- 对不依赖外部产品事实、品牌素材或真实图片的静态首页，也要把 active design artifacts 明确写成“无外部事实依赖”“当前无品牌素材依赖”“真实图片不是页面成立前提”，不要留在 `pending`
- 再创建第一个可打开的页面入口，例如 `index.html`
- 跑完 starter 后，下一步就是同时改 active design artifacts 和入口文件；直接在生成的入口文件上改。禁止删除 starter 生成的入口文件后另起新稿，也不要继续在 placeholder 文档之间兜圈
- 不要在 placeholder 文档之间反复来回扫描而迟迟不落任何实现文件

## 这层解决什么问题

- 避免界面都长成一种安全极简解
- 避免默认紫白渐变、通用字体、白底卡片堆叠和无语境装饰
- 避免事实没核实就上页面
- 避免内容型页面没有真实图还硬做
- 避免实现时临时发明主题和组件
- 避免方向文档只写 lens/theme/layout，却没有审美主张和用户记忆点
