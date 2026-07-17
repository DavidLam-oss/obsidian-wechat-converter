/*
## 核心功能

集中定义 AppleTheme 的色板、字号、字体、主题预设、间距和圆角常量。

## 输入

不接收运行时输入；配置由 AppleTheme 只读引用。

## 输出

输出主题类使用的静态配置对象和中性色常量。

## 定位

位于 themes/，是 apple-theme.js 的配置子模块；不生成具体标签样式。

## 依赖

无运行时依赖。

## 维护规则

- 保持配置对象的数据结构与 AppleTheme 公共静态字段一致。
- 新主题只在此处登记，样式算法放在对应样式模块。
*/

/**
 * @typedef {'github' | 'wechat' | 'serif' | 'paper' | 'grid' | 'typo' | 'media' | 'colorful'} AppleThemeName
 * @typedef {'blue' | 'green' | 'purple' | 'orange' | 'teal' | 'rose' | 'ruby' | 'slate'} AppleThemeColorName
 * @typedef {'sans-serif' | 'serif' | 'monospace'} AppleFontFamilyName
 * @typedef {1 | 2 | 3 | 4 | 5} AppleFontSizeName
 * @typedef {{ base: number, h1: number, h2: number, h3: number, h4: number, h5: number, h6: number, code: number, caption: number }} AppleFontSizeConfig
 * @typedef {Record<string, unknown> & { name: string, lineHeight: number, paragraphGap: number, textColor: string }} AppleThemeConfig
 */

/**
 * 🎨 主题色板 - 8种预设颜色
 */
/** @type {Record<AppleThemeColorName, string>} */
const THEME_COLORS = {
  blue: '#0366d6',
  green: '#28a745',
  purple: '#6f42c1',
  orange: '#fd7e14',
  teal: '#20c997',
  rose: '#e83e8c',
  ruby: '#dc3545',
  slate: '#6c757d',
};

/**
 * 🎨 标题专用深色板 (Tone-on-Tone)
 * 相比主题色加深 15-20%，用于标题以增加视觉稳重感，避免与正文高亮色冲突
 */
/** @type {Record<AppleThemeColorName, string>} */
const THEME_COLORS_DEEP = {
  blue: '#004795',    // Deep Blue
  green: '#1e7e34',   // Deep Green
  purple: '#4a2b82',  // Deep Purple
  orange: '#c75e0b',  // Deep Orange
  teal: '#158765',    // Deep Teal
  rose: '#b81f66',    // Deep Rose
  ruby: '#a81825',    // Deep Ruby
  slate: '#495057',   // Deep Slate
};

/**
 * 📐 字体大小系统 - 5档
 */
/** @type {Record<AppleFontSizeName, AppleFontSizeConfig>} */
const FONT_SIZES = {
  1: { base: 14, h1: 26, h2: 20, h3: 16, h4: 14, h5: 14, h6: 14, code: 12, caption: 12 },
  2: { base: 15, h1: 28, h2: 21, h3: 17, h4: 15, h5: 15, h6: 15, code: 13, caption: 12 },
  3: { base: 16, h1: 30, h2: 22, h3: 18, h4: 16, h5: 16, h6: 16, code: 14, caption: 13 }, // 推荐
  4: { base: 17, h1: 32, h2: 24, h3: 19, h4: 17, h5: 17, h6: 17, code: 15, caption: 14 },
  5: { base: 18, h1: 34, h2: 26, h3: 20, h4: 18, h5: 18, h6: 18, code: 16, caption: 14 },
};

/**
 * 🔤 字体栈
 */
