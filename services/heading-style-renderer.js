/*
## 核心功能

实现公众号文章标题分节样式扩展（Heading Style Variants），为文章二级标题（h2）
提供 4 套高兼容性内联排版风格：
- default: 经典极简（保持主题原生高品质左边框/底色块，长文耐看）
- serial-number: 大数字序号（34px 巨大双位数序号下沉对齐，右侧标题，底部微细线）
- badge: 胶囊徽标（纯色圆角矩形序号标签 + 渐变分割线）
- zen: 留白禅意（居中微型英文字距 PART 01 + 宋体衬线大标题 + 42px 居中微细分割线）

## 输入

- html: 渲染后的文章 HTML 字符串
- options: { headingStyle?, themeColor?, customColor?, primaryColor?, titleColor?, mutedTextColor?, settings? }

## 输出

- decorateArticleHeadings: 返回注入内联标题装饰后的 HTML 字符串

## 定位

位于 services/，属于渲染流水线的后置 HTML 装饰服务；纯逻辑与字符串正则转换，无 DOM 宿主依赖。

## 依赖

- 仅依赖 ES 标准库，支持多环境（Node/Electron/浏览器/测试）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 所有样式必须保持纯 inline style，杜绝依赖外部 CSS 类或未被内联的样式表。
- 绝不改动冻结文件（converter.js 与 wechatsync-bridge.js）。
*/

export const HEADING_STYLES = /** @type {const} */ ({
  DEFAULT: 'default',
  SERIAL_NUMBER: 'serial-number',
  BADGE: 'badge',
  ZEN: 'zen',
});

export const VALID_HEADING_STYLES = /** @type {const} */ ([
  HEADING_STYLES.DEFAULT,
  HEADING_STYLES.SERIAL_NUMBER,
  HEADING_STYLES.BADGE,
  HEADING_STYLES.ZEN,
]);

export const HEADING_STYLE_LABELS = /** @type {const} */ ({
  [HEADING_STYLES.DEFAULT]: '跟随主题（默认）',
  [HEADING_STYLES.SERIAL_NUMBER]: '大数字序号（01、02）',
  [HEADING_STYLES.BADGE]: '胶囊徽标（Badge）',
  [HEADING_STYLES.ZEN]: '留白禅意（Zen）',
});

import { THEME_PRESET_COLORS } from './engagement-card.js';

/**
 * 转换 Hex 色值为 RGB 分量
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
  let c = String(hex || '').trim().replace(/^#/, '');
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const num = parseInt(c, 16);
  if (Number.isNaN(num) || c.length !== 6) {
    return { r: 3, g: 102, b: 214 }; // 默认经典蓝
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * 解析主色调
 * @param {{ primaryColor?: string, customColor?: string, themeColor?: string, settings?: Record<string, unknown> }} options
 * @returns {string}
 */
export function resolvePrimaryColor(options = {}) {
  if (typeof options.primaryColor === 'string' && options.primaryColor.trim()) {
    return options.primaryColor.trim();
  }

  const customColor = options.customColor || /** @type {string|undefined} */ (options.settings?.customColor);
  if (typeof customColor === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(customColor.trim())) {
    return customColor.trim();
  }

  const themeColor = options.themeColor || /** @type {string|undefined} */ (options.settings?.themeColor);
  if (typeof themeColor === 'string' && THEME_PRESET_COLORS[themeColor.toLowerCase()]) {
    return THEME_PRESET_COLORS[themeColor.toLowerCase()];
  }

  return '#0366d6';
}

/**
 * 清除已有的 style="..." 属性，保留其余属性（如 id, class, data-*）
 * @param {string} rawAttrs
 * @returns {string}
 */
