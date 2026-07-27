# Asset Spec

| 类型 | 资产 | 来源 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| logo | 不新增；沿用插件与 Obsidian 既有标识 | 项目现有资产 | not-needed | 贴图弹窗不展示品牌 logo |
| 产品图 | 用户当前 `imageItems` | 当前笔记、本地文件、当前账号素材 | runtime | 不内置示例照片 |
| UI 图 | 方向 1 参考集 | `.openprd/harness/visual-reviews/reference-sets/sticker-publish-direction-1/` | selected | 主参考源，约束层级与密度 |
| 功能图标 | `images`、`x`、方向箭头 | Obsidian `setIcon` / 内置 Lucide | selected | 图片区标题、移除与键盘排序继续使用现有图标；“上传”“从素材库选择”复用文章模式纯文字按钮，不另设贴图专属图标 |
| 摄影 / 插图 | 不需要静态摄影或插图 | 产品任务属性 | not-needed | 真实图片来自用户内容 |
| 色板 / 字体 | Obsidian 主题变量 + 系统字体；工作台蓝仅用于主动作/焦点 | `DESIGN.md`、用户确认色板 | frozen | 同时适配浅色与深色主题 |
| 动效节奏 | 150–200ms 状态反馈，尊重 `prefers-reduced-motion` | `DESIGN.md` | frozen | 不做装饰性进场 |
| 背景 / 表面 | 中性平面、1px 边界、无嵌套卡片 | `DESIGN.md`、方向 1 | frozen | 移除悬停使用中性遮罩 |
| 构图记忆点 | 单列任务流中的最终图片网格顺序 | 用户确认方向 1 | frozen | 网格顺序就是发布顺序 |

## 冻结变量

- lens: operational-density
- theme: tool-neutral（由 Obsidian 主题变量适配）
- layout: ops-density-grid 的单列弹窗变体
- aesthetic: 克制、可靠、精致的原生工具感
- memory-point: 图片网格是最终发布顺序
