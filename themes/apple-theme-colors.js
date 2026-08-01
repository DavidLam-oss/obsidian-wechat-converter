/*
## 核心功能

为动态文章主题计算可读的颜色角色，并提供轻量、无 DOM 依赖的颜色对比度工具。

## 输入

接收主题色、自定义色、标题染色开关和可选文章表面色。

## 输出

输出 accent、accentReadable、accentDeep、accentSoft、text、muted、surface 和 border 等角色，供主题样式模块生成内联 CSS。

## 定位

位于 themes/，是 apple-theme.js 的颜色计算子模块；不管理主题状态，也不生成标签样式。

## 依赖

无运行时依赖。

## 维护规则

- 新增颜色角色时，先定义其可读性责任，再由具体主题消费。
- 文章主题色只能表达内容强调；插件操作 UI 的成功、警告和错误色不得从这里派生。
- 需要承载文字的颜色必须通过 contrastRatio 或等价逻辑验证，不能直接复用浅色 customColor。
*/

const DEFAULT_ACCENT = '#0366d6';
const DEFAULT_HEADING = '#3e3e3e';
const DEFAULT_SURFACE = '#ffffff';
const DEFAULT_TEXT = '#2c2c2c';
const DEFAULT_MUTED = '#666666';
const DEFAULT_BORDER = '#dedede';

/**
 * @typedef {{ r: number, g: number, b: number }} RgbColor
 * @typedef {{
 *   accent: string,
 *   accentReadable: string,
 *   accentDeep: string,
 *   accentSoft: string,
 *   accentBorder: string,
 *   text: string,
 *   muted: string,
 *   surface: string,
 *   border: string,
 * }} PictorialColorRoles
 */

/**
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
function normalizeHexColor(value, fallback = DEFAULT_ACCENT) {
  const raw = String(value || '').trim().replace(/^#/, '');
  const expanded = /^[0-9a-f]{3}$/i.test(raw)
    ? raw.split('').map((part) => `${part}${part}`).join('')
    : raw;

  if (!/^[0-9a-f]{6}$/i.test(expanded)) return fallback.toLowerCase();
  return `#${expanded.toLowerCase()}`;
}

/**
 * @param {unknown} value
 * @returns {RgbColor | null}
 */
function hexToRgb(value) {
  const normalized = normalizeHexColor(value, '');
  if (!normalized) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

/**
 * @param {number} channel
 * @returns {number}
 */
function linearizeChannel(channel) {
  const normalized = Math.max(0, Math.min(255, channel)) / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

/**
 * @param {unknown} color
 * @returns {number}
 */
function relativeLuminance(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;
  return 0.2126 * linearizeChannel(rgb.r)
    + 0.7152 * linearizeChannel(rgb.g)
    + 0.0722 * linearizeChannel(rgb.b);
}

/**
 * @param {unknown} foreground
 * @param {unknown} background
 * @returns {number}
 */
function contrastRatio(foreground, background) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

/**
 * @param {RgbColor} start
 * @param {RgbColor} end
 * @param {number} amount
 * @returns {string}
 */
function mixRgbColors(start, end, amount) {
  const ratio = Math.max(0, Math.min(1, amount));
  /** @param {number} from @param {number} to @returns {number} */
  const blend = (from, to) => Math.round(from + (to - from) * ratio);
  /** @param {number} value @returns {string} */
  const toHex = (value) => value.toString(16).padStart(2, '0');
  return `#${toHex(blend(start.r, end.r))}${toHex(blend(start.g, end.g))}${toHex(blend(start.b, end.b))}`;
}

/**
 * @param {unknown} color
 * @param {unknown} background
 * @param {number} [minimum]
 * @returns {string}
 */
function ensureReadableOnSurface(color, background, minimum = 4.5) {
  const normalizedColor = normalizeHexColor(color);
  const normalizedBackground = normalizeHexColor(background, DEFAULT_SURFACE);
  if (contrastRatio(normalizedColor, normalizedBackground) >= minimum) return normalizedColor;

  const source = hexToRgb(normalizedColor);
  const black = hexToRgb('#000000');
  if (!source || !black) return DEFAULT_HEADING;

  for (let step = 1; step <= 100; step += 1) {
    const candidate = mixRgbColors(source, black, step / 100);
    if (contrastRatio(candidate, normalizedBackground) >= minimum) return candidate;
  }

  return DEFAULT_HEADING;
}

/**
 * @param {unknown} color
 * @param {number} alpha
 * @returns {string}
 */
function colorToRgba(color, alpha) {
  const rgb = hexToRgb(color);
  if (!rgb) return 'rgba(3, 102, 214, 0.12)';
  const normalizedAlpha = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${normalizedAlpha.toFixed(3)})`;
}

/**
 * @param {{ accent?: unknown, headingColor?: unknown, coloredHeader?: boolean, surface?: unknown }} [options]
 * @returns {PictorialColorRoles}
 */
function createPictorialColorRoles({
  accent = DEFAULT_ACCENT,
  headingColor = DEFAULT_HEADING,
  coloredHeader = false,
  surface = DEFAULT_SURFACE,
} = {}) {
  const normalizedSurface = normalizeHexColor(surface, DEFAULT_SURFACE);
  const normalizedAccent = normalizeHexColor(accent, DEFAULT_ACCENT);
  const readableAccent = ensureReadableOnSurface(normalizedAccent, normalizedSurface);
  const requestedHeading = normalizeHexColor(headingColor, readableAccent);
  const accentDeep = coloredHeader
    ? ensureReadableOnSurface(requestedHeading, normalizedSurface)
    : DEFAULT_HEADING;

  return {
    accent: normalizedAccent,
    accentReadable: readableAccent,
    accentDeep,
    accentSoft: colorToRgba(normalizedAccent, 0.12),
    accentBorder: colorToRgba(readableAccent, 0.34),
    text: DEFAULT_TEXT,
    muted: DEFAULT_MUTED,
    surface: normalizedSurface,
    border: DEFAULT_BORDER,
  };
}

export {
  normalizeHexColor,
  relativeLuminance,
  contrastRatio,
  ensureReadableOnSurface,
  colorToRgba,
  createPictorialColorRoles,
};
