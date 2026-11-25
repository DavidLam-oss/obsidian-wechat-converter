/*
## 核心功能

自定义排版主题 Token（CustomThemeToken）与 AppleStyle 多主题系统的编译适配层。
将 Token 格式无损编译为 AppleTheme 运行时所需的 AppleThemeConfig 与 AppleThemeOptions，
统一单一数据流，杜绝状态脱节与字段漂移。

## 输入

- `token`: 合法的 `CustomThemeToken` 对象

## 输出

- `compileCustomThemeToAppleConfig(token)`: 编译生成完整的 `AppleThemeConfig`
- `compileCustomThemeToAppleOptions(token)`: 编译生成完整的 `AppleThemeOptions`
- `findCustomTheme(customThemes, themeId)`: 按 ID 检索用户自定义主题 Token
- `listAllThemes(customThemes)`: 获取包含官方内置主题与用户自定义主题的统一清单

## 定位

位于 services/，业务适配层，不依赖 DOM，可在 Node 环境下独立单测。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- reason: Theme token compilation maps loosely-typed JSON tokens into typed AppleTheme options */

import { compileCustomCss } from './custom-css-compiler.js';
import { applyCompiledCustomCss } from './custom-css-inliner.js';

/**
 * 官方内置 8 套文章主题元信息清单
 */
export const BUILTIN_ARTICLE_THEMES = /** @type {const} */ ([
  { value: 'github', label: '简约' },
  { value: 'wechat', label: '经典' },
  { value: 'serif', label: '优雅' },
  { value: 'paper', label: '纸张长文' },
  { value: 'grid', label: '网格文档' },
  { value: 'typo', label: 'Typo' },
  { value: 'media', label: '清爽媒体' },
  { value: 'colorful', label: '彩色强调' },
]);

/**
 * 读取自定义主题的 CSS 文本（优先 css，兼容历史 rawCssOverrides）
 * @param {import('./theme-token-validator.js').CustomThemeToken | Record<string, any> | null | undefined} token
 * @returns {string}
 */
export function getCustomThemeCss(token) {
  if (!token || typeof token !== 'object') return '';
  const candidate = typeof token.css === 'string' && token.css.trim()
    ? token.css
    : (typeof token.rawCssOverrides === 'string' ? token.rawCssOverrides : '');
  return candidate.trim();
}

/**
 * 编译自定义主题 CSS（自动强制 !important 以覆盖 AppleTheme 基础内联保底样式）
 * @param {import('./theme-token-validator.js').CustomThemeToken | Record<string, any> | null | undefined} token
 * @returns {import('./custom-css-compiler.js').CustomCssCompileResult | null}
 */
export function compileCustomThemeCss(token) {
  const css = getCustomThemeCss(token);
  if (!css) return null;
  return compileCustomCss(css, {
    sourceIdentity: `custom-theme:${token?.id || 'draft'}`,
    forceImportant: true,
    rootSectionDirectChild: true,
  });
}

/**
 * 保护内置组件子树（互动三连卡、Mac 代码块）不被自定义主题 CSS（如 p / pre / section）误伤
 * @param {string} html
 * @returns {{ html: string, restore: (targetHtml: string) => string }}
 */
