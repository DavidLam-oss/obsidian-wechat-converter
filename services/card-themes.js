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
- 三主题（§3.3「主题不是三种底色」）：clear-notes（清晰笔记，默认）/ paper-notes（纸页随笔：暖纸底 + 衬线标题 + 编辑式引用）/ dark-take（深色观点：强标题尺度 + 少量强调色）。差异 = token + THEME_CSS_EXTRAS 专属规则，新增主题必须同时在两处定义，且不得使用宿主主题变量。
*/

export const CARD_THEME_IDS = /** @type {const} */ (["clear-notes", "paper-notes", "dark-take"]);

export const DEFAULT_CARD_THEME_ID = "clear-notes";

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
  "clear-notes": {
    id: "clear-notes",
    name: "清晰笔记",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#ffffff",
      textColor: "#1f2328",
      textColorSecondary: "#59636e",
      accentColor: "#0969da",
      borderColor: "#d1d9e0",
      codeBackground: "#f6f8fa",
      quoteBackground: "#f6f8fa",
      headingWeight: "700",
      pagePadding: 28,
      contentGap: 14,
    },
    coverStyle: "left-aligned",
  },
  "paper-notes": {
    id: "paper-notes",
    name: "纸页随笔",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      // 衬线标题（§3.3 纸页随笔：暖纸底、衬线标题与克制正文、编辑式段落节奏）
      headingFontFamily:
        'Georgia, "Times New Roman", "Songti SC", "Noto Serif SC", "SimSun", serif',
      background: "#faf6ef",
      textColor: "#3d3529",
      textColorSecondary: "#8a7f6d",
      accentColor: "#9a3b26",
      borderColor: "#e2d9c8",
      codeBackground: "#f1ead9",
      quoteBackground: "transparent",
      headingWeight: "600",
      pagePadding: 30,
      contentGap: 18,
    },
    coverStyle: "masthead",
  },
  "dark-take": {
    id: "dark-take",
    name: "深色观点",
    tokens: {
      fontFamily:
        '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
      fontFamilyMono:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
      background: "#14161a",
      textColor: "#e8eaed",
      textColorSecondary: "#9aa0a6",
      accentColor: "#e8a33d",
      borderColor: "#2a2e35",
      codeBackground: "#1d2026",
      quoteBackground: "#1d2026",
      headingWeight: "800",
      pagePadding: 30,
      contentGap: 18,
    },
    coverStyle: "statement",
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
const THEME_CSS_EXTRAS = {
  "paper-notes": `
.icard-content h1, .icard-content h2, .icard-content h3,
.icard-content h4, .icard-content h5, .icard-content h6 {
  font-family: ${THEMES["paper-notes"].tokens.headingFontFamily};
  letter-spacing: 0.3px;
}
.icard-content h1 { font-size: 21px; }
.icard-content p { letter-spacing: 0.2px; }
/* 编辑式引用：去底色，仅留细线与次级色，靠缩进表达层级 */
.icard-content blockquote {
  border-left: 2px solid ${THEMES["paper-notes"].tokens.accentColor};
  border-radius: 0;
  padding: 2px 0 2px 14px;
  color: ${THEMES["paper-notes"].tokens.textColorSecondary};
}
.icard-content blockquote .icard-callout-title { font-weight: 600; }
.icard-content hr { border-top: 1px solid ${THEMES["paper-notes"].tokens.borderColor}; }
`,
  "dark-take": `
/* 强标题尺度：h1 放大、层级对比拉开 */
.icard-content h1 { font-size: 24px; letter-spacing: 0.2px; }
.icard-content h2 { font-size: 20px; }
.icard-content h3 { font-size: 18px; }
.icard-content h4, .icard-content h5, .icard-content h6 { font-size: 15.5px; }
/* 少量强调色：引用边线、callout 标题、任务勾选；正文不染色 */
.icard-content blockquote { border-left: 2px solid ${THEMES["dark-take"].tokens.accentColor}; }
.icard-content a { color: ${THEMES["dark-take"].tokens.accentColor}; }
.icard-content th { background: ${THEMES["dark-take"].tokens.codeBackground}; }
.icard-content img { border-radius: 8px; }
`,
};

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
.icard-page {
  background: ${t.background};
  width: var(--icard-page-width, ${CARD_PAGE_WIDTH}px);
  min-height: var(--icard-page-height, ${CARD_PAGE_HEIGHT_3_4}px);
  box-sizing: border-box;
  padding: ${pad !== null ? `${pad}px` : `${t.pagePadding}px`};
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.icard-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: ${t.contentGap}px;
}
.icard-content h1, .icard-content h2, .icard-content h3,
.icard-content h4, .icard-content h5, .icard-content h6 {
  color: ${t.textColor};
  font-family: ${t.headingFontFamily || t.fontFamily};
  font-weight: ${t.headingWeight};
  line-height: 1.35;
  margin: 0;
}
.icard-content h1 { font-size: 22px; }
.icard-content h2 { font-size: 19px; }
.icard-content h3 { font-size: 17px; }
.icard-content h4, .icard-content h5, .icard-content h6 { font-size: 15px; }
.icard-content p {
  margin: 0;
  font-size: ${bodySize};
  line-height: ${bodyLine};
  color: ${t.textColor};
}
.icard-content a {
  color: ${t.accentColor};
  text-decoration: none;
}
.icard-content strong { font-weight: 700; }
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
  border-radius: 6px;
  display: block;
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
.icard-footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid ${t.borderColor};
  font-size: 11px;
  color: ${t.textColorSecondary};
}
.icard-footer .icard-page-num { font-variant-numeric: tabular-nums; }
`;
  return base + (THEME_CSS_EXTRAS[theme.id] || "");
}
