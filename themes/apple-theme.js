/**
 * 🍎 Apple Style 多主题系统
 * 支持多种主题风格：简约、经典、水墨、极光等
 * 设计理念：克制、优雅、注重细节
 */

class AppleTheme {
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
    1: { base: 14, h1: 22, h2: 18, h3: 16, code: 12, caption: 12 },  // 小
    2: { base: 15, h1: 24, h2: 20, h3: 17, code: 13, caption: 12 },  // 较小
    3: { base: 16, h1: 28, h2: 21, h3: 18, code: 14, caption: 13 },  // 推荐
    4: { base: 17, h1: 30, h2: 23, h3: 19, code: 15, caption: 14 },  // 较大
    5: { base: 18, h1: 32, h2: 24, h3: 20, code: 16, caption: 14 },  // 大
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
      headingWeight: 800,
      headingLetterSpacing: 0,
      lineHeight: 1.8,
      paragraphGap: 20,
      h1Decoration: 'none',
      h2Decoration: 'none',
      h3Decoration: 'none',
      blockquoteBorderWidth: 4,
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',
      linkDecoration: 'underline',
    },
    wechat: {
      name: '经典',
      headingWeight: 700,
      headingLetterSpacing: 0.5,
      lineHeight: 1.9,
      paragraphGap: 24,
      h1Decoration: 'underline-gradient', // 渐变下划线
      h2Decoration: 'underline-gradient',
      h3Decoration: 'left-border',
      blockquoteBorderWidth: 4,
      textColor: '#3f3f3f',
      headingColor: '#3e3e3e',
      linkDecoration: 'none',
    },
    serif: {
      name: '优雅',
      headingWeight: 700,
      headingLetterSpacing: 1.0,
      lineHeight: 1.9,
      paragraphGap: 20,
      h1Decoration: 'center-line',
      h2Decoration: 'center-line',
      h3Decoration: 'underline',
      blockquoteBorderWidth: 3,
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',
      linkDecoration: 'none',
    },
    ink: {
      name: '水墨',
      headingWeight: 600,
      headingLetterSpacing: 1.5,
      lineHeight: 1.8,
      paragraphGap: 20,
      h1Decoration: 'center-line',
      h2Decoration: 'dash-symbol',
      h3Decoration: 'left-border',
      blockquoteBorderWidth: 4,
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',
      linkDecoration: 'none',
    },
    aurora: {
      name: '极光',
      headingWeight: 700,
      headingLetterSpacing: -0.2,
      lineHeight: 1.8,
      paragraphGap: 20,
      h1Decoration: 'top-bottom-lines',
      h2Decoration: 'dots-symbol',
      h3Decoration: 'none',
      blockquoteBorderWidth: 3,
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',
      linkDecoration: 'underline',
    },
    vintage: {
      name: '复古',
      headingWeight: 600,
      headingLetterSpacing: 0.5,
      lineHeight: 1.8,
      paragraphGap: 20,
      h1Decoration: 'dashed-line',
      h2Decoration: 'diamond-symbol',
      h3Decoration: 'left-border',
      blockquoteBorderWidth: 4,
      textColor: '#3e3e3e',
      headingColor: '#4a3f28',
      linkDecoration: 'none',
    },
    porcelain: {
      name: '青瓷',
      headingWeight: 600,
      headingLetterSpacing: 0.5,
      lineHeight: 1.8,
      paragraphGap: 20,
      h1Decoration: 'diamond-line',
      h2Decoration: 'center-line',
      h3Decoration: 'double-border',
      blockquoteBorderWidth: 3,
      textColor: '#3e3e3e',
      headingColor: '#333',
      linkDecoration: 'none',
    },
    editorial: {
      name: '报章',
      headingWeight: 700,
      headingLetterSpacing: 0,
      lineHeight: 1.8,
      paragraphGap: 20,
      h1Decoration: 'full-underline',
      h2Decoration: 'medium-underline',
      h3Decoration: 'underline',
      blockquoteBorderWidth: 4,
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',
      linkDecoration: 'underline',
    },
    deco: {
      name: '摩登',
      headingWeight: 700,
      headingLetterSpacing: 0.2,
      lineHeight: 1.8,
      paragraphGap: 20,
      h1Decoration: 'double-lines',
      h2Decoration: 'center-line',
      h3Decoration: 'top-bottom-border',
      blockquoteBorderWidth: 3,
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',
      linkDecoration: 'none',
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

    const styles = {
      // === 容器 ===
      'section': `
        font-family: ${font};
        font-size: ${sizes.base}px;
        line-height: ${config.lineHeight};
        color: ${config.textColor};
        padding: ${s.md}px;
        background: #ffffff;
        max-width: 100%;
        word-wrap: break-word;
      `,

      // === H1 主要章节 ===
      'h1': `
        font-family: ${font};
        font-size: ${sizes.h1}px;
        font-weight: ${config.headingWeight};
        color: ${config.headingColor};
        line-height: 1.2;
        letter-spacing: ${config.headingLetterSpacing}px;
        margin: 32px auto 24px;
        text-align: center;
      `,

      // === H2 次级章节 ===
      'h2': `
        font-family: ${font};
        font-size: ${sizes.h2}px;
        font-weight: ${Math.max(config.headingWeight - 100, 500)};
        color: ${config.headingColor};
        line-height: 1.25;
        letter-spacing: ${config.headingLetterSpacing}px;
        margin: 28px auto 20px;
        text-align: center;
      `,

      // === H3 小节标题 ===
      'h3': `
        font-family: ${font};
        font-size: ${sizes.h3}px;
        font-weight: ${Math.max(config.headingWeight - 200, 500)};
        color: ${config.headingColor};
        line-height: 1.3;
        letter-spacing: ${config.headingLetterSpacing}px;
        margin: 24px 0 16px;
        text-align: left;
        ${config.h3Decoration === 'left-border' ? `border-left: 4px solid ${color}; padding-left: 12px;` : ''}
        ${config.h3Decoration === 'underline' ? `border-bottom: 2px solid ${color}; padding-bottom: 4px; display: inline-block;` : ''}
        ${config.h3Decoration === 'double-border' ? `border-left: 3px double ${color}; padding-left: 14px;` : ''}
        ${config.h3Decoration === 'top-bottom-border' ? `border-top: 2px solid ${color}; border-bottom: 2px solid ${color}; padding: 6px 0; display: inline-block;` : ''}
      `,

      // === 段落 ===
      'p': `
        font-family: ${font};
        font-size: ${sizes.base}px;
        line-height: ${config.lineHeight};
        color: ${config.textColor};
        margin: 0 0 ${config.paragraphGap}px 0;
        text-align: justify;
        letter-spacing: 0.02em;
      `,

      // === 引用块 ===
      'blockquote': `
        font-size: ${sizes.base}px;
        line-height: ${config.lineHeight};
        color: #666;
        background: ${color}08;
        margin: ${s.md}px 0;
        padding: ${s.sm}px ${s.md}px;
        border-left: ${config.blockquoteBorderWidth}px solid ${color};
        font-style: italic;
      `,

      // === 代码块 ===
      'pre': `
        background: #f6f8fa;
        border: 1px solid #e1e4e8;
        border-radius: ${r.md}px;
        padding: ${s.md}px;
        margin: ${s.md}px 0;
        overflow-x: auto;
        font-family: ${AppleTheme.FONTS.monospace};
        font-size: ${sizes.code}px;
        line-height: 1.6;
        color: #24292e;
      `,

      // === 行内代码 ===
      'code': `
        background: ${color}1A;
        color: ${color};
        padding: 2px 4px;
        border-radius: 3px;
        font-family: ${AppleTheme.FONTS.monospace};
        font-size: ${sizes.code}px;
      `,

      // === 列表 ===
      'ul': `
        font-family: ${font};
        font-size: ${sizes.base}px;
        line-height: ${config.lineHeight};
        color: ${config.textColor};
        margin: 12px 0;
        padding-left: 20px;
        list-style-type: disc;
      `,

      'ol': `
        font-family: ${font};
        font-size: ${sizes.base}px;
        line-height: ${config.lineHeight};
        color: ${config.textColor};
        margin: 12px 0;
        padding-left: 20px;
        list-style-type: decimal;
      `,

      'li': `
        font-size: ${sizes.base}px;
        line-height: ${config.lineHeight};
        color: ${config.textColor};
        margin: 4px 0;
      `,

      'li p': `
        margin: 0;
        padding: 0;
        line-height: ${config.lineHeight};
      `,

      // === 图片 ===
      'figure': `
        margin: ${s.md}px 0;
        text-align: center;
      `,

      'figcaption': `
        font-size: ${sizes.caption}px;
        color: #999;
        text-align: center;
        margin-top: ${s.sm}px;
      `,

      'img': `
        max-width: 100%;
        height: auto;
        display: block;
        margin: 0 auto;
        border-radius: ${r.sm}px;
      `,

      // === 链接 ===
      'a': `
        color: ${color};
        text-decoration: ${config.linkDecoration};
        border-bottom: ${config.linkDecoration === 'none' ? `1px solid ${color}40` : 'none'};
      `,

      // === 表格 ===
      'table': `
        border-collapse: collapse;
        width: 100%;
        margin: ${s.md}px 0;
        border: 1px solid #e1e4e8;
      `,

      'th': `
        background: ${color}1F;
        font-weight: bold;
        color: ${color};
        border: 1px solid #e1e4e8;
        padding: 12px;
        text-align: left;
      `,

      'td': `
        border: 1px solid #e1e4e8;
        padding: 12px;
        text-align: left;
      `,

      'thead': `
        background: #f6f8fa;
      `,

      // === 分隔线 - 不可见，仅产生间距 ===
      'hr': `
        border: 0;
        border-top: 1px solid rgba(0,0,0,0.08);
        margin: 40px 0;
      `,

      // === 强调 - 荧光笔效果 ===
      'strong': `
        font-weight: bold;
        color: ${color};
        background-color: ${color}15;
        padding: 2px 4px;
        border-radius: 3px;
      `,

      'em': `
        font-style: italic;
      `,

      'del': `
        text-decoration: line-through;
        color: #999;
      `,

      // === 头像相关 ===
      'avatar-header': `
        margin: 0 0 ${s.sm}px 0;
        overflow: hidden;
      `,

      'avatar': `
        width: 28px !important;
        max-width: 28px !important;
        height: 28px !important;
        max-height: 28px !important;
        border-radius: 50%;
        object-fit: cover;
        border: 1px solid #e8e8ed;
        float: left;
        margin-right: ${s.sm}px;
      `,
    };

    return (styles[tagName] || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
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
