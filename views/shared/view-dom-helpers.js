import { getActiveDocument, getActiveWindowValue } from '../../services/dom-utils.js';

function getActiveDocumentCompat() {
  return getActiveDocument();
}

/**
 * @returns {SVGElement}
 */
function createFallbackSvgElement() {
  const activeDocument = getActiveDocumentCompat();
  if (!activeDocument) {
    throw new Error('Active document unavailable for SVG fallback');
  }
  return activeDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
}

/**
 * @returns {AppleThemeApiLike}
 */
function getAppleThemeApi() {
  const api = getActiveWindowValue('AppleTheme');
  return /** @type {AppleThemeApiLike} */ (api);
}

/**
 * @param {Event} event
 * @returns {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null}
 */
function getValueElementFromEvent(event) {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement
  ) {
    return target;
  }
  return null;
}

/**
 * @param {Event} event
 * @param {string} [fallback]
 * @returns {string}
 */
function getEventTargetValue(event, fallback = '') {
  return getValueElementFromEvent(event)?.value ?? fallback;
}

/**
 * @param {unknown} value
 * @returns {HTMLImageElement[]}
 */
function toImageElements(value) {
  if (!value || typeof value !== 'object' || typeof value[Symbol.iterator] !== 'function') return [];
  /** @type {HTMLImageElement[]} */
  const images = [];
  for (const item of value) {
    if (item instanceof HTMLImageElement) images.push(item);
  }
  return images;
}

/**
 * @param {unknown} element
 * @param {string} className
 */
function removeElementClass(element, className) {
  if (element instanceof HTMLElement) element.classList.remove(className);
}

export {
  getActiveDocumentCompat,
  createFallbackSvgElement,
  getAppleThemeApi,
  getValueElementFromEvent,
  getEventTargetValue,
  toImageElements,
  removeElementClass,
};
