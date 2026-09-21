/*
## 核心功能

图片卡片主题（C01①：三套齐备）。提供主题 token 与卡片页面 scoped CSS 构建，主题颜色/字体全部显式定义，不随 Obsidian 深浅色漂移。

## 输入

主题 id；`buildCardPageCss(theme)` 的调用方（card-render-engine）。

## 输出

`getCardTheme(id)` → 主题定义（token + 元信息）；`buildCardPageCss(theme, typography?)` → 以 `.icard` 为根的 scoped CSS 字符串（typography 为 B03 排版覆盖：正文字号/行高/页面内边距，未提供项回落主题值）。

## 定位

位于 services/，卡片渲染样式层；CSS 仅作用于卡片 DOM，不进入工具壳/预览容器其他区域。

## 依赖

无运行时依赖（纯数据 + 字符串模板）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 六主题（2026-09-13 照搬 xiaoweibox-mono red-note themes.ts）：simple-white（极简白，默认）/ gradient-blue（渐变蓝）/ dark-gold（黑金，衬线）/ neon-purple（霓虹紫）/ forest-green（森林绿）/ rose-gold（玫瑰金，衬线）。差异 = token（含双层卡 cardBackground/cardShadow）+ coverStyle 四式（magazine/centered/luxury/neon）；extras 仅留 token 表达不了的规则。旧三主题 id 走 CARD_THEME_ID_ALIASES 静默迁移。新增主题必须同步 token + coverStyle 归属，不得使用宿主主题变量。
*/

export const CARD_THEME_IDS = /** @type {const} */ ([
  "simple-white",
  "gradient-blue",
  "dark-gold",
  "neon-purple",
  "forest-green",
  "rose-gold",
]);

export const DEFAULT_CARD_THEME_ID = "simple-white";

/** 旧三主题（2026-09-13 退役）→ 新主题别名（设置归一化时静默迁移） */
/** @type {Record<string, string>} */
export const CARD_THEME_ID_ALIASES = {
  "clear-notes": "simple-white",
  "paper-notes": "rose-gold",
  "dark-take": "dark-gold",
};

/** 逻辑画布（3:4 默认）；比例 → 逻辑尺寸统一由 card-render-engine 换算 */
export const CARD_PAGE_WIDTH = 375;
export const CARD_PAGE_HEIGHT_3_4 = 500;

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   tokens: {
 *     fontFamily: string,
 *     fontFamilyMono: string,
 *     headingFontFamily?: string,
 *     background: string,
 *     cardBackground: string,
 *     cardShadow: string,
 *     textColor: string,
 *     textColorSecondary: string,
 *     accentColor: string,
 *     borderColor: string,
 *     codeBackground: string,
 *     quoteBackground: string,
 *     headingWeight: string,
 *     pagePadding: number,
 *     contentGap: number,
 *   },
 *   coverStyle: string,
 * }} CardTheme
 */

