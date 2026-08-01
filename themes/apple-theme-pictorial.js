/*
## 核心功能

生成“图文志”主题的微信公众号兼容内联样式，包括图文叙事的正文、标题、引用、媒体和表格样式。

## 输入

接收标签名、AppleTheme 的字号与字体设置、动态颜色角色和行文间距设置。

## 输出

输出标签级 CSS 字符串；未知标签返回 null，由 AppleTheme 的既有通用样式继续处理。

## 定位

位于 themes/，是 apple-theme.js 的图文志样式子模块；不解析 Markdown，也不识别图片语义。

## 依赖

依赖 apple-theme-colors.js 输出的颜色角色，以及 AppleTheme 传入的字体与尺寸配置。

## 维护规则

- 只使用微信公众号可保留的标签级内联样式，不依赖 class、style 标签、伪元素、复杂 Grid 或动画。
- 不引入固定第二强调色；所有内容强调必须来自动态颜色角色。
- hero、regular 与 caption 的结构识别属于 serializer 子模块，本文件只定义其视觉角色。
*/

/**
 * @typedef {{ base: number, h1: number, h2: number, h3: number, h4: number, h5: number, h6: number, code: number, caption: number }} AppleFontSizeConfig
 * @typedef {{ accent: string, accentReadable: string, accentDeep: string, accentSoft: string, accentBorder: string, text: string, muted: string, surface: string, border: string }} PictorialColorRoles
 */

/**
 * @param {{
 *   tagName: string,
 *   roles: PictorialColorRoles,
 *   sizes: AppleFontSizeConfig,
 *   font: string,
 *   serifFont: string,
 *   monospaceFont: string,
 *   lineHeight: number,
 *   paragraphGap: number,
 *   letterSpacing: number,
 *   sidePadding: number,
 * }} options
 * @returns {string | null}
 */
