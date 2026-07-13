/*
## 核心功能

定义微信公众号文章的 Apple 风格主题、内联样式和内置预设。

## 输入

接收主题设置、渲染后的 HTML 结构和微信编辑器兼容约束。

## 输出

输出 同文件内副作用、配置对象、测试断言或样式规则，供 converter.js 应用主题样式。

## 定位

位于 themes/，是文章主题层；不处理 Markdown 解析或发布同步。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 themes 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/**
 * 🍎 Apple Style 多主题系统
 * 支持多种主题风格：简约、经典、水墨、极光等
 * 设计理念：克制、优雅、注重细节
 */

/**
 * @typedef {'github' | 'wechat' | 'serif' | 'paper' | 'grid' | 'typo' | 'media' | 'colorful'} AppleThemeName
 * @typedef {'blue' | 'green' | 'purple' | 'orange' | 'teal' | 'rose' | 'ruby' | 'slate'} AppleThemeColorName
 * @typedef {'sans-serif' | 'serif' | 'monospace'} AppleFontFamilyName
 * @typedef {1 | 2 | 3 | 4 | 5} AppleFontSizeName
 * @typedef {{ base: number, h1: number, h2: number, h3: number, h4: number, h5: number, h6: number, code: number, caption: number }} AppleFontSizeConfig
 * @typedef {{
 *   name: string,
 *   lineHeight: number,
 *   paragraphGap: number,
 *   h1Decoration?: string,
 *   h2Decoration?: string,
 *   h3Decoration?: string,
 *   h4Decoration?: string,
 *   h5Decoration?: string,
 *   h6Decoration?: string,
 *   headingWeight?: number,
 *   headingLetterSpacing?: number,
 *   textColor: string,
 *   headingColor?: string,
 *   mutedTextColor?: string,
 *   sectionBg?: string,
 *   sectionBgStyle?: string,
 *   sectionBgSize?: string,
 *   sectionSidePaddingOffset?: number,
 *   gridLineAlpha?: string,
 *   shiftHeadingDecorationsDown?: boolean,
 *   linkDecoration?: string,
 *   blockquoteBorderWidth?: number,
 *   blockquoteBorderColor?: string,
 *   blockquoteBg?: string,
 *   blockquoteStyle?: string,
 *   blockquoteTextColor?: string,
 *   tableHeaderBg?: string,
 *   tableBorderColor?: string,
 *   tableCellPadding?: number,
 *   figurePadding?: number,
 *   figureBorderColor?: string,
 *   paragraphTextIndent?: string,
 *   strongBg?: boolean,
 * }} AppleThemeConfig
 * @typedef {{
 *   theme?: AppleThemeName | string,
 *   themeColor?: AppleThemeColorName | 'custom' | string,
 *   customColor?: string | null,
 *   quoteCalloutStyleMode?: 'theme' | 'neutral' | string,
 *   fontFamily?: AppleFontFamilyName | string,
 *   fontSize?: AppleFontSizeName | number,
 *   macCodeBlock?: boolean,
 *   codeLineNumber?: boolean,
 *   sidePadding?: number,
 *   coloredHeader?: boolean,
 * }} AppleThemeOptions
 */

// Use assignment expression to avoid "Identifier has already been declared" errors if re-eval'd
const APPLE_THEME_GLOBAL = /** @type {Record<string, unknown>} */ (typeof window !== 'undefined' ? window : {});