/** @type {Record<string, CardTheme>} */
const THEMES = {
  // —— 六主题照搬 xiaoweibox-mono red-note themes.ts（2026-09-13，David 拍板直接搬）——
  "simple-white": {
    id: "simple-white",
    name: "极简白",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#f3f4f6",
      cardBackground: "#ffffff",
      cardShadow:
        "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
      textColor: "#1f2937",
      textColorSecondary: "#6b7280",
      accentColor: "#ef4444",
      borderColor: "#e5e7eb",
      codeBackground: "#f6f8fa",
      quoteBackground: "#ef444414",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "magazine",
  },
  "gradient-blue": {
    id: "gradient-blue",
    name: "渐变蓝",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%)",
      cardBackground: "rgba(255, 255, 255, 0.95)",
      cardShadow:
        "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      textColor: "#0f172a",
      textColorSecondary: "#64748b",
      accentColor: "#2563eb",
      borderColor: "#dbeafe",
      codeBackground: "#eff6ff",
      quoteBackground: "#2563eb14",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "centered",
  },
  "dark-gold": {
    id: "dark-gold",
    name: "黑金",
    tokens: {
      fontFamily: '"Songti SC", "Noto Serif SC", "SimSun", Georgia, serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#18181b",
      cardBackground: "#27272a",
      cardShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
      textColor: "#e4e4e7",
      textColorSecondary: "#a1a1aa",
      accentColor: "#f59e0b",
      borderColor: "#78350f",
      codeBackground: "#3f3f46",
      quoteBackground: "#f59e0b14",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 16,
    },
    coverStyle: "luxury",
  },
  "neon-purple": {
    id: "neon-purple",
    name: "霓虹紫",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#020617",
      cardBackground: "rgba(30, 27, 75, 0.9)",
      cardShadow: "0 0 20px rgba(192, 132, 252, 0.3)",
      textColor: "#f3e8ff",
      textColorSecondary: "#c4b5fd",
      accentColor: "#e879f9",
      borderColor: "#701a75",
      codeBackground: "#1e1b4b",
      quoteBackground: "#e879f914",
      headingWeight: "800",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "neon",
  },
  "forest-green": {
    id: "forest-green",
    name: "森林绿",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "linear-gradient(135deg, #064e3b 0%, #047857 100%)",
      cardBackground: "rgba(16, 185, 129, 0.1)",
      cardShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
      textColor: "#d1fae5",
      textColorSecondary: "#a7f3d0",
      accentColor: "#fcd34d",
      borderColor: "#065f46",
      codeBackground: "rgba(6, 78, 59, 0.6)",
      quoteBackground: "#fcd34d14",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "centered",
  },
  "rose-gold": {
    id: "rose-gold",
    name: "玫瑰金",
    tokens: {
      fontFamily: '"Songti SC", "Noto Serif SC", "SimSun", Georgia, serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
      cardBackground: "#ffffff",
      cardShadow: "0 10px 25px -5px rgba(244, 114, 182, 0.2)",
      textColor: "#831843",
      textColorSecondary: "#9d6b7d",
      accentColor: "#f472b6",
      borderColor: "#fbcfe8",
      codeBackground: "#fdf2f8",
      quoteBackground: "#f472b614",
      headingWeight: "600",
      pagePadding: 28,
      contentGap: 16,
    },
    coverStyle: "luxury",
  },
};

/**
 * 获取主题；未知 id 回落默认主题。
 * @param {string} id
 * @returns {CardTheme}
 */
export function getCardTheme(id) {
  return /** @type {CardTheme} */ (THEMES[id] || THEMES[DEFAULT_CARD_THEME_ID]);
}

/**
 * 是否为已定义主题（不回落）。
 * @param {string} id
 * @returns {boolean}
 */
export function hasCardTheme(id) {
  return Boolean(Object.prototype.hasOwnProperty.call(THEMES, id));
}

/**
 * 排版覆盖（B03）：字号/行高/边距；未提供的项回落主题 token 与固定值。
 * @typedef {{
 *   fontSize?: number,
 *   lineHeight?: number,
 *   pagePadding?: number,
 * }} CardTypography
 */

/**
 * 主题专属 CSS extras（§3.3「主题不是三种底色」）：在共享模板之上叠加排版差异。
 * 仅允许使用主题 token 的字面量颜色/字体，禁止宿主主题变量。
 * @type {Record<string, string>}
 */
/**
 * 主题专属 CSS extras：在共享模板之上叠加排版差异。
 * 2026-09-13 六主题照搬 red-note 后，差异主要走 token（含衬线字体/字重），
 * extras 仅保留 token 表达不了的规则；当前六主题暂无必需项，保留扩展位。
 * 仅允许使用主题 token 的字面量颜色/字体，禁止宿主主题变量。
 * @type {Record<string, string>}
 */
const THEME_CSS_EXTRAS = {};

