---
version: alpha
name: "顺序优先的安静发布工作台"
description: "以最终九宫格顺序为核心、融入 Obsidian 的单列贴图发布体验"
colors:
  primary: "#0071e3"
  ink: "#1d1d1f"
  text-secondary: "#6e6e73"
  text-tertiary: "#86868b"
  background: "#ffffff"
  surface: "#f5f5f7"
  accent: "#0071e3"
  accent-hover: "#0077ed"
  success: "#34c759"
  warning: "#ff9500"
  error: "#ff3b30"
  border: "#e8e8ed"
  divider: "#d2d2d7"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, PingFang SC, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, PingFang SC, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, PingFang SC, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0"
  code:
    fontFamily: "SF Mono, Menlo, Monaco, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.background}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.background}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  icon-button:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    height: "32px"
    width: "32px"
  field:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
---
<!-- OPENPRD:UI-CONTEXT
status=frozen
direction=direction-1
source=user-confirmed
schema=google-labs-code/design.md@bde692f2bc92ef7fdd0cf277b2704ab074b70efd
-->

# Design System: 微信公众号排版转换器

## Overview

**Creative North Star: “安静的发布工作台”**

插件界面服务于连续的写作与发布任务。它应当克制、可靠、精致：以清晰层级、稳定控件和可扫描状态帮助用户检查内容并完成动作，而不是用装饰争夺注意力。信息密度可以高，但每一层都必须有明确职责。

设计系统分为两个彼此关联但不可混用的表面：**Obsidian 插件操作 UI** 使用 Obsidian 原生控件和语义状态，承担设置、预览控制与发布流程；**导出文章与主题输出** 面向微信等内容平台，允许使用用户选择的主题色、字体和行文样式。文章主题色不能反向定义操作 UI 的成功、警告或错误语义。

布局使用 4px 基础节奏和 `4 / 8 / 16 / 24 / 32 / 48px` 间距级别。桌面侧边栏保持紧凑，移动布局通过结构重排与稳定尺寸适配，不用随视口缩放字号。动效只用于状态变化，常规反馈控制在 150–250ms，并尊重系统的减少动态效果偏好。

**Key Characteristics:**

- Obsidian 原生、任务导向、紧凑可扫描。
- 中性表面为主，蓝色只强调关键动作与当前选择。
- 预览是内容结果，工具栏与设置是控制层，两者层级明确。
- 浅色、深色与移动布局共享相同的状态语义和交互规则。

### 图文志文章输出面

“图文志”是文章输出的 `dynamic-editorial` 主题，不是插件操作 UI 的新视觉系统。它借鉴公开 Image Essay 的高层叙事节奏：首图建立开篇，普通图片以留白推进段落，图注保持安静且只在作者提供说明时出现。文章始终是一条适合微信公众号的单列内联样式流，不依赖 `<style>`、class CSS、伪元素、动画、backdrop-filter 或复杂 Grid。

它的气质是克制的编辑感，而不是暖纸色、卡片堆叠或外部主题的固定绿黄、红白、橄榄橙配色。无图文章仍是稳定的纸刊长文；有图只增强节奏，不要求作者为主题重写文章结构。

## Colors

色彩以清晰的黑白灰层级承载内容，以少量系统蓝承载操作；语义色只用于可解释的状态，不作装饰。

### Primary

- **工作台蓝** (`#0071e3`)：主操作、当前选择、焦点和进行中状态。单个视图中保持稀少，避免同时出现多个竞争焦点。
- **工作台蓝 Hover** (`#0077ed`)：明确可交互元素的悬停反馈，不用于静态信息。

### Semantic

- **完成绿** (`#34c759`)：同步或校验完成等正向状态；必须同时显示文字或图标。
- **注意橙** (`#ff9500`)：额度、连接或需用户处理的非阻断提醒。
- **错误红** (`#ff3b30`)：失败、无效输入和破坏性动作；不可用于一般强调。

### Neutral

