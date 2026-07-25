# 项目级产品与设计上下文文档

## 背景与原因

基于现有 Obsidian 插件代码与界面事实，新增根目录 PRODUCT.md 和 DESIGN.md，为后续产品、交互与视觉调整提供统一且可复用的依据。

## 变更内容

- 新增根目录 PRODUCT.md
- 新增根目录 DESIGN.md
- 校验文档结构、设计 token 与仓库事实一致性
- PRODUCT.md 使用 product register
- DESIGN.md 遵循标准 YAML token frontmatter 与 Overview、Colors、Typography、Elevation、Components、Do's and Don'ts 六章节
- 文档使用自然中文并保持结构清楚、美观、可扫描
- PRODUCT.md 覆盖用户、产品目的、品牌性格、反例、设计原则和可访问性
- DESIGN.md 基于现有 styles、themes、views 与截图，包含标准 token frontmatter 和固定六章节
- 明确区分 Obsidian 插件操作界面与文章输出主题
- 最终只新增两份根目录文档且内容可由仓库事实追溯

## 能力范围

- `consumer-requirements`: 项目级产品与设计上下文文档 需求。

## 影响范围

- 主要用户: 在 Obsidian 中写作并发布到微信公众号、飞书云文档或其他内容平台的创作者
- 主要用户: 重视 Markdown 渲染还原、媒体兼容与多平台草稿工作流的技术写作者和内容运营者
- 依赖: Obsidian 原生设计变量与控件
- 依赖: 项目现有 styles 和 themes 源文件
- 依赖: impeccable PRODUCT.md 与 DESIGN.md 结构规范
- 风险: 将历史视觉不一致写成强制标准
- 风险: 文档过长导致实际开发难以使用
- 风险: 插件 UI 与文章输出规范混淆
