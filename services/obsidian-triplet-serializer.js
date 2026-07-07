/*
## 核心功能

实现渲染管线相关的 obsidian triplet serializer 能力，服务预览、复制和发布一致性。

## 输入

接收 Markdown 源、Obsidian 渲染上下文、DOM 容器、渲染选项和转换器依赖。

## 输出

输出 `serializeObsidianRenderedHtml`、`deriveImageCaption`、`safeDecodeCaption`，供视图层生成预览或发布 HTML。

## 定位

位于 services/，属于渲染服务层；避免把渲染细节堆回 input.js。

## 依赖

关键依赖：`./dom-utils.js`、`./obsidian-triplet-serializer-utils.js`、`./obsidian-triplet-serializer-images.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { createHtmlContainer, getActiveDocument, htmlToText, setElementHtml } from './dom-utils.js';
import { getTagStyle, setInlineStyleIfMissing } from './obsidian-triplet-serializer-utils.js';
import {
  convertImageSwipeBlocks,
  convertObsidianImageSwipeCallouts,
  convertStandaloneImages,
  deriveImageCaption,
  materializeImageEmbedPlaceholders,
  promoteImageEmbedAltHints,
  safeDecodeCaption,
} from './obsidian-triplet-serializer-images.js';

/**
 * @typedef {{
 *   type: string,
 *   title: string,
 *   icon: string,
 *   label: string,
 * }} LegacyCalloutInfo
 *
 * @typedef {{
 *   index?: number,
 *   lastIndex?: number,
 *   url?: string,
 *   text?: string,
 * }} LinkifyMatchLike
 *
 * @typedef {{
 *   typographer?: boolean,
 * }} MarkdownOptionsLike
 *
 * @typedef {{
 *   render?: (markdown: string) => string,
 *   renderInline?: (markdown: string) => string,
 *   options?: MarkdownOptionsLike,
 *   linkify?: {
 *     match?: (text: string) => LinkifyMatchLike[] | null,
 *   },
 * }} MarkdownItLike
 *
 * @typedef {{
 *   getThemeColorValue?: () => string,
 * }} ThemeLike
 *
 * @typedef {{
 *   renderCalloutOpen?: (callout: LegacyCalloutInfo) => string,
 *   getInlineStyle?: (tagName: string) => string,
 *   createCodeBlock?: (content: string, language: string) => string,
 *   validateLink?: (href: string, isImage?: boolean) => string,
 *   resolveImagePath?: (src: string) => string,
 *   fixListParagraphs?: (html: string) => string,
 *   unwrapFigures?: (html: string) => string,
 *   removeBlockquoteParagraphMargins?: (html: string) => string,
 *   fixMathJaxTags?: (html: string) => string,
 *   sanitizeHtml?: (html: string) => string,
 *   showImageCaption?: boolean,
 *   avatarUrl?: string,
 *   theme?: ThemeLike,
 *   md?: MarkdownItLike,
 * }} ConverterLike
 *
 * @typedef {{
 *   placeholder?: string,
 *   rendered?: string,
 * }} PreRenderedMathLike
 *
 * @typedef {{
 *   token: string,
 *   styleMarkup: string,
 * }} SvgStylePlaceholder
 */

/** @type {Record<string, string>} */
const LEGACY_CALLOUT_ICON_BY_TYPE = {
  note: 'ℹ️',
  info: 'ℹ️',
  todo: '☑️',
  abstract: '📄',
  summary: '📄',
  tldr: '📄',
  tip: '💡',
  hint: '💡',
  important: '💡',
  success: '✅',
  check: '✅',
  done: '✅',
  question: '❓',
  help: '❓',
  faq: '❓',
  warning: '⚠️',
  caution: '⚠️',
  attention: '⚠️',
  failure: '❌',
  fail: '❌',
  missing: '❌',
  danger: '🚨',
  error: '❌',
  bug: '🐛',
  quote: '💬',
  cite: '📝',
  example: '📋',
};

