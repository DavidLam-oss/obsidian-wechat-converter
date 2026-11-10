/*
## 核心功能

将 SVG 节点及内嵌 SVG 图片栅格化，供 Mermaid 导出和公众号发布使用。

## 输入

接收本地资源路径、DOM 节点、图片字节、渲染选项和上传上下文。

## 输出

输出 `isMathJaxSvg`、`getSvgLogicalSize`，用于资源解析、栅格化、缓存或同步前替换。

## 定位

位于 services/，属于资源处理层；调用方只消费归一化结果。

## 依赖

关键依赖：`./dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { getActiveDocument } from './dom-utils.js';

/**
 * @typedef {{ logicalWidth: number, logicalHeight: number, rawStyle: string }} SvgLogicalSize
 * @typedef {{ clonedSvg: SVGElement, logicalWidth: number, logicalHeight: number, rawStyle: string }} PreparedSvgClone
 * @typedef {{ scale?: number, output?: 'blob' | 'dataUrl' }} SvgRasterizeOptions
 * @typedef {{ blob?: Blob, dataUrl?: string, width: number, height: number, style: string }} SvgRasterizeResult
 */

/**
 * @param {Element | null | undefined} svgElement
 * @returns {boolean}
 */
export function isMathJaxSvg(svgElement) {
  if (!svgElement || typeof svgElement.getAttribute !== 'function') return false;
  if (svgElement.getAttribute('role') === 'img') return true;
  if (svgElement.getAttribute('focusable') === 'false') return true;
  if (svgElement.classList?.contains('MathJax')) return true;
  return !!svgElement.closest?.('mjx-container,mjx-math,.MathJax');
}

const SVG_INLINE_STYLE_PROPS = [
  'color',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'background',
  'background-color',
  'font',
  'font-size',
  'font-family',
  'font-weight',
  'line-height',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'word-spacing',
  'white-space',
];

/**
 * @param {Element | null | undefined} el
 * @param {Record<string, string>} [declarations]
 */
function appendInlineStyle(el, declarations = {}) {
  if (!el || typeof el.setAttribute !== 'function') return;
  const current = String(el.getAttribute('style') || '').trim();
  /** @type {string[]} */
  const nextParts = [];
  Object.entries(declarations).forEach(([key, value]) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    nextParts.push(`${key}:${normalized}`);
  });
  if (!nextParts.length) return;
  const joined = current ? `${current}${current.endsWith(';') ? '' : ';'}${nextParts.join(';')};` : `${nextParts.join(';')};`;
  el.setAttribute('style', joined);
}

/**
 * @param {SVGElement | null | undefined} sourceSvg
 * @param {SVGElement | null | undefined} clonedSvg
 */
function inlineSvgComputedStyles(sourceSvg, clonedSvg) {
  if (
    !sourceSvg
    || !clonedSvg
    || typeof window === 'undefined'
    || typeof window.getComputedStyle !== 'function'
  ) {
    return;
  }

  const sourceElements = /** @type {Element[]} */ ([sourceSvg, ...Array.from(sourceSvg.querySelectorAll('*'))]);
  const clonedElements = /** @type {Element[]} */ ([clonedSvg, ...Array.from(clonedSvg.querySelectorAll('*'))]);
  const pairCount = Math.min(sourceElements.length, clonedElements.length);

  for (let index = 0; index < pairCount; index += 1) {
    const sourceEl = sourceElements[index];
    const clonedEl = clonedElements[index];
    if (!sourceEl || !clonedEl) continue;

    const computed = window.getComputedStyle(sourceEl);
    /** @type {Record<string, string>} */
    const styleMap = {};
    SVG_INLINE_STYLE_PROPS.forEach((prop) => {
      const value = computed.getPropertyValue(prop);
      if (!value) return;
      const trimmed = String(value).trim();
      if (!trimmed || trimmed === 'none' || trimmed === 'normal') return;
      styleMap[prop] = trimmed;
    });

    // Many Mermaid nodes rely on computed presentation attributes that would be
    // lost once the SVG is drawn from a detached blob URL.
    if (styleMap.fill && !clonedEl.getAttribute('fill')) clonedEl.setAttribute('fill', styleMap.fill);
    if (styleMap.stroke && !clonedEl.getAttribute('stroke')) clonedEl.setAttribute('stroke', styleMap.stroke);
    if (styleMap['stroke-width'] && !clonedEl.getAttribute('stroke-width')) clonedEl.setAttribute('stroke-width', styleMap['stroke-width']);
    appendInlineStyle(clonedEl, styleMap);
  }
}

/**
 * @param {SVGElement | Element | null | undefined} svgElement
 * @returns {SvgLogicalSize}
 */
