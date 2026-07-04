// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toSelectionRecord(value) {
  return isRecord(value) ? /** @type {AiLayoutSelectionLike} */ (value) : {};
}

function toRecord(value) {
  return isRecord(value) ? /** @type {Record<string, unknown>} */ (value) : {};
}

function toAiLayoutBlocks(value) {
  return Array.isArray(value)
    ? value.map((item) => /** @type {AiLayoutBlockLike} */ (toRecord(item)))
    : [];
}

function toAiImageRefs(value) {
  return Array.isArray(value)
    ? value.map((image) => /** @type {AiImageRefLike} */ (toRecord(image)))
    : [];
}

function applyElementCssStyles(element, styles) {
  const target = /** @type {Element & { setCssStyles?: (styles: Record<string, string | number | null | undefined>) => void }} */ (element);
  if (!target || typeof target.setCssStyles !== 'function') return;
  target.setCssStyles(styles);
}

function getDefaultFetch() {
  const activeWindow = typeof window !== 'undefined' ? window : null;
  if (activeWindow && typeof activeWindow.fetch === 'function') {
    /** @type {FetchLike} */
    const fetchFromActiveWindow = (input, init) => activeWindow.fetch(input, init);
    return fetchFromActiveWindow;
  }
  return undefined;
}

function setAiLayoutTimeout(callback, delay) {
  if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') return null;
  return window.setTimeout(callback, delay);
}

function clearAiLayoutTimeout(timer) {
  if (!timer || typeof window === 'undefined' || typeof window.clearTimeout !== 'function') return;
  window.clearTimeout(timer);
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

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
