/*
## 核心功能

实现渲染管线相关的 rendered mermaid 能力，服务预览、复制和发布一致性。

## 输入

接收 Markdown 源、Obsidian 渲染上下文、DOM 容器、渲染选项和转换器依赖。

## 输出

输出 `buildMermaidCompatSource`、`normalizeRenderedMermaidDiagrams`、`prepareRenderedMermaidDiagramsForWechat`、`hasMermaidMarker`、`looksLikeMermaidSvg`、`isMermaidCodeBlock`，供视图层生成预览或发布 HTML。

## 定位

位于 services/，属于渲染服务层；避免把渲染细节堆回 input.js。

## 依赖

关键依赖：`./svg-rasterizer.js`、`./dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { isMathJaxSvg, rasterizeSvgToPngDataUrl } from './svg-rasterizer.js';
import { findAllElements, getActiveDocument, setElementHtml } from './dom-utils.js';

/**
 * @typedef {{ dataUrl?: string, width?: number, height?: number, style?: string }} MermaidRasterizeResult
 * @typedef {(svg: SVGElement, options?: { scale?: number }) => Promise<MermaidRasterizeResult>} MermaidRasterizerLike
 * @typedef {(value: string) => string} SimpleHashLike
 * @typedef {Map<string, MermaidRasterizeResult>} MermaidImageCacheLike
 * @typedef {{
 *   rasterizeSvg?: MermaidRasterizerLike,
 *   scale?: number,
 *   simpleHash?: SimpleHashLike | null,
 *   mermaidImageCache?: MermaidImageCacheLike | null,
 * }} MermaidRasterizeOptions
 * @typedef {{ svg?: string, bindFunctions?: (element: Element) => void }} MermaidRenderResultLike
 * @typedef {{ render: (id: string, source: string) => Promise<string | MermaidRenderResultLike> | string | MermaidRenderResultLike }} MermaidApiLike
 * @typedef {{ mermaidApi?: MermaidApiLike | null }} MermaidRenderOptions
 * @typedef {Element & { setCssStyles?: (styles: Record<string, string>) => void }} CssStyleElementLike
 */

