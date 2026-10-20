/*
## 核心功能

公众号文章末尾互动三连卡（Engagement Footer Card）：点赞、在看、转发。
全量自适应继承当前文章的 themeColor / customColor 色彩生态；
采用纯内联样式与微矢量 SVG，保证微信后台留存与兼容性；
独立可选（Opt-in），默认关闭（false）。

## 输入

- options: { themeColor?, customColor?, mutedTextColor?, ctaText? }

## 输出

- renderEngagementCard(options) -> 纯内联样式的 WeChat-friendly HTML 字符串
- shouldShowEngagementCard(settings, frontmatter?) -> boolean
- appendEngagementCardToHtml(html, options) -> 拼接后的 HTML 字符串

## 定位

位于 services/，属于文章视觉增强组件层；纯逻辑与字符串组装，无 DOM/宿主依赖。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 必须保持纯内联 style 属性，微信后台会剥离外部 CSS 与 class 样式。
- SVG 采用内联微矢量，必须指定 explicit viewBox / width / height / stroke / fill。
*/

export const DEFAULT_ENGAGEMENT_CTA_TEXT = '如果对你有启发，欢迎点赞、在看、转发';

/** @type {Record<string, string>} */
export const THEME_PRESET_COLORS = {
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
 * HTML 转义，防止 CTA 文本中的特殊字符破坏 HTML 结构
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 解析主色（优先使用自定义十六进制色，否则查预设色板）
 * @param {string} [themeColor]
 * @param {string} [customColor]
 * @returns {string}
 */
export function resolveEngagementCardColor(themeColor, customColor) {
  if (themeColor === 'custom' && typeof customColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(customColor.trim())) {
    return customColor.trim();
  }
  if (typeof themeColor === 'string' && THEME_PRESET_COLORS[themeColor]) {
    return THEME_PRESET_COLORS[themeColor];
  }
  if (typeof themeColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(themeColor.trim())) {
    return themeColor.trim();
  }
  return THEME_PRESET_COLORS.blue;
}

/**
 * 判定是否应渲染互动三连卡。
 * 遵循「严格克制、可选开启」原则：
 * 1. 优先检查 frontmatter 中的 engagement_card / three_links 字段（单篇强制开/关）；
 * 2. 否则读取全局设置 enableEngagementCard（默认 false）。
 *
 * @param {{ enableEngagementCard?: boolean } | null | undefined} settings
 * @param {Record<string, unknown> | null | undefined} [frontmatter]
 * @returns {boolean}
 */
export function shouldShowEngagementCard(settings, frontmatter) {
  if (frontmatter && typeof frontmatter === 'object') {
    const fmValue = frontmatter.engagement_card
      ?? frontmatter.engagementCard
      ?? frontmatter.three_links
      ?? frontmatter.interactive_card;
    if (typeof fmValue === 'boolean') {
      return fmValue;
    }
  }
  return Boolean(settings?.enableEngagementCard);
}

/**
 * 渲染文章末尾互动三连卡 HTML 字符串。
 * 包含点赞、在看、转发三个微卡片，全部采用行内样式并自适应当前主题色。
 *
 * @param {{
 *   themeColor?: string,
 *   customColor?: string,
 *   mutedTextColor?: string,
 *   ctaText?: string,
 * }} [options]
 * @returns {string}
 */
export function renderEngagementCard(options = {}) {
  const primaryColor = resolveEngagementCardColor(options.themeColor, options.customColor);
  const rgb = hexToRgb(primaryColor);
  const cardBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.03)`;
  const cardBorder = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
  const badgeBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.07)`;
  const badgeBorder = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.20)`;
  const textColor = options.mutedTextColor || '#6b7280';
  const rawCta = typeof options.ctaText === 'string' && options.ctaText.trim()
    ? options.ctaText.trim()
    : DEFAULT_ENGAGEMENT_CTA_TEXT;
  const safeCta = escapeHtml(rawCta);

  // 微矢量 SVG 图标（高兼容性，无微信过滤风险）
  const thumbSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; display: inline-block;"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>`;
  const eyeSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; display: inline-block;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  const shareSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; display: inline-block;"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`;

  const badgeStyle = `display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 6px 14px; border-radius: 999px; background-color: ${badgeBg}; border: 1px solid ${badgeBorder}; color: ${primaryColor}; font-size: 13px; font-weight: 600; line-height: 1; text-align: center; box-sizing: border-box; text-decoration: none; white-space: nowrap; flex: 0 0 auto;`;

  return [
    `<section class="owc-engagement-card" style="margin: 36px auto 20px; padding: 20px 12px; border: 1px solid ${cardBorder}; border-radius: 12px; background-color: ${cardBg}; text-align: center; box-sizing: border-box; max-width: 100%;">`,
    `  <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.6; color: ${textColor}; font-weight: 500; text-align: center; word-break: break-word;">${safeCta}</p>`,
    `  <section style="display: flex; justify-content: center; align-items: center; flex-wrap: nowrap; gap: 8px; margin: 0 auto; text-align: center; width: 100%; box-sizing: border-box;">`,
    `    <section style="${badgeStyle}">${thumbSvg}<span>点赞</span></section>`,
    `    <section style="${badgeStyle}">${eyeSvg}<span>在看</span></section>`,
    `    <section style="${badgeStyle}">${shareSvg}<span>转发</span></section>`,
    `  </section>`,
    `</section>`,
  ].join('\n');
}