function protectBuiltinComponentSubtrees(html) {
  if (typeof DOMParser === 'undefined' || !html) {
    return { html, restore: (targetHtml) => targetHtml };
  }
  const hasProtectedClass = html.includes('owc-engagement-card')
    || html.includes('code-snippet__fix')
    || html.includes('code-snippet__export');
  if (!hasProtectedClass) {
    return { html, restore: (targetHtml) => targetHtml };
  }

  const doc = new DOMParser().parseFromString(`<div id="owc-theme-protect-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('owc-theme-protect-root');
  if (!root) {
    return { html, restore: (targetHtml) => targetHtml };
  }

  /** @type {Array<{ token: string, markup: string }>} */
  const placeholders = [];
  const protectedNodes = Array.from(
    root.querySelectorAll('.owc-engagement-card, .code-snippet__fix, .code-snippet__export')
  );
  protectedNodes.forEach((node, index) => {
    // 跳过已处于更外层受保护节点内部的后代
    if (node.parentElement?.closest('.owc-engagement-card, .code-snippet__fix, .code-snippet__export')) {
      return;
    }
    const token = `owc-protected-${index}`;
    placeholders.push({ token, markup: node.outerHTML });
    const marker = doc.createElement('span');
    marker.setAttribute('data-owc-protected-block', token);
    node.replaceWith(marker);
  });

  if (placeholders.length === 0) {
    return { html, restore: (targetHtml) => targetHtml };
  }

  // 读取替换后的内部 HTML 序列（不经过 innerHTML 赋值）
  const protectedHtml = Array.from(root.childNodes)
    .map((child) => (child.nodeType === 1 ? /** @type {Element} */ (child).outerHTML : (child.textContent || '')))
    .join('');

  return {
    html: protectedHtml,
    restore: (targetHtml) => {
      const outDoc = new DOMParser().parseFromString(`<div id="owc-theme-restore-root">${targetHtml}</div>`, 'text/html');
      const outRoot = outDoc.getElementById('owc-theme-restore-root');
      if (!outRoot) return targetHtml;
      placeholders.forEach(({ token, markup }) => {
        const marker = outRoot.querySelector(`[data-owc-protected-block="${token}"]`);
        if (!marker) return;
        const fragDoc = new DOMParser().parseFromString(markup, 'text/html');
        const restoredEl = fragDoc.body.firstElementChild;
        if (restoredEl) {
          marker.replaceWith(outDoc.importNode(restoredEl, true));
        }
      });
      return Array.from(outRoot.childNodes)
        .map((child) => (child.nodeType === 1 ? /** @type {Element} */ (child).outerHTML : (child.textContent || '')))
        .join('');
    },
  };
}

/**
 * 将自定义主题 CSS 编译并内联应用到 HTML（含 ::before/::after/counter() 预渲染；fail-open）
 * @param {string} html
 * @param {import('./theme-token-validator.js').CustomThemeToken | Record<string, any> | null | undefined} token
 * @returns {string}
 */
export function applyCustomThemeCssToHtml(html, token) {
  if (!html) return html;
  const compiled = compileCustomThemeCss(token);
  if (!compiled || !compiled.usable) return html;
  const protectedSubtrees = protectBuiltinComponentSubtrees(html);
  const result = applyCompiledCustomCss(protectedSubtrees.html, compiled);
  return result.html ? protectedSubtrees.restore(result.html) : html;
}

/**
 * 计算切换主题时同步更新 AppleTheme 实例所需的完整选项（含 themeColor / customColor / customThemeConfig）
 * @param {{ themeColor?: unknown, customColor?: unknown, customThemes?: unknown } | null | undefined} settings
 * @param {string} themeId
 * @returns {Record<string, any>}
 */
export function resolveThemeUpdateOptions(settings, themeId) {
  const customToken = findCustomTheme(settings?.customThemes, themeId);
  const customConfig = customToken ? compileCustomThemeToAppleConfig(customToken) : null;
  return {
    theme: themeId,
    themeColor: customToken ? 'custom' : (typeof settings?.themeColor === 'string' ? settings.themeColor : 'blue'),
    customColor: customToken
      ? (customToken.colors?.accent || '#2563EB')
      : (typeof settings?.customColor === 'string' ? settings.customColor : null),
    customThemeConfig: customConfig,
    lineHeight: null,
    paragraphGap: null,
    letterSpacing: null,
  };
}

/**
 * 若当前 settings 选中的是带 CSS 的自定义主题，则先应用该主题 CSS；否则原样返回 HTML
 * @param {string} html
 * @param {{ theme?: unknown, customThemes?: unknown } | null | undefined} settings
 * @returns {string}
 */
export function applyActiveCustomThemeCss(html, settings) {
  if (!html || !settings) return html;
  const activeCustomTheme = findCustomTheme(settings.customThemes, String(settings.theme || ''));
  if (!activeCustomTheme || !getCustomThemeCss(activeCustomTheme)) return html;
  return applyCustomThemeCssToHtml(html, activeCustomTheme);
}

/**
 * 将 CustomThemeToken 编译为运行时 AppleThemeConfig 结构
 * @param {import('./theme-token-validator.js').CustomThemeToken} token
 * @returns {Record<string, any>}
 */
export function compileCustomThemeToAppleConfig(token) {
  const colors = token.colors || { accent: '#2563EB' };
  const typography = token.typography || {};
  const themeCss = getCustomThemeCss(token);
  const hasThemeCss = Boolean(themeCss);

  // 映射标题风格（CSS 驱动主题默认保持零边框干扰基线，避免 github 底线与自定义 CSS 冲突）
  let h1Decoration = 'none';
  let h2Decoration = 'none';
  let h3Decoration = hasThemeCss ? 'none' : 'bottom-line-left';
  let h4Decoration = 'none';
  let headingWeight = 700;
  let blockquoteStyle = hasThemeCss ? 'none' : 'soft';

  switch (token.headingStyle) {
    case 'serial-number':
      headingWeight = 800;
      break;
    case 'badge':
      headingWeight = 700;
      break;
    case 'zen':
      headingWeight = 600;
      h3Decoration = 'bottom-line-center';
      blockquoteStyle = 'soft';
      break;
    case 'default':
    default:
      headingWeight = 700;
      break;
  }

  // 1. 自定义 H3 / H4 风格覆盖（注意命名差异：Token 侧只认 'classic'，引擎侧对应装饰值叫 'classic-subhead'，勿把引擎值当 Token 值反向比对）
  const customH3 = token.heading?.h3Style || token.h3Style;
  if (customH3 === 'left-border') {
    h3Decoration = 'left-border';
  } else if (customH3 === 'classic') {
    h3Decoration = 'classic-subhead';
  } else if (customH3 === 'simple') {
    h3Decoration = 'simple';
  } else if (customH3 === 'bottom-line') {
    h3Decoration = 'bottom-line-left';
  } else if (customH3 === 'badge') {
    h3Decoration = 'colorful-section';
  }

  const customH4 = token.heading?.h4Style || token.h4Style;
  if (customH4 === 'left-border') {
    h4Decoration = 'left-border';
  } else if (customH4 === 'light-bg') {
    h4Decoration = 'light-bg';
  } else if (customH4 === 'bottom-line') {
    h4Decoration = 'bottom-line-left';
  } else if (customH4 === 'classic-minor') {
    h4Decoration = 'classic-minor';
  } else if (customH4 === 'simple') {
    h4Decoration = 'simple';
  }

  // 2. 引用块风格覆盖
  const customBlockquote = token.blockquote?.style || token.blockquoteStyle;
  if (customBlockquote === 'center') {
    blockquoteStyle = 'center';
  } else if (customBlockquote === 'paper') {
    blockquoteStyle = 'paper';
  } else if (customBlockquote === 'minimal') {
    blockquoteStyle = 'minimal';
  } else if (customBlockquote === 'soft') {
    blockquoteStyle = 'soft';
  } else if (customBlockquote === 'none') {
    blockquoteStyle = 'none';
  }

  // 3. 加粗强调风格
  const strongStyle = typography.strongStyle || token.strongStyle || 'color';

  return {
    name: token.name || '自定义主题',
    primaryColor: colors.accent,
    lightColor: colors.light || '#F8FAFC',
    titleColor: colors.title || '#1E293B',
    borderColor: colors.border || '#E2E8F0',
    codeBackground: colors.codeBackground || '#F1F5F9',
    sectionBg: colors.canvas || '#ffffff',
    headingStyle: token.headingStyle || token.heading?.style || 'default',
    heading: token.heading,
    fontFamily: typography.fontPreset || 'sans-serif',
    baseFontSize: typography.baseFontSize,
    lineHeight: typography.lineHeight || 1.75,
    paragraphGap: typography.paragraphGap || 16,
    letterSpacing: typography.letterSpacing,
    h1Decoration,
    h2Decoration,
    h3Decoration,
    h4Decoration,
    headingWeight,
    headingLetterSpacing: typography.letterSpacing || 0,
    textColor: colors.text || '#334155',
    headingColor: colors.title || '#1E293B',
    mutedTextColor: colors.muted || '#64748B',
    linkDecoration: 'underline',
    blockquoteBorderWidth: 3,
    blockquoteBorderColor: colors.accent,
    blockquoteBg: colors.light || '#F8FAFC',
    blockquoteStyle,
    blockquoteTextColor: colors.muted || '#64748B',
    strongStyle,
    strongBg: strongStyle === 'highlight',
    tableHeaderBg: colors.light || '#F8FAFC',
    tableBorderColor: colors.border || '#E2E8F0',
    tableCellPadding: 10,
    figurePadding: 8,
    figureBorderColor: colors.border || '#E2E8F0',
    highlightColor: colors.highlight,
    css: themeCss,
    rawCssOverrides: themeCss,
  };
}

/**
 * 将 CustomThemeToken 编译为实例化 AppleTheme 所需的 AppleThemeOptions
 * @param {import('./theme-token-validator.js').CustomThemeToken} token
 * @returns {Record<string, any>}
 */
export function compileCustomThemeToAppleOptions(token) {
  const config = compileCustomThemeToAppleConfig(token);
  const typography = token.typography || {};

  return {
    theme: token.id,
    themeColor: 'custom',
    customColor: token.colors?.accent || '#2563EB',
    fontFamily: typography.fontPreset || 'sans-serif',
    fontSize: typography.baseFontSize,
    lineHeight: typography.lineHeight,
    paragraphGap: typography.paragraphGap,
    letterSpacing: typography.letterSpacing,
    customThemeConfig: config,
  };
}

/**
 * 从自定义主题数组中根据 ID 查找 Token
 * @param {import('./theme-token-validator.js').CustomThemeToken[] | unknown} customThemes
 * @param {string} themeId
 * @returns {import('./theme-token-validator.js').CustomThemeToken | null}
 */
export function findCustomTheme(customThemes, themeId) {
  if (!Array.isArray(customThemes) || !themeId) return null;
  const match = customThemes.find((t) => t && t.id === themeId);
  return match || null;
}

/**
 * 汇总官方内置主题与用户自定义主题
 * @param {import('./theme-token-validator.js').CustomThemeToken[] | unknown} [customThemes]
 * @returns {Array<{ value: string, label: string, isCustom: boolean }>}
 */
export function listAllThemes(customThemes = []) {
  const builtins = BUILTIN_ARTICLE_THEMES.map((t) => ({
    value: t.value,
    label: t.label,
    isCustom: false,
  }));

  if (!Array.isArray(customThemes) || customThemes.length === 0) {
    return builtins;
  }

  const customs = customThemes
    .filter((t) => t && typeof t === 'object' && t.id && t.name)
    .map((t) => ({
      value: t.id,
      label: t.name,
      isCustom: true,
    }));

  return [...builtins, ...customs];
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- reason: close the scoped disable block above */