- **主墨色** (`#1d1d1f`)：主要标题与正文。
- **次级灰** (`#6e6e73`)：辅助说明、次要操作和图标默认态。
- **弱化灰** (`#86868b`)：低优先级标签与占位信息，使用前检查对比度。
- **画布白** (`#ffffff`)：主内容与基础控件表面。
- **工作台灰** (`#f5f5f7`)：预览画布、分组背景和第二层表面。
- **边界灰** (`#e8e8ed`)：输入框、容器和轻量边界。
- **分隔灰** (`#d2d2d7`)：工具栏或信息区之间需要更明确区分时使用。

深色主题沿用 Obsidian 的 `--background-*` 和 `--background-modifier-border` 变量表达背景、表面与边界，并保留同样的层级关系。

**The Separate Semantics Rule.** 文章主题色表达内容风格，插件语义色表达操作状态；两者永不互换。

### 图文志颜色角色

- **accent**：链接、章节细线和低频视觉强调，取当前 `themeColor` 或 `customColor`。
- **accent-readable**：需要承载文字或细边界时使用；计算对比度后选择原色、安全加深或深色中性回退，避免亮黄、浅粉等自定义色直接承担文字。
- **accent-deep**：标题染色开启时的安全深色；关闭“标题使用加深主题色”时回退既有深灰规则。
- **accent-soft**：从 accent 派生的低透明度表面，只服务安静的章节/引用关系。
- **text / muted / surface / border**：固定为高可读中性色，不能把第二种固定强调色伪装成主题身份。

## Typography

**Display Font:** 不设置独立展示字体；插件 UI 统一使用系统无衬线字体。
**Body Font:** `-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, PingFang SC, Arial, sans-serif`
**Label/Mono Font:** `SF Mono, Menlo, Monaco, Consolas, monospace`

系统字体让插件自然融入 Obsidian，并在中英文混排时保持稳定。操作界面不追求编辑感或展示感，而通过字号、字重和留白建立层级；文章输出字体由所选主题独立控制。

### Hierarchy

- **View Title** (600, 14px, 1.2)：当前文档名、弹窗主标题和高优先级分区标题。
- **Section Title** (600, 13–15px)：设置分区、结果分区和可折叠区域标题。
- **Body** (400, 13px)：说明、状态详情与表单辅助信息；连续说明文字保持易读行长。
- **Label** (500, 11–12px)：字段名、徽标和紧凑状态，不用全大写制造强调。
- **Code / Value** (400, 12–13px)：Token、路径、调用次数和需要等宽对齐的值。

**The Quiet Hierarchy Rule.** 通过 1–2 个字号级差、字重与间距建立层级，禁止在侧边栏、设置页和弹窗中使用 Hero 级大字。

### 图文志排版

- 标题和正文采用现有安全字体栈；图文志对文章标题与章节优先使用衬线角色，插件 UI 仍使用系统无衬线字体。
- 正文字号沿用用户已选字号档位，行高与段间距由图文志配置控制，不用流式字号或远程字体。
- H1 用居中的克制开篇层级，H2/H3 用左侧阅读轨道与细节奏线建立章节停顿；不使用“01 / 02”编号作为机械骨架。
- 图注小于正文且满足可读对比度，文本居中；缺失图注时不保留空节点或占位。

## Layout

贴图发布使用单列任务流：账号与标题先建立发布上下文，图片区随后成为主要工作面，清理摘要与发布动作收尾。图片区标题、计数、说明和两个添加动作属于同一层级；3 列网格在侧边栏与弹窗中复用相同顺序语义，不把空槽渲染成装饰卡片。

- 桌面弹窗保持约 `560px`–`640px` 的内容宽度，优先完整展示 3 列图片。
- 窄屏下标题区动作可换行，网格仍保持 3 列；点击目标通过内边距扩展，不用放大可见图标。
- 相邻控件使用 `8px`–`12px` 紧凑间距，字段组与图片区之间使用 `16px`–`24px` 分隔。
- 图片采用正方形裁切；序号固定在左上角，移除入口固定在右上角，键盘排序反馈不改变网格尺寸。
- 弹窗内容可滚动，页脚动作保持稳定，不允许图片数量变化推动按钮横向漂移。