function toTitleCase(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function resolveLegacyCalloutIcon(type) {
  const key = String(type || '').trim().toLowerCase();
  if (!key) return 'ℹ️';
  return LEGACY_CALLOUT_ICON_BY_TYPE[key] || 'ℹ️';
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function convertObsidianCalloutsToLegacy(container, converter) {
  if (!container || !converter) return;
  if (typeof converter.renderCalloutOpen !== 'function') return;

  const callouts = Array.from(
    container.querySelectorAll('div.callout,aside.callout,blockquote.callout,section.callout')
  );
  if (callouts.length === 0) return;

  // Convert deepest nodes first so nested callouts stay stable.
  /** @param {Element} node */
  const getCalloutDepth = (node) => {
    let depth = 0;
    let cursor = node?.parentElement || null;
    while (cursor) {
      if (
        cursor.matches &&
        cursor.matches('div.callout,aside.callout,blockquote.callout,section.callout')
      ) {
        depth += 1;
      }
      cursor = cursor.parentElement;
    }
    return depth;
  };
  callouts.sort((a, b) => {
    const da = getCalloutDepth(a);
    const db = getCalloutDepth(b);
    return db - da;
  });

  for (const callout of callouts) {
    if (!callout || !callout.parentNode) continue;

    const typeRaw =
      callout.getAttribute('data-callout') ||
      callout.getAttribute('data-callout-type') ||
      '';
    const type = String(typeRaw || '').trim().toLowerCase();

    const titleEl =
      callout.querySelector(':scope > .callout-title .callout-title-inner') ||
      callout.querySelector(':scope > .callout-title-inner') ||
      callout.querySelector(':scope > .callout-title');
    const titleText = String(titleEl?.textContent || '').trim();
    const title = titleText || toTitleCase(type) || 'Callout';

    const contentEl =
      callout.querySelector(':scope > .callout-content') ||
      callout.querySelector(':scope > .callout-body');
    const contentHtml = contentEl ? contentEl.innerHTML : callout.innerHTML;

    const calloutInfo = {
      type: type || title.toLowerCase(),
      title,
      icon: resolveLegacyCalloutIcon(type || title),
      label: type || title,
    };

    let openHtml = '';
    try {
      openHtml = converter.renderCalloutOpen(calloutInfo);
    } catch {
      continue;
    }
    if (!openHtml) continue;

    const host = createHtmlContainer('div', `${openHtml}${contentHtml}</section></section>`);

    const replacementNodes = Array.from(host.childNodes);
    if (replacementNodes.length === 0) continue;
    callout.replaceWith(...replacementNodes);
  }
}

/**
 * @param {Element} el
 * @param {string} tagName
 * @param {boolean} [finalStage]
 */
function sanitizeClassList(el, tagName, finalStage = false) {
  const className = el.getAttribute('class');
  if (!className) return;
  const classes = className.split(/\s+/).filter(Boolean);
  let keep = [];

  if (tagName === 'section') {
    keep = classes.filter((cls) => cls === 'code-snippet__fix');
  } else if (tagName === 'img') {
    keep = classes.filter((cls) => cls === 'math-formula-image' || cls === 'mermaid-diagram-image');
  } else if (tagName === 'svg') {
    keep = classes.filter((cls) => cls === 'owc-mermaid-diagram');
  } else if (!finalStage && (tagName === 'pre' || tagName === 'code')) {
    keep = classes.filter((cls) => cls.startsWith('language-'));
  }

  if (keep.length > 0) {
    el.setAttribute('class', keep.join(' '));
  } else {
    el.removeAttribute('class');
  }
}

/**
 * @param {Element | null | undefined} container
 * @param {{ finalStage?: boolean }} [options]
 */
function pruneObsidianOnlyAttributes(container, { finalStage = false } = {}) {
  if (!container) return;

  const SVG_ALLOWED_ATTRS = new Set([
    'style', 'class', 'xmlns', 'viewbox', 'width', 'height', 'x', 'y', 'dx', 'dy',
    'cx', 'cy', 'rx', 'ry', 'r', 'x1', 'y1', 'x2', 'y2', 'd', 'points',
    'transform', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity',
    'fill-opacity', 'stroke-opacity', 'font-size', 'font-family',
    'font-weight', 'text-anchor', 'alignment-baseline', 'dominant-baseline',
    'preserveaspectratio',
    'marker-start', 'marker-mid', 'marker-end', 'markerwidth', 'markerheight',
    'refx', 'refy', 'orient', 'pathlength', 'role', 'focusable', 'aria-hidden',
    'xmlns:xlink', 'xlink:href',
  ]);
  const SVG_TAGS = new Set([
    'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
    'polygon', 'text', 'tspan', 'defs', 'marker', 'foreignobject', 'clippath',
    'pattern', 'mask', 'symbol', 'use',
  ]);

  /** @param {string} tagName */
  const getAllowedAttrs = (tagName) => {
    if (tagName === 'a') return new Set(['href', 'style']);
    if (tagName === 'img') return new Set(['src', 'alt', 'style', 'width', 'height', 'class', 'referrerpolicy']);
    if (tagName === 'section' && !finalStage) {
      return new Set(['style', 'class', 'data-owc-image-swipe', 'data-owc-image-swipe-type', 'data-owc-image-swipe-warning', 'data-owc-image-swipe-hint']);
    }
    if (tagName === 'section') return new Set(['style', 'class']);
    if (!finalStage && (tagName === 'pre' || tagName === 'code')) return new Set(['style', 'class']);
    if (SVG_TAGS.has(tagName)) return SVG_ALLOWED_ATTRS;
    return new Set(['style']);
  };

  Array.from(container.querySelectorAll('*')).forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    const allowed = getAllowedAttrs(tagName);
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      if ((name.startsWith('data-') && !allowed.has(name)) || name === 'id' || name === 'dir') {
        el.removeAttribute(attr.name);
        continue;
      }
      if (!allowed.has(name)) {
        el.removeAttribute(attr.name);
      }
    }

    sanitizeClassList(el, tagName, finalStage);

    const style = el.getAttribute('style');
    if (style !== null && style.trim() === '') {
      el.removeAttribute('style');
    }
  });
}

