/*
## 核心功能

生成 AppleTheme 的 H1 至 H6 内联样式。

## 输入

接收主题类、当前主题实例、标题装饰类型、颜色、字号、字体与主题配置。

## 输出

输出微信编辑器兼容的标题内联 CSS 字符串。

## 定位

位于 themes/，是 apple-theme.js 的标题样式子模块；不管理主题状态或正文标签样式。

## 依赖

通过参数使用 AppleTheme 静态字体与配置，并复用实例的样式拼接方法。

## 维护规则

- 保持各标题层级的既有装饰映射与默认样式。
- 新增标题装饰时只修改对应层级函数并补主题回归测试。
*/

/**
 * @typedef {{ FONTS: Record<string, string>, THEME_CONFIGS: Record<string, Record<string, unknown>> }} AppleThemeClassLike
 * @typedef {{ joinStyleStrings: (...styles: string[]) => string }} AppleThemeInstanceLike
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- reason: extracted style builders preserve the dynamically shaped theme class and instance contract */

/** @returns {string} */
function buildH1Style(themeClass, type, color, fontSize, font, headingColor, config = themeClass.THEME_CONFIGS.github) {
  const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 30px auto 20px; color: ${headingColor}; text-align: center; line-height: 1.2;`;
  switch (type) {
    case 'editorial-h1': // Magazine Style: Forced Serif + Golden Line (More elegant: 1px height, 80px width, tightened spacing)
      return `font-family: ${themeClass.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 28px auto 16px; padding: 0 0 10px; color: ${headingColor}; text-align: center; line-height: 1.2; background-image: linear-gradient(to right, transparent, ${color}, transparent); background-size: 80px 1px; background-repeat: no-repeat; background-position: bottom center; letter-spacing: 1px;`;
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
      return `font-family: ${themeClass.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 34px auto 24px; color: ${headingColor}; text-align: center; line-height: 1.35; letter-spacing: 1px; border-top: 2px solid ${color}; border-bottom: 1px solid ${color}66; padding: 16px 0 14px;`;
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

/** @returns {string} */
function buildH2Style(themeClass, type, color, fontSize, font, headingColor, config = themeClass.THEME_CONFIGS.github) {
  const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 32px auto 16px; text-align: center; color: ${headingColor}; line-height: 1.25;`;
  switch (type) {
    case 'editorial-h1': // Golden Line (Shifted from H1 - More elegant: 1px height, 80px width, tightened spacing)
      return `font-family: ${themeClass.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 28px auto 14px; padding: 0 0 10px; color: ${headingColor}; text-align: center; line-height: 1.2; background-image: linear-gradient(to right, transparent, ${color}, transparent); background-size: 80px 1px; background-repeat: no-repeat; background-position: bottom center; letter-spacing: 1px;`;
    case 'editorial-h2': // Magazine Subtitle
      return `font-family: ${themeClass.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: normal; margin: 32px auto 16px; text-align: center; color: ${headingColor}; line-height: 1.4; font-style: italic; letter-spacing: 1px;`;
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
      return `font-family: ${themeClass.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 34px auto 20px; color: ${headingColor}; text-align: center; line-height: 1.35; letter-spacing: 1px; border-top: 2px solid ${color}; border-bottom: 1px solid ${color}66; padding: 14px 0 12px;`;
    case 'paper-chapter':
      return `font-family: ${themeClass.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 34px auto 20px; color: ${headingColor}; text-align: center; line-height: 1.35; letter-spacing: 1.5px; border-bottom: 2px solid ${color}; padding-bottom: 12px;`;
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
      return `font-family: ${themeClass.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 34px 0 16px; color: ${headingColor}; text-align: left; line-height: 1.35; border-bottom: 1px solid ${color}55; padding-bottom: 8px;`;
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

/** @returns {string} */
function buildH3Style(themeClass, type, color, fontSize, font, headingColor, config = themeClass.THEME_CONFIGS.github) {
  const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 20px 0 12px; text-align: left; color: ${headingColor}; line-height: 1.3;`;
  switch (type) {
    case 'editorial-h2': // Italic Serif (Left Aligned for H3)
      return `font-family: ${themeClass.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: normal; margin: 24px 0 12px; text-align: left; color: ${headingColor}; line-height: 1.4; font-style: italic; letter-spacing: 1px;`;
    case 'editorial-h3': // Magazine Section: Forced Serif + Left Underline
      return `font-family: ${themeClass.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 24px 0 12px; text-align: left; color: ${headingColor}; line-height: 1.3;
         border-bottom: 1px solid ${color}; padding-bottom: 4px; display: inline-block; width: auto; letter-spacing: 0.5px;`;
    case 'left-border':
      return `${base} border-left: 4px solid ${color}; padding-left: 10px;`;
    case 'bottom-line-left':
      return `${base} display: inline-block; border-bottom: 2px solid ${color}; padding-bottom: 2px; margin-right: auto;`;
    case 'classic-subhead':
      return `${base} border-left: 3px solid ${color}; background: ${color}0A; padding: 6px 10px; margin: 24px 0 12px;`;
    case 'paper-section':
      return `font-family: ${themeClass.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 28px 0 14px; color: ${headingColor}; text-align: left; line-height: 1.35; border-top: 1px solid ${color}55; padding-top: 8px;`;
    case 'grid-section':
      return `${base} background-image: linear-gradient(${color}, ${color}); background-size: 3px 55%; background-position: left center; background-repeat: no-repeat; padding-left: 12px;`;
    case 'typo-section':
      return `${base} font-weight: 700; margin: 28px 0 14px; line-height: 1.35; border-left: 2px solid #d8d8d8; padding-left: 10px;`;
    case 'media-section':
      return `${base} display: inline-block; width: auto; background: ${color}14; border: 1px solid ${color}33; padding: 5px 10px; border-radius: 2px;`;
    case 'colorful-section':
      return `${base} display: inline-block; width: auto; background: ${color}18; border-bottom: 2px solid ${color}; padding: 5px 9px 4px; border-radius: 4px 4px 0 0;`;
    case 'paper-kicker':
      return `font-family: ${themeClass.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 24px 0 12px; color: ${headingColor}; text-align: left; line-height: 1.35; padding-left: 10px; border-left: 3px double ${color};`;
    case 'typo-subhead':
      return `${base} font-weight: 700; color: ${headingColor};`;
    default:
      return this.joinStyleStrings(base, config.headingLetterSpacing ? `letter-spacing: ${config.headingLetterSpacing}px` : '');
  }
}

/** @returns {string} */
function buildH4Style(themeClass, type, color, fontSize, font, headingColor) {
  const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 15px 0 10px; text-align: left; color: ${headingColor}; line-height: 1.35;`;
  switch (type) {
    case 'editorial-h3': // Inherit H3 style for H4
      return `font-family: ${themeClass.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 15px 0 10px; text-align: left; color: ${headingColor}; line-height: 1.35;
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
      return `font-family: ${themeClass.FONTS.serif}; display: inline-block; font-size: ${fontSize}px; font-weight: bold; margin: 22px 0 10px; color: ${headingColor}; text-align: left; line-height: 1.35; border-bottom: 1px double ${color}99; padding-bottom: 2px;`;
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

/** @returns {string} */
function buildH5Style(themeClass, type, color, fontSize, font, headingColor) {
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

/** @returns {string} */
function buildH6Style(themeClass, type, color, fontSize, font, headingColor, mutedColor = '#6b7280') {
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

export {
  buildH1Style,
  buildH2Style,
  buildH3Style,
  buildH4Style,
  buildH5Style,
  buildH6Style,
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- reason: resume typed linting after extracted theme style boundary */