### 图文志文章布局

- 输出为单列微信文章流；外层 `section` 保留用户侧边距和中性表面。
- `hero` 只由 `hero:` 显式标记触发，采用完整宽度、无额外卡片边框的开篇图片；标记以外的普通图片都是 `regular`。
- `regular` 图片保留比正文更明显的上下留白，视觉上承接前后段落，但不改变原始图片比例或根据尺寸推断角色。
- 图片容器、caption 与章节之间通过节奏和细边界形成层级，不依赖多列、浮动、绝对定位或伪元素。
- 表格、代码、数学、Mermaid、Callout、图片轮播、敏感图片和头像水印继续走现有兼容路径；不强行套入杂志结构。

## Elevation

系统以扁平和色调分层为默认。主内容、工具栏与设置项依靠背景、1px 边界和间距区分；阴影只用于确实悬浮在当前层级之上的覆盖面板、弹出菜单、手机预览框，或作为焦点反馈，不能给每个分区都制造“卡片感”。

### Shadow Vocabulary

- **Focus Ring** (`0 0 0 2px color-mix(in srgb, var(--apple-accent) 12%, transparent)`): 输入框或可选容器获得焦点时使用。
- **Compact Overlay** (`0 8px 18px color-mix(in srgb, var(--text-normal) 18%, transparent)`): 菜单、弹出层等短暂覆盖内容的表面。
- **Preview Device**：仅手机边框预览使用更深的组合阴影，用来表达真实设备边界，不复用于普通容器。

**The Flat-by-Default Rule.** 静止表面默认无阴影；只有层级或状态发生真实变化时才允许抬升。

## Shapes

- 常规控件圆角使用 `4px`，网格图片与信息容器使用 `8px`，弹窗层级最多 `12px`。
- 图片格使用完整 `1px` 边界或主题背景分层，不使用彩色侧边条。
- 移除态使用约 78% 的中性深色遮罩；错误红只用于真实错误，不承担普通移除悬停。

## Components

### Buttons

- **Shape:** 常规文字按钮使用 4px 圆角；紧凑按钮高度稳定，文字不会改变布局尺寸。
- **Primary:** 工作台蓝背景、白色文字、`10px 16px` 内边距，仅用于当前流程的主要提交动作。
- **Secondary / Ghost:** 使用 Obsidian 原生按钮或透明背景与次级文字色，不与主操作争夺注意力。
- **Icon Button:** 使用 Lucide 或 Obsidian 已有图标，`32px` 方形点击区、4px 圆角；移动端可增至 `34px`。陌生图标必须有 tooltip 和可访问名称。
- **States:** default、hover、focus、active、disabled、loading 都必须明确；loading 不得让按钮尺寸变化。

### Tabs and Segmented Controls

- 平台或视图切换使用标签页；互斥模式使用分段控件，不用一组相似的普通按钮代替。
- 活动态使用工作台蓝文字、短下划线或浅色背景中的一种主要信号，并保留非颜色信号。

### Cards / Containers

- 仅对重复项目、模态内容组或确实需要边界的工具使用容器。
- 常规半径为 8px，重要结果组最多 12px；避免卡片内再嵌套卡片。
- 边界使用 1px 边界灰，内部间距优先为 12–16px；列表和连续设置项优先用分隔线与留白。

### Inputs / Fields

- 复用 Obsidian 原生输入、开关、下拉框和滑块；自定义字段使用 4–8px 圆角、白色或主题表面及 1px 边界。
- 聚焦时边界转为工作台蓝，并增加 2px 低透明度 focus ring；错误态同时提供红色边界与文字说明。
- 长标题、路径和 Token 允许换行或安全省略，不能覆盖相邻按钮与状态。

### Status and Feedback

- 成功、警告、失败、连接和额度状态必须包含图标或文字，不只改变颜色。
- 完成状态紧邻下一步动作；例如成功后应让“在浏览器查看”或“复制链接”立即可见。
- Notice 适合提示需要重新打开预览等轻量后续动作；阻断性决定才使用 Modal。