/**
 * @param {Element | null | undefined} container
 */
function normalizeLegacyTagAliases(container) {
  if (!container) return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;
  const strikeTags = Array.from(container.querySelectorAll('s'));
  for (const sEl of strikeTags) {
    const del = activeDocument.createElement('del');
    if (sEl.hasAttributes()) {
      Array.from(sEl.attributes).forEach((attr) => {
        del.setAttribute(attr.name, attr.value);
      });
    }
    while (sEl.firstChild) {
      del.appendChild(sEl.firstChild);
    }
    sEl.replaceWith(del);
  }
}

/**
 * @param {Element | null | undefined} container
 */
function normalizeLegacyDeleteNesting(container) {
  if (!container) return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;

  const dels = Array.from(container.querySelectorAll('del'));
  for (const first of dels) {
    if (!first || !first.parentElement) continue;
    if (first.parentElement.tagName.toLowerCase() === 'del') continue;
    if (first.querySelector('del')) continue;

    let spacer = first.nextSibling;
    let second = null;

    if (spacer && spacer.nodeType === Node.TEXT_NODE && /^\s*$/.test(spacer.textContent || '')) {
      second = spacer.nextSibling;
    } else if (spacer instanceof Element && spacer.tagName.toLowerCase() === 'del') {
      second = spacer;
      spacer = null;
    } else {
      continue;
    }

    if (!(second instanceof Element) || second.tagName.toLowerCase() !== 'del') continue;

    const label = (first.textContent || '').trim();
    if (!/[：:]$/.test(label)) continue;
    if (!/\S/.test(second.textContent || '')) continue;

    if (!/\s$/.test(first.textContent || '')) {
      first.appendChild(activeDocument.createTextNode(' '));
    }
    first.appendChild(second);
    if (spacer && spacer.parentNode) spacer.remove();
  }
}

/**
 * @param {string} html
 * @returns {string}
 */
function normalizeLegacyDeleteNestingInHtml(html) {
  if (typeof html !== 'string' || html.length === 0) return html;
  return html.replace(
    /<del([^>]*)>([^<]*[：:])<\/del>(?:\s|&nbsp;|<br\s*\/?>)*<del([^>]*)>/g,
    (_match, attrs1, label, attrs2) => `<del${attrs1}>${label} <del${attrs2}>`
  );
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function sanitizeAnchorAndImageLinks(container, converter) {
  if (!container) return;

  const hasExplicitProtocol = (value) => /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(String(value || ''));
  const hasNonAscii = (value) => {
    for (const ch of String(value || '')) {
      if (String(ch || '').charCodeAt(0) > 0x7f) return true;
    }
    return false;
  };

  const canonicalizeRelativeHrefForLegacyParity = (href) => {
    const value = String(href || '').trim();
    if (!value) return value;
    if (value.startsWith('#') || value.startsWith('//')) return value;
    if (hasExplicitProtocol(value)) {
      // Keep most absolute links unchanged; only normalize non-ASCII http(s) URLs
      // for parity with legacy punycode output.
      if (/^https?:/i.test(value) && hasNonAscii(value)) {
        try {
          const parsed = new URL(value);
          const isBareHost = /^https?:\/\/[^/?#]+$/i.test(value);
          if (isBareHost && parsed.pathname === '/' && !parsed.search && !parsed.hash) {
            return `${parsed.protocol}//${parsed.host}`;
          }
          return parsed.href;
        } catch {
          return value;
        }
      }
      return value;
    }

    let decoded = value;
    try {
      decoded = decodeURI(value);
    } catch {
      // keep original value if decode fails (e.g. malformed percent encoding)
    }
    return encodeURI(decoded);
  };

  container.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const safeHref =
      converter && typeof converter.validateLink === 'function'
        ? converter.validateLink(href, false)
        : href;
    a.setAttribute('href', canonicalizeRelativeHrefForLegacyParity(safeHref));
  });
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function convertPreBlocks(container, converter) {
  if (!container || !converter || typeof converter.createCodeBlock !== 'function') return;

  const preBlocks = Array.from(container.querySelectorAll('pre'));
  for (const pre of preBlocks) {
    if (pre.closest('.code-snippet__fix')) continue;
    const codeEl = pre.querySelector('code');
    const className = `${pre.className || ''} ${codeEl?.className || ''}`;
    const langMatch = className.match(/language-([\w-]+)/);
    const lang = langMatch ? langMatch[1] : 'text';
    const content = codeEl ? codeEl.textContent || '' : pre.textContent || '';

    const wrapper = createHtmlContainer('div', converter.createCodeBlock(content, lang));
    const replacement = wrapper.firstElementChild;
    if (replacement) {
      pre.replaceWith(replacement);
    }
  }
}

/**
 * @param {Element | null | undefined} container
 */
function trimTrailingWhitespaceInBlockText(container) {
  if (!container) return;
  const selector = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,figcaption,td,th';
  const blocks = Array.from(container.querySelectorAll(selector));

  for (const block of blocks) {
    let node = block.lastChild;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const original = String(node.textContent || '');
        const trimmed = original.replace(/[ \t\u00a0]+$/g, '');
        if (trimmed !== original) {
          if (trimmed) {
            node.textContent = trimmed;
            break;
          }
          const prev = node.previousSibling;
          node.remove();
          node = prev;
          continue;
        }
      }
      break;
    }
  }
}

