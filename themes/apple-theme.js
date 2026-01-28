/**
 * 🍎 Apple Style 多主题系统
 * 支持多种主题风格：简约、经典、水墨、极光等
 * 设计理念：克制、优雅、注重细节
 */

// Use assignment expression to avoid "Identifier has already been declared" errors if re-eval'd
window.AppleTheme = class AppleTheme {
  /**
   * 🎨 主题色板 - 8种预设颜色
   */
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
   * 📐 字体大小系统 - 5档
   */
  static FONT_SIZES = {
    1: { base: 14, h1: 30, h2: 24, h3: 18, h4: 16, h5: 14, h6: 14, code: 12, caption: 12 },
    2: { base: 15, h1: 32, h2: 26, h3: 20, h4: 17, h5: 15, h6: 15, code: 13, caption: 12 },
    3: { base: 16, h1: 34, h2: 28, h3: 22, h4: 18, h5: 16, h6: 16, code: 14, caption: 13 }, // 推荐
    4: { base: 17, h1: 38, h2: 30, h3: 24, h4: 20, h5: 17, h6: 17, code: 15, caption: 14 },
    5: { base: 18, h1: 42, h2: 34, h3: 26, h4: 22, h5: 18, h6: 18, code: 16, caption: 14 },
  };

  /**
   * 🔤 字体栈
   */
  static FONTS = {
    'sans-serif': `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif`,
    'serif': `'Times New Roman', Georgia, 'SimSun', serif`,
    'monospace': `'SF Mono', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
  };

  /**
   * 🎨 主题配置 - 每种主题的独特配色和规则
   */
  static THEME_CONFIGS = {
    github: {
      name: '简约',
      lineHeight: 1.8,
      paragraphGap: 20,
      h1Decoration: 'none',
      h2Decoration: 'none',
      h3Decoration: 'none',
      h4Decoration: 'none',
      headingWeight: 800,
      headingLetterSpacing: -0.5,
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',
      linkDecoration: 'underline',
      blockquoteBorderWidth: 4,
      blockquoteBorderColor: '#d0d7de', // Github 灰
      blockquoteBg: '#ffffff', // 白底
    },
    wechat: {
      name: '经典',
      lineHeight: 1.8,
      paragraphGap: 24,
      h1Decoration: 'bottom-line',       // 底部短线
      h2Decoration: 'bottom-line',       // 底部短线 (原胶囊)
      h3Decoration: 'left-border',       // 左边框
      h4Decoration: 'light-bg',          // 浅色背景
      headingWeight: 700,
      headingLetterSpacing: 0,
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',
      linkDecoration: 'none',
      blockquoteBorderWidth: 4,
    },
    serif: {
      name: '优雅',
      lineHeight: 1.8,
      paragraphGap: 20,
      h1Decoration: 'border-box',        // 边框盒子
      h2Decoration: 'bottom-line-center',// 居中极细线
      h3Decoration: 'bottom-line-left',  // 左对齐短线
      h4Decoration: 'italic-serif',      // 斜体衬线
      headingWeight: 700,
      headingLetterSpacing: 0,
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',
      linkDecoration: 'none',
      blockquoteBorderWidth: 3,
    },
  };

  /**
   * 📐 间距系统 - 8px 基准
   */
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
  static RADIUS = {
    sm: 4,
    md: 8,
    lg: 12,
  };

  /**
   * 当前配置
   */
  constructor(options = {}) {
    this.themeName = options.theme || 'github';
    this.themeColor = options.themeColor || 'blue';
    this.customColor = options.customColor || null;
    this.fontFamily = options.fontFamily || 'sans-serif';
    this.fontSize = options.fontSize || 3;
    this.macCodeBlock = options.macCodeBlock !== false;
    this.codeLineNumber = options.codeLineNumber || false;
  }

  /**
   * 获取当前主题色值
   */
  getThemeColorValue() {
    if (this.themeColor === 'custom' && this.customColor) {
      return this.customColor;
    }
    return AppleTheme.THEME_COLORS[this.themeColor] || AppleTheme.THEME_COLORS.blue;
  }

  /**
   * 获取当前主题配置
   */
  getThemeConfig() {
    return AppleTheme.THEME_CONFIGS[this.themeName] || AppleTheme.THEME_CONFIGS.github;
  }

  /**
   * 获取字体尺寸配置
   */
  getSizes() {
    return AppleTheme.FONT_SIZES[this.fontSize] || AppleTheme.FONT_SIZES[3];
  }

  /**
   * 获取字体栈
   */
  getFontFamily() {
    return AppleTheme.FONTS[this.fontFamily] || AppleTheme.FONTS['sans-serif'];
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
    const s = AppleTheme.SPACING;
    const r = AppleTheme.RADIUS;

    switch (tagName) {
      case 'section':
        return `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: ${config.textColor}; padding: ${s.md}px; background: #ffffff; max-width: 100%; word-wrap: break-word; text-align: justify;`;

      case 'h1': return this.getH1Style(config.h1Decoration, color, sizes.h1, font);
      case 'h2': return this.getH2Style(config.h2Decoration, color, sizes.h2, font);
      case 'h3': return this.getH3Style(config.h3Decoration, color, sizes.h3, font);
      case 'h4': return this.getH4Style(config.h4Decoration, color, sizes.h4, font);

      case 'h5':
        return `font-family: ${font}; font-size: ${sizes.h5}px; font-weight: bold; color: ${config.headingColor}; margin: 10px 0; text-align: left; line-height: 1.4;`;
      case 'h6':
        return `font-family: ${font}; font-size: ${sizes.h6}px; font-weight: bold; color: ${config.headingColor}; margin: 10px 0; text-align: left; line-height: 1.4;`;

      case 'p':
        return `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: ${config.textColor}; margin: 0 0 ${config.paragraphGap}px 0; text-align: justify; letter-spacing: 0;`;

      case 'blockquote':
        return `font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: #666; background: ${config.blockquoteBg || color + '08'}; margin: ${s.md}px 0 ${s.md}px 1em; padding: ${s.sm}px ${s.md}px; border-left: ${config.blockquoteBorderWidth}px solid ${config.blockquoteBorderColor || color}; font-style: italic; border-radius: 0 ${r.sm}px ${r.sm}px 0;`;

      case 'pre':
        return `background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: ${r.md}px; padding: ${s.md}px; margin: ${s.md}px 0; overflow-x: auto; font-family: ${AppleTheme.FONTS.monospace}; font-size: ${sizes.code}px; line-height: 1.6; color: #24292e;`;

      case 'code':
        return `background: ${color}1A; color: ${color}; padding: 2px 4px; border-radius: 3px; font-family: ${AppleTheme.FONTS.monospace}; font-size: ${sizes.code}px;`;

      case 'ul':
        return `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: ${config.textColor}; margin: 12px 0; padding-left: 20px; list-style-type: disc;`;
      case 'ol':
        return `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: ${config.textColor}; margin: 12px 0; padding-left: 20px; list-style-type: decimal;`;
      case 'li':
        return `font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: ${config.textColor}; margin: 4px 0;`;
      case 'li p':
        return `margin: 0; padding: 0; line-height: ${config.lineHeight};`;

      case 'figure':
        return `display: block; margin: ${s.md}px 0; text-align: center; border: 1px solid #e1e4e8; border-radius: ${r.md}px; padding: ${s.md}px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);`;
      case 'figcaption':
        return `font-size: ${sizes.caption}px; color: #999; text-align: center; margin-top: ${s.sm}px;`;
      case 'img':
        return `max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: ${r.sm}px;`;

      case 'a':
        return `color: ${color}; text-decoration: ${config.linkDecoration}; border-bottom: ${config.linkDecoration === 'none' ? `1px dashed ${color}` : 'none'};`;

      case 'table':
        return `border-collapse: collapse; width: 100%; margin: ${s.md}px 0; border: 1px solid #e1e4e8;`;
      case 'th':
        return `background: ${color}1F; font-weight: bold; color: ${config.textColor}; border: 1px solid #e1e4e8; padding: 12px; text-align: left;`;
      case 'td':
        return `border: 1px solid #e1e4e8; padding: 12px; text-align: left;`;
      case 'thead':
        return `background: #f6f8fa;`;

      case 'hr':
        return `border: 0; border-top: 1px solid rgba(0,0,0,0.08); margin: 40px 0;`;

      case 'strong':
        return `font-weight: bold; color: ${color};`;
      case 'em':
        return `font-style: italic;`;
      case 'del':
        return `text-decoration: line-through; color: #999;`;

      case 'avatar-header':
        return `margin: 0 0 ${s.sm}px 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; width: 100%; flex-direction: row !important;`;
      case 'avatar':
        return `width: 32px !important; height: 32px !important; border-radius: 50%; object-fit: cover; border: 1px solid #e8e8ed; flex-shrink: 0;`;
      case 'avatar-caption':
        return `font-size: ${sizes.caption}px; color: #666; margin-left: 10px; line-height: 1.4;`;

      default:
        return '';
    }
  }

  // === Helper Methods ===

  getH1Style(type, color, fontSize, font) {
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 30px auto 20px; color: #333; text-align: center; line-height: 1.2;`;
    switch (type) {
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
      default: // none or unknown
        return base;
    }
  }

  getH2Style(type, color, fontSize, font) {
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 40px auto 20px; text-align: center; color: #333; line-height: 1.25;`;
    switch (type) {
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
      default:
        return base;
    }
  }

  getH3Style(type, color, fontSize, font) {
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 24px 0 16px; text-align: left; color: #333; line-height: 1.3;`;
    switch (type) {
      case 'left-border':
        return `${base} border-left: 4px solid ${color}; padding-left: 10px;`;
      case 'bottom-line-left':
        return `${base} display: inline-block; border-bottom: 2px solid ${color}; padding-bottom: 2px; margin-right: auto;`;
      default:
        return base;
    }
  }

  getH4Style(type, color, fontSize, font) {
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 15px 0 10px; text-align: left; color: #333; line-height: 1.35;`;
    switch (type) {
      case 'light-bg':
        return `${base} background-color: ${color}15; padding: 4px 8px; border-radius: 4px; display: inline-block; color: ${color};`;
      case 'italic-serif':
        return `${base} font-style: italic; font-family: serif; border-bottom: 1px dashed #ccc; display: inline-block; padding-bottom: 2px;`;
      default:
        return base;
    }
  }

  /**
   * 更新配置
   */
  update(options) {
    if (options.theme !== undefined) this.themeName = options.theme;
    if (options.themeColor !== undefined) this.themeColor = options.themeColor;
    if (options.customColor !== undefined) this.customColor = options.customColor;
    if (options.fontFamily !== undefined) this.fontFamily = options.fontFamily;
    if (options.fontSize !== undefined) this.fontSize = options.fontSize;
    if (options.macCodeBlock !== undefined) this.macCodeBlock = options.macCodeBlock;
    if (options.codeLineNumber !== undefined) this.codeLineNumber = options.codeLineNumber;
  }

  /**
   * 获取主题列表
   */
  static getThemeList() {
    return Object.entries(AppleTheme.THEME_CONFIGS).map(([key, config]) => ({
      value: key,
      label: config.name,
    }));
  }

  /**
   * 获取主题色列表
   */
  static getColorList() {
    return Object.entries(AppleTheme.THEME_COLORS).map(([key, value]) => ({
      value: key,
      color: value,
    }));
  }
}

// 导出到全局作用域
window.AppleTheme = AppleTheme;