class AppleTheme {
  /**
   * 🎨 主题色板 - 8种预设颜色
   */
  /** @type {Record<AppleThemeColorName, string>} */
  static THEME_COLORS = {
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
  static THEME_COLORS_DEEP = {
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
  static FONT_SIZES = {
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
  static FONTS = {
    'sans-serif': `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif`,
    'serif': `'Times New Roman', Georgia, 'SimSun', serif`,
    'monospace': `'SF Mono', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
  };

  /**
   * 🎨 主题配置 - 每种主题的独特配色和规则
   */
  /** @type {Record<AppleThemeName, AppleThemeConfig>} */
  static THEME_CONFIGS = {

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
  static SPACING = {
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
  static RADIUS = {
    sm: 4,
    md: 8,
    lg: 12,
  };

  static QUOTE_CALLOUT_NEUTRAL_BG = '#f9f9f9';
  static QUOTE_NEUTRAL_BORDER = '#d9d9d9';

  /**
   * 当前配置
   * @param {AppleThemeOptions} [options]
   */
  constructor(options = {}) {
    /** @type {AppleThemeName | string} */
    this.themeName = typeof options.theme === 'string' && options.theme ? options.theme : 'github';
    /** @type {AppleThemeColorName | 'custom' | string} */
    this.themeColor = typeof options.themeColor === 'string' && options.themeColor ? options.themeColor : 'blue';
    /** @type {string | null} */
    this.customColor = typeof options.customColor === 'string' && options.customColor ? options.customColor : null;
    /** @type {'theme' | 'neutral' | string} */
    this.quoteCalloutStyleMode = typeof options.quoteCalloutStyleMode === 'string' ? options.quoteCalloutStyleMode : 'theme';
    /** @type {AppleFontFamilyName | string} */
    this.fontFamily = typeof options.fontFamily === 'string' && options.fontFamily ? options.fontFamily : 'sans-serif';
    /** @type {AppleFontSizeName | number} */
    this.fontSize = typeof options.fontSize === 'number' ? options.fontSize : 3;
    /** @type {boolean} */
    this.macCodeBlock = options.macCodeBlock !== false;
    /** @type {boolean} */
    this.codeLineNumber = Boolean(options.codeLineNumber);
    // 侧边距设置 (默认 16px)
    /** @type {number} */
    this.sidePadding = options.sidePadding !== undefined ? Number(options.sidePadding) : 16;
    // 间距微调（全局覆盖；null/undefined = 继承当前主题默认）
    // 注意：字距默认 0（与正文现状一致），合法值 0 必须用 ?? 解析，不能用 ||
    /** @type {number | null | undefined} */
    this.lineHeight = options.lineHeight;
    /** @type {number | null | undefined} */
    this.paragraphGap = options.paragraphGap;
    /** @type {number | null | undefined} */
    this.letterSpacing = options.letterSpacing;
    // 标题染色设置
    /** @type {boolean} */
    this.coloredHeader = Boolean(options.coloredHeader);
  }

  /**
   * 获取当前主题色值
   * @returns {string}
   */
  getThemeColorValue() {
    if (this.themeColor === 'custom' && this.customColor) {
      return this.customColor;
    }
    return AppleTheme.THEME_COLORS[/** @type {AppleThemeColorName} */ (this.themeColor)] || AppleTheme.THEME_COLORS.blue;
  }

  /**
   * 获取标题专用深色值
   * @returns {string}
   */
  getHeadingColorValue() {
    // 1. 如果未开启标题染色，返回默认深灰
    if (!this.coloredHeader) {
      return '#3e3e3e';
    }

    // 2. 自定义颜色：自动计算变深 20%
    if (this.themeColor === 'custom' && this.customColor) {
      return this.adjustColorBrightness(this.customColor, -20);
    }

    // 3. 预设颜色：返回深色板对应值
    return AppleTheme.THEME_COLORS_DEEP[/** @type {AppleThemeColorName} */ (this.themeColor)] || AppleTheme.THEME_COLORS_DEEP.blue;
  }

  /**
   * 辅助：调整 Hex 颜色亮度
   * @param {string} hex - #RRGGBB
   * @param {number} percent - -100 to 100
   * @returns {string}
   */
  adjustColorBrightness(hex, percent) {
    hex = hex.replace(/^#/, '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    r = Math.round(r * (100 + percent) / 100);
    g = Math.round(g * (100 + percent) / 100);
    b = Math.round(b * (100 + percent) / 100);

    r = (r < 255) ? r : 255;
    g = (g < 255) ? g : 255;
    b = (b < 255) ? b : 255;

    // Pad with 0 if necessary
    const rr = ((r.toString(16).length === 1) ? '0' + r.toString(16) : r.toString(16));
    const gg = ((g.toString(16).length === 1) ? '0' + g.toString(16) : g.toString(16));
    const bb = ((b.toString(16).length === 1) ? '0' + b.toString(16) : b.toString(16));

    return `#${rr}${gg}${bb}`;
  }

  /**
   * 获取当前主题配置
   * @returns {AppleThemeConfig}
   */
  getThemeConfig() {
    return AppleTheme.THEME_CONFIGS[/** @type {AppleThemeName} */ (this.themeName)] || AppleTheme.THEME_CONFIGS.github;
  }

  /**
   * 获取字体尺寸配置
   * @returns {AppleFontSizeConfig}
   */
  getSizes() {
    return AppleTheme.FONT_SIZES[/** @type {AppleFontSizeName} */ (this.fontSize)] || AppleTheme.FONT_SIZES[3];
  }

  /**
   * 获取字体栈
   * @returns {string}
   */
  getFontFamily() {
    return AppleTheme.FONTS[/** @type {AppleFontFamilyName} */ (this.fontFamily)] || AppleTheme.FONTS['sans-serif'];
  }

  /**
   * @returns {'theme' | 'neutral'}
   */
  getQuoteCalloutStyleMode() {
    return this.quoteCalloutStyleMode === 'neutral' ? 'neutral' : 'theme';
  }

  /**
   * 获取元素样式
   * @param {string} tagName - HTML 标签名
   * @returns {string} - CSS 样式字符串
   */
  getStyle(tagName) {
    const config = this.getThemeConfig();
    const sizes = this.getSizes();
    const font = this.getFontFamily();
    const color = this.getThemeColorValue();
    const quoteCalloutStyleMode = this.getQuoteCalloutStyleMode();
    const s = AppleTheme.SPACING;
    const r = AppleTheme.RADIUS;

    // 标题颜色逻辑：使用专门的深色系标题色
    // 注意：某些特殊主题装饰(h1Decoration)可能已经包含了颜色设置，这里主要针对文字本身
    const textColor = config.textColor;
    const mutedTextColor = config.mutedTextColor;
    const headingColor = this.getHeadingColorValue();
    const sectionSidePadding = this.getSectionSidePadding(config);

    // 间距微调有效值：全局覆盖优先，null/undefined 回退主题默认。
    // 字距无主题级配置，默认 0；0 是合法值，必须用 ?? 保留 0（不能用 ||）。
    const effectiveLineHeight = this.lineHeight ?? config.lineHeight;
    const effectiveParagraphGap = this.paragraphGap ?? config.paragraphGap;
    const effectiveLetterSpacing = this.letterSpacing ?? 0;

    switch (tagName) {
      case 'section':
        // 使用配置的 sidePadding
        if (config.sectionBgStyle !== 'grid') {
          return this.joinStyleStrings(
            `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${effectiveLineHeight}; color: ${textColor}; padding: 20px ${sectionSidePadding}px; background: ${config.sectionBg || '#ffffff'}; ${this.getSectionBoxSizingStyle(config)}max-width: 100%; word-wrap: break-word; word-break: normal; overflow-wrap: break-word; line-break: strict; text-align: justify`
          );
        }

        return this.joinStyleStrings(
          `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${effectiveLineHeight}; color: ${textColor}; padding: 20px ${sectionSidePadding}px; box-sizing: border-box; max-width: 100%; word-wrap: break-word; word-break: normal; overflow-wrap: break-word; line-break: strict; text-align: justify`,
          `background-color: ${config.sectionBg || '#ffffff'}`,
          `background-image: linear-gradient(${this.hexToRgba(color, config.gridLineAlpha || '09')} 1px, transparent 1px), linear-gradient(90deg, ${this.hexToRgba(color, config.gridLineAlpha || '09')} 1px, transparent 1px)`,
          config.sectionBgSize ? `background-size: ${config.sectionBgSize}` : ''
        );

      case 'h1': return this.getH1Style(config.h1Decoration, color, sizes.h1, font, headingColor, config);
      case 'h2':
        return config.shiftHeadingDecorationsDown
          ? this.getH1Style(config.h1Decoration, color, sizes.h2, font, headingColor, config)
          : this.getH2Style(config.h2Decoration, color, sizes.h2, font, headingColor, config);
      case 'h3':
        return config.shiftHeadingDecorationsDown
          ? this.getH2Style(config.h2Decoration, color, sizes.h3, font, headingColor, config)
          : this.getH3Style(config.h3Decoration, color, sizes.h3, font, headingColor, config);
      case 'h4':
        return config.shiftHeadingDecorationsDown
          ? this.getH3Style(config.h3Decoration, color, sizes.h4, font, headingColor, config)
          : this.getH4Style(config.h4Decoration, color, sizes.h4, font, headingColor);

      case 'h5':
        return this.getH5Style(config.h5Decoration, color, sizes.h5, font, headingColor);
      case 'h6':
        return this.getH6Style(config.h6Decoration, color, sizes.h6, font, headingColor, mutedTextColor);

      case 'p':
        return this.joinStyleStrings(
          `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${effectiveLineHeight}; color: ${textColor}; margin: 0 0 ${effectiveParagraphGap}px 0; text-align: justify; text-align-last: left;${effectiveLetterSpacing ? ` letter-spacing: ${effectiveLetterSpacing}px;` : ' letter-spacing: 0;'} word-break: normal; overflow-wrap: break-word; line-break: strict`,
          config.paragraphTextIndent ? `text-indent: ${config.paragraphTextIndent}` : ''
        );





      case 'blockquote':
        if (config.blockquoteStyle === 'center') {
          const centeredBackground = quoteCalloutStyleMode === 'neutral'
            ? AppleTheme.QUOTE_CALLOUT_NEUTRAL_BG
            : (config.blockquoteBg || color + '1F');
          const centeredRuleColor = quoteCalloutStyleMode === 'neutral'
            ? AppleTheme.QUOTE_NEUTRAL_BORDER
            : `${color}55`;
          return `font-family: ${AppleTheme.FONTS.serif}; font-size: ${sizes.base}px; line-height: 1.85; color: #4f4a45; background: ${centeredBackground}; width: 92%; box-sizing: border-box; margin: 24px auto; padding: 18px 20px; text-align: justify; border-top: 1px solid ${centeredRuleColor}; border-bottom: 1px solid ${centeredRuleColor}; border-radius: ${r.sm}px;`;
        }
        if (config.blockquoteStyle === 'paper') {
          const paperBg = quoteCalloutStyleMode === 'neutral'
            ? AppleTheme.QUOTE_CALLOUT_NEUTRAL_BG
            : (config.blockquoteBg || color + '1F');
          const paperBorder = quoteCalloutStyleMode === 'neutral'
            ? AppleTheme.QUOTE_NEUTRAL_BORDER
            : `${color}99`;
          return `font-family: ${AppleTheme.FONTS.serif}; font-size: ${sizes.base}px; line-height: ${effectiveLineHeight}; color: #5f574c; background: ${paperBg}; margin: 22px 0 22px 8px; padding: 16px 18px; border-left: 3px solid ${paperBorder}; border-radius: ${r.sm}px; text-align: justify;`;
        }
        if (config.blockquoteStyle === 'soft') {
          const softBg = quoteCalloutStyleMode === 'neutral'
            ? AppleTheme.QUOTE_CALLOUT_NEUTRAL_BG
            : (config.blockquoteBg || color + '14');
          const softTextColor = config.blockquoteTextColor || '#595959';
          const softBorderColor = quoteCalloutStyleMode === 'neutral'
            ? AppleTheme.QUOTE_NEUTRAL_BORDER
            : `${color}99`;
          const softBorderWidth = this.themeName === 'wechat'
            ? 3
            : (config.blockquoteBorderWidth || 4);
          return `font-size: ${sizes.base}px; line-height: ${effectiveLineHeight}; color: ${softTextColor}; background: ${softBg}; margin: ${s.md}px 0 ${s.md}px 8px; padding: ${s.md}px; border-left: ${softBorderWidth}px solid ${softBorderColor}; border-radius: ${r.sm}px;`;
        }

        if (quoteCalloutStyleMode === 'neutral') {
          const neutralBorderWidth = this.themeName === 'wechat'
            ? 3
            : (config.blockquoteBorderWidth || 4);
          return `font-size: ${sizes.base}px; line-height: ${effectiveLineHeight}; color: #595959; background: ${AppleTheme.QUOTE_CALLOUT_NEUTRAL_BG}; margin: ${s.md}px 0 ${s.md}px 8px; padding: ${s.md}px; border-left: ${neutralBorderWidth}px solid ${AppleTheme.QUOTE_NEUTRAL_BORDER}; border-radius: ${r.sm}px;`;
        }

        // 经典主题（wechat）：使用更细的边框和更浅的颜色，与 H3 区分
        // H3: 4px 主题色 100% 左边框，顶格
        // 引用块: 3px 主题色 60% 左边框，缩进 4px
        if (this.themeName === 'wechat') {
          return `font-size: ${sizes.base}px; line-height: ${effectiveLineHeight}; color: #595959; background: ${config.blockquoteBg || color + '1F'}; margin: ${s.md}px 0 ${s.md}px 4px; padding: ${s.md}px; border-left: 3px solid ${color}99; border-radius: 3px;`;
        }

        // Standard Blockquote: Restoring Italic and adjusting padding/background to match the screenshot
        // Background: Light opacity of theme color (1F) for better visibility
        // Border: Solid theme color
        // Font: Normal (removed italic) for better legibility on mobile
        return `font-size: ${sizes.base}px; line-height: ${effectiveLineHeight}; color: #595959; background: ${config.blockquoteBg || color + '1F'}; margin: ${s.md}px 0; padding: ${s.md}px; border-left: ${config.blockquoteBorderWidth}px solid ${config.blockquoteBorderColor || color}; border-radius: 3px;`;

      case 'pre':
        return `background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: ${r.md}px; padding: ${s.md}px; margin: ${s.md}px 0; overflow-x: auto; font-family: ${AppleTheme.FONTS.monospace}; font-size: ${sizes.code}px; line-height: 1.6; color: #24292e;`;

      case 'code':
        return `background: ${color}1A; color: ${color}; padding: 2px 4px; border-radius: 3px; font-family: ${AppleTheme.FONTS.monospace}; font-size: ${sizes.code}px;`;

      case 'ul':
        return `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${effectiveLineHeight}; color: ${textColor}; margin: 12px 0; padding-left: 20px; list-style-type: disc;`;
      case 'ol':
        return `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${effectiveLineHeight}; color: ${textColor}; margin: 12px 0; padding-left: 20px; list-style-type: decimal;`;
      case 'li':
        return `font-size: ${sizes.base}px; line-height: ${effectiveLineHeight}; color: ${textColor}; margin: 4px 0;${effectiveLetterSpacing ? ` letter-spacing: ${effectiveLetterSpacing}px;` : ''}`;
      case 'li-task':
        return `font-size: ${sizes.base}px; line-height: ${effectiveLineHeight}; color: ${textColor}; margin: 4px 0; list-style-type: none; margin-left: -20px;`;
      case 'li p':
        return `margin: 0; padding: 0; line-height: ${effectiveLineHeight};`;




      case 'figure':
        // Fix: Restoring wireframe (border/padding) & balanced spacing (20px top/bottom)
        // No shadow for cleaner look
        return `display: block; margin: 20px 0; text-align: center; border: 1px solid ${config.figureBorderColor || '#e1e4e8'}; border-radius: ${r.md}px; padding: ${config.figurePadding || 10}px;`;

      case 'figcaption':
        return `font-size: ${sizes.caption}px; color: #999; text-align: center; margin-top: ${s.sm}px;`;

      case 'img':
        return `display: block; margin: 0 auto; max-width: 100%; border-radius: 4px;`;

      case 'a':
        return `color: ${color}; text-decoration: ${config.linkDecoration}; border-bottom: ${config.linkDecoration === 'none' ? `1px dashed ${color}` : 'none'}; word-break: break-word; overflow-wrap: anywhere;`;

      case 'table-wrapper':
        return `display: block; box-sizing: border-box; width: 100%; max-width: 100%; overflow-x: scroll; overflow-y: hidden; -webkit-overflow-scrolling: touch; margin: ${s.md}px 0; padding-bottom: 10px;`;
      case 'table':
        return `border-collapse: collapse; width: 720px; min-width: 100%; max-width: none; table-layout: auto; border: 1px solid ${config.tableBorderColor || '#e1e4e8'};`;
      case 'th':
        return `background: ${config.tableHeaderBg || color + '1F'}; font-weight: bold; color: ${textColor}; border: 1px solid ${config.tableBorderColor || '#e1e4e8'}; padding: ${config.tableCellPadding || 12}px; text-align: left; white-space: nowrap; word-break: keep-all; overflow-wrap: normal;`;
      case 'td':
        return `border: 1px solid ${config.tableBorderColor || '#e1e4e8'}; padding: ${config.tableCellPadding || 12}px; text-align: left; white-space: nowrap; word-break: keep-all; overflow-wrap: normal;`;
      case 'thead':
        return `background: #f6f8fa;`;

      case 'hr':
        return `border: 0; border-top: 1px solid rgba(0,0,0,0.08); margin: 40px 0;`;

      case 'strong':
        return config.strongBg
          ? `font-weight: bold; color: ${color}; background: ${color}18; padding: 0 3px; border-radius: 3px;`
          : `font-weight: bold; color: ${color};`;
      case 'em':
        return `font-style: italic;`;
      case 'del':
        return `text-decoration: line-through; color: #999;`;

      case 'avatar-header':
        return `margin: 0 0 ${s.sm}px 0 !important; display: flex !important; align-items: center !important; justify-content: flex-start !important; width: 100%; flex-direction: row !important; flex-wrap: nowrap !important; text-align: left !important;`;
      case 'avatar':
        return `display: inline-block !important; vertical-align: middle !important; margin: 0 !important; width: 32px !important; height: 32px !important; border-radius: 50%; object-fit: cover; border: 1px solid #e8e8ed; flex-shrink: 0;`;
      case 'avatar-caption':
        return `display: inline-block !important; vertical-align: middle !important; font-size: ${sizes.caption}px; color: #666; margin-left: 10px; line-height: 1.4; text-align: left !important;`;

      default:
        return '';
    }
  }

  // === Helper Methods ===

  /**
   * @param {string | undefined} type
   * @param {string} color
   * @param {number} fontSize
   * @param {string} font
   * @param {string} headingColor
   * @param {AppleThemeConfig} [config]
   * @returns {string}
   */
  getH1Style(type, color, fontSize, font, headingColor, config = AppleTheme.THEME_CONFIGS.github) {
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 30px auto 20px; color: ${headingColor}; text-align: center; line-height: 1.2;`;
    switch (type) {
      case 'editorial-h1': // Magazine Style: Forced Serif + Golden Line (More elegant: 1px height, 80px width, tightened spacing)
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 28px auto 16px; padding: 0 0 10px; color: ${headingColor}; text-align: center; line-height: 1.2; background-image: linear-gradient(to right, transparent, ${color}, transparent); background-size: 80px 1px; background-repeat: no-repeat; background-position: bottom center; letter-spacing: 1px;`;
      case 'bottom-line':
        // Pure CSS centered short line using linear-gradient (simulating image)
        return `${base}
          background-image: linear-gradient(to right, ${color}, ${color});
          background-size: 80px 3px;
          background-repeat: no-repeat;
          background-position: bottom center;
          padding-bottom: 15px;`;
      case 'border-box':
        return `${base} border: 1px solid ${color}; padding: 10px 20px; border-radius: 4px; display: inline-block; width: auto;`;
      case 'classic-title':
        return `${base} margin: 34px auto 22px; padding: 0; background-image: linear-gradient(to right, transparent, ${color}, transparent); background-size: 120px 2px; background-repeat: no-repeat; background-position: bottom center; padding-bottom: 14px;`;
      case 'paper-title':
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 34px auto 24px; color: ${headingColor}; text-align: center; line-height: 1.35; letter-spacing: 1px; border-top: 2px solid ${color}; border-bottom: 1px solid ${color}66; padding: 16px 0 14px;`;
      case 'grid-title':
        return `${base} text-align: left; border: 1px solid ${color}55; border-radius: 4px; padding: 10px 12px; background: ${color}0F;`;
      case 'typo-title':
        return `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: 700; margin: 34px auto 22px; color: ${headingColor}; text-align: left; line-height: 1.28; border-bottom: 1px solid #d8d8d8; padding-bottom: 14px;`;
      case 'media-title':
        return `${base} text-align: left; color: ${headingColor}; background-image: linear-gradient(to right, ${color}, ${color}33); background-size: 100% 2px; background-repeat: no-repeat; background-position: bottom left; padding-bottom: 14px;`;
      case 'colorful-title':
        return `${base} color: #ffffff; background: ${color}; padding: 12px 18px; border-radius: 6px; box-shadow: 6px 6px 0 ${color}33;`;
      default: // none or unknown
        return this.joinStyleStrings(base, config.headingLetterSpacing ? `letter-spacing: ${config.headingLetterSpacing}px` : '');
    }
  }

  /**
   * @param {string | undefined} type
   * @param {string} color
   * @param {number} fontSize
   * @param {string} font
   * @param {string} headingColor
   * @param {AppleThemeConfig} [config]
   * @returns {string}
   */
  getH2Style(type, color, fontSize, font, headingColor, config = AppleTheme.THEME_CONFIGS.github) {
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 32px auto 16px; text-align: center; color: ${headingColor}; line-height: 1.25;`;
    switch (type) {
      case 'editorial-h1': // Golden Line (Shifted from H1 - More elegant: 1px height, 80px width, tightened spacing)
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 28px auto 14px; padding: 0 0 10px; color: ${headingColor}; text-align: center; line-height: 1.2; background-image: linear-gradient(to right, transparent, ${color}, transparent); background-size: 80px 1px; background-repeat: no-repeat; background-position: bottom center; letter-spacing: 1px;`;
      case 'editorial-h2': // Magazine Subtitle
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: normal; margin: 32px auto 16px; text-align: center; color: ${headingColor}; line-height: 1.4; font-style: italic; letter-spacing: 1px;`;
      case 'bottom-line':
        // Pure CSS centered short line (thinner/shorter for H2)
        return `${base}
           background-image: linear-gradient(to right, ${color}, ${color});
           background-size: 50px 2px;
           background-repeat: no-repeat;
           background-position: bottom center;
           padding-bottom: 12px;`;
      case 'filled-pill':
        return `${base} background-color: ${color}; color: #fff; padding: 5px 20px; border-radius: 20px; display: inline-block; width: auto;`;
      case 'bottom-line-center':
        return `${base} display: inline-block; border-bottom: 1px solid ${color}; padding-bottom: 5px; width: auto;`;
      case 'classic-title':
        return `${base} margin: 34px auto 20px; padding: 0; background-image: linear-gradient(to right, transparent, ${color}, transparent); background-size: 120px 2px; background-repeat: no-repeat; background-position: bottom center; padding-bottom: 14px;`;
      case 'paper-title':
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 34px auto 20px; color: ${headingColor}; text-align: center; line-height: 1.35; letter-spacing: 1px; border-top: 2px solid ${color}; border-bottom: 1px solid ${color}66; padding: 14px 0 12px;`;
      case 'paper-chapter':
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 34px auto 20px; color: ${headingColor}; text-align: center; line-height: 1.35; letter-spacing: 1.5px; border-bottom: 2px solid ${color}; padding-bottom: 12px;`;
      case 'grid-title':
        return `${base} text-align: left; border: 1px solid ${color}55; border-radius: 4px; padding: 10px 12px; background: ${color}0F;`;
      case 'grid-chapter':
        return `${base} text-align: left; border-left: 3px solid ${color}; border-radius: 0 4px 4px 0; padding: 8px 12px; background: ${color}08;`;
      case 'typo-title':
        return `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: 700; margin: 34px 0 18px; color: ${headingColor}; text-align: left; line-height: 1.3; background-image: linear-gradient(#d8d8d8, #d8d8d8); background-size: 40% 1px; background-repeat: no-repeat; background-position: bottom left; padding-bottom: 12px;`;
      case 'media-title':
        return `${base} text-align: left; color: ${headingColor}; background-image: linear-gradient(to right, ${color}, ${color}33); background-size: 100% 2px; background-repeat: no-repeat; background-position: bottom left; padding-bottom: 12px;`;
      case 'media-chapter':
        return `${base} text-align: left; color: ${headingColor}; background-image: linear-gradient(to right, ${color}, transparent); background-size: 60% 2px; background-repeat: no-repeat; background-position: bottom left; padding-bottom: 12px;`;
      case 'colorful-title':
        return `${base} color: #ffffff; background: ${color}; padding: 10px 16px; border-radius: 6px; box-shadow: 5px 5px 0 ${color}33;`;
      case 'colorful-chapter':
        return `${base} text-align: left; border-left: 4px solid ${color}; background: ${color}12; padding: 10px 14px; border-radius: 0 4px 4px 0;`;
      case 'paper-section':
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 34px 0 16px; color: ${headingColor}; text-align: left; line-height: 1.35; border-bottom: 1px solid ${color}55; padding-bottom: 8px;`;
      case 'grid-section':
        return `${base} text-align: left; border-bottom: 1px solid ${color}66; padding: 4px 0 8px;`;
      case 'typo-section':
        return `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: 700; margin: 34px 0 16px; color: ${headingColor}; text-align: left; line-height: 1.35;`;
      case 'media-section':
        return `${base} display: inline-block; width: auto; text-align: left; background: ${color}14; border: 1px solid ${color}33; padding: 6px 12px; border-radius: 2px;`;
      case 'colorful-section':
        return `${base} display: inline-block; width: auto; text-align: left; background: ${color}18; border-bottom: 3px solid ${color}; padding: 6px 10px 5px; border-radius: 4px 4px 0 0;`;
      default:
        return this.joinStyleStrings(base, config.headingLetterSpacing ? `letter-spacing: ${config.headingLetterSpacing}px` : '');
    }
  }

  /**
   * @param {string | undefined} type
   * @param {string} color
   * @param {number} fontSize
   * @param {string} font
   * @param {string} headingColor
   * @param {AppleThemeConfig} [config]
   * @returns {string}
   */
  getH3Style(type, color, fontSize, font, headingColor, config = AppleTheme.THEME_CONFIGS.github) {
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 20px 0 12px; text-align: left; color: ${headingColor}; line-height: 1.3;`;
    switch (type) {
      case 'editorial-h2': // Italic Serif (Left Aligned for H3)
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: normal; margin: 24px 0 12px; text-align: left; color: ${headingColor}; line-height: 1.4; font-style: italic; letter-spacing: 1px;`;
      case 'editorial-h3': // Magazine Section: Forced Serif + Left Underline
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 24px 0 12px; text-align: left; color: ${headingColor}; line-height: 1.3;
           border-bottom: 1px solid ${color}; padding-bottom: 4px; display: inline-block; width: auto; letter-spacing: 0.5px;`;
      case 'left-border':
        return `${base} border-left: 4px solid ${color}; padding-left: 10px;`;
      case 'bottom-line-left':
        return `${base} display: inline-block; border-bottom: 2px solid ${color}; padding-bottom: 2px; margin-right: auto;`;
      case 'classic-subhead':
        return `${base} border-left: 3px solid ${color}; background: ${color}0A; padding: 6px 10px; margin: 24px 0 12px;`;
      case 'paper-section':
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 28px 0 14px; color: ${headingColor}; text-align: left; line-height: 1.35; border-top: 1px solid ${color}55; padding-top: 8px;`;
      case 'grid-section':
        return `${base} background-image: linear-gradient(${color}, ${color}); background-size: 3px 55%; background-position: left center; background-repeat: no-repeat; padding-left: 12px;`;
      case 'typo-section':
        return `${base} font-weight: 700; margin: 28px 0 14px; line-height: 1.35; border-left: 2px solid #d8d8d8; padding-left: 10px;`;
      case 'media-section':
        return `${base} display: inline-block; width: auto; background: ${color}14; border: 1px solid ${color}33; padding: 5px 10px; border-radius: 2px;`;
      case 'colorful-section':
        return `${base} display: inline-block; width: auto; background: ${color}18; border-bottom: 2px solid ${color}; padding: 5px 9px 4px; border-radius: 4px 4px 0 0;`;
      case 'paper-kicker':
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 24px 0 12px; color: ${headingColor}; text-align: left; line-height: 1.35; padding-left: 10px; border-left: 3px double ${color};`;
      case 'typo-subhead':
        return `${base} font-weight: 700; color: ${headingColor};`;
      default:
        return this.joinStyleStrings(base, config.headingLetterSpacing ? `letter-spacing: ${config.headingLetterSpacing}px` : '');
    }
  }

  /**
   * @param {string | undefined} type
   * @param {string} color
   * @param {number} fontSize
   * @param {string} font
   * @param {string} headingColor
   * @returns {string}
   */
  getH4Style(type, color, fontSize, font, headingColor) {
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 15px 0 10px; text-align: left; color: ${headingColor}; line-height: 1.35;`;
    switch (type) {
      case 'editorial-h3': // Inherit H3 style for H4
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 15px 0 10px; text-align: left; color: ${headingColor}; line-height: 1.35;
           border-bottom: 1px solid ${color}; padding-bottom: 3px; display: inline-block; width: auto; letter-spacing: 0.5px;`;
      case 'simple': // Simple Bold (User Font)
        // Use headingColor (Deep) instead of color (Bright)
        return `${base}`;
      case 'light-bg':
        // Background uses bright color tint (low opacity), Text uses deep headingColor
        return `${base} background-color: ${color}15; padding: 4px 8px; border-radius: 4px; display: inline-block;`;
      case 'classic-minor':
        return `${base} border-left: 2px solid ${color}55; padding-left: 8px;`;
      case 'left-border':
        return `${base} border-left: 3px solid ${color}; padding-left: 9px;`;
      case 'bottom-line-left':
        return `${base} display: inline-block; border-bottom: 2px solid ${color}; padding-bottom: 2px; margin-right: auto;`;
      case 'paper-kicker':
        return `font-family: ${AppleTheme.FONTS.serif}; display: inline-block; font-size: ${fontSize}px; font-weight: bold; margin: 22px 0 10px; color: ${headingColor}; text-align: left; line-height: 1.35; border-bottom: 1px double ${color}99; padding-bottom: 2px;`;
      case 'grid-kicker':
        return `${base} display: inline-block; border-bottom: 1px dashed ${color}44; padding-bottom: 2px;`;
      case 'typo-subhead':
        return `${base} font-weight: 700; letter-spacing: 1.5px;`;
      case 'colorful-kicker':
        return `${base} color: ${color}; background: ${color}12; padding: 4px 8px; border-radius: 4px; display: inline-block;`;
      case 'italic-serif':
        return `${base} font-style: italic; font-family: serif; border-bottom: 1px dashed #ccc; display: inline-block; padding-bottom: 2px;`;
      default:
        return base;
    }
  }

  /**
   * @param {string | undefined} type
   * @param {string} color
   * @param {number} fontSize
   * @param {string} font
   * @param {string} headingColor
   * @returns {string}
   */
  getH5Style(type, color, fontSize, font, headingColor) {
    if (!type) {
      return `font-family: ${font}; font-size: ${fontSize}px; font-weight: bold; color: ${headingColor}; margin: 10px 0; text-align: left; line-height: 1.4;`;
    }
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; color: ${headingColor}; margin: 12px 0 8px; text-align: left; line-height: 1.4;`;
    switch (type) {
      case 'light-bg':
        return `${base} background-color: ${color}12; padding: 3px 7px; border-radius: 4px; display: inline-block;`;
      case 'dashed-bottom':
        return `${base} font-weight: 600; border-bottom: 1px dashed ${color}33; display: inline-block; padding-bottom: 1px;`;
      case 'simple':
      default:
        return base;
    }
  }

  /**
   * @param {string | undefined} type
   * @param {string} color
   * @param {number} fontSize
   * @param {string} font
   * @param {string} headingColor
   * @param {string} [mutedColor]
   * @returns {string}
   */
  getH6Style(type, color, fontSize, font, headingColor, mutedColor = '#6b7280') {
    if (!type) {
      return `font-family: ${font}; font-size: ${fontSize}px; font-weight: bold; color: ${headingColor}; margin: 10px 0; text-align: left; line-height: 1.4;`;
    }
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; color: ${headingColor}; margin: 10px 0 6px; text-align: left; line-height: 1.4;`;
    switch (type) {
      case 'quiet':
        return `${base} color: ${mutedColor}; font-weight: 600;`;
      default:
        return base;
    }
  }

  /**
   * @param {string} hexColor
   * @param {string} [alphaHex]
   * @returns {string}
   */
  hexToRgba(hexColor, alphaHex = 'ff') {
    const normalized = String(hexColor || '').trim().replace(/^#/, '');
    if (!/^[0-9a-f]{6}$/i.test(normalized)) {
      return hexColor;
    }
    const alpha = Number.parseInt(String(alphaHex || 'ff'), 16);
    const clampedAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(255, alpha)) : 255;
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${(clampedAlpha / 255).toFixed(3)})`;
  }

  /**
   * @param {...string} styles
   * @returns {string}
   */
  joinStyleStrings(...styles) {
    return styles
      .map((style) => (style || '').trim())
      .filter(Boolean)
      .map((style) => style.endsWith(';') ? style : `${style};`)
      .join(' ');
  }

  /**
   * @param {AppleThemeConfig} [config]
   * @returns {number}
   */
  getSectionSidePadding(config = AppleTheme.THEME_CONFIGS.github) {
    const configuredPadding = Number(this.sidePadding);
    const themeOffset = Number(config.sectionSidePaddingOffset || 0);
    const safeConfiguredPadding = Number.isFinite(configuredPadding) ? configuredPadding : 16;
    const safeThemeOffset = Number.isFinite(themeOffset) ? themeOffset : 0;
    return safeConfiguredPadding + safeThemeOffset;
  }

  /**
   * @param {AppleThemeConfig} [config]
   * @returns {string}
   */
  getSectionBoxSizingStyle(config = AppleTheme.THEME_CONFIGS.github) {
    return config.sectionSidePaddingOffset ? 'box-sizing: border-box; ' : '';
  }

   /**
   * 更新配置
   * @param {AppleThemeOptions} options
   */
  update(options) {
    if (typeof options.theme === 'string') this.themeName = options.theme;
    if (typeof options.themeColor === 'string') this.themeColor = options.themeColor;
    if (typeof options.customColor === 'string' || options.customColor === null) this.customColor = options.customColor;
    if (typeof options.quoteCalloutStyleMode === 'string') this.quoteCalloutStyleMode = options.quoteCalloutStyleMode;
    if (typeof options.fontFamily === 'string') this.fontFamily = options.fontFamily;
    if (typeof options.fontSize === 'number') this.fontSize = options.fontSize;
    if (options.macCodeBlock !== undefined) this.macCodeBlock = options.macCodeBlock !== false;
    if (options.codeLineNumber !== undefined) this.codeLineNumber = Boolean(options.codeLineNumber);
    if (options.sidePadding !== undefined) this.sidePadding = Number(options.sidePadding);
    // 间距微调：允许 null 显式重置为继承主题默认
    if (options.lineHeight !== undefined) this.lineHeight = options.lineHeight;
    if (options.paragraphGap !== undefined) this.paragraphGap = options.paragraphGap;
    if (options.letterSpacing !== undefined) this.letterSpacing = options.letterSpacing;
    if (options.coloredHeader !== undefined) this.coloredHeader = Boolean(options.coloredHeader);
  }

  /**
   * 获取主题列表
   * @returns {{ value: string, label: string }[]}
   */
  static getThemeList() {
    return Object.entries(AppleTheme.THEME_CONFIGS).map(([key, config]) => ({
      value: key,
      label: config.name,
    }));
  }

  /**
   * 获取主题色列表
   * @returns {{ value: string, color: string }[]}
   */
  static getColorList() {
    return Object.entries(AppleTheme.THEME_COLORS).map(([key, value]) => ({
      value: key,
      color: value,
    }));
  }
}

// 导出到全局作用域
APPLE_THEME_GLOBAL.AppleTheme = AppleTheme;
if (typeof window !== 'undefined') {
  window.AppleTheme = APPLE_THEME_GLOBAL.AppleTheme;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppleTheme;
}