/**
 * @param {Element | null | undefined} container
 */
function trimLeadingWhitespaceInBlockText(container) {
  if (!container) return;
  const selector = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,figcaption,td,th';
  const blocks = Array.from(container.querySelectorAll(selector));

  for (const block of blocks) {
    let node = block.firstChild;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const original = String(node.textContent || '');
        const trimmed = original.replace(/^[ \t\u00a0]+/g, '');
        if (trimmed !== original) {
          if (trimmed) {
            node.textContent = trimmed;
            break;
          }
          const next = node.nextSibling;
          node.remove();
          node = next;
          continue;
        }
      }
      break;
    }
  }
}

/**
 * @param {Element | null | undefined} container
 */
function pruneEmptyHeadings(container) {
  if (!container) return;
  const headings = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6'));

  for (const heading of headings) {
    const text = String(heading.textContent || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00a0/g, ' ')
      .trim();
    if (text) continue;

    const html = String(heading.innerHTML || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    if (!html) {
      heading.remove();
      continue;
    }

    const normalized = html
      .replace(/<br\s*\/?>/gi, '')
      .replace(/&nbsp;/gi, '')
      .replace(/\s+/g, '');
    if (!normalized) {
      heading.remove();
    }
  }
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function applyThemeInlineStyles(container, converter) {
  if (!container || !converter) return;

  const styledTags = [
    'p', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'figure', 'figcaption',
    'img', 'a', 'table', 'thead', 'th', 'td', 'hr', 'strong', 'em', 'del',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  ];

  for (const tag of styledTags) {
    const styleText = getTagStyle(converter, tag);
    if (!styleText) continue;
    container.querySelectorAll(tag).forEach((el) => {
      if (el.closest?.('svg')) {
        return;
      }
      if (tag === 'img' && el.getAttribute('data-owc-skip-style') === '1') {
        return;
      }
      setInlineStyleIfMissing(el, styleText);
    });
  }

  const liPStyle = getTagStyle(converter, 'li p');
  if (liPStyle) {
    container.querySelectorAll('li > p').forEach((p) => {
      if (!p.closest?.('svg')) {
        setInlineStyleIfMissing(p, liPStyle);
      }
    });
  }
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function formatTaskListItems(container, converter) {
  if (!container || !converter) return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;

  const themeColor = converter.theme.getThemeColorValue() || '#576b95';
  const liTaskStyle = getTagStyle(converter, 'li-task') || 'list-style-type: none; margin-left: -20px;';

  container.querySelectorAll('li').forEach((li) => {
    let target = li;
    let firstChild = li.firstChild;

    if (firstChild && firstChild.nodeType === 1 && firstChild.tagName === 'P') {
      target = firstChild;
      firstChild = firstChild.firstChild;
    }

    if (firstChild && firstChild.nodeType === 3) {
      const text = firstChild.textContent || '';
      const trimmed = text.trimStart();
      if (trimmed.startsWith('☑') || trimmed.startsWith('□') || trimmed.startsWith('☐')) {
        const markerChar = trimmed[0];
        const isChecked = markerChar === '☑';
        
        li.setAttribute('style', liTaskStyle);

        const markerIndex = text.indexOf(markerChar);
        const preMarker = text.slice(0, markerIndex);
        const postMarker = text.slice(markerIndex + 1).trimStart();
        
        firstChild.textContent = preMarker;

        const checkboxSpan = activeDocument.createElement('span');
        checkboxSpan.setAttribute('style', `display: inline-block; font-size: 1.15em; font-weight: bold; margin-right: 6px; vertical-align: -0.05em; color: ${isChecked ? '#8f959e' : themeColor}; line-height: 1;`);
        checkboxSpan.textContent = isChecked ? '☑' : '☐';

        target.insertBefore(checkboxSpan, firstChild.nextSibling);

        if (postMarker) {
          const restTextNode = activeDocument.createTextNode(postMarker);
          target.insertBefore(restTextNode, checkboxSpan.nextSibling);
        }

        if (isChecked) {
          const contentSpan = activeDocument.createElement('span');
          const checkedTaskContentStyle = 'text-decoration: line-through; color: #8f959e;';
          contentSpan.setAttribute('style', checkedTaskContentStyle);

          let sibling = checkboxSpan.nextSibling;
          while (sibling) {
            const next = sibling.nextSibling;
            if (sibling.nodeType === 1 && (sibling.tagName === 'UL' || sibling.tagName === 'OL')) {
              break;
            }
            contentSpan.appendChild(sibling);
            sibling = next;
          }
          if (sibling) {
            target.insertBefore(contentSpan, sibling);
          } else {
            target.appendChild(contentSpan);
          }
        }
      }
    }
  });
}

/**
 * @param {HTMLTableElement | Element | null | undefined} table
 * @returns {number}
 */
function getTableColumnCount(table) {
  if (!table) return 0;
  const rows = Array.from(table.querySelectorAll('tr'));
  for (const row of rows) {
    const cells = Array.from(row.children).filter((child) => {
      const tagName = child.tagName?.toLowerCase?.();
      return tagName === 'th' || tagName === 'td';
    });
    if (cells.length === 0) continue;

    return cells.reduce((total, cell) => {
      const colspan = Number.parseInt(cell.getAttribute('colspan') || '1', 10);
      return total + (Number.isFinite(colspan) && colspan > 0 ? colspan : 1);
    }, 0);
  }
  return 0;
}

/**
 * @param {HTMLTableElement | Element | null | undefined} table
 * @returns {number}
 */
function getWechatTableWidth(table) {
  const columns = getTableColumnCount(table);
  if (!columns) return 720;
  const width = columns <= 2 ? (columns * 180 + 80) : (columns * 230 + 80);
  return Math.max(360, Math.min(1200, width));
}

/**
 * @param {string} style
 * @param {string} property
 * @param {string} value
 * @returns {string}
 */
function replaceStyleDeclaration(style, property, value) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*[^;]+;?`, 'gi');
  const cleaned = String(style || '')
    .replace(pattern, ';')
    .replace(/;{2,}/g, ';')
    .replace(/^\s*;\s*/, '')
    .trim();
  const normalized = cleaned && !cleaned.endsWith(';') ? `${cleaned};` : cleaned;
  return `${property}: ${value}; ${normalized}`.trim();
}

/**
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
function isHorizontallyScrollableWrapper(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  const style = el.getAttribute('style') || '';
  return /overflow-x\s*:\s*(?:auto|scroll)/i.test(style);
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function wrapTablesForHorizontalScroll(container, converter) {
  if (!container) return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;
  const wrapperStyle = getTagStyle(converter, 'table-wrapper')
    || 'display: block; box-sizing: border-box; width: 100%; max-width: 100%; overflow-x: scroll; overflow-y: hidden; -webkit-overflow-scrolling: touch; margin: 16px 0; padding-bottom: 10px;';

  Array.from(container.querySelectorAll('table')).forEach((table) => {
    const width = getWechatTableWidth(table);
    let tableStyle = table.getAttribute('style') || getTagStyle(converter, 'table') || '';
    tableStyle = replaceStyleDeclaration(tableStyle, 'width', `${width}px`);
    tableStyle = replaceStyleDeclaration(tableStyle, 'min-width', '100%');
    tableStyle = replaceStyleDeclaration(tableStyle, 'max-width', 'none');
    table.setAttribute('style', tableStyle);

    const parent = table.parentElement;
    if (isHorizontallyScrollableWrapper(parent)) return;

    const wrapper = activeDocument.createElement('section');
    wrapper.setAttribute('style', wrapperStyle);
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  });
}

/**
 * @param {Element | null | undefined} container
 * @param {{ preserveSvgStyleTags?: boolean }} [options]
 */
function stripDangerousTags(container, { preserveSvgStyleTags = false } = {}) {
  if (!container) return;
  container.querySelectorAll('script,iframe,object,embed,form,input,button,style').forEach((el) => {
    if (
      preserveSvgStyleTags
      && el.tagName?.toLowerCase?.() === 'style'
      && el.closest?.('svg')
    ) {
      return;
    }
    el.remove();
  });
}

/**
 * @param {string} html
 * @returns {{ html: string, placeholders: SvgStylePlaceholder[] }}
 */
function protectSvgStyleTags(html) {
  if (typeof html !== 'string' || !html.includes('<style')) {
    return { html, placeholders: [] };
  }

  /** @type {SvgStylePlaceholder[]} */
  const placeholders = [];
  let index = 0;
  const protectedHtml = html.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svgMarkup) => {
    return svgMarkup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (styleMarkup) => {
      const token = `__OWC_SVG_STYLE_${index}__`;
      placeholders.push({ token, styleMarkup });
      index += 1;
      return token;
    });
  });

  return { html: protectedHtml, placeholders };
}

/**
 * @param {string} html
 * @param {SvgStylePlaceholder[]} [placeholders]
 * @returns {string}
 */
function restoreSvgStyleTags(html, placeholders = []) {
  let result = String(html || '');
  placeholders.forEach(({ token, styleMarkup }) => {
    result = result.split(token).join(styleMarkup);
  });
  return result;
}

/**
 * @param {Element | null | undefined} svg
 * @returns {boolean}
 */
function looksLikeMathSvg(svg) {
  if (!svg || svg.tagName?.toLowerCase?.() !== 'svg') return false;
  if (svg.getAttribute('role') === 'img') return true;
  if (svg.getAttribute('focusable') === 'false') return true;
  if (svg.classList?.contains('MathJax')) return true;
  return !!svg.closest?.('mjx-container,mjx-math,.MathJax');
}

/**
 * @param {Element | null | undefined} container
 */
function normalizeMathPresentation(container) {
  if (!container) return;

  const blockStyle = 'display:block; width:100%; margin:1em auto; text-align:center; max-width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;';
  const inlineStyle = 'display:inline-block; vertical-align:middle; transform:translateY(-0.12em); margin:0 1px; line-height:1;';

  /** @param {Element | null | undefined} el */
  const normalizeTopOffsets = (el) => {
    if (!el || typeof el.getAttribute !== 'function' || typeof el.setAttribute !== 'function') return;
    const style = String(el.getAttribute('style') || '');
    if (!/\btop\s*:/i.test(style)) return;
    let topValue = null;
    let nextStyle = style.replace(/(^|;)\s*top\s*:\s*([^;]+)\s*;?/i, (_m, prefix, value) => {
      topValue = String(value || '').trim();
      return String(prefix || '');
    });
    if (!topValue) return;
    if (/transform\s*:/i.test(nextStyle)) {
      nextStyle = nextStyle.replace(
        /transform\s*:\s*([^;]+)/i,
        (_m, value) => `transform:${String(value || '').trim()} translateY(${topValue})`
      );
    } else {
      nextStyle = `${nextStyle}${nextStyle.trim().endsWith(';') || !nextStyle.trim() ? '' : ';'}transform: translateY(${topValue});`;
    }
    el.setAttribute('style', nextStyle);
  };

  container.querySelectorAll('mjx-container').forEach((mjx) => {
    const attrs = `${mjx.getAttribute('display') || ''} ${mjx.getAttribute('style') || ''}`.toLowerCase();
    const isBlock = attrs.includes('true') || attrs.includes('display: block') || attrs.includes('display:block');
    const existing = String(mjx.getAttribute('style') || '');
    const normalized = existing ? `${existing}${existing.trim().endsWith(';') ? '' : ';'}` : '';
    mjx.setAttribute('style', `${normalized}${isBlock ? blockStyle : inlineStyle}`);
  });

  container.querySelectorAll('svg').forEach((svg) => {
    if (!looksLikeMathSvg(svg)) return;
    const svgStyle = String(svg.getAttribute('style') || '');
    let normalizedSvgStyle = svgStyle ? `${svgStyle}${svgStyle.trim().endsWith(';') ? '' : ';'}` : '';
    normalizedSvgStyle = normalizedSvgStyle.replace(/vertical-align\s*:\s*[^;]+;?/gi, '');
    if (!/max-width\s*:/i.test(normalizedSvgStyle)) {
      normalizedSvgStyle = `${normalizedSvgStyle}max-width: 100%; height: auto;`;
    }
    svg.setAttribute('style', `${normalizedSvgStyle}display:inline-block;vertical-align:middle;`);

    const parent = svg.parentElement;
    if (!parent) return;

    const parentTag = parent.tagName.toLowerCase();
    const mathParent = parentTag === 'mjx-container' ? parent : null;
    const blockHint = String(mathParent?.getAttribute('display') || mathParent?.getAttribute('style') || '').toLowerCase();
    const wrapperMathMode = parent.getAttribute('data-owc-math');
    const hostMathMode = parentTag !== 'mjx-container' ? parent.closest?.('[data-owc-math]')?.getAttribute('data-owc-math') : null;
    const isBlockMath = wrapperMathMode === 'block'
      || hostMathMode === 'block'
      || blockHint.includes('true')
      || blockHint.includes('display: block')
      || blockHint.includes('display:block');

    if (isBlockMath) {
      const host = parentTag === 'section'
        ? parent
        : (parentTag === 'p' && parent.childNodes.length === 1 ? parent : null);
      if (host) {
        host.setAttribute('style', blockStyle);
      }
      svg.setAttribute(
        'style',
        `${svg.getAttribute('style') || ''}${String(svg.getAttribute('style') || '').trim().endsWith(';') || !svg.getAttribute('style') ? '' : ';'}display:block;margin:0 auto;`
      );
    } else if (parentTag === 'span' || parentTag === 'mjx-container') {
      const existing = String(parent.getAttribute('style') || '');
      const normalized = existing ? `${existing}${existing.trim().endsWith(';') ? '' : ';'}` : '';
      parent.setAttribute('style', `${normalized}${inlineStyle}`);
    }

    normalizeTopOffsets(svg);
    Array.from(svg.querySelectorAll('[style*="top:"], [style*="top: "]')).forEach(normalizeTopOffsets);
  });

  container.querySelectorAll('[data-owc-math="block"]').forEach((el) => {
    const existing = String(el.getAttribute('style') || '');
    const normalized = existing ? `${existing}${existing.trim().endsWith(';') ? '' : ';'}` : '';
    el.setAttribute('style', `${normalized}${blockStyle}`);
  });

  container.querySelectorAll('[data-owc-math="inline"]').forEach((el) => {
    const existing = String(el.getAttribute('style') || '');
    const normalized = existing ? `${existing}${existing.trim().endsWith(';') ? '' : ';'}` : '';
    el.setAttribute('style', `${normalized}${inlineStyle}`);
  });
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function applyLegacyTypographerParity(container, converter) {
  if (!container || !converter || !converter.md) return;
  if (typeof converter.md.renderInline !== 'function') return;
  if (converter.md.options && converter.md.options.typographer !== true) return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;

  const walker = activeDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const interestingPattern = /["']|\.{3}|---?|\+-|\((?:c|r|tm)\)/i;

  let node = walker.nextNode();
  while (node) {
    const current = node;
    node = walker.nextNode();

    const parent = current.parentElement;
    if (!parent) continue;
    if (parent.closest('pre,code,kbd,samp,script,style,textarea,svg,mjx-container,mjx-math,math')) continue;

    const original = String(current.textContent || '');
    if (!original || !interestingPattern.test(original)) continue;

    let rendered = '';
    try {
      rendered = converter.md.renderInline(original);
    } catch {
      continue;
    }
    if (!rendered || rendered === original) continue;

    const normalized = htmlToText(rendered);
    if (normalized && normalized !== original) {
      current.textContent = normalized;
    }
  }
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function renderUnresolvedMathFormulas(container, converter) {
  // Obsidian's MarkdownRenderer.renderMarkdown does not render LaTeX math formulas.
  // This function detects unresolved $...$ and $$...$$ patterns in text nodes
  // and renders them using the converter's markdown-it + MathJax pipeline.
  if (!container || !converter) return;
  if (!converter.md || typeof converter.md.renderInline !== 'function') return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;

  const walker = activeDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  /** @type {Text[]} */
  const textNodes = [];
  let node = walker.nextNode();
  while (node) {
    const text = String(node.textContent || '');
    // Check for math patterns: $...$ (inline) or $$...$$ (block)
    if (text.includes('$') && node instanceof Text) {
      textNodes.push(node);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (!parent) continue;
    // Skip if inside code, pre, or already rendered math
    if (parent.closest('pre,code,kbd,samp,script,style,textarea,mjx-container,mjx-math,math')) continue;

    const text = String(textNode.textContent || '');
    if (!text.includes('$')) continue;

    // Check if there are actual math patterns (not just escaped dollar signs)
    // Pattern: $$...$$ for block, $...$ for inline (not preceded/followed by $)
    const hasBlockMath = /\$\$[\s\S]+?\$\$/.test(text);
    const hasInlineMath = /(^|[^$])\$(?!\$)([^$\n]+?)\$(?!\$)/.test(text);
    if (!hasBlockMath && !hasInlineMath) continue;

    // Use markdown-it to render the text with math
    let rendered;
    try {
      // For block math, we need to handle it differently
      if (hasBlockMath) {
        // Create a temporary container and use full render for block math
        const tempDiv = createHtmlContainer('div');
        // Wrap block math in paragraph-like structure for rendering
        const wrappedText = text.replace(/\$\$([\s\S]+?)\$\$/g, '\n$$\n$1\n$$\n');
        const fullRendered = converter.md.render(wrappedText);
        setElementHtml(tempDiv, fullRendered);

        // Extract the rendered content
        const fragment = activeDocument.createDocumentFragment();
        while (tempDiv.firstChild) {
          fragment.appendChild(tempDiv.firstChild);
        }
        textNode.replaceWith(fragment);
      } else {
        // Inline math only - use renderInline
        rendered = converter.md.renderInline(text);
        if (rendered && rendered !== text) {
          const tempDiv = createHtmlContainer('div', rendered);
          const fragment = activeDocument.createDocumentFragment();
          while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
          }
          textNode.replaceWith(fragment);
        }
      }
    } catch {
      // Keep original text if rendering fails
      continue;
    }
  }
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function applyLegacyLinkifyParity(container, converter) {
  if (!container || !converter || !converter.md || !converter.md.linkify) return;
  if (typeof converter.md.linkify.match !== 'function') return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;

  const walker = activeDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const current = node;
    node = walker.nextNode();

    const parent = current.parentElement;
    if (!parent) continue;
    if (parent.closest('a,pre,code,kbd,samp,script,style,textarea,svg,mjx-container,mjx-math,math')) continue;

    const original = String(current.textContent || '');
    if (!original || !original.includes('.')) continue;

    let matches = null;
    try {
      matches = converter.md.linkify.match(original);
    } catch {
      matches = null;
    }
    if (!Array.isArray(matches) || matches.length === 0) continue;

    const fragment = activeDocument.createDocumentFragment();
    let cursor = 0;

    for (const item of matches) {
      const start = Number.isFinite(item?.index) ? item.index : -1;
      const end = Number.isFinite(item?.lastIndex) ? item.lastIndex : -1;
      if (start < 0 || end <= start || start < cursor || end > original.length) continue;

      if (start > cursor) {
        fragment.appendChild(activeDocument.createTextNode(original.slice(cursor, start)));
      }

      const displayText = original.slice(start, end);
      const hrefCandidate = String(item?.url || item?.text || displayText || '').trim();
      const href =
        converter && typeof converter.validateLink === 'function'
          ? converter.validateLink(hrefCandidate, false)
          : hrefCandidate;

      const a = activeDocument.createElement('a');
      a.setAttribute('href', href);
      a.textContent = displayText;
      fragment.appendChild(a);
      cursor = end;
    }

    if (cursor === 0) continue;
    if (cursor < original.length) {
      fragment.appendChild(activeDocument.createTextNode(original.slice(cursor)));
    }

    if (current.parentNode) {
      current.parentNode.replaceChild(fragment, current);
    }
  }
}

/**
 * @param {string} html
 * @param {PreRenderedMathLike[]} formulas
 * @returns {string}
 */
function injectPreRenderedMathFormulas(html, formulas) {
  if (!html || !Array.isArray(formulas) || formulas.length === 0) return html;

  let result = html;
  for (const { placeholder, rendered } of formulas) {
    if (placeholder && rendered) {
      // Replace placeholder with pre-rendered math HTML
      result = result.split(placeholder).join(rendered);
    }
  }
  return result;
}

/**
 * @param {{
 *   root?: Element | null,
 *   converter?: ConverterLike | null,
 *   preRenderedMath?: PreRenderedMathLike[],
 *   preserveSvgStyleTags?: boolean,
 * }} options
 * @returns {string}
 */
function serializeObsidianRenderedHtml({
  root,
  converter,
  preRenderedMath = [],
  preserveSvgStyleTags = false,
}) {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    throw new Error('Triplet serializer requires DOM environment');
  }

  const container = activeDocument.createElement('div');
  if (root) {
    Array.from(root.childNodes || []).forEach((node) => {
      container.appendChild(node.cloneNode(true));
    });
  }

  materializeImageEmbedPlaceholders(container, converter);
  promoteImageEmbedAltHints(container);
  convertObsidianImageSwipeCallouts(container);
  convertObsidianCalloutsToLegacy(container, converter);
  pruneObsidianOnlyAttributes(container, { finalStage: false });
  normalizeLegacyTagAliases(container);
  normalizeLegacyDeleteNesting(container);
  stripDangerousTags(container, { preserveSvgStyleTags });
  // Render math formulas that Obsidian's MarkdownRenderer didn't process
  renderUnresolvedMathFormulas(container, converter);
  applyLegacyLinkifyParity(container, converter);
  applyLegacyTypographerParity(container, converter);
  sanitizeAnchorAndImageLinks(container, converter);
  normalizeMathPresentation(container);
  convertPreBlocks(container, converter);
  convertImageSwipeBlocks(container, converter);
  convertStandaloneImages(container, converter);
  formatTaskListItems(container, converter);
  applyThemeInlineStyles(container, converter);
  wrapTablesForHorizontalScroll(container, converter);
  pruneObsidianOnlyAttributes(container, { finalStage: true });
  trimLeadingWhitespaceInBlockText(container);
  trimTrailingWhitespaceInBlockText(container);
  pruneEmptyHeadings(container);

  let html = container.innerHTML;

  // Inject pre-rendered math formulas (placeholders were created during preprocessing)
  html = injectPreRenderedMathFormulas(html, preRenderedMath);

  if (converter && typeof converter.fixListParagraphs === 'function') {
    html = converter.fixListParagraphs(html);
  }
  if (converter && typeof converter.unwrapFigures === 'function') {
    html = converter.unwrapFigures(html);
  }
  if (converter && typeof converter.removeBlockquoteParagraphMargins === 'function') {
    html = converter.removeBlockquoteParagraphMargins(html);
  }
  if (converter && typeof converter.fixMathJaxTags === 'function') {
    html = converter.fixMathJaxTags(html);
  }
  /** @type {{ html: string, placeholders: SvgStylePlaceholder[] }} */
  let svgStyleProtection = { html, placeholders: [] };
  if (preserveSvgStyleTags) {
    svgStyleProtection = protectSvgStyleTags(html);
    html = svgStyleProtection.html;
  }

  if (converter && typeof converter.sanitizeHtml === 'function') {
    html = converter.sanitizeHtml(html);
  }

  if (preserveSvgStyleTags) {
    html = restoreSvgStyleTags(html, svgStyleProtection.placeholders);
  }
  html = normalizeLegacyDeleteNestingInHtml(html);

  const sectionStyle = getTagStyle(converter, 'section');
  return `<section style="${sectionStyle}">${html}</section>`;
}

export {
  serializeObsidianRenderedHtml,
  deriveImageCaption,
  safeDecodeCaption,
};