### Preview and Publishing Surfaces

- 预览区是内容结果面，保持稳定尺寸和独立滚动；工具栏动作不能挤压预览内容。
- 手机边框是功能模式而非装饰卡片，固定比例和尺寸，移动端通过结构适配保证完整可见。
- 微信、飞书与其他平台在同一发布入口下保持分区清楚，账号、状态、结果与恢复动作不跨平台混用。

### Pictorial Article Components

- **Editorial section**：中性纸面、稳定阅读宽度和动态强调色的低频细线。
- **Hero figure**：显式首图；只消费 `hero:` marker，使用可选且去 marker 的图注。
- **Regular figure**：正文图片；保持原始图像和可选图注，不猜测角色。
- **Caption**：仅当作者提供非空说明时生成；用 muted 文字而不是额外品牌色。
- **Editorial headings**：H1 开篇、H2/H3 节奏分层；标题颜色尊重既有 coloredHeader 开关。
- **Quiet quote**：以空间、细边界和 soft accent 表达引用，不添加彩色侧边条。

### Sticker Image Order

- 图片网格是贴图模式的主要结果面；网格顺序与最终发布顺序一一对应。
- 添加本地图片使用 Obsidian/Lucide `upload`，素材库使用 `images`，移除使用 `x`；键盘排序使用方向箭头并提供可访问名称。
- 鼠标拖动、触摸移动和键盘排序必须调用同一重排逻辑；焦点在重排后跟随图片。
- 移除后提供“撤销”，不弹二次确认；超过 9 张时禁用添加入口并说明限制。
- 动效只表达拖动、焦点、移除和撤销状态，持续 `150ms`–`200ms`，并在减少动态效果偏好下关闭位移动画。

## Do's and Don'ts

### Do:

- **Do** 使用 `4 / 8 / 16 / 24 / 32 / 48px` 间距节奏和 `4 / 8 / 12px` 圆角级别，保持一致的组件语言。
- **Do** 优先复用 Obsidian 原生控件、主题变量与焦点行为，所有主要动作支持键盘操作。
- **Do** 让预览、复制与同步尽可能一致，并在平台限制导致差异时明确说明。
- **Do** 将工作台蓝 `#0071e3` 留给关键动作、当前选择和焦点，将状态色留给真实状态。
- **Do** 让每个加载、成功、警告和失败状态说明结果、影响与下一步。
- **Do** 分开维护插件操作 UI 与导出文章主题；主题色只影响文章表达，不改写操作语义。

### Don't:

- **Don't** 把工具界面做成营销落地页：禁止超大标题、装饰性 Hero、漂浮卡片堆叠和功能说明展板。
- **Don't** 使用通用 AI 产品套路：禁止紫蓝渐变、发光色块、玻璃拟态和无业务含义的装饰动画。
- **Don't** 脱离 Obsidian 重新发明开关、输入框、滚动条、弹窗和其他标准交互。
- **Don't** 用嵌套卡片、超过 12px 的常规容器圆角或高饱和 inactive 状态制造层级。
- **Don't** 把文章主题色当作插件 UI 的成功、警告或错误色，也不要用绿色承担一般主操作。
- **Don't** 只显示“成功”或“失败”而隐藏下一步、失败影响、重试或恢复路径。
- **Don't** 用流式字号、展示字体或负字距处理侧边栏、设置页、按钮和数据标签。
- **Do** 让图文志颜色从用户当前主题色动态派生，并对文字角色检查可读性。
- **Do** 把 `hero:` 当作明确作者意图；未标记的图片永远安全降级为 regular。
- **Do** 保持自定义 CSS 在基础输出后的覆盖顺序。
- **Don't** 复制 Flipped Editor、外部 AGPL 主题的精确 CSS、装饰 HTML、名称、示例内容、图片或固定配色。
- **Don't** 用图片尺寸、文件名、位置或主观算法推断 hero / wide 等角色。
- **Don't** 为图文志在微信输出中使用 class CSS、`<style>`、伪元素、复杂 Grid、动画或固定第二强调色。