function stripStyleAttr(rawAttrs) {
  return String(rawAttrs || '').replace(/\s*style\s*=\s*(['\"]).*?\1/gi, '').trim();
}

/**
 * 从标题 HTML 中探测已有的序号并剥离，返回结构化序号与干净文本
 * @param {string} innerHtml
 * @param {number} fallbackIndex (1-based)
 * @returns {{ numStr: string, cleanTitle: string }}
 */
export function parseHeadingNumberAndTitle(innerHtml, fallbackIndex) {
  const raw = String(innerHtml || '').trim();

  // 匹配类似 "1. ", "01. ", "1、", "01 ", "01: " 等前缀
  const match = raw.match(/^(?:<[^>]+>)*\s*(?:(?:(\d{1,3})[.\u3001\s\-:]\s*)|(?:(\d{1,3})\s+))/);

  if (match) {
    const parsedNum = parseInt(match[1] || match[2], 10);
    const clean = raw.replace(/^(?:<[^>]+>)*\s*(?:\d{1,3}[.\u3001\s\-:]\s*|\d{1,3}\s+)/, '').trim();
    return {
      numStr: String(parsedNum).padStart(2, '0'),
      cleanTitle: clean || raw,
    };
  }

  return {
    numStr: String(fallbackIndex).padStart(2, '0'),
    cleanTitle: raw,
  };
}

/**
 * 装饰文章标题（对 h2 应用指定分节样式）
 * @param {string} html
 * @param {{
 *   headingStyle?: string,
 *   primaryColor?: string,
 *   themeColor?: string,
 *   customColor?: string,
 *   titleColor?: string,
 *   mutedTextColor?: string,
 *   settings?: Record<string, unknown>,
 * }} [options={}]
 * @returns {string}
 */
export function decorateArticleHeadings(html, options = {}) {
  const content = String(html || '');
  if (!content) return '';

  const headingStyle = options.headingStyle
    || /** @type {string|undefined} */ (options.settings?.headingStyle)
    || HEADING_STYLES.DEFAULT;

  if (headingStyle === HEADING_STYLES.DEFAULT || !VALID_HEADING_STYLES.includes(/** @type {any} */ (headingStyle))) {
    return content;
  }

  const primaryColor = resolvePrimaryColor(options);
  const titleColor = options.titleColor
    || /** @type {string|undefined} */ (options.settings?.titleColor)
    || '#1f2937';
  const rgb = hexToRgb(primaryColor);
  const subtleBorderColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`;

  let headingCounter = 0;

  // 正则替换所有 <h2>...</h2> 标签
  return content.replace(/<h2(\b[^>]*)>([\s\S]*?)<\/h2>/gi, (_fullMatch, rawAttrs, innerContent) => {
    headingCounter += 1;
    const attrs = String(rawAttrs || '');
    const inner = String(innerContent || '');
    const { numStr, cleanTitle } = parseHeadingNumberAndTitle(inner, headingCounter);
    const cleanedAttrs = stripStyleAttr(attrs);
    const attrsPrefix = cleanedAttrs ? ` ${cleanedAttrs}` : '';

    switch (headingStyle) {
      case HEADING_STYLES.SERIAL_NUMBER: {
        return (
          `<h2${attrsPrefix} style="display: block; margin: 36px 0 20px; padding: 0 0 10px 0; border: none; border-bottom: 1px solid ${subtleBorderColor}; text-align: left; background: none; line-height: 1.2;">` +
          `<span style="display: inline-block; vertical-align: baseline; font-size: 34px; font-weight: 800; line-height: 1; color: ${primaryColor}; margin-right: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;">${numStr}</span>` +
          `<span style="display: inline-block; vertical-align: baseline; font-size: 19px; font-weight: 700; color: ${titleColor}; line-height: 1.4;">${cleanTitle}</span>` +
          `</h2>`
        );
      }

      case HEADING_STYLES.BADGE: {
        return (
          `<h2${attrsPrefix} style="display: block; margin: 34px 0 18px; padding: 0 0 10px 0; border: none; background: none; background-image: linear-gradient(to right, ${primaryColor}, transparent); background-size: 100% 2px; background-repeat: no-repeat; background-position: bottom left; text-align: left; line-height: 1.2;">` +
          `<span style="display: inline-block; vertical-align: middle; background-color: ${primaryColor}; color: #ffffff; font-size: 12px; font-weight: 700; padding: 2px 9px; border-radius: 10px; margin-right: 10px; line-height: 1.3; letter-spacing: 0.5px;">${numStr}</span>` +
          `<span style="display: inline-block; vertical-align: middle; font-size: 18px; font-weight: 700; color: ${titleColor}; line-height: 1.4;">${cleanTitle}</span>` +
          `</h2>`
        );
      }

      case HEADING_STYLES.ZEN: {
        return (
          `<h2${attrsPrefix} style="display: block; margin: 40px auto 24px; padding: 0; border: none; background: none; text-align: center; line-height: 1.2;">` +
          `<span style="display: block; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 600; color: ${primaryColor}; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 8px;">PART ${numStr}</span>` +
          `<span style="display: block; font-family: 'Songti SC', 'Source Han Serif SC', 'Noto Serif CJK SC', 'SimSun', serif; font-size: 21px; font-weight: 700; color: ${titleColor}; line-height: 1.4; letter-spacing: 1px;">${cleanTitle}</span>` +
          `<span style="display: block; width: 42px; height: 1px; margin: 14px auto 0; background-color: ${primaryColor}; opacity: 0.6;"></span>` +
          `</h2>`
        );
      }

      default:
        return _fullMatch;
    }
  });
}
