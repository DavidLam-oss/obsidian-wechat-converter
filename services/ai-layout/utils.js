/*
## 核心功能

实现 AI layout 服务的 utils 子能力，支撑文章结构到微信安全版式的生成和归一化。

## 输入

接收 Markdown 结构、AI provider 响应、布局选择、色彩/组件配置和缓存状态。

## 输出

输出 `isRecord`、`toSelectionRecord`、`toRecord`、`toAiLayoutBlocks`、`toAiImageRefs`、`applyElementCssStyles`、`getDefaultFetch`、`setAiLayoutTimeout`、`clearAiLayoutTimeout`、`clampNumber`，供 AI layout 入口和转换器面板调用。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现；保持与旧 services/ai-layout.js 兼容。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {AiLayoutSelectionLike} */
function toSelectionRecord(value) {
  return isRecord(value) ? /** @type {AiLayoutSelectionLike} */ (value) : {};
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function toRecord(value) {
  return isRecord(value) ? /** @type {Record<string, unknown>} */ (value) : {};
}

/** @param {unknown} value @returns {AiLayoutBlockLike[]} */
function toAiLayoutBlocks(value) {
  return Array.isArray(value)
    ? value.map((item) => /** @type {AiLayoutBlockLike} */ (toRecord(item)))
    : [];
}

/** @param {unknown} value @returns {AiImageRefLike[]} */
function toAiImageRefs(value) {
  return Array.isArray(value)
    ? value.map((image) => /** @type {AiImageRefLike} */ (toRecord(image)))
    : [];
}

/** @param {unknown} element @param {Record<string, string | number | null | undefined>} styles */
function applyElementCssStyles(element, styles) {
  const target = /** @type {Element & { setCssStyles?: (styles: Record<string, string | number | null | undefined>) => void }} */ (element);
  if (!target || typeof target.setCssStyles !== 'function') return;
  target.setCssStyles(styles);
}

/** @returns {FetchLike | undefined} */
function getDefaultFetch() {
  const activeWindow = typeof window !== 'undefined' ? window : null;
  if (activeWindow && typeof activeWindow.fetch === 'function') {
    /** @type {FetchLike} */
    const fetchFromActiveWindow = (input, init) => activeWindow.fetch(input, init);
    return fetchFromActiveWindow;
  }
  return undefined;
}

/** @param {() => void} callback @param {number} delay @returns {number | null} */
function setAiLayoutTimeout(callback, delay) {
  if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') return null;
  return window.setTimeout(callback, delay);
}

/** @param {number | null | undefined} timer */
function clearAiLayoutTimeout(timer) {
  if (!timer || typeof window === 'undefined' || typeof window.clearTimeout !== 'function') return;
  window.clearTimeout(timer);
}

/** @param {unknown} value @param {number} fallback @param {number} min @param {number} max @returns {number} */
function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/** @param {unknown} value @param {string} fallback @returns {string} */
function coerceString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

export {
  isRecord,
  toSelectionRecord,
  toRecord,
  toAiLayoutBlocks,
  toAiImageRefs,
  applyElementCssStyles,
  getDefaultFetch,
  setAiLayoutTimeout,
  clearAiLayoutTimeout,
  clampNumber,
  coerceString,
};