export function getSvgLogicalSize(svgElement) {
  const rect = typeof svgElement?.getBoundingClientRect === 'function'
    ? svgElement.getBoundingClientRect()
    : { width: 0, height: 0 };

  let logicalWidth = Number(rect?.width) || 0;
  let logicalHeight = Number(rect?.height) || 0;

  const rawWidth = svgElement?.getAttribute?.('width') || '';
  const rawHeight = svgElement?.getAttribute?.('height') || '';
  const rawStyle = svgElement?.getAttribute?.('style') || '';
  const viewBox = svgElement?.getAttribute?.('viewBox') || '';

  if (logicalWidth === 0 || logicalHeight === 0) {
    if (!logicalWidth && !rawWidth.trim().endsWith('%')) logicalWidth = parseFloat(rawWidth) || 0;
    if (!logicalHeight && !rawHeight.trim().endsWith('%')) logicalHeight = parseFloat(rawHeight) || 0;
  }

  if ((logicalWidth === 0 || logicalHeight === 0) && viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map((value) => parseFloat(value));
    const [, , boxWidth, boxHeight] = parts;
    if (parts.length === 4 && boxWidth > 0 && boxHeight > 0 && Number.isFinite(boxWidth) && Number.isFinite(boxHeight)) {
      if (!logicalWidth) logicalWidth = logicalHeight ? logicalHeight * boxWidth / boxHeight : boxWidth;
      if (!logicalHeight) logicalHeight = logicalWidth * boxHeight / boxWidth;
    }
  }

  if (logicalWidth === 0) logicalWidth = 100;
  if (logicalHeight === 0) logicalHeight = 20;

  return {
    logicalWidth,
    logicalHeight,
    rawStyle,
  };
}

/**
 * @param {SVGElement} svgElement
 * @returns {PreparedSvgClone}
 */
function prepareSvgClone(svgElement) {
  const clonedSvg = /** @type {SVGElement} */ (svgElement.cloneNode(true));
  const { logicalWidth, logicalHeight, rawStyle } = getSvgLogicalSize(svgElement);

  inlineSvgComputedStyles(svgElement, clonedSvg);

  if (isMathJaxSvg(svgElement)) {
    clonedSvg.setAttribute('fill', '#333333');
    if (clonedSvg.style) {
      const mathSvgColor = '#333333';
      clonedSvg.setCssStyles?.({ color: mathSvgColor });
    }

    clonedSvg.querySelectorAll('*').forEach((el) => {
      if (el.getAttribute('fill') === 'currentColor' || !el.getAttribute('fill')) {
        el.setAttribute('fill', '#333333');
      }
      if (el.getAttribute('stroke') === 'currentColor') {
        el.setAttribute('stroke', '#333333');
      }
    });
  }

  return {
    clonedSvg,
    logicalWidth,
    logicalHeight,
    rawStyle,
  };
}

/**
 * @param {SVGElement} svgElement
 * @param {SvgRasterizeOptions} [options]
 * @returns {Promise<SvgRasterizeResult>}
 */
async function rasterizeSvg(svgElement, options = {}) {
  const { scale = 3, output = 'blob' } = options;

  return new Promise((resolve, reject) => {
    try {
      const {
        clonedSvg,
        logicalWidth,
        logicalHeight,
        rawStyle,
      } = prepareSvgClone(svgElement);

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clonedSvg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        try {
          const activeDocument = getActiveDocument();
          if (!activeDocument) {
            URL.revokeObjectURL(url);
            reject(new Error('Document unavailable'));
            return;
          }
          const canvas = activeDocument.createElement('canvas');
          canvas.width = logicalWidth * scale;
          canvas.height = logicalHeight * scale;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Canvas context unavailable'));
            return;
          }

          ctx.scale(scale, scale);
          ctx.drawImage(image, 0, 0, logicalWidth, logicalHeight);
          URL.revokeObjectURL(url);

          if (output === 'dataUrl') {
            resolve({
              dataUrl: canvas.toDataURL('image/png'),
              width: logicalWidth,
              height: logicalHeight,
              style: rawStyle,
            });
            return;
          }

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Canvas toBlob failed'));
              return;
            }
            resolve({
              blob,
              width: logicalWidth,
              height: logicalHeight,
              style: rawStyle,
            });
          }, 'image/png');
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('SVG image load failed'));
      };
      image.src = url;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * @param {SVGElement} svgElement
 * @param {SvgRasterizeOptions} [options]
 * @returns {Promise<SvgRasterizeResult>}
 */
export async function rasterizeSvgToPngBlob(svgElement, options = {}) {
  return rasterizeSvg(svgElement, { ...options, output: 'blob' });
}

/**
 * @param {SVGElement} svgElement
 * @param {SvgRasterizeOptions} [options]
 * @returns {Promise<SvgRasterizeResult>}
 */
export async function rasterizeSvgToPngDataUrl(svgElement, options = {}) {
  return rasterizeSvg(svgElement, { ...options, output: 'dataUrl' });
}

/** @param {HTMLElement} root */
export async function rasterizeEmbeddedSvgImagesForWechat(root) {
  const images = root.querySelectorAll('img[src^="data:image/svg+xml," i],img[src^="data:image/svg+xml;" i]');
  for (const img of images) {
    try {
      const source = new Image();
      source.src = img.getAttribute('src') || '';
      await source.decode();
      const { naturalWidth, naturalHeight } = source;
      if (!naturalWidth || !naturalHeight) throw new Error('SVG image has no dimensions');
      const scale = Math.min(1, 1920 / Math.max(naturalWidth, naturalHeight));
      const canvas = root.ownerDocument.createElement('canvas');
      canvas.width = Math.max(1, Math.round(naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas context unavailable');
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      img.setAttribute('src', canvas.toDataURL('image/png'));
    } catch (error) {
      console.warn('内嵌 SVG 转 PNG 失败，保留原图:', error);
    }
  }
}
