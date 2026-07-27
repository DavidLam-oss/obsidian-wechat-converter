# Selected Direction

- selected: direction-1（顺序优先的单列编排）
- source: user-confirmed
- confirmed-at: 2026-07-27
- reason: 最贴近现有 Obsidian 弹窗，顺序认知最清楚，侧边栏与窄屏适配成本最低
- lens: operational-density
- theme: tool-neutral（复用 Obsidian 浅色/深色主题变量）
- layout: ops-density-grid 的单列弹窗变体
- aesthetic: 克制、可靠、精致；通过密度、对齐和状态体现质量，不增加装饰
- memory-point: 看到的图片网格顺序就是最终微信贴图顺序
- primary-reference: `.openprd/harness/visual-reviews/reference-sets/sticker-publish-direction-1/source.png`
- components:
  - 原生账号选择与标题输入
  - 占满字段轨道的标题框与 `当前 / 20 字` 实时计数
  - 图片区标题、计数、说明和添加动作
  - 侧栏保留三列；发布弹窗按桌面 5 列、中等宽度 4 列、窄屏 3 列展示有序图片网格
  - 中性移除遮罩与撤销反馈
  - 清理摘要与稳定页脚动作
- follow-up risks:
  - 20 张图片时弹窗与图片区双层滚动的可达性
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

## 2026-07-27 局部修正

- source: user-confirmed
- scope: 首次打开闪烁、标题框宽度、20 字标题限制
- interaction:
  - 同一来源已有贴图数据时不再打开后重复重建图片 DOM
  - 首次无缓存时先完成数据读取再展示弹窗
  - 标题允许继续编辑，超过 20 字时以 `21 / 20 字` 错误态提示并阻止发布，不静默截断

## 2026-07-27 图片上限与密度修正

- source: user-confirmed
- scope: 公开 API 图片上限、图片添加保护、图片区密度、侧栏同步刷新
- product:
  - 以微信公开 `draft/add` 的 20 张上限为准，不把后台网页的 45 张能力推定到 API
  - 达到 20 张后禁用本地与素材库添加；批量选择超过剩余名额时明确提示未添加数量
  - 服务层与 API 层拒绝第 21 张，移除原有静默 `slice`
- layout:
  - 发布检查移到图片区之前，让用户不用滚到底部也能看到图片和文案状态
  - 图片区桌面 5 列、中等宽度 4 列、窄屏 3 列
  - 图片区最大高度 `min(360px, 42vh)`，20 张时在局部滚动，页脚保持可达
- interaction:
  - 弹窗内排序、移除、恢复或添加后标记侧栏为待刷新
  - 弹窗关闭时统一刷新一次侧栏贴图预览
- evidence:
  - actual-screenshot: `.openprd/harness/visual-reviews/sticker-image-limit-20-desktop.png`
  - before-after-board: `.openprd/harness/visual-reviews/sticker-image-density-before-after.jpg`
  - verification-board: `.openprd/harness/visual-reviews/sticker-image-limit-20-verification.jpg`
  - alignment-board: `.openprd/harness/visual-reviews/sticker-image-limit-20-alignment.jpg`

## 2026-07-27 控件一致性修正

- source: user-confirmed
- scope: 标题超限计数、图片添加入口的文案与样式
- typography:
  - 标题计数保持 `当前/20 字` 的单行格式
  - 超限时只把“当前字数”标红，`/20 字` 保持次级文字色，避免整段错误色抢占注意力
- components:
  - 贴图模式直接复用文章模式 `.wechat-modal-cover-btns` 按钮样式
  - 两个入口统一为“上传”“从素材库选择”，不再使用贴图模式专属图标与专属文案