/**
 * 封面变体 CSS（§3.3；2026-09-13 照搬 red-note coverStyle 四式，类名同步）：
 * - magazine（极简白 ← CoverCardMagazine）：日期页眉细线、标题组垂直居中、竖线摘要、底部居中圆点条。
 * - centered（渐变蓝/森林绿 ← CoverCard default）：全居中、标题下强调色圆角短条、底部署名。
 * - luxury（黑金/玫瑰金 ← CoverCardLuxury）：双细线框、内容垂直居中、衬线标题 + 短分隔线、斜体摘要。
 * - neon（霓虹紫 ← CoverCardNeon）：顶栏（NOTES · 日期）、右上光晕、特大标题、强调色边线摘要、底部渐变条。
 * DOM 共享 kicker(日期)/title/excerpt/meta(作者·水印)；仅 CSS 差异，token 字面量，禁止宿主变量。
 * @param {CardTheme} theme
 * @returns {string}
 */
function buildCoverCss(theme) {
  const t = theme.tokens;
  switch (theme.coverStyle) {
    case "centered":
      return `
.icard-cover--centered .icard-cover-body { align-items: center; text-align: center; }
.icard-cover--centered .icard-cover-kicker { margin-bottom: 18px; }
.icard-cover--centered .icard-cover-title {
  font-size: 25px;
  /* 标题组垂直居中（kicker 顶部、meta 署名贴底），消除下部大片留白 */
  margin-top: auto;
}
.icard-cover--centered .icard-cover-title::after {
  content: "";
  display: block;
  width: 56px;
  height: 4px;
  border-radius: 999px;
  background: ${t.accentColor};
  margin: 18px auto 0;
}
.icard-cover--centered .icard-cover-excerpt {
  margin-top: 16px;
  margin-bottom: auto;
  max-width: 30em;
}
.icard-cover--centered .icard-cover-meta { margin-top: 0; letter-spacing: 1px; }
`;
    case "luxury":
      return `
.icard-cover--luxury::before,
.icard-cover--luxury::after {
  content: "";
  position: absolute;
  pointer-events: none;
}
.icard-cover--luxury::before { inset: 10px; border: 1px solid ${t.borderColor}; }
.icard-cover--luxury::after { inset: 14px; border: 1px solid ${t.borderColor}; opacity: 0.45; }
.icard-cover--luxury .icard-cover-body { align-items: center; text-align: center; }
.icard-cover--luxury .icard-cover-kicker { letter-spacing: 3px; margin-bottom: 20px; }
.icard-cover--luxury .icard-cover-title { font-size: 26px; letter-spacing: 0.5px; margin-top: auto; }
.icard-cover--luxury .icard-cover-title::after {
  content: "";
  display: block;
  width: 44px;
  height: 2px;
  background: ${t.accentColor};
  margin: 18px auto 0;
}
.icard-cover--luxury .icard-cover-excerpt {
  margin-top: 16px;
  margin-bottom: auto;
  font-style: italic;
  max-width: 30em;
}
.icard-cover--luxury .icard-cover-meta {
  margin-top: 0;
  padding-top: 14px;
  border-top: 1px solid ${t.borderColor};
  align-self: stretch;
  text-align: center;
  letter-spacing: 2px;
}
`;
    case "neon":
      return `
.icard-cover--neon::before {
  content: "";
  position: absolute;
  top: -12%;
  right: -18%;
  width: 72%;
  height: 46%;
  background: radial-gradient(closest-side, ${t.accentColor}26, transparent);
  pointer-events: none;
}
.icard-cover--neon .icard-cover-kicker {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid ${t.borderColor};
}
.icard-cover--neon .icard-cover-kicker::before {
  content: "NOTES";
  font-size: 10px;
  letter-spacing: 3px;
  color: ${t.accentColor};
}
.icard-cover--neon .icard-cover-title {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.3px;
  /* 标题组垂直居中（kicker 顶栏、meta 渐变条贴底），消除下部大片留白 */
  margin-top: auto;
}
.icard-cover--neon .icard-cover-excerpt {
  margin-top: 14px;
  margin-bottom: auto;
  border-left: 3px solid ${t.accentColor};
  padding-left: 12px;
}
.icard-cover--neon .icard-cover-meta {
  letter-spacing: 1.5px;
}
.icard-cover--neon .icard-cover-meta::after {
  content: "";
  display: block;
  height: 3px;
  margin-top: 12px;
  border-radius: 999px;
  background: linear-gradient(90deg, ${t.accentColor}, transparent);
}
`;
    case "magazine":
    default:
      return `
.icard-cover--magazine .icard-cover-kicker {
  padding-bottom: 10px;
  border-bottom: 1px solid ${t.borderColor};
}
.icard-cover--magazine .icard-cover-title {
  font-size: 26px;
  /* 标题组垂直居中（kicker 页眉、meta 圆点条贴底），消除下部大片留白 */
  margin-top: auto;
}
.icard-cover--magazine .icard-cover-excerpt {
  margin-top: 18px;
  margin-bottom: auto;
  border-left: 3px solid ${t.accentColor};
  padding-left: 12px;
}
.icard-cover--magazine .icard-cover-meta { margin-top: 0; }
.icard-cover--magazine .icard-cover-meta::after {
  content: "";
  display: block;
  width: 68px;
  height: 6px;
  margin: 14px auto 0;
  background-image: radial-gradient(circle, ${t.borderColor} 2.5px, transparent 3px);
  background-size: 14px 6px;
  background-repeat: repeat-x;
}
`;
  }
}

