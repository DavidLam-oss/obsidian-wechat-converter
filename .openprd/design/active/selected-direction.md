# Selected Direction

- selected: direction-1（顺序优先的单列编排）
- source: user-confirmed
- confirmed-at: 2026-07-27
- reason: 最贴近现有 Obsidian 弹窗，顺序认知最清楚，侧边栏与窄屏适配成本最低
- lens: operational-density
- theme: tool-neutral（复用 Obsidian 浅色/深色主题变量）
- layout: ops-density-grid 的单列弹窗变体
- aesthetic: 克制、可靠、精致；通过密度、对齐和状态体现质量，不增加装饰
- memory-point: 看到的九宫格顺序就是最终微信贴图顺序
- primary-reference: `.openprd/harness/visual-reviews/reference-sets/sticker-publish-direction-1/source.png`
- components:
  - 原生账号选择与标题输入
  - 图片区标题、计数、说明和添加动作
  - 共享三列有序图片网格
  - 中性移除遮罩与撤销反馈
  - 清理摘要与稳定页脚动作
- follow-up risks:
  - 9 张图片时弹窗高度与滚动边界
  - 侧边栏窄宽度下按钮换行与 3 列图片可读性
  - 键盘排序后的焦点跟随
  - 深色主题下边界、遮罩与焦点对比度
  - 参考稿示例照片和空槽不应被逐像素照搬

## 实现与验证

- implementation-status: completed
- actual-screenshot: `.openprd/harness/visual-reviews/sticker-publish-direction-1-actual.png`
- reference-actual-board: `.openprd/harness/visual-reviews/sticker-publish-direction-1-reference-actual.jpg`
- alignment-board: `.openprd/harness/visual-reviews/sticker-publish-direction-1-alignment.jpg`
- verification-board: `.openprd/harness/visual-reviews/sticker-publish-direction-1-verification.jpg`
- validation-summary:
  - 三列卡片宽高一致，内容槽位与操作按钮内边距一致
  - 单列流程、主次动作和来源标签符合已确认方向
  - 生产 CSS 同构页面在 760×1200 视口验证通过
  - 真实 Obsidian 文件选择器、公众号素材接口与发布链路保留为人工联调项
