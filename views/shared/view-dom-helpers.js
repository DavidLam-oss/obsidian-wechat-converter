/*
## 核心功能

提供视图层共享工具：view dom helpers。

## 输入

接收视图状态、DOM 容器、常量或轻量数据对象。

## 输出

输出 `getActiveDocumentCompat`、`createFallbackSvgElement`、`getAppleThemeApi`、`getValueElementFromEvent`、`getEventTargetValue`、`toImageElements`、`removeElementClass`，供 converter、publish modal 和 settings 复用。

## 定位

位于 views/shared/，只放视图共享小工具，不承载业务服务逻辑。

## 依赖

关键依赖：`../../services/dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/shared 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

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