/** @type {Record<AppleFontFamilyName, string>} */
const FONTS = {
  'sans-serif': `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif`,
  'serif': `'Times New Roman', Georgia, 'SimSun', serif`,
  'monospace': `'SF Mono', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
};

/**
 * 🎨 主题配置 - 每种主题的独特配色和规则
 */
/** @type {Record<AppleThemeName, AppleThemeConfig>} */
const THEME_CONFIGS = {

  github: {
    name: '简约',
    lineHeight: 1.82,
    paragraphGap: 18,
    h1Decoration: 'none',
    h2Decoration: 'none',
    h3Decoration: 'bottom-line-left',
    h4Decoration: 'none',
    headingWeight: 800,
    headingLetterSpacing: 0,
    textColor: '#3e3e3e',
    headingColor: '#3e3e3e',

    linkDecoration: 'underline',
    blockquoteBorderWidth: 4,
    tableHeaderBg: '#f6f8fa',
    tableCellPadding: 10,
    figurePadding: 8,
    figureBorderColor: '#e8eaed',
    // Removed blockquoteBorderColor to allow theme color (was #d0d7de)
    // Removed blockquoteBg to allow theme color tint (was #ffffff)
  },
  wechat: {
    name: '经典',
    lineHeight: 1.8,
    paragraphGap: 24,
    h1Decoration: 'classic-title',
    h2Decoration: 'classic-title',
    h3Decoration: 'classic-subhead',
    h4Decoration: 'classic-minor',
    headingWeight: 700,
    headingLetterSpacing: 0,
    textColor: '#3e3e3e',
    headingColor: '#3e3e3e',
    linkDecoration: 'none',
    blockquoteBorderWidth: 4,
    blockquoteBg: '#f8fafc',
    blockquoteStyle: 'soft',
  },
  serif: {
    name: '优雅',
    lineHeight: 1.8,
    paragraphGap: 26,
    h1Decoration: 'editorial-h1',      // 杂志大标题 (金线)
    h2Decoration: 'editorial-h1',      // H2 此时也是金线 (Level 2 = Level 1)
    h3Decoration: 'editorial-h2',      // H3 使用原 H2 样式 (斜体，现在的 helper 已强制左对齐)
    h4Decoration: 'editorial-h3',      // H4 使用原 H3 (左对齐下划线)
    headingWeight: 700,
    headingLetterSpacing: 1,           // 优雅主题增加字间距
    textColor: '#3e3e3e',
    headingColor: '#3e3e3e',
    linkDecoration: 'none',
    blockquoteBorderWidth: 0,          // 居中样式不需要左边框
    blockquoteStyle: 'center',         // 新增：居中引用
  },
  paper: {
    name: '纸张长文',
    lineHeight: 1.9,
    paragraphGap: 22,
    shiftHeadingDecorationsDown: true,
    h1Decoration: 'paper-title',
    h2Decoration: 'paper-chapter',
    h3Decoration: 'paper-section',
    h4Decoration: 'paper-kicker',
    h5Decoration: 'simple',
    h6Decoration: 'quiet',
    headingWeight: 700,
    headingLetterSpacing: 0,
    textColor: '#3f3a33',
    headingColor: '#3e3e3e',
    sectionBg: '#fffdf8',
    sectionSidePaddingOffset: 6,
    mutedTextColor: '#786f63',
    linkDecoration: 'none',
    blockquoteBorderWidth: 0,
    blockquoteBg: '#f7f1e7',
    blockquoteStyle: 'paper',
    tableHeaderBg: '#f7f1e7',
    tableBorderColor: '#e6dccd',
    figureBorderColor: '#eadfce',
  },
  grid: {
    name: '网格文档',
    lineHeight: 1.82,
    paragraphGap: 20,
    shiftHeadingDecorationsDown: true,
    h1Decoration: 'grid-title',
    h2Decoration: 'grid-chapter',
    h3Decoration: 'grid-section',
    h4Decoration: 'grid-kicker',
    h5Decoration: 'light-bg',
    h6Decoration: 'quiet',
    headingWeight: 800,
    headingLetterSpacing: 0,
    textColor: '#344054',
    headingColor: '#263238',
    sectionBgStyle: 'grid',
    sectionBg: '#ffffff',
    sectionSidePaddingOffset: 6,
    sectionBgSize: '18px 18px',
    gridLineAlpha: '09',
    mutedTextColor: '#667085',
    linkDecoration: 'none',
    blockquoteBorderWidth: 4,
    blockquoteBg: '#f6f9fc',
    blockquoteStyle: 'soft',
    blockquoteTextColor: '#4b5565',
    tableHeaderBg: '#f3f7fb',
    tableBorderColor: '#dbe5ef',
  },
  typo: {
    name: 'Typo',
    lineHeight: 1.92,
    paragraphGap: 22,
    shiftHeadingDecorationsDown: true,
    h1Decoration: 'typo-title',
    h2Decoration: 'typo-title',
    h3Decoration: 'typo-section',
    h4Decoration: 'typo-subhead',
    h5Decoration: 'dashed-bottom',
    h6Decoration: 'quiet',
    headingWeight: 700,
    headingLetterSpacing: 0,
    textColor: '#333333',
    headingColor: '#222222',
    mutedTextColor: '#6b6b6b',
    linkDecoration: 'underline',
    blockquoteBorderWidth: 2,
    blockquoteBg: '#fafafa',
    blockquoteStyle: 'soft',
    paragraphTextIndent: '2em',
    tableHeaderBg: '#f7f7f7',
    figureBorderColor: '#ededed',
  },
  media: {
    name: '清爽媒体',
    lineHeight: 1.86,
    paragraphGap: 18,
    shiftHeadingDecorationsDown: true,
    h1Decoration: 'media-title',
    h2Decoration: 'media-chapter',
    h3Decoration: 'media-section',
    h4Decoration: 'left-border',
    h5Decoration: 'light-bg',
    h6Decoration: 'quiet',
    headingWeight: 700,
    headingLetterSpacing: 0,
    textColor: '#3b4648',
    headingColor: '#263238',
    mutedTextColor: '#667476',
    linkDecoration: 'none',
    blockquoteBorderWidth: 3,
    blockquoteBg: '#f3fbf8',
    blockquoteStyle: 'soft',
    tableHeaderBg: '#f3fbf8',
    tableBorderColor: '#dbeee8',
    figureBorderColor: '#dcefeb',
  },
  colorful: {
    name: '彩色强调',
    lineHeight: 1.82,
    paragraphGap: 20,
    shiftHeadingDecorationsDown: true,
    h1Decoration: 'colorful-title',
    h2Decoration: 'colorful-chapter',
    h3Decoration: 'colorful-section',
    h4Decoration: 'colorful-kicker',
    h5Decoration: 'light-bg',
    h6Decoration: 'quiet',
    headingWeight: 800,
    headingLetterSpacing: 0,
    textColor: '#3e3e3e',
    headingColor: '#3e3e3e',
    mutedTextColor: '#6b7280',
    linkDecoration: 'none',
    blockquoteBorderWidth: 4,
    blockquoteBg: '#fffaf5',
    blockquoteStyle: 'soft',
    tableHeaderBg: '#fff8ed',
    figureBorderColor: '#f0e4d4',
    strongBg: true,
  },
};

/**
 * 📐 间距系统 - 8px 基准
 */
/** @type {Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl', number>} */
const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

/**
 * 🎯 圆角系统
 */
/** @type {Record<'sm' | 'md' | 'lg', number>} */
const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
};

const QUOTE_CALLOUT_NEUTRAL_BG = '#f9f9f9';
const QUOTE_NEUTRAL_BORDER = '#d9d9d9';


export {
  THEME_COLORS,
  THEME_COLORS_DEEP,
  FONT_SIZES,
  FONTS,
  THEME_CONFIGS,
  SPACING,
  RADIUS,
  QUOTE_CALLOUT_NEUTRAL_BG,
  QUOTE_NEUTRAL_BORDER,
};
