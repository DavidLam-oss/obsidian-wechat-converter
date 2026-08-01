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

关键依赖：`./dom-utils.js`、`./obsidian-triplet-serializer-utils.js`、`./obsidian-triplet-serializer-images.js`、`./obsidian-triplet-serializer-pictorial.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { getActiveDocument } from './dom-utils.js';
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
import { applyPictorialFigureStyles } from './obsidian-triplet-serializer-pictorial.js';
import {
  convertObsidianCalloutsToLegacy,
  pruneObsidianOnlyAttributes,
  normalizeLegacyTagAliases,
  normalizeLegacyDeleteNesting,
  normalizeLegacyDeleteNestingInHtml,
  sanitizeAnchorAndImageLinks,
  convertPreBlocks,
  trimTrailingWhitespaceInBlockText,
  trimLeadingWhitespaceInBlockText,
  pruneEmptyHeadings,
} from './obsidian-triplet-serializer-dom.js';
import {
  stripDangerousTags,
  protectSvgStyleTags,
  restoreSvgStyleTags,
  normalizeMathPresentation,
  applyLegacyTypographerParity,
  renderUnresolvedMathFormulas,
  applyLegacyLinkifyParity,
  injectPreRenderedMathFormulas,
} from './obsidian-triplet-serializer-parity.js';

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

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function applyThemeInlineStyles(container, converter) {
  if (!container || !converter) return;

  const styledTags = [
    'p', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'figure', 'figcaption',
    'img', 'a', 'table', 'thead', 'th', 'td', 'hr', 'strong', 'em', 'del', 'mark',
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
  applyPictorialFigureStyles(container, converter);
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