const MERMAID_COMPAT_THEME = {
  theme: 'base',
  flowchart: {
    htmlLabels: false,
    useMaxWidth: true,
    curve: 'basis',
  },
  themeVariables: {
    background: '#ffffff',
    primaryColor: '#efeaff',
    primaryBorderColor: '#b197fc',
    primaryTextColor: '#2f2f2f',
    secondaryColor: '#efeaff',
    secondaryBorderColor: '#b197fc',
    secondaryTextColor: '#2f2f2f',
    tertiaryColor: '#fff7cc',
    tertiaryBorderColor: '#d6c978',
    tertiaryTextColor: '#2f2f2f',
    clusterBkg: '#fff7cc',
    clusterBorder: '#d6c978',
    lineColor: '#555555',
    defaultLinkColor: '#555555',
    edgeLabelBackground: '#ffffff',
    mainBkg: '#efeaff',
    nodeBorder: '#b197fc',
    textColor: '#2f2f2f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
};

/** @param {string} source */
function hasMermaidInitDirective(source) {
  return /^\s*%%\{init:/m.test(String(source || ''));
}

/** @param {string} source */
export function buildMermaidCompatSource(source) {
  const normalized = String(source || '').trim();
  if (!normalized) return '';
  if (hasMermaidInitDirective(normalized)) return normalized;
  return `%%{init: ${JSON.stringify(MERMAID_COMPAT_THEME)}}%%\n${normalized}`;
}

/** @param {CssStyleElementLike | null | undefined} host */
function normalizeMermaidPreviewHost(host) {
  if (!host || typeof host.setAttribute !== 'function') return;
  host.setCssStyles?.({
    display: 'block',
    width: '100%',
    maxWidth: '100%',
    margin: '16px auto',
    overflow: 'hidden',
    textAlign: 'center',
  });
}

/**
 * @param {CssStyleElementLike | null | undefined} el
 * @param {Record<string, string>} [styles]
 */
function setCssStylesCompat(el, styles = {}) {
  if (!el || !styles) return;
  if (typeof el.setCssStyles === 'function') {
    el.setCssStyles(styles);
    return;
  }
  const declarations = Object.entries(styles)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([property, value]) => `${property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}:${value};`)
    .join('');
  if (declarations) {
    appendInlineStyle(el, declarations);
  }
}

/** @param {SVGElement | CssStyleElementLike | null | undefined} svg */
function normalizeMermaidPreviewSvg(svg) {
  if (!svg || typeof svg.setAttribute !== 'function') return;
  svg.classList?.add?.('owc-mermaid-diagram');
  setCssStylesCompat(svg, {
    display: 'block',
    width: '100%',
    maxWidth: '100%',
    height: 'auto',
    margin: '0 auto',
  });
}

/**
 * @param {Element | null | undefined} el
 * @param {string} declarations
 */
function appendInlineStyle(el, declarations) {
  if (!el || !declarations) return;
  const current = String(el.getAttribute('style') || '').trim();
  const normalized = current ? (current.endsWith(';') ? current : `${current};`) : '';
  el.setAttribute('style', `${normalized}${declarations}`);
}

/**
 * @param {string} selector
 * @param {SVGElement} svg
 * @returns {string | null}
 */
function normalizeMermaidRuleSelector(selector, svg) {
  const raw = String(selector || '').trim();
  if (!raw || raw.startsWith('@')) return null;

  const svgId = String(svg?.getAttribute?.('id') || '').trim();
  let normalized = raw;

  if (svgId) {
    const escapedId = svgId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalized = normalized.replace(new RegExp(`#${escapedId}\\b`, 'g'), '').trim();
  }

  normalized = normalized
    .replace(/^svg\b/i, '')
    .replace(/^:root\b/i, '')
    .replace(/^\s*>\s*/, '')
    .trim();

  if (!normalized) return ':scope';
  return normalized;
}

/**
 * @param {SVGElement | null | undefined} svg
 * @returns {number}
 */
function inlineMermaidSvgStyles(svg) {
  if (!svg) return 0;

  const styleNodes = findAllElements(svg, 'style');
  if (styleNodes.length === 0) return 0;

  let appliedCount = 0;

  for (const styleNode of styleNodes) {
    const cssText = String(styleNode.textContent || '');
    const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
    let match;
    while ((match = ruleRegex.exec(cssText))) {
      const selectorGroup = String(match[1] || '').trim();
      const declarations = String(match[2] || '').trim();
      if (!selectorGroup || !declarations) continue;

      const selectors = /** @type {string[]} */ (
        selectorGroup.split(',').map((selector) => normalizeMermaidRuleSelector(selector, svg)).filter(Boolean)
      );
      for (const selector of selectors) {
        /** @type {Element[]} */
        let targets = [];
        try {
          if (selector === ':scope') {
            targets = [svg];
          } else {
            targets = findAllElements(svg, selector);
          }
        } catch {
          continue;
        }

        for (const target of targets) {
          appendInlineStyle(target, declarations);
          appliedCount += 1;
        }
      }
    }

    styleNode.remove();
  }

  return appliedCount;
}

/**
 * @param {Element | null | undefined} el
 * @param {string} name
 * @param {number} [fallback]
 * @returns {number}
 */
function getForeignObjectNumericAttr(el, name, fallback = 0) {
  const raw = String(el?.getAttribute?.(name) || '').trim();
  if (!raw) return fallback;
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * @param {string} styleText
 * @param {string} property
 */
function parseCssDecl(styleText, property) {
  const match = String(styleText || '').match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'));
  return match ? String(match[1] || '').trim() : '';
}

/** @param {string} text */
function estimateMermaidTextUnits(text) {
  let units = 0;
  for (const ch of String(text || '')) {
    if (/\s/.test(ch)) {
      units += 0.35;
    } else if (String(ch || '').charCodeAt(0) <= 0x7f) {
      units += /[A-Z0-9]/.test(ch) ? 0.72 : 0.58;
    } else {
      units += 1;
    }
  }
  return units;
}

/**
 * @param {string} text
 * @param {number} maxUnits
 * @returns {string[]}
 */
function wrapMermaidLabelText(text, maxUnits) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const limit = Math.max(2, maxUnits || 2);
  /** @type {string[]} */
  const lines = [];
  let current = '';
  let currentUnits = 0;

  const pushLine = () => {
    const value = current.trim();
    if (value) lines.push(value);
    current = '';
    currentUnits = 0;
  };

  for (const ch of normalized) {
    const unit = estimateMermaidTextUnits(ch);
    if (current && currentUnits + unit > limit) {
      pushLine();
    }
    current += ch;
    currentUnits += unit;
  }
  pushLine();

  return lines.filter(Boolean);
}

/**
 * @param {SVGElement | null | undefined} svg
 * @returns {number}
 */
function flattenMermaidForeignObjectLabels(svg) {
  const activeDocument = getActiveDocument();
  if (!svg || !activeDocument) return 0;

  const foreignObjects = findAllElements(svg, 'foreignObject');
  let flattened = 0;

  for (const foreignObject of foreignObjects) {
    const textContent = String(foreignObject.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!textContent) {
      foreignObject.remove();
      continue;
    }

    const x = getForeignObjectNumericAttr(foreignObject, 'x', 0);
    const y = getForeignObjectNumericAttr(foreignObject, 'y', 0);
    const width = getForeignObjectNumericAttr(foreignObject, 'width', 0);
    const height = getForeignObjectNumericAttr(foreignObject, 'height', 0);
    const centerX = x + (width / 2);
    const centerY = y + (height / 2);

    const sampleTextNode = foreignObject.querySelector('p,span,div') || foreignObject;
    const sampleStyle = String(sampleTextNode.getAttribute?.('style') || '');
    const fill = parseCssDecl(sampleStyle, 'color') || parseCssDecl(sampleStyle, 'fill') || '#333333';
    const fontSizeRaw = parseCssDecl(sampleStyle, 'font-size') || '16px';
    const fontWeight = parseCssDecl(sampleStyle, 'font-weight') || '500';
    const fontFamily = parseCssDecl(sampleStyle, 'font-family') || '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    const fontSize = Math.max(10, Math.min(16, parseFloat(fontSizeRaw) || 16));
    const maxUnits = width > 0 ? Math.max(2, Math.floor(width / (fontSize * 0.72))) : 12;
    const lines = wrapMermaidLabelText(textContent, maxUnits);
    const lineHeight = Math.max(fontSize * 1.2, 14);
    const startY = centerY - ((lines.length - 1) * lineHeight) / 2;

    const textEl = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', String(centerX));
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('fill', fill);
    textEl.setAttribute('font-size', `${fontSize}px`);
    textEl.setAttribute('font-weight', fontWeight);
    textEl.setAttribute('font-family', fontFamily);
    const readableTextStyle = 'paint-order:stroke fill;stroke:none !important;';
    textEl.setAttribute('style', readableTextStyle);

    lines.forEach((line, index) => {
      const tspan = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', String(centerX));
      tspan.setAttribute('y', String(startY + (index * lineHeight) + (fontSize * 0.35)));
      tspan.textContent = line;
      textEl.appendChild(tspan);
    });

    foreignObject.replaceWith(textEl);
    flattened += 1;
  }

  return flattened;
}

/**
 * @param {Element | null | undefined} root
 * @returns {number}
 */
export function normalizeRenderedMermaidDiagrams(root) {
  if (!root) return 0;

  let normalizedCount = 0;
  const svgs = /** @type {SVGElement[]} */ (findAllElements(root, 'svg').filter(looksLikeMermaidSvg));
  for (const svg of svgs) {
    inlineMermaidSvgStyles(svg);
    const host = svg.closest?.('.mermaid,[data-obsidian-wechat-mermaid="true"]');
    if (host) {
      normalizeMermaidPreviewHost(host);
    }
    normalizeMermaidPreviewSvg(svg);
    normalizedCount += 1;
  }

  const images = /** @type {HTMLImageElement[]} */ (findAllElements(root, 'img.mermaid-diagram-image'));
  for (const img of images) {
    const host = img.closest?.('.mermaid,[data-obsidian-wechat-mermaid="true"]');
    if (host) {
      normalizeMermaidPreviewHost(host);
    }
    if (!img.getAttribute('style')) {
      const maxWidthStyle = img.getAttribute('width')
        ? `${Math.round(Number(img.getAttribute('width')) || 0)}px`
        : '100%';
      img.setAttribute(
        'style',
        `display:block;width:100%;max-width:${maxWidthStyle};height:auto;margin:0 auto;`
      );
    }
    normalizedCount += 1;
  }

  return normalizedCount;
}

/** @param {SVGElement | null | undefined} svg */
function unwrapMermaidHtmlLabelParagraphs(svg) {
  if (!svg) return 0;
  const labels = findAllElements(svg, '.nodeLabel p, .edgeLabel p');
  let count = 0;
  for (const paragraph of labels) {
    const parent = paragraph.parentElement;
    if (!parent) continue;
    while (paragraph.firstChild) {
      parent.insertBefore(paragraph.firstChild, paragraph);
    }
    paragraph.remove();
    count += 1;
  }
  return count;
}

/** @param {SVGElement | null | undefined} svg */
function convertMermaidForeignObjectContainers(svg) {
  const activeDocument = getActiveDocument();
  if (!svg || !activeDocument) return 0;
  const labelNodes = findAllElements(svg, '.nodeLabel, .edgeLabel');
  let count = 0;

  for (const label of labelNodes) {
    const parent = label.parentElement;
    const grand = parent?.parentElement;
    if (!parent || !grand) continue;
    if (grand.getAttribute('data-owc-mermaid-label-host') === 'true') continue;
    if (grand.tagName.toLowerCase() !== 'foreignobject') continue;

    const section = activeDocument.createElement('section');
    const xmlns = parent.getAttribute('xmlns');
    const style = parent.getAttribute('style');
    if (xmlns) section.setAttribute('xmlns', xmlns);
    if (style) section.setAttribute('style', style);
    while (parent.firstChild) {
      section.appendChild(parent.firstChild);
    }

    grand.setAttribute('data-owc-mermaid-label-host', 'true');
    grand.replaceChildren(section);
    count += 1;
  }

  return count;
}

/** @param {SVGElement | null | undefined} svg */
function enforceMermaidTextReadability(svg) {
  if (!svg) return 0;
  let count = 0;
  findAllElements(svg, 'tspan, text, .nodeLabel, .edgeLabel, foreignObject section, foreignObject span, foreignObject div')
    .forEach((node) => {
      appendInlineStyle(
        node,
        'fill:#333333 !important;color:#333333 !important;stroke:none !important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;'
      );
      count += 1;
    });
  return count;
}

/**
 * @param {Element | null | undefined} root
 * @returns {number}
 */
export function prepareRenderedMermaidDiagramsForWechat(root) {
  if (!root) return 0;

  normalizeRenderedMermaidDiagrams(root);

  let processed = 0;
  const svgs = /** @type {SVGElement[]} */ (findAllElements(root, 'svg').filter(looksLikeMermaidSvg));
  for (const svg of svgs) {
    unwrapMermaidHtmlLabelParagraphs(svg);
    convertMermaidForeignObjectContainers(svg);
    flattenMermaidForeignObjectLabels(svg);
    enforceMermaidTextReadability(svg);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    appendInlineStyle(svg, 'overflow:visible;max-width:100%;height:auto;');
    processed += 1;
  }

  return processed;
}

/**
 * @param {number | undefined} width
 * @param {number | undefined} height
 */
function buildMermaidImageStyle(width, height) {
  const numericWidth = Number(width) || 0;
  const numericHeight = Number(height) || 0;
  const isPortrait = numericWidth > 0 && numericHeight > (numericWidth * 1.08);
  const widthPercent = isPortrait ? '78%' : '100%';
  const maxWidthStyle = numericWidth > 0 ? `${Math.round(numericWidth)}px` : '100%';
  return `display:block;width:${widthPercent};max-width:${maxWidthStyle};height:auto;margin:0 auto;`;
}

/**
 * @param {SVGElement} svg
 * @param {number} scale
 * @param {SimpleHashLike | null | undefined} simpleHash
 */
function getSerializedMermaidCacheKey(svg, scale, simpleHash) {
  const serializer = typeof XMLSerializer !== 'undefined' ? new XMLSerializer() : null;
  const svgMarkup = serializer ? serializer.serializeToString(svg) : (svg?.outerHTML || '');
  const payload = `${svgMarkup}::scale:${scale}`;
  return typeof simpleHash === 'function' ? simpleHash(payload) : payload;
}

/**
 * @param {Element | null | undefined} root
 * @param {MermaidRasterizeOptions} [options]
 * @returns {Promise<number>}
 */
export async function convertRenderedMermaidDiagramsToImages(root, options = {}) {
  if (!root) return 0;

  const {
    rasterizeSvg = rasterizeSvgToPngDataUrl,
    scale = 3,
    simpleHash = null,
    mermaidImageCache = null,
  } = options;

  normalizeRenderedMermaidDiagrams(root);

  const svgs = /** @type {SVGElement[]} */ (findAllElements(root, 'svg').filter(looksLikeMermaidSvg));
  let convertedCount = 0;

  for (const svg of svgs) {
    try {
      const cacheKey = getSerializedMermaidCacheKey(svg, scale, simpleHash);
      /** @type {MermaidRasterizeResult | null} */
      let result = mermaidImageCache?.get(cacheKey) || null;

      if (!result) {
        try {
          result = await rasterizeSvg(svg, { scale });
        } catch (firstError) {
          if (!svg.querySelector('foreignObject')) {
            throw firstError;
          }
          flattenMermaidForeignObjectLabels(svg);
          result = await rasterizeSvg(svg, { scale });
        }
        if (mermaidImageCache && result?.dataUrl) {
          mermaidImageCache.set(cacheKey, result);
        }
      }

      if (!result?.dataUrl) continue;

      const activeDocument = getActiveDocument();
      if (!activeDocument) continue;
      const img = activeDocument.createElement('img');
      img.setAttribute('src', result.dataUrl);
      img.setAttribute('alt', 'Mermaid diagram');
      img.setAttribute('class', 'mermaid-diagram-image');
      if (result.width) img.setAttribute('width', String(Math.round(result.width)));
      if (result.height) img.setAttribute('height', String(Math.round(result.height)));
      img.setAttribute('style', buildMermaidImageStyle(result.width, result.height));

      const host = svg.closest?.('.mermaid,[data-obsidian-wechat-mermaid="true"]');
      if (host && host !== root) {
        normalizeMermaidPreviewHost(host);
        host.replaceChildren(img);
      } else {
        svg.replaceWith(img);
      }
      convertedCount += 1;
    } catch (error) {
      console.error('Mermaid 图表导出为图片失败，保留原始 SVG:', error);
    }
  }

  return convertedCount;
}

/**
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function hasMermaidMarker(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  const values = [
    el.getAttribute('class'),
    el.getAttribute('id'),
    el.getAttribute('data-type'),
    el.getAttribute('aria-label'),
    el.getAttribute('aria-roledescription'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return values.includes('mermaid');
}

/**
 * @param {Element | null | undefined} svg
 * @returns {svg is SVGElement}
 */
export function looksLikeMermaidSvg(svg) {
  if (!svg || svg.tagName?.toLowerCase?.() !== 'svg') return false;
  if (isMathJaxSvg(svg)) return false;
  if (svg.closest('.callout-icon')) return false;
  if (hasMermaidMarker(svg)) return true;

  let cursor = svg.parentElement;
  let depth = 0;
  while (cursor && depth < 5) {
    if (hasMermaidMarker(cursor)) return true;
    cursor = cursor.parentElement;
    depth += 1;
  }

  return !!svg.querySelector(
    'g.node,g.edgePath,g.cluster,g.edgeLabel,g.messageText,g.actor,.node,.edgePath,.cluster,.edgeLabel'
  );
}

/** @param {Element | null | undefined} codeEl */
export function isMermaidCodeBlock(codeEl) {
  if (!codeEl || codeEl.tagName?.toLowerCase?.() !== 'code') return false;
  const className = String(codeEl.getAttribute('class') || '').toLowerCase();
  if (className.split(/\s+/).includes('language-mermaid')) return true;
  if (className.includes('language-mermaid')) return true;
  return !!codeEl.closest('.block-language-mermaid');
}

/**
 * @param {MermaidRenderOptions} [options]
 * @returns {MermaidApiLike | null}
 */
function resolveMermaidApi(options = {}) {
  if (options.mermaidApi && typeof options.mermaidApi.render === 'function') {
    return options.mermaidApi;
  }
  const globalApi = typeof window !== 'undefined'
    ? /** @type {{ mermaid?: MermaidApiLike } & Window} */ (window).mermaid
    : null;
  if (globalApi && typeof globalApi.render === 'function') {
    return globalApi;
  }
  return null;
}

let mermaidRenderNonce = 0;

/**
 * @param {Element | null | undefined} root
 * @param {MermaidRenderOptions} [options]
 * @returns {Promise<number>}
 */
export async function renderMermaidCodeBlocks(root, options = {}) {
  if (!root) return 0;

  const mermaidApi = resolveMermaidApi(options);
  if (!mermaidApi) return 0;

  const codeBlocks = /** @type {HTMLElement[]} */ (findAllElements(root, 'pre > code').filter(isMermaidCodeBlock));
  let renderedCount = 0;

  for (const codeEl of codeBlocks) {
    const source = String(codeEl.textContent || '').trim();
    if (!source) continue;

    try {
      mermaidRenderNonce += 1;
      const renderSource = buildMermaidCompatSource(source);
      const renderResult = await mermaidApi.render(`obsidian-wechat-mermaid-${mermaidRenderNonce}`, renderSource);
      const renderObject = typeof renderResult === 'string'
        ? null
        : /** @type {MermaidRenderResultLike} */ (renderResult);
      const svg = typeof renderResult === 'string' ? renderResult : renderObject?.svg || '';
      if (!svg) continue;

      const activeDocument = getActiveDocument();
      if (!activeDocument) continue;
      const host = activeDocument.createElement('div');
      host.setAttribute('class', 'mermaid');
      host.setAttribute('data-obsidian-wechat-mermaid', 'true');
      setElementHtml(host, svg);
      normalizeRenderedMermaidDiagrams(host);

      if (typeof renderObject?.bindFunctions === 'function') {
        renderObject.bindFunctions(host);
      }

      const pre = codeEl.closest('pre');
      (pre || codeEl).replaceWith(host);
      renderedCount += 1;
    } catch (error) {
      console.error('Mermaid 代码块渲染失败，保留原始代码块:', error);
    }
  }

  return renderedCount;
}

/**
 * @param {Element | null | undefined} root
 * @param {MermaidRasterizeOptions} [options]
 * @returns {Promise<void>}
 */
export async function rasterizeRenderedMermaidDiagrams(root, options = {}) {
  if (!root) return;

  const {
    rasterizeSvg = rasterizeSvgToPngDataUrl,
    scale = 3,
  } = options;

  // Export/copy often works on detached DOM trees, where computed styles are
  // incomplete. Inline Mermaid's own <style> rules first so rasterization stays
  // faithful even outside the live preview container.
  normalizeRenderedMermaidDiagrams(root);

  const svgs = /** @type {SVGElement[]} */ (findAllElements(root, 'svg').filter(looksLikeMermaidSvg));
  for (const svg of svgs) {
    try {
      let result;
      try {
        result = await rasterizeSvg(svg, { scale });
      } catch (firstError) {
        if (!svg.querySelector('foreignObject')) {
          throw firstError;
        }
        flattenMermaidForeignObjectLabels(svg);
        result = await rasterizeSvg(svg, { scale });
      }
      const activeDocument = getActiveDocument();
      if (!activeDocument) continue;
      const img = activeDocument.createElement('img');
      img.setAttribute('src', result.dataUrl);
      img.setAttribute('alt', 'Mermaid diagram');
      img.setAttribute('class', 'mermaid-diagram-image');
      if (result.width) img.setAttribute('width', String(Math.round(result.width)));
      if (result.height) img.setAttribute('height', String(Math.round(result.height)));
      const maxWidthStyle = result.width ? `${Math.round(result.width)}px` : '100%';
      img.setAttribute(
        'style',
        `display:block;width:100%;max-width:${maxWidthStyle};height:auto;margin:0 auto;`
      );

      const host = svg.closest?.('.mermaid,[data-obsidian-wechat-mermaid="true"]');
      if (host && host !== root) {
        normalizeMermaidPreviewHost(host);
        host.replaceChildren(img);
      } else {
        svg.replaceWith(img);
      }
    } catch (error) {
      console.error('Mermaid 图表栅格化失败，保留原始 SVG:', error);
    }
  }
}
