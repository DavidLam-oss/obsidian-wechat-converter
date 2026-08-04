# 自定义 CSS 端到端验收

用于验证普通微信公众号排版中的自定义 CSS。自动化测试通过后，再执行本清单的真实微信 smoke。

## 准备

1. 在插件设置的微信页启用自定义 CSS。
2. 先粘贴 `samples/custom-css-demo.css.example`，再用一篇 Markdown CSS 笔记重复验证。
3. CSS 笔记需分别覆盖裸 CSS、frontmatter + 单个 fenced `css`、frontmatter + 多个 fenced `css`。
4. 测试文章包含 h1–h6、段落、链接、普通引用、Callout、行内与 fenced code、嵌套列表、表格、本地图片、公式、Mermaid 和分隔线。

## 自动化基线

- `npm test -- --run tests/custom_css_source.test.js tests/custom_css_compiler.test.js tests/custom_css_inliner.test.js tests/custom_css_end_to_end.test.js tests/custom_css_sample.test.js`
- `npm run scan:guard`
- `npm run build`

## 人工矩阵

| 主题 | 普通预览 | 复制到微信编辑器 | 同步微信草稿 |
|---|---|---|---|
| 简约 | 待验收 | 待验收 | 待验收 |
| 经典 | 待验收 | 待验收 | 待验收 |
| 优雅 | 待验收 | 待验收 | 待验收 |

每格检查：

- 标题、正文、Callout、代码、表格和图片样式符合样例。
- `::before` 装饰符只出现一次。
- 图片、公式与 Mermaid 仍可显示。
- 复制与草稿没有丢失安全的 inline style。
- AI 编排预览、AI 导出、多平台发布和贴图发布不包含这份 CSS。
- CSS 暂时写错时仍可预览与发布，并继续使用当前会话上一份有效样式。
- 修改 CSS textarea 或 CSS 笔记后，普通预览自动更新且滚动位置不跳动。

## 安全检查

确认 `@import`、`@font-face`、`http:`、`https:`、协议相对 URL、相对路径、`file:`、SVG data URL、超限 data image 与 `expression()` 不会触发外部加载或阻断文章发布。