/**
 * 将互动卡安全拼装进文章 HTML。
 * 优先插入在文章根节点闭合标签之前，保持在 .owc-article-root 内部。
 *
 * @param {string} html
 * @param {{
 *   themeColor?: string,
 *   customColor?: string,
 *   mutedTextColor?: string,
 *   ctaText?: string,
 * }} [options]
 * @returns {string}
 */
export function appendEngagementCardToHtml(html, options = {}) {
  const cardHtml = renderEngagementCard(options);
  if (!html) return cardHtml;

  // 检查是否已包含互动卡，避免重复附加
  if (html.includes('class="owc-engagement-card"')) {
    return html;
  }

  // 若文章以 </section> 结尾，插入在最后一个 </section> 之前
  if (/<\/section>\s*$/i.test(html)) {
    return html.replace(/<\/section>\s*$/i, `\n${cardHtml}\n</section>`);
  }

  // 否则直接追加至末尾
  return `${html}\n${cardHtml}`;
}

/**
 * @typedef {{
 *   getPublishContextFile?: () => unknown,
 *   app?: {
 *     metadataCache?: {
 *       getFileCache?: (file: unknown) => { frontmatter?: Record<string, unknown> } | null | undefined
 *     }
 *   },
 *   plugin?: {
 *     settings?: {
 *       enableEngagementCard?: boolean,
 *       themeColor?: string,
 *       customColor?: string,
 *       engagementCtaText?: string,
 *       [key: string]: unknown
 *     }
 *   }
 * }} EngagementViewLike
 */

/**
 * 包装视图文章渲染产物，按需附加互动三连卡。
 * @param {EngagementViewLike | null | undefined} view
 * @param {string} rawHtml
 * @returns {string}
 */
export function decorateArticleWithEngagementCard(view, rawHtml) {
  const activeFile = typeof view?.getPublishContextFile === 'function'
    ? view.getPublishContextFile()
    : null;

  /** @type {Record<string, unknown> | null | undefined} */
  const frontmatter = (activeFile && typeof view?.app?.metadataCache?.getFileCache === 'function')
    ? view.app.metadataCache.getFileCache(activeFile)?.frontmatter
    : null;

  const settings = view?.plugin?.settings;
  if (shouldShowEngagementCard(settings, frontmatter)) {
    return appendEngagementCardToHtml(rawHtml, {
      themeColor: typeof settings?.themeColor === 'string' ? settings.themeColor : undefined,
      customColor: typeof settings?.customColor === 'string' ? settings.customColor : undefined,
      ctaText: typeof settings?.engagementCtaText === 'string' ? settings.engagementCtaText : undefined,
    });
  }

  return rawHtml;
}