/**
 * 构建主题 scoped CSS。所有选择器以 .icard 开头；颜色/字体全部来自 token，禁止宿主主题变量。
 * typography（B03）仅覆盖正文字号/行高与页面内边距；标题层级、页脚、表格字号保持固定，
 * 避免小字号下标题反向小于正文等失衡（归一化钳制在 card-settings-model.js）。
 * @param {CardTheme} theme
 * @param {CardTypography} [typography]
 * @returns {string}
 */
export function buildCardPageCss(theme, typography = {}) {
  const t = theme.tokens;
  const fs = Number(typography.fontSize) > 0 ? Number(typography.fontSize) : null;
  const lh = Number(typography.lineHeight) > 0 ? Number(typography.lineHeight) : null;
  const pad = Number(typography.pagePadding) > 0 ? Number(typography.pagePadding) : null;
  const bodySize = fs !== null ? `${fs}px` : "14px";
  const bodyLine = lh !== null ? `${lh}` : "1.7";
  const liLine = lh !== null ? `${lh}` : "1.65";
  // 引用/callout 正文比主字号小半档，保持视觉层级
  const quoteSize = fs !== null ? `${Math.max(10, fs - 0.5)}px` : "13.5px";
  const base = `
.icard {
  font-family: ${t.fontFamily};
  color: ${t.textColor};
}
/* red-note 双层卡骨架（2026-09-13 照搬 xiaoweibox-mono red-note）：
   page = 外层主题底色 + 固定 14px 外框；content = 内嵌圆角卡片（cardBackground + 阴影）。
   pagePadding 滑块语义保留为「内卡页面留白」。封面页 full-bleed，另行覆盖 padding。 */
.icard-page {
  position: relative;
  background: ${t.background};
  width: var(--icard-page-width, ${CARD_PAGE_WIDTH}px);
  min-height: var(--icard-page-height, ${CARD_PAGE_HEIGHT_3_4}px);
  box-sizing: border-box;
  padding: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.icard-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: ${t.contentGap}px;
  background: ${t.cardBackground};
  border-radius: 12px;
  box-shadow: ${t.cardShadow};
  box-sizing: border-box;
  padding: ${pad !== null ? `${pad}px` : `${t.pagePadding}px`};
}
/* —— red-note markdown 装饰：标题线、引用底色、强调染色 —— */
.icard-content h1, .icard-content h2, .icard-content h3,
.icard-content h4, .icard-content h5, .icard-content h6 {
  color: ${t.textColor};
  font-family: ${t.headingFontFamily || t.fontFamily};
  font-weight: ${t.headingWeight};
  line-height: 1.35;
  margin: 0;
}
.icard-content h1 {
  font-size: 22px;
  padding-bottom: 6px;
  border-bottom: 3px solid ${t.accentColor};
}
.icard-content h2 {
  font-size: 19px;
  padding-left: 10px;
  border-left: 4px solid ${t.accentColor};
}
.icard-content h3 {
  font-size: 17px;
  padding-left: 9px;
  border-left: 3px solid ${t.accentColor};
}
.icard-content h4, .icard-content h5, .icard-content h6 { font-size: 15px; }
.icard-content p {
  margin: 0;
  font-size: ${bodySize};
  line-height: ${bodyLine};
  color: ${t.textColor};
  text-align: justify;
  letter-spacing: 0.02em;
}
.icard-content a {
  color: ${t.accentColor};
  text-decoration: none;
}
.icard-content strong {
  font-weight: 700;
  color: ${t.accentColor};
}
.icard-content em { font-style: italic; }
.icard-content del { text-decoration: line-through; }
.icard-content code {
  font-family: ${t.fontFamilyMono};
  font-size: 12.5px;
  background: ${t.codeBackground};
  border: 1px solid ${t.borderColor};
  border-radius: 4px;
  padding: 1px 5px;
}
.icard-content ul, .icard-content ol {
  margin: 0;
  padding-left: 20px;
  list-style: none;
}
/* 圆点/编号用显式 .icard-marker 元素渲染（绝对定位悬挂缩进）：
   不用 ::marker——捕获引擎克隆与 Obsidian 宿主环境对 ::marker 的支持不一致，会丢圆点 */
.icard-content li {
  position: relative;
  font-size: ${bodySize};
  line-height: ${liLine};
  margin: 6px 0;
  padding-left: 18px;
}
.icard-content li .icard-marker {
  position: absolute;
  left: 0;
  text-align: right;
  min-width: 14px;
}
.icard-content ul ul, .icard-content ol ol, .icard-content ul ol, .icard-content ol ul {
  margin: 4px 0;
}
.icard-content li.icard-nested-1 { margin-left: 16px; }
.icard-content li.icard-nested-2 { margin-left: 32px; }
.icard-content li.icard-task .icard-task-box {
  display: inline-block;
  width: 14px;
  height: 14px;
  line-height: 14px;
  text-align: center;
  border: 1.5px solid ${t.borderColor};
  border-radius: 3px;
  margin-right: 6px;
  font-size: 11px;
  color: ${t.accentColor};
}
.icard-content li.icard-task.icard-task-done { color: ${t.textColorSecondary}; }
.icard-content blockquote {
  margin: 0;
  padding: 10px 14px;
  background: ${t.quoteBackground};
  border-left: 3px solid ${t.accentColor};
  border-radius: 0 6px 6px 0;
  font-size: ${quoteSize};
  line-height: ${liLine};
}
.icard-content blockquote .icard-callout-title {
  font-weight: 700;
  font-size: 13.5px;
  color: ${t.accentColor};
  margin-bottom: 4px;
}
.icard-content blockquote p { font-size: ${quoteSize}; }
.icard-content table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12.5px;
  line-height: 1.5;
}
.icard-content th, .icard-content td {
  border: 1px solid ${t.borderColor};
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}
.icard-content th {
  background: ${t.codeBackground};
  font-weight: 700;
}
.icard-content img {
  max-width: 100%;
  border-radius: 12px;
  display: block;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}
/* 超高图片等比缩入（分页计划 scaled 标记）：高度钳制到单页可用内容高度 */
.icard-content img.icard-img-fit {
  max-height: var(--icard-content-height, 100%);
  width: auto;
}
.icard-content hr {
  border: none;
  border-top: 1px solid ${t.borderColor};
  margin: 4px 0;
  width: 100%;
}
/* —— 页脚条（red-note 式）：外底上的单行，左页码、右水印；水印不再用绝对定位覆盖层 —— */
.icard-footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 4px 2px;
  font-size: 11px;
  color: ${t.textColorSecondary};
}
.icard-footer .icard-page-num { font-variant-numeric: tabular-nums; flex-shrink: 0; }
.icard-footer .icard-watermark {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  letter-spacing: 2px;
  opacity: 0.75;
}
/* —— 文字封面（C01③）：共享骨架，按主题 coverStyle 出对应变体 ——
   封面 full-bleed：外框不用双层卡，单独给足页面留白 */
.icard-cover {
  padding: 26px;
}
.icard-cover--full-bleed {
  padding: 0;
  overflow: hidden;
}
.icard-cover-full-bleed-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.icard-cover--has-image {
  position: relative;
  overflow: hidden;
}
.icard-cover-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  z-index: 0;
}
.icard-cover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.65) 100%);
  z-index: 1;
}
.icard-cover--has-image .icard-cover-body {
  position: relative;
  z-index: 2;
}
.icard-cover--has-image .icard-cover-title,
.icard-cover--has-image .icard-cover-excerpt,
.icard-cover--has-image .icard-cover-kicker,
.icard-cover--has-image .icard-cover-meta {
  color: #ffffff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
}
/* 自适应封面：根据 6 主题各自的美学特征自然融入图片 */
.icard-cover--adaptive.icard-cover--magazine {
  padding: 16px;
}
.icard-cover--adaptive.icard-cover--magazine .icard-cover-hero {
  width: 100%;
  height: 48%;
  max-height: 240px;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 14px;
  flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}
.icard-cover--adaptive.icard-cover--magazine .icard-cover-hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.icard-cover--adaptive.icard-cover--magazine .icard-cover-title {
  margin-top: 0;
  font-size: 23px;
}

.icard-cover--adaptive.icard-cover--centered .icard-cover-frame {
  width: 180px;
  height: 180px;
  margin: 8px auto 14px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.85);
}
.icard-cover--adaptive.icard-cover--centered .icard-cover-frame-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.icard-cover--adaptive.icard-cover--centered .icard-cover-title {
  margin-top: 0;
  font-size: 23px;
}

.icard-cover--adaptive.icard-cover--luxury .icard-cover-arch {
  width: 160px;
  height: 190px;
  margin: 10px auto 12px;
  border-radius: 80px 80px 8px 8px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1.5px solid ${t.borderColor};
  box-shadow: 0 15px 30px rgba(0, 0, 0, 0.5);
}
.icard-cover--adaptive.icard-cover--luxury .icard-cover-arch-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.icard-cover--adaptive.icard-cover--luxury .icard-cover-title {
  margin-top: 0;
  font-size: 23px;
}

.icard-cover-cyber-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.72) 0%, rgba(2, 6, 23, 0.9) 100%);
  background-image: linear-gradient(#ffffff0a 1px, transparent 1px), linear-gradient(90deg, #ffffff0a 1px, transparent 1px);
  background-size: 32px 32px;
  z-index: 1;
}
.icard-cover-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.icard-cover-kicker {
  font-size: 11px;
  letter-spacing: 2.5px;
  font-weight: 600;
  color: ${t.accentColor};
}
.icard-cover-title {
  font-family: ${t.headingFontFamily || t.fontFamily};
  font-weight: ${t.headingWeight};
  color: ${t.textColor};
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.icard-cover-excerpt {
  font-size: 13.5px;
  line-height: 1.7;
  color: ${t.textColorSecondary};
  overflow-wrap: anywhere;
}
.icard-cover-meta {
  font-size: 12px;
  color: ${t.textColorSecondary};
  overflow-wrap: anywhere;
}
${buildCoverCss(theme)}
`;
  return base + (THEME_CSS_EXTRAS[theme.id] || "");
}