function getPictorialStyle({
  tagName,
  roles,
  sizes,
  font,
  serifFont,
  monospaceFont,
  lineHeight,
  paragraphGap,
  letterSpacing,
  sidePadding,
}) {
  const bodyLetterSpacing = letterSpacing ? `letter-spacing: ${letterSpacing}px;` : 'letter-spacing: 0;';
  const bodyFont = font || serifFont;
  const safeSidePadding = Number.isFinite(sidePadding) ? sidePadding : 16;
  const regularFigure = 'display:block;box-sizing:border-box;margin:28px 0 30px;padding:0;text-align:center;border:0;';
  const regularImage = 'display:block;box-sizing:border-box;max-width:100%;height:auto;margin:0 auto;border:0;border-radius:0;';
  const caption = `display:block;font-family:${bodyFont};font-size:${sizes.caption}px;line-height:1.6;color:${roles.muted};margin:10px auto 0;padding:0;text-align:center;${bodyLetterSpacing}`;

  switch (tagName) {
    case 'section':
      return `font-family:${bodyFont};font-size:${sizes.base}px;line-height:${lineHeight};color:${roles.text};padding:26px ${safeSidePadding}px 34px;background:${roles.surface};box-sizing:border-box;max-width:100%;word-wrap:break-word;word-break:normal;overflow-wrap:break-word;line-break:strict;text-align:left;`;
    case 'h1':
      return `font-family:${serifFont};display:block;font-size:${sizes.h1}px;font-weight:700;line-height:1.28;color:${roles.accentDeep};margin:38px 0 20px;padding:0 0 14px;text-align:center;letter-spacing:0.01em;border-bottom:1px solid ${roles.accentBorder};`;
    case 'h2':
      return `font-family:${serifFont};display:block;font-size:${sizes.h2}px;font-weight:700;line-height:1.34;color:${roles.accentDeep};margin:40px 0 18px;padding:0;text-align:left;letter-spacing:0.01em;`;
    case 'h3':
      return `font-family:${serifFont};display:block;font-size:${sizes.h3}px;font-weight:700;line-height:1.42;color:${roles.accentDeep};margin:30px 0 13px;padding:0;text-align:left;`;
    case 'h4':
      return `font-family:${bodyFont};display:block;font-size:${sizes.h4}px;font-weight:700;line-height:1.5;color:${roles.accentDeep};margin:24px 0 10px;padding:0;text-align:left;`;
    case 'h5':
      return `font-family:${bodyFont};display:block;font-size:${sizes.h5}px;font-weight:700;line-height:1.5;color:${roles.accentDeep};margin:20px 0 8px;padding:0;text-align:left;`;
    case 'h6':
      return `font-family:${bodyFont};display:block;font-size:${sizes.h6}px;font-weight:700;line-height:1.5;color:${roles.muted};margin:18px 0 8px;padding:0;text-align:left;`;
    case 'p':
      return `font-family:${bodyFont};font-size:${sizes.base}px;line-height:${lineHeight};color:${roles.text};margin:0 0 ${paragraphGap}px 0;padding:0;text-align:justify;text-align-last:left;${bodyLetterSpacing}word-break:normal;overflow-wrap:break-word;line-break:strict;`;
    case 'blockquote':
      return `font-family:${serifFont};font-size:${sizes.base}px;line-height:${lineHeight};color:${roles.text};background:${roles.accentSoft};margin:28px 0;padding:17px 18px;text-align:justify;border-top:1px solid ${roles.accentBorder};border-bottom:1px solid ${roles.accentBorder};border-left:0;border-right:0;border-radius:0;`;
    case 'pre':
      return `background:#f6f7f8;border:1px solid ${roles.border};border-radius:4px;padding:14px 16px;margin:20px 0;overflow-x:auto;font-family:${monospaceFont};font-size:${sizes.code}px;line-height:1.65;color:${roles.text};`;
    case 'code':
      return `background:${roles.accentSoft};color:${roles.accentReadable};padding:1px 4px;border-radius:2px;font-family:${monospaceFont};font-size:${sizes.code}px;`;
    case 'ul':
      return `font-family:${bodyFont};font-size:${sizes.base}px;line-height:${lineHeight};color:${roles.text};margin:14px 0 20px;padding-left:22px;list-style-type:disc;`;
    case 'ol':
      return `font-family:${bodyFont};font-size:${sizes.base}px;line-height:${lineHeight};color:${roles.text};margin:14px 0 20px;padding-left:22px;list-style-type:decimal;`;
    case 'li':
      return `font-size:${sizes.base}px;line-height:${lineHeight};color:${roles.text};margin:5px 0;${bodyLetterSpacing}`;
    case 'li-task':
      return `font-size:${sizes.base}px;line-height:${lineHeight};color:${roles.text};margin:5px 0;list-style-type:none;margin-left:-20px;${bodyLetterSpacing}`;
    case 'li p':
      return `margin:0;padding:0;line-height:${lineHeight};`;
    case 'figure':
    case 'pictorial-regular-figure':
      return regularFigure;
    case 'pictorial-hero-figure':
      return 'display:block;box-sizing:border-box;margin:36px 0 32px;padding:0;text-align:center;border:0;';
    case 'img':
    case 'pictorial-regular-img':
      return regularImage;
    case 'pictorial-hero-img':
      return 'display:block;box-sizing:border-box;width:100%;max-width:100%;height:auto;margin:0 auto;border:0;border-radius:0;';
    case 'figcaption':
    case 'pictorial-caption':
      return caption;
    case 'a':
      return `color:${roles.accentReadable};text-decoration:none;border-bottom:1px solid ${roles.accentBorder};word-break:break-word;overflow-wrap:anywhere;`;
    case 'table-wrapper':
      return 'display:block;box-sizing:border-box;width:100%;max-width:100%;overflow-x:scroll;overflow-y:hidden;-webkit-overflow-scrolling:touch;margin:20px 0;padding-bottom:10px;';
    case 'table':
      return `border-collapse:collapse;width:720px;min-width:100%;max-width:none;table-layout:auto;border:1px solid ${roles.border};`;
    case 'thead':
      return `background:${roles.accentSoft};`;
    case 'th':
      return `background:${roles.accentSoft};font-weight:700;color:${roles.text};border:1px solid ${roles.border};padding:11px 12px;text-align:left;white-space:nowrap;word-break:keep-all;overflow-wrap:normal;`;
    case 'td':
      return `border:1px solid ${roles.border};padding:11px 12px;text-align:left;white-space:nowrap;word-break:keep-all;overflow-wrap:normal;`;
    case 'hr':
      return `border:0;border-top:1px solid ${roles.accentBorder};margin:42px 0;`;
    case 'strong':
      return `font-weight:700;color:${roles.text};`;
    case 'em':
      return 'font-style:italic;';
    case 'del':
      return `text-decoration:line-through;color:${roles.muted};`;
    case 'mark':
      return `background:${roles.accentSoft};color:${roles.text};padding:0 2px;border-radius:2px;`;
    default:
      return null;
  }
}

export {
  getPictorialStyle,
};
