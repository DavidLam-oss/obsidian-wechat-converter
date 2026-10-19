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

import { findCustomTheme } from './custom-theme-adapter.js';
import { sanitizeRawCssOverrides } from './theme-token-validator.js';

export const HEADING_STYLES = /** @type {const} */ ({
  DEFAULT: 'default',
  SERIAL_NUMBER: 'serial-number',
  BADGE: 'badge',
  ZEN: 'zen',
  LEFT_BORDER: 'left-border',
  BOTTOM_LINE: 'bottom-line',
  BUBBLE: 'bubble',
  CARD: 'card',
  DOUBLE_LINE: 'double-line',
});

export const VALID_HEADING_STYLES = /** @type {const} */ ([
  HEADING_STYLES.DEFAULT,
  HEADING_STYLES.SERIAL_NUMBER,
  HEADING_STYLES.BADGE,
  HEADING_STYLES.ZEN,
  HEADING_STYLES.LEFT_BORDER,
  HEADING_STYLES.BOTTOM_LINE,
  HEADING_STYLES.BUBBLE,
  HEADING_STYLES.CARD,
  HEADING_STYLES.DOUBLE_LINE,
]);

export const HEADING_STYLE_LABELS = /** @type {const} */ ({
  [HEADING_STYLES.DEFAULT]: '跟随主题（默认）',
  [HEADING_STYLES.SERIAL_NUMBER]: '大数字序号（01、02）',
  [HEADING_STYLES.BADGE]: '胶囊徽标（Badge）',
  [HEADING_STYLES.ZEN]: '留白禅意（Zen）',
  [HEADING_STYLES.LEFT_BORDER]: '左侧色块条（Left Border）',
  [HEADING_STYLES.BOTTOM_LINE]: '底边下划线（Bottom Line）',
  [HEADING_STYLES.BUBBLE]: '背景浅色卡（Bubble Card）',
  [HEADING_STYLES.CARD]: '背景浅色卡（Bubble Card）',
  [HEADING_STYLES.DOUBLE_LINE]: '双细下划线（Double Line）',
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

  const settings = options.settings;
  const themeColor = options.themeColor
    || (typeof settings?.themeColor === 'string' ? settings.themeColor : undefined);

  // 1. 若使用的是自定义主题，优先读取自定义主题的主色调
  if (settings && typeof settings.theme === 'string' && settings.customThemes) {
    const customToken = findCustomTheme(settings.customThemes, settings.theme);
    const accent = customToken?.colors?.accent;
    if (typeof accent === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(accent.trim())) {
      return accent.trim();
    }
  }

  // 2. 若用户选择的是自定义颜色模式，读取 customColor
  if (themeColor === 'custom') {
    const customColor = options.customColor
      || (typeof settings?.customColor === 'string' ? settings.customColor : undefined);
    if (typeof customColor === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(customColor.trim())) {
      return customColor.trim();
    }
  }

  // 3. 预设颜色（blue, green, purple, orange, teal, rose, ruby, slate 等）
  if (typeof themeColor === 'string' && THEME_PRESET_COLORS[themeColor.toLowerCase()]) {
    return THEME_PRESET_COLORS[themeColor.toLowerCase()];
  }

  // 4. 若 themeColor 本身就是一个 Hex 颜色值
  if (typeof themeColor === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(themeColor.trim())) {
    return themeColor.trim();
  }

  // 5. 回退检查 customColor
  const fallbackCustom = options.customColor
    || (typeof settings?.customColor === 'string' ? settings.customColor : undefined);
  if (typeof fallbackCustom === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(fallbackCustom.trim())) {
    return fallbackCustom.trim();
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
 * 装饰文章标题（对 h2 应用指定分节样式或自定义装饰）
 * @param {string} html
 * @param {{
 *   headingStyle?: string,
 *   customHeading?: import('./theme-token-validator.js').HeadingDecorationToken,
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

  const customHeading = options.customHeading || null;
  const headingStyle = options.headingStyle
    || /** @type {string|undefined} */ (options.settings?.headingStyle)
    || (customHeading?.style || HEADING_STYLES.DEFAULT);

  // 若为默认且没有提供自定义 heading 配置，原样返回
  if ((headingStyle === HEADING_STYLES.DEFAULT || !headingStyle) && !customHeading) {
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

    // 1. 如果 AI 或自定义主题提供了直接的 customStyle 内联样式
    if (customHeading?.customStyle) {
      const sanitized = sanitizeRawCssOverrides(String(customHeading.customStyle)).sanitized;
      let prefixSpan = '';
      if (customHeading.prefix) {
        const prefixStr = customHeading.prefix.replace(/01|number|%n/i, numStr);
        prefixSpan = `<span style="display: inline-block; vertical-align: baseline; font-weight: 700; color: ${primaryColor}; margin-right: 8px;">${prefixStr}</span>`;
      }
      return (
        `<h2${attrsPrefix} style="display: block; margin: 32px 0 16px; line-height: 1.4; ${sanitized}">` +
        prefixSpan +
        `<span style="color: ${titleColor}; line-height: 1.4;">${cleanTitle}</span>` +
        `</h2>`
      );
    }

    // 2. 匹配有效样式模式
    const effectiveStyle = customHeading?.style || headingStyle;

    switch (effectiveStyle) {
      case HEADING_STYLES.SERIAL_NUMBER: {
        return (
          `<h2${attrsPrefix} style="display: block; margin: 36px 0 20px; padding: 0 0 10px 0; border: none; border-bottom: 1px solid ${subtleBorderColor}; text-align: left; background: none; line-height: 1.2;">` +
          `<span style="display: inline-block; vertical-align: baseline; font-size: 34px; font-weight: 800; line-height: 1; color: ${primaryColor}; margin-right: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;">${numStr}</span>` +
          `<span style="display: inline-block; vertical-align: baseline; font-size: 19px; font-weight: 700; color: ${titleColor}; line-height: 1.4;">${cleanTitle}</span>` +
          `</h2>`
        );
      }

      case HEADING_STYLES.BADGE: {
        const bg = customHeading?.background || primaryColor;
        const radius = customHeading?.borderRadius || '10px';
        return (
          `<h2${attrsPrefix} style="display: block; margin: 34px 0 18px; padding: 0 0 10px 0; border: none; background: none; background-image: linear-gradient(to right, ${primaryColor}, transparent); background-size: 100% 2px; background-repeat: no-repeat; background-position: bottom left; text-align: left; line-height: 1.2;">` +
          `<span style="display: inline-block; vertical-align: middle; background-color: ${bg}; color: #ffffff; font-size: 12px; font-weight: 700; padding: 2px 9px; border-radius: ${radius}; margin-right: 10px; line-height: 1.3; letter-spacing: 0.5px;">${numStr}</span>` +
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

      case HEADING_STYLES.LEFT_BORDER: {
        const borderVal = customHeading?.borderLeft || customHeading?.border || `4px solid ${primaryColor}`;
        const bgVal = customHeading?.background || 'transparent';
        const radiusVal = customHeading?.borderRadius || '0';
        const alignVal = customHeading?.align || 'left';
        let prefixSpan = '';
        if (customHeading?.prefix) {
          const prefixStr = customHeading.prefix.replace(/01|number|%n/i, numStr);
          prefixSpan = `<span style="display: inline-block; vertical-align: baseline; font-weight: 700; color: ${primaryColor}; margin-right: 8px;">${prefixStr}</span>`;
        }
        return (
          `<h2${attrsPrefix} style="display: block; margin: 32px 0 18px; padding: 6px 12px; border: none; border-left: ${borderVal}; background: ${bgVal}; border-radius: ${radiusVal}; text-align: ${alignVal}; line-height: 1.35;">` +
          prefixSpan +
          `<span style="display: inline-block; vertical-align: baseline; font-size: 19px; font-weight: 700; color: ${titleColor};">${cleanTitle}</span>` +
          `</h2>`
        );
      }

      case HEADING_STYLES.BOTTOM_LINE: {
        const borderVal = customHeading?.borderBottom || customHeading?.border || `2px solid ${primaryColor}`;
        const bgVal = customHeading?.background || 'none';
        const alignVal = customHeading?.align || 'left';
        let prefixSpan = '';
        if (customHeading?.prefix) {
          const prefixStr = customHeading.prefix.replace(/01|number|%n/i, numStr);
          prefixSpan = `<span style="display: inline-block; vertical-align: baseline; font-weight: 700; color: ${primaryColor}; margin-right: 8px;">${prefixStr}</span>`;
        }
        return (
          `<h2${attrsPrefix} style="display: block; margin: 32px 0 18px; padding: 0 0 8px 0; border: none; border-bottom: ${borderVal}; background: ${bgVal}; text-align: ${alignVal}; line-height: 1.35;">` +
          prefixSpan +
          `<span style="display: inline-block; vertical-align: baseline; font-size: 19px; font-weight: 700; color: ${titleColor};">${cleanTitle}</span>` +
          `</h2>`
        );
      }

      case HEADING_STYLES.BUBBLE:
      case HEADING_STYLES.CARD: {
        const bgVal = customHeading?.background || `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`;
        const borderVal = customHeading?.border || `1px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`;
        const radiusVal = customHeading?.borderRadius || '6px';
        const alignVal = customHeading?.align || 'left';
        let prefixSpan = '';
        if (customHeading?.prefix) {
          const prefixStr = customHeading.prefix.replace(/01|number|%n/i, numStr);
          prefixSpan = `<span style="display: inline-block; vertical-align: baseline; font-weight: 700; color: ${primaryColor}; margin-right: 8px;">${prefixStr}</span>`;
        }
        return (
          `<h2${attrsPrefix} style="display: block; margin: 30px 0 18px; padding: 8px 14px; border: ${borderVal}; background: ${bgVal}; border-radius: ${radiusVal}; text-align: ${alignVal}; line-height: 1.35;">` +
          prefixSpan +
          `<span style="display: inline-block; vertical-align: baseline; font-size: 18px; font-weight: 700; color: ${titleColor};">${cleanTitle}</span>` +
          `</h2>`
        );
      }

      case HEADING_STYLES.DOUBLE_LINE: {
        const borderVal = customHeading?.borderBottom || `3px double ${primaryColor}`;
        const alignVal = customHeading?.align || 'left';
        let prefixSpan = '';
        if (customHeading?.prefix) {
          const prefixStr = customHeading.prefix.replace(/01|number|%n/i, numStr);
          prefixSpan = `<span style="display: inline-block; vertical-align: baseline; font-weight: 700; color: ${primaryColor}; margin-right: 8px;">${prefixStr}</span>`;
        }
        return (
          `<h2${attrsPrefix} style="display: block; margin: 32px 0 18px; padding: 0 0 6px 0; border: none; border-bottom: ${borderVal}; text-align: ${alignVal}; line-height: 1.35;">` +
          prefixSpan +
          `<span style="display: inline-block; vertical-align: baseline; font-size: 19px; font-weight: 700; color: ${titleColor};">${cleanTitle}</span>` +
          `</h2>`
        );
      }

      default: {
        if (customHeading) {
          const borderVal = customHeading.borderLeft || customHeading.border || `3px solid ${primaryColor}`;
          const bgVal = customHeading.background || 'transparent';
          const radiusVal = customHeading.borderRadius || '0';
          let prefixSpan = '';
          if (customHeading.prefix) {
            const prefixStr = customHeading.prefix.replace(/01|number|%n/i, numStr);
            prefixSpan = `<span style="display: inline-block; vertical-align: baseline; font-weight: 700; color: ${primaryColor}; margin-right: 8px;">${prefixStr}</span>`;
          }
          return (
            `<h2${attrsPrefix} style="display: block; margin: 32px 0 18px; padding: 6px 12px; border: none; border-left: ${borderVal}; background: ${bgVal}; border-radius: ${radiusVal}; text-align: ${customHeading.align || 'left'}; line-height: 1.35;">` +
            prefixSpan +
            `<span style="display: inline-block; vertical-align: baseline; font-size: 19px; font-weight: 700; color: ${titleColor};">${cleanTitle}</span>` +
            `</h2>`
          );
        }
        return _fullMatch;
      }
    }
  });
}
