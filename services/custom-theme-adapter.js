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
 * 将 CustomThemeToken 编译为运行时 AppleThemeConfig 结构
 * @param {import('./theme-token-validator.js').CustomThemeToken} token
 * @returns {Record<string, any>}
 */
export function compileCustomThemeToAppleConfig(token) {
  const colors = token.colors || { accent: '#2563EB' };
  const typography = token.typography || {};

  // 映射标题风格
  let h1Decoration = 'none';
  let h2Decoration = 'none';
  let h3Decoration = 'bottom-line-left';
  let h4Decoration = 'none';
  let headingWeight = 700;
  let blockquoteStyle = 'soft';

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

  return {
    name: token.name || '自定义主题',
    primaryColor: colors.accent,
    lightColor: colors.light || '#F8FAFC',
    titleColor: colors.title || '#1E293B',
    borderColor: colors.border || '#E2E8F0',
    codeBackground: colors.codeBackground || '#F1F5F9',
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
    tableHeaderBg: colors.light || '#F8FAFC',
    tableBorderColor: colors.border || '#E2E8F0',
    tableCellPadding: 10,
    figurePadding: 8,
    figureBorderColor: colors.border || '#E2E8F0',
    // 预留前向兼容字段（由于微信剥离外部样式表与 style 标签，本字段保持惰性，定制样式统一走 Token/heading 内联）
    rawCssOverrides: token.rawCssOverrides || '',
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

